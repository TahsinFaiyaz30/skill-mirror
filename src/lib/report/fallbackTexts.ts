import { readable } from "@/lib/config/taxonomy";
import type { KeyMoment, MomentCandidate, ReportData } from "@/types/report";
import type { TurnRow } from "@/lib/db/schema";

const coaching: Record<string, [string, string]> = {
  gaze_aversion: [
    "Your gaze moved away from the screen for several seconds.",
    "Return your gaze to the interviewer when you finish a thought.",
  ],
  self_touch: [
    "Your hand moved to your face during the answer.",
    "Rest your hands on the desk between gestures.",
  ],
  arms_crossed: [
    "Your arms stayed crossed during this part of the answer.",
    "Let your elbows drop and use one small gesture to emphasize a point.",
  ],
  slouch: [
    "Your posture drifted from your setup baseline.",
    "Sit upright before you start the next answer and reset between points.",
  ],
  filler_burst: [
    "Several filler sounds landed close together.",
    "Replace fillers with a short, quiet pause before starting the next point.",
  ],
  long_pause: [
    "There was a long gap between spoken phrases.",
    "Use a short pause to prepare your next point, then state it in one sentence.",
  ],
  fidgeting: [
    "Small hand movements continued through this section.",
    "Pause your hands between deliberate gestures.",
  ],
  pace_fast: [
    "You spoke quickly through this part of the answer.",
    "Slow down at the main decision and pause before giving the result.",
  ],
};
export function fallbackMoment(candidate: MomentCandidate): KeyMoment {
  const positive =
    candidate.type === "strong_answer" || candidate.category === "positive";
  const moment =
    candidate.kind === "answer"
      ? [
          positive
            ? "This answer showed clear evidence of the skill being tested."
            : "This answer needed more depth or a concrete example.",
          positive
            ? "State your decision and evidence in the same order on the next question."
            : "Start with your decision, name the constraint, and add evidence of the outcome.",
        ]
      : (coaching[candidate.type] ?? [
          readable(candidate.type) + " was recorded in this window.",
          "Replay the clip and practice this portion with a clear, steady delivery.",
        ]);
  return {
    id: candidate.id,
    title:
      candidate.kind === "answer"
        ? positive
          ? "A strong answer"
          : "Develop this answer"
        : readable(candidate.type),
    sentiment: positive ? "positive" : "improve",
    kind: candidate.kind,
    category: candidate.category,
    type: candidate.type,
    clipStartMs: candidate.clipStartMs,
    clipEndMs: candidate.clipEndMs,
    turnIdx: candidate.turnIdx,
    eventId: candidate.eventId,
    questionSource: candidate.questionSource,
    transcriptExcerpt: candidate.transcriptExcerpt,
    whatHappened: moment[0],
    whyItMatters:
      candidate.kind === "answer"
        ? "Specific decisions and evidence show how you apply your skills."
        : "Delivery can help the interviewer follow what you are saying.",
    howToFix: moment[1],
    betterAnswer:
      candidate.kind === "answer" && !positive
        ? "State the situation and constraint. Describe the action you personally took. Explain the tradeoff and quantify the outcome."
        : null,
  };
}

export function fallbackNarrative(
  report: ReportData,
  candidates: MomentCandidate[],
  turns: TurnRow[],
) {
  const strengths = [
    ...new Set(turns.flatMap((turn) => turn.scores?.strengths ?? [])),
  ];
  const growth = [...new Set(turns.flatMap((turn) => turn.scores?.gaps ?? []))];
  const lists = {
    strengths: [
      strengths[0] ?? "You worked through the questions presented.",
      strengths[1] ?? "You have examples to build on in your next interview.",
    ],
    growthAreas: [
      growth[0] ?? "Give a specific example for your main decision.",
      growth[1] ?? "Explain what changed and how you measured it.",
    ],
  };
  const sorted = [...candidates].sort((a, b) => b.severity - a.severity);
  return {
    ...report,
    headline: {
      ...report.headline,
      summary:
        "The interview covered " +
        report.session.roleTitle +
        " skills and experience. " +
        lists.strengths[0] +
        " " +
        lists.growthAreas[0],
    },
    summaryLists: lists,
    keyMoments: sorted.slice(0, 5).map(fallbackMoment),
    practicePlan: [
      {
        title: "Explain one tradeoff",
        why: "Show the reasoning behind a decision.",
        drill:
          "Pick a technical question and give two 90-second answers. Name the options, constraint, and choice.",
        targetMetric: "One explicit tradeoff per answer",
      },
      {
        title: "Build a STAR example",
        why: "Make ownership and impact measurable.",
        drill:
          "Practice three examples, one minute each. State the situation, task, action, and result.",
        targetMetric: "Four STAR elements per example",
      },
      {
        title: "Lead with a clear point",
        why: "Make the answer easy to follow.",
        drill:
          "Record three 60-second answers. Open with your decision and close with one result.",
        targetMetric: "Main point in the first sentence",
      },
    ],
  };
}
