import { TAXONOMY, type CompetencyKey } from "@/lib/config/taxonomy";
import { wordsIn } from "@/lib/utils/math";
import type {
  AnswerStatus,
  Directive,
  DirectiveMode,
  Phase,
} from "@/types/interview";
import type { InterviewContext, Item } from "./state";

const ackList = [
  "Okay.",
  "Thanks.",
  "Got it.",
  "Alright.",
  "Understood.",
  "Thank you.",
];
const banned =
  /\b(?:correct|right|wrong|great|excellent|perfect|good answer|incorrect|exactly|nice|awesome|impressive)\b/i;
export const neutralAck = (value: string, seq: number) =>
  value.trim() && wordsIn(value) <= 8 && !banned.test(value)
    ? value.trim()
    : ackList[(((seq - 1) % ackList.length) + ackList.length) % ackList.length];
const spoken: Partial<Record<Phase, string>> = {
  cv_deep_dive: "your background and projects",
  behavioral: "a few questions about your experience",
  technical: "some technical questions",
  presentation: "a short presentation exercise",
  candidate_questions: "time for your questions",
};
export function phaseListSpoken(phases: readonly Phase[]) {
  const phasesToSay = phases.flatMap((phase) =>
    spoken[phase] ? [spoken[phase]] : [],
  );
  if (phasesToSay.length < 2)
    return phasesToSay[0] ?? "an introduction and wrap-up";
  if (phasesToSay.length === 2) return phasesToSay.join(" and ");
  return phasesToSay.slice(0, -1).join(", ") + ", and " + phasesToSay.at(-1);
}
export const displayCompetency = (key: string | null) =>
  key && Object.hasOwn(TAXONOMY, key)
    ? TAXONOMY[key as CompetencyKey][0]
    : null;
export const calibrationQuestion = "Tell me about yourself (about 1 minute).";
const prefixes: Partial<Record<AnswerStatus, string>> = {
  time_cap: "Let me stop you there in the interest of time.",
  no_response: "No problem, let's move on.",
  skipped: "Sure, let's move on.",
};
export function compose(
  context: InterviewContext,
  item: Item,
  options: {
    seq: number;
    turnIdx: number;
    previous?: Item;
    ack?: string;
    status?: AnswerStatus;
    mode?: DirectiveMode;
    wording?: string;
    clarification?: boolean;
  },
): Directive {
  const { config, plan, firstName, company, roleTitle } = context;
  const { seq, turnIdx, previous } = options;
  const mode =
    options.mode ??
    (item.kind === "close"
      ? "close"
      : item.kind === "candidate_questions"
        ? "candidate_questions"
        : item.kind === "presentation"
          ? "presentation_prompt"
          : "ask");
  const ack =
    (options.status && prefixes[options.status]) ||
    neutralAck(options.ack ?? "", seq);
  const name = config.ai.interviewerName ?? plan.persona.interviewer_name;
  const label = displayCompetency(item.competencyKey);
  const first = item.phase !== previous?.phase;
  let sayText: string,
    questionText: string | null = item.questionText,
    cardLabel: string;
  let presentation: Directive["presentation"] = null;
  if (item.kind === "calibration") {
    const start =
      config.kind === "practice"
        ? "Hi " +
          firstName +
          ", I'm " +
          name +
          ", and I'll be interviewing you today for the " +
          roleTitle +
          " role at " +
          company +
          ". We have about " +
          config.lengthMinutes +
          " minutes: "
        : "Hi " +
          firstName +
          ", I'm " +
          name +
          " from " +
          company +
          ". Thanks for joining this interview for the " +
          roleTitle +
          " position. It will take about " +
          config.lengthMinutes +
          " minutes, covering ";
    const introTail =
      config.lengthMinutes <= 5
        ? ". Keep each answer concise. When you're finished, just pause or press Done answering. Let's start: tell me briefly about yourself in about fifteen seconds."
        : ". Take your time with each answer. When you're finished, just pause or press Done answering. Let's start: tell me about yourself, in about a minute.";
    sayText =
      start +
      phaseListSpoken(config.phaseOrder) +
      introTail;
    questionText = calibrationQuestion;
    cardLabel = "Introduction";
  } else if (mode === "close") {
    const closing =
      config.kind === "practice"
        ? "Your detailed feedback report will be ready in a couple of minutes."
        : config.feedbackVisibility === "none"
          ? "The team at " +
            company +
            " will review your interview and be in touch."
          : "You'll see your feedback shortly, and the team at " +
            company +
            " will be in touch.";
    sayText =
      ack +
      " That's all from my side. Thank you for your time today, " +
      firstName +
      ". " +
      closing +
      " Good luck!";
    questionText = null;
    cardLabel = "Wrap-up";
  } else if (mode === "presentation_prompt") {
    const scenario = config.presentation.custom ?? plan.presentation;
    presentation = {
      title: scenario?.title ?? "Presentation",
      scenario: scenario?.scenario ?? "",
      prepMs: config.presentation.prepMs,
      talkMs: config.presentation.talkMs,
      interruptAtMs: config.presentation.interruptAtMs,
    };
    const prefix =
      ack.slice(0, 60) +
      " Next, a short presentation exercise. Here's the scenario. ";
    const prep =
      " You have thirty seconds to prepare. I'll tell you when to begin.";
    const available = 700 - prefix.length - prep.length;
    const body =
      presentation.scenario.length <= available
        ? presentation.scenario
        : presentation.scenario.slice(0, available - 1).trimEnd() + "…";
    sayText = prefix + body + prep;
    questionText = presentation.title;
    cardLabel = "Presentation";
  } else if (mode === "presentation_begin") {
    sayText = "Time's up. Please begin whenever you're ready.";
    questionText =
      (config.presentation.custom ?? plan.presentation)?.title ??
      "Presentation";
    cardLabel = "Presentation";
  } else if (mode === "presentation_interrupt") {
    sayText = "Sorry to jump in. " + options.wording;
    questionText = options.wording ?? null;
    cardLabel = "Presentation";
  } else if (item.kind === "presentation_followup") {
    sayText = "Thank you, let me stop you there. " + item.questionText;
    cardLabel = "Presentation · Follow-up";
  } else if (item.kind === "candidate_questions") {
    questionText = "Do you have any questions for me?";
    sayText = ack + " We're nearly done. " + questionText;
    cardLabel = "Your questions";
  } else {
    cardLabel =
      item.phase === "cv_deep_dive"
        ? "Your experience"
        : item.phase === "behavioral"
          ? "Behavioral"
          : label
            ? "Technical · " + label
            : "Technical";
    let transition = "";
    if (first && item.phase === "cv_deep_dive")
      transition = "I'd like to start with your background. ";
    if (first && item.phase === "behavioral")
      transition = "Let's talk about some of your experiences. ";
    if (first && item.phase === "technical")
      transition =
        "Alright, let's move on to some technical questions" +
        (item.source === "ai_plan" && label ? ", starting with " + label : "") +
        ". ";
    if (
      !first &&
      item.source === "ai_plan" &&
      item.phase === "technical" &&
      label &&
      item.competencyKey !== previous?.competencyKey
    )
      transition = "Let's switch to " + label + ". ";
    sayText =
      ack + " " + (item.isFollowUp ? "" : transition) + item.questionText;
  }
  if (options.clarification) sayText = options.wording || item.questionText;
  const expectAnswer =
    mode !== "close" &&
    mode !== "presentation_prompt" &&
    mode !== "presentation_interrupt";
  return {
    seq,
    turnIdx,
    phase: item.phase,
    phaseIndex: config.phaseOrder.indexOf(item.phase),
    mode,
    sayText: sayText.trim().slice(0, 700),
    questionText,
    cardLabel,
    expectAnswer,
    maxAnswerMs:
      item.kind === "presentation"
        ? config.presentation.talkMs
        : config.maxAnswerMs[item.kind],
    presentation,
    endInterview: mode === "close",
  };
}
