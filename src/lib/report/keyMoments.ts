import { clamp, mean, median, present } from "@/lib/utils/math";
import type { SessionRow, TurnRow } from "@/lib/db/schema";
import type { MetricSecond, SessionEvent } from "@/types/interview";
import type { MomentCandidate, ReportData, TimedWord } from "@/types/report";
import { identifyFillers } from "./voiceMetrics";

import { integrityOnly } from "@/lib/vision/integrity";
const answerStart = (turn: TurnRow) => turn.answerStartMs ?? turn.askEndMs ?? 0;
const isWeakAnswer = (turn: TurnRow) =>
  turn.scoreTotal !== null &&
  (turn.scores?.outcome === "fail" || turn.scoreTotal <= 1.5);
export function keyMomentCandidates(
  turns: TurnRow[],
  events: SessionEvent[],
  words: TimedWord[],
  durationMs: number,
  off: boolean,
) {
  const highEvents = events
    .filter(
      (e) =>
        e.severity >= 0.4 &&
        e.category !== "positive" &&
        (!off || integrityOnly(e)),
    )
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 25);
  const weak = turns.filter(isWeakAnswer).slice(0, 8);
  const positive = [
    ...(off ? [] : events.filter((e) => e.category === "positive")),
    ...turns.filter((t) => (t.scoreTotal ?? 0) >= 3.5),
  ].slice(0, 7);
  const highlights = [...highEvents, ...weak, ...positive];
  const coveredTurns = new Set(
    highlights.map((item) => ("category" in item ? item.turnIdx : item.idx)),
  );
  const review = turns
    .filter((turn) => turn.scoreTotal !== null && !coveredTurns.has(turn.idx))
    .slice(0, Math.max(0, 5 - highlights.length));
  return [...highlights, ...review].map((candidate, i): MomentCandidate => {
    const event = "category" in candidate ? candidate : null;
    const turn = event
      ? turns.find((item) => item.idx === event.turnIdx)
      : (candidate as TurnRow);
    const startMs = event?.startMs ?? (turn ? answerStart(turn) : 0);
    const endMs = event?.endMs ?? turn?.answerEndMs ?? startMs;
    let clipStartMs = Math.max(0, event ? startMs - 3000 : startMs - 2000);
    let clipEndMs = event ? endMs + 3000 : Math.min(endMs, startMs + 45000);
    if (event && turn) {
      clipStartMs = Math.max(clipStartMs, turn.askStartMs ?? 0);
      clipEndMs = Math.min(clipEndMs, (turn.answerEndMs ?? clipEndMs) + 2000);
    }
    if (event && clipEndMs - clipStartMs > 45000) clipEndMs = startMs + 42000;
    clipStartMs = clamp(clipStartMs, 0, durationMs);
    clipEndMs = clamp(clipEndMs, clipStartMs, durationMs);
    const excerpt = words
      .filter((word) => word.s >= startMs && word.s <= endMs)
      .map((word) => word.w)
      .join(" ");
    const v = turn?.finalMetrics?.vision,
      a = turn?.finalMetrics?.voice;
    const context = [
      v?.eyeContactPct != null &&
        "eye contact " + Math.round(v.eyeContactPct * 100) + "%",
      a && a.hardFillers + a.softFillers + " fillers",
      turn?.finalMetrics?.stress != null &&
        "stress " + turn.finalMetrics.stress.toFixed(2),
      turn?.scoreTotal != null && "answer score " + turn.scoreTotal + " of 4",
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: "km-" + (i + 1),
      kind: event ? "event" : "answer",
      category: event?.category ?? "answer",
      type:
        event?.type ??
        ((turn?.scoreTotal ?? 0) >= 3.5
          ? "strong_answer"
          : turn && isWeakAnswer(turn)
            ? "weak_answer"
            : "answer_review"),
      startMs,
      endMs,
      clipStartMs,
      clipEndMs,
      turnIdx: turn?.idx ?? event?.turnIdx ?? null,
      questionShort: turn?.questionText.slice(0, 100) ?? "",
      questionSource: turn?.questionSource ?? null,
      transcriptExcerpt: (
        excerpt ||
        turn?.answerTranscriptFinal ||
        turn?.answerTranscriptLive ||
        ""
      ).slice(0, 300),
      context,
      severity:
        event?.severity ??
        ((turn?.scoreTotal ?? 0) >= 3.5
          ? 0.5
          : Math.max(0.4, 1 - (turn?.scoreTotal ?? 0) / 4)),
      eventId: event?.id ?? null,
    };
  });
}

export function reportTimeline(
  session: SessionRow,
  turns: TurnRow[],
  timeline: MetricSecond[],
  words: TimedWord[],
  events: SessionEvent[],
  baseline: NonNullable<ReportData["baseline"]>,
): ReportData["timeline"] {
  const off = session.config.evaluation.nonverbalPolicy === "off";
  const buckets = new Map<number, MetricSecond[]>();
  if (!off)
    for (const second of timeline) {
      const t = Math.floor(second.t / 2) * 2;
      buckets.set(t, [...(buckets.get(t) ?? []), second]);
    }
  const b = baseline.fields;
  const fills = off
    ? { hardFillers: [], softFillers: [] }
    : identifyFillers(words);
  return {
    durationMs: session.durationMs ?? 0,
    buckets: [...buckets].map(([t, seconds]) => ({
      t,
      ec: mean(seconds.map((s) => s.ec).filter(present)),
      f0: median(seconds.map((s) => s.f0).filter(present)),
      tension: mean(
        seconds.flatMap((s) =>
          s.bt === null || s.lp === null || s.fg === null || s.ec === null
            ? []
            : [
                clamp(
                  (0.25 * (s.bt - b.browTension)) / 0.15 +
                    (0.25 * (s.lp - b.lipPress)) / 0.15 +
                    (0.25 * s.fg) / 0.3 +
                    (0.25 * (b.eyeContact - s.ec)) / 0.25,
                  0,
                  2,
                ) / 2,
              ],
        ),
      ),
    })),
    turns: turns.flatMap((row) =>
      row.askStartMs === null
        ? []
        : [
            {
              turnIdx: row.idx,
              startMs: row.askStartMs,
              endMs: row.answerEndMs ?? row.askEndMs ?? row.askStartMs,
              answerStartMs: row.answerStartMs,
              label: row.questionText,
              phase: row.phase,
              difficulty: row.difficulty,
              questionSource: row.questionSource,
            },
          ],
    ),
    fillers: [...fills.hardFillers, ...fills.softFillers].sort(
      (a, b) => a.s - b.s,
    ),
    events: events
      .filter((e) => !off || integrityOnly(e))
      .map(({ id, category, type, startMs, endMs, severity }) => ({
        id,
        category,
        type,
        startMs,
        endMs,
        severity,
      })),
  };
}
