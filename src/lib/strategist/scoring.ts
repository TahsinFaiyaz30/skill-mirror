import { SCORING } from "@/lib/config/constants";
import { rubricKeys, type RubricKey } from "@/lib/ai/schemas";
import type {
  Intensity,
  ItemKind,
  P4Output,
  ScoreOutcome,
  Strictness,
  TurnScores,
} from "@/types/interview";
import type { Item } from "./state";
import { wordsIn } from "@/lib/utils/math";

export const rubricWeights: Record<
  ItemKind,
  Partial<Record<RubricKey, number>>
> = {
  intro: {},
  calibration: { communication: 0.5, relevance: 0.5 },
  cv_deep_dive: {
    authenticity: 0.35,
    ownership: 0.25,
    impact: 0.25,
    communication: 0.15,
  },
  behavioral: { ownership: 0.35, impact: 0.35, communication: 0.3 },
  technical: { correctness: 0.5, depth: 0.3, communication: 0.2 },
  presentation: {
    structure: 0.25,
    audience_fit: 0.25,
    persuasiveness: 0.25,
    handling_challenge: 0.25,
  },
  presentation_followup: { handling_pushback: 0.7, communication: 0.3 },
  candidate_questions: { question_quality: 1 },
  close: {},
};
export function outcomeFor(
  kind: ItemKind,
  total: number,
  strictness: Strictness,
): ScoreOutcome {
  if (!["cv_deep_dive", "behavioral", "technical"].includes(kind)) return "na";
  const { pass, fail } = SCORING.strictness[strictness];
  return total >= pass ? "pass" : total < fail ? "fail" : "partial";
}
export function validateRubric(kind: ItemKind, output: P4Output) {
  if (
    Object.keys(rubricWeights[kind]).some(
      (key) => output.rubric[key as RubricKey] === null,
    ) ||
    (kind === "behavioral" && !output.star)
  ) {
    throw new Error("Missing required rubric fields");
  }
}
export function totalScore(
  kind: ItemKind,
  rubric: Record<string, number>,
  star: P4Output["star"],
) {
  const sum = Object.entries(rubricWeights[kind]).reduce(
    (total, [key, weight]) => total + (rubric[key] ?? 0) * weight,
    0,
  );
  return Math.max(
    0,
    Math.round(
      (sum -
        (kind === "behavioral" && (!star?.action || !star.result) ? 0.5 : 0)) *
        1e8,
    ) / 1e8,
  );
}
export function buildScores(
  kind: ItemKind,
  output: P4Output | null,
  source: TurnScores["source"],
  strictness: Strictness,
  opts: { zero?: boolean; interrupt?: boolean; mockTotal?: number } = {},
): TurnScores {
  const rubric: Record<string, number> = Object.fromEntries(
    Object.keys(rubricWeights[kind]).map((key) => [
      key,
      opts.zero ? 0 : (output?.rubric[key as RubricKey] ?? 0),
    ]),
  );
  if (!opts.zero && kind === "presentation" && !opts.interrupt)
    rubric.handling_challenge = 2;
  const failed = !output && !opts.zero;
  const total = opts.zero
    ? 0
    : failed
      ? 2
      : (opts.mockTotal ?? totalScore(kind, rubric, output?.star ?? null));
  return {
    kind,
    rubric,
    star:
      opts.zero && kind === "behavioral"
        ? { situation: false, task: false, action: false, result: false }
        : (output?.star ?? null),
    total,
    outcome: opts.zero
      ? "fail"
      : failed
        ? "na"
        : outcomeFor(kind, total, strictness),
    intent: output?.intent ?? "answer",
    evidence: output?.evidence ?? [],
    strengths: output?.strengths ?? [],
    gaps: output?.gaps ?? [],
    note: output?.note ?? "",
    cvClaimSignal: output?.cv_claim_signal ?? "none",
    scoringFailed: failed,
    source,
  };
}
export function strongFollowUp(
  item: Item,
  scores: TurnScores,
  intensity: Intensity,
  tradeoffProbed = false,
) {
  if (
    intensity === "low" ||
    scores.outcome !== "pass" ||
    item.followUpsUsed >= item.maxFollowUps ||
    item.isFollowUp
  )
    return false;
  if (intensity === "medium")
    return (
      item.kind === "technical" &&
      item.source === "ai_plan" &&
      (item.level ?? 0) >= 3 &&
      scores.rubric.depth <= 2 &&
      !tradeoffProbed
    );
  return (
    (item.kind === "technical" && (item.level ?? 0) >= 2) ||
    item.kind === "cv_deep_dive" ||
    item.kind === "behavioral"
  );
}
export function mockP4(text: string): { output: P4Output; total: number } {
  const words = wordsIn(text);
  const total = words < 15 ? 1 : words <= 50 ? 2 : words <= 120 ? 3 : 4;
  return {
    total,
    output: {
      intent: "answer",
      clarification_reply: "",
      rubric: Object.fromEntries(
        rubricKeys.map((key) => [key, total]),
      ) as P4Output["rubric"],
      star: {
        situation: words >= 15,
        task: words >= 15,
        action: words >= 30,
        result: words >= 40,
      },
      strengths: total >= 3 ? ["Explained a concrete approach."] : [],
      gaps:
        total < 3 ? ["Add a concrete example and explain the outcome."] : [],
      evidence: [],
      follow_up_if_weak: {
        tactic: "probe_vague",
        text: "Could you give a specific example and explain what you did?",
      },
      follow_up_if_strong: {
        tactic: "tradeoff_challenge",
        text: "What constraint would make you change that approach?",
      },
      ack: "Thanks.",
      cv_claim_signal: "none",
      note: "",
    },
  };
}
