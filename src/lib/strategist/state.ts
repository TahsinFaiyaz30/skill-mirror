import type { Directive, InterviewConfig, InterviewPlan, ItemKind, OpeningQuestion, Phase, QuestionSource, ScoreOutcome } from "@/types/interview";
import { newCompetency, type CompetencyState } from "./staircase";
import { buildQueues, type Queues } from "./queues";
export type Item = {
  kind: ItemKind; phase: Phase; source: QuestionSource; openingQuestionId: string | null; competencyKey: string | null;
  questionId: string | null; level: number | null; isFollowUp: boolean; followUpsUsed: number; maxFollowUps: number;
  clarificationsUsed: number; questionText: string; idealPoints: string[]; redFlags: string[]; lookFor: string[];
  parentQuestionId: string | null; mustAsk: boolean; followUpType?: "weak" | "strong"; parentSource?: QuestionSource;
};
export type StrategistState = {
  version: 1; phase: Phase; phaseIndex: number; phaseStartedMs: number; turnIdx: number; lastDirective: Directive; llmCalls: number; queues: Queues; current: Item;
  technical: { order: string[]; activeIndex: number; comps: Record<string, CompetencyState> };
  primariesAsked: Partial<Record<Phase, number>>;
  coverage: Record<string, { status: "pending" | "asked" | "unasked" | "skipped_by_candidate"; turnIdx: number | null }>;
  presentation: { stage: "none" | "prompted" | "began" | "interrupted" | "ended" | "followup_asked"; interruptChallenge: string | null };
  history: { turnIdx: number; kind: ItemKind; competencyKey: string | null; level: number | null; total: number; outcome: ScoreOutcome; shortQuestion: string }[];
  notes: string[];
};
export type InterviewContext = { config: InterviewConfig; plan: InterviewPlan; firstName: string; company: string; roleTitle: string };
export function basicItem(kind: ItemKind, phase: Phase, questionText = ""): Item {
  return { kind, phase, source: "system", openingQuestionId: null, competencyKey: null, questionId: null, level: null, isFollowUp: false,
    followUpsUsed: 0, maxFollowUps: 0, clarificationsUsed: 0, questionText, idealPoints: [], redFlags: [], lookFor: [], parentQuestionId: null, mustAsk: false };
}
export function companyTechnical(config: InterviewConfig): OpeningQuestion[] {
  return config.phaseOrder.includes("technical") && config.mode !== "auto" ? config.customQuestions.filter((question) => question.phase === "technical" && question.competencyKey) : [];
}
export function initialTechnical(config: InterviewConfig, plan: InterviewPlan): StrategistState["technical"] {
  const list = config.mode === "scripted"
    ? companyTechnical(config).map((question) => ({ key: question.competencyKey!, start_level: Math.max(1, Math.min(4, plan.expected_level - 1)) }))
    : plan.technical;
  const order = [...new Set(list.map((c) => c.key))];
  return { order, activeIndex: 0, comps: Object.fromEntries(list.map((c) => [c.key, newCompetency(c.start_level)])) };
}
export function initialState(context: InterviewContext, directive: Directive, current: Item): StrategistState {
  return {
    version: 1, phase: "intro_calibration", phaseIndex: 0, phaseStartedMs: 0, turnIdx: 0, lastDirective: directive,
    llmCalls: 0, queues: buildQueues(context.config, context.plan), current, technical: initialTechnical(context.config, context.plan),
    primariesAsked: {}, coverage: Object.fromEntries(context.config.customQuestions.map((q) => [q.id, { status: "pending", turnIdx: null }])),
    presentation: { stage: "none", interruptChallenge: null }, history: [], notes: [],
  };
}
