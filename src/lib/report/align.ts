import { fieldMean, secondsIn } from "@/lib/vision/aggregator";
import type { MetricSecond } from "@/types/interview";
import type { TimedSegment, TimedWord, WordTrack } from "@/types/report";
type TurnWindow = {
  idx: number;
  answerStartMs: number | null;
  answerEndMs: number | null;
  askEndMs: number | null;
};
type WhisperWord = { word: string; start: number; end: number };
type WhisperSegment = {
  text: string;
  start: number;
  end: number;
  no_speech_prob?: number;
  avg_logprob?: number;
};
export function whisperTimestamps(
  words: WhisperWord[],
  segments: WhisperSegment[],
  offsetMs: number,
  timeline: MetricSecond[],
): WordTrack {
  const ms = (seconds: number) =>
    Math.max(0, Math.round(seconds * 1000 + offsetMs));
  const bad = segments.filter((segment) => {
    const samples = secondsIn(timeline, ms(segment.start), ms(segment.end));
    const vad = fieldMean(samples, "vad");
    return (
      ((segment.no_speech_prob ?? 0) > 0.6 &&
        (segment.avg_logprob ?? 0) < -1) ||
      (vad !== null && vad < 0.1)
    );
  });
  const rejected = new Set(bad);
  return {
    words: words
      .filter(
        (word) =>
          !bad.some(
            (segment) =>
              word.start >= segment.start && word.start < segment.end,
          ),
      )
      .map(({ word, start, end }) => ({
        w: word.trim(),
        s: ms(start),
        e: ms(end),
      })),
    segments: segments
      .filter((segment) => !rejected.has(segment))
      .map(({ text, start, end }) => ({
        text: text.trim(),
        s: ms(start),
        e: ms(end),
      })),
  };
}
export function alignWords(turns: TurnWindow[], track: WordTrack) {
  const results = new Map(
    turns.map((turn) => [
      turn.idx,
      { words: [] as TimedWord[], segments: [] as TimedSegment[] },
    ]),
  );
  const windows = turns.flatMap((turn) => {
    const start = turn.answerStartMs ?? turn.askEndMs,
      end = turn.answerEndMs;
    return start !== null && end !== null
      ? [{ idx: turn.idx, start, end }]
      : [];
  });
  const find = (time: number) =>
    windows
      .filter((win) => time >= win.start - 500 && time <= win.end + 1000)
      .sort(
        (a, b) =>
          Math.max(0, a.start - time, time - a.end) -
            Math.max(0, b.start - time, time - b.end) || b.start - a.start,
      )[0]?.idx;
  for (const word of [...track.words].sort((a, b) => a.s - b.s)) {
    const id = find(word.s);
    if (id !== undefined) results.get(id)?.words.push(word);
  }
  for (const segment of track.segments) {
    const id = find(segment.s);
    if (id !== undefined) results.get(id)?.segments.push(segment);
  }
  return results;
}
