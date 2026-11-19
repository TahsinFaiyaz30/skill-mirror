import type { SessionRow } from "@/lib/db/schema";
import type { Baseline, StrategistInput } from "@/types/interview";
import {
  GEMINI_STRATEGIST_TIMEOUT_MS,
  STRATEGIST_TIMEOUT_MS,
} from "@/lib/config/constants";
import { displayCompetency } from "@/lib/strategist/compose";
import { mockP4, validateRubric } from "@/lib/strategist/scoring";
import type { Evaluation } from "@/lib/strategist/engine";
import type { Item, StrategistState } from "@/lib/strategist/state";
import { p4 } from "./prompts/p4_strategist";
import { p6 } from "./prompts/p6_interrupt";
import { geminiJSON } from "./gemini";
import { groqJSON } from "./groq";
import { interruptSchema, p4Schema } from "./schemas";

const bullets = (items: string[]) =>
  items.map((item) => "- " + item).join("\n") || "None";
const pct = (value: number | null | undefined) =>
  value == null ? "unavailable" : Math.round(value * 100) + "%";
function metricsSummary(input: StrategistInput, baseline: Baseline | null) {
  if (!input.metrics) return "None";
  const { vision, voice } = input.metrics;
  const pieces = [];
  if (vision)
    pieces.push(
      "eye contact " +
        pct(vision.eyeContactPct) +
        " (baseline " +
        pct(baseline?.fields.eyeContact) +
        ")",
      "fidgeting " + pct(vision.fidgetPct),
    );
  if (voice)
    pieces.push(
      voice.longPauseCount + " long pauses",
      "live pace " + Math.round(voice.liveWpm ?? 0) + " wpm",
    );
  return pieces.join(", ") || "None";
}
export async function evaluateAnswer(
  session: SessionRow,
  state: StrategistState,
  input: StrategistInput,
  item: Item = state.current,
  rescore = false,
): Promise<Evaluation | undefined> {
  if (session.aiMode === "mock") {
    const mock = mockP4(input.transcript);
    return { output: mock.output, source: "mock", mockTotal: mock.total };
  }
  const presentation = session.plan?.presentation;
  const prompt = p4({
    company: session.company,
    seniority: session.seniority,
    roleTitle: session.roleTitle,
    kind: item.kind,
    competencyDisplayNameOrNone:
      displayCompetency(item.competencyKey) ?? "None",
    levelOrNone: item.level ?? "None",
    isFollowUp: item.isFollowUp,
    questionText: item.questionText,
    idealPointsBulletedOrNone: bullets(item.idealPoints),
    redFlagsBulletedOrNone: bullets(item.redFlags),
    lookForBulletedOrNone: bullets(item.lookFor),
    cvClaimOrNone:
      session.plan?.cv_claims.find(
        (claim) => claim.competency_key === item.competencyKey,
      )?.claim ?? "None",
    presentationScenarioOrNone: item.kind.startsWith("presentation")
      ? (presentation?.scenario ?? "None")
      : "None",
    interruptChallengeOrNone:
      item.kind === "presentation"
        ? (state.presentation.interruptChallenge ?? "None")
        : "None",
    pushbackAnglesOrNone: item.kind.startsWith("presentation")
      ? bullets(presentation?.pushback_angles ?? [])
      : "None",
    strictness: session.config.ai.strictness,
    aiInstructionsOrNone: session.config.ai.instructions || "None",
    companyBlock: session.kind !== "practice",
    last3HistoryLines: state.history
      .slice(-3)
      .map((q) => q.kind + " " + q.shortQuestion + " · " + q.outcome)
      .join("\n"),
    answerStatus: input.answerStatus,
    oneLineVisionVoiceSummaryOrNone:
      session.config.evaluation.nonverbalPolicy === "off"
        ? "None"
        : metricsSummary(input, session.baseline),
    transcriptLast6000Chars: input.transcript.slice(-6000),
  });
  const validate = (output: import("@/types/interview").P4Output) =>
    validateRubric(item.kind, output);
  if (!rescore) {
    try {
      return {
        output: await groqJSON(prompt, p4Schema, {
          temperature: 0.2,
          maxTokens: 900,
          validate,
          timeout: STRATEGIST_TIMEOUT_MS,
        }),
        source: "groq",
      };
    } catch {
      /* Use the second provider. */
    }
  }
  try {
    return {
      output: await geminiJSON(prompt, p4Schema, {
        maxTokens: 900,
        validate,
        thinking: "low",
        timeout: GEMINI_STRATEGIST_TIMEOUT_MS,
      }),
      source: "gemini",
    };
  } catch {
    return undefined;
  }
}

export async function interruptChallenge(
  session: SessionRow,
  transcript: string,
) {
  const scenario = session.plan?.presentation;
  if (session.aiMode === "mock" || !scenario)
    return scenario?.interrupt_challenge;
  try {
    return (
      await groqJSON(
        p6({
          scenario: scenario.scenario,
          audience: scenario.audience,
          partialTranscript: transcript,
        }),
        interruptSchema,
        { timeout: 2500, temperature: 0.6, maxTokens: 120 },
      )
    ).challenge;
  } catch {
    return scenario.interrupt_challenge;
  }
}
