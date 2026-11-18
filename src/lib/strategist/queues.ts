import { MAX_FOLLOWUPS_PER_ITEM } from "@/lib/config/constants";
import type { InterviewConfig, InterviewPlan, OpeningQuestion, Phase, PlanCompetency } from "@/types/interview";
import type { Item } from "./state";
import type { CompetencyState } from "./staircase";
export type QueueEntry = { ref: string; source: "company" | "ai_plan"; mustAsk: boolean; done: boolean };
export type Queues = Partial<Record<Phase, QueueEntry[]>>;
export const isInjected = (q: OpeningQuestion) => !q.mustAsk && q.phase === "technical" && q.competencyKey != null && q.difficulty != null;
export function buildQueues(config: InterviewConfig, plan: InterviewPlan): Queues {
  const result: Queues = {};
  for (const phase of ["cv_deep_dive", "behavioral", "technical"] as const) {
    if (!config.phaseOrder.includes(phase)) continue;
    let questions = config.mode === "auto" ? [] : config.customQuestions.filter((q) => q.phase === phase);
    if (config.mode === "hybrid") questions = questions.filter((q) => !isInjected(q)).sort((a, b) => Number(b.mustAsk) - Number(a.mustAsk));
    const fromCompany: QueueEntry[] = questions.map((q) => ({ ref: q.id, source: "company", mustAsk: q.mustAsk, done: false }));
    const planItems = config.mode === "scripted" ? [] : phase === "behavioral" ? plan.behavioral : phase === "cv_deep_dive" ? plan.cv_questions : [];
    result[phase] = [...fromCompany, ...planItems.map((q): QueueEntry => ({ ref: q.id, source: "ai_plan", mustAsk: false, done: false }))];
  }
  return result;
}
export function companyItem(q: OpeningQuestion, config: InterviewConfig, overBudget = false): Item {
  return {
    kind: q.phase, phase: q.phase, source: "company", openingQuestionId: q.id, competencyKey: q.competencyKey ?? null, questionId: q.id,
    level: q.difficulty ?? null, isFollowUp: false, followUpsUsed: 0, maxFollowUps: overBudget || config.mode === "scripted" && !config.ai.allowFollowUps ? 0 : q.maxFollowUps,
    clarificationsUsed: 0, questionText: q.text, idealPoints: q.idealPoints, redFlags: q.redFlags, lookFor: [], parentQuestionId: null, mustAsk: q.mustAsk,
  };
}
export function getQueueItem(entry: QueueEntry, phase: Phase, config: InterviewConfig, plan: InterviewPlan, overBudget: boolean): Item | null {
  if (entry.source === "company") {
    const q = config.customQuestions.find((q) => q.id === entry.ref);
    return q ? companyItem(q, config, overBudget) : null;
  }
  if (phase !== "cv_deep_dive" && phase !== "behavioral") return null;
  const q = (phase === "cv_deep_dive" ? plan.cv_questions : plan.behavioral).find((q) => q.id === entry.ref);
  return q ? {
    kind: phase, phase, source: "ai_plan", openingQuestionId: null, competencyKey: "theme" in q ? q.theme : null, questionId: q.id,
    level: null, isFollowUp: false, followUpsUsed: 0, maxFollowUps: MAX_FOLLOWUPS_PER_ITEM, clarificationsUsed: 0,
    questionText: q.text, idealPoints: [], redFlags: [], lookFor: q.look_for, parentQuestionId: null, mustAsk: false,
  } : null;
}
export function pickLadder(comp: PlanCompetency, state: CompetencyState, config: InterviewConfig): Item | null {
  const levels = [state.level, ...[1,2,3,4].flatMap((n) => [state.level + n, state.level - n])].filter((n) => n >= 1 && n <= 5);
  for (const level of levels) {
    const injected = config.mode === "hybrid" && config.customQuestions.find((q) =>
      isInjected(q) && q.competencyKey === comp.key && q.difficulty === level && !state.usedQuestionIds.includes(q.id));
    if (injected) return companyItem(injected, config);
    const question = comp.ladder[level]?.find((q) => !state.usedQuestionIds.includes(q.id));
    if (question) return {
      kind: "technical", phase: "technical", source: "ai_plan", openingQuestionId: null, competencyKey: comp.key, questionId: question.id, level,
      isFollowUp: false, followUpsUsed: 0, maxFollowUps: MAX_FOLLOWUPS_PER_ITEM, clarificationsUsed: 0,
      questionText: question.text, idealPoints: question.ideal_points, redFlags: question.red_flags, lookFor: [], parentQuestionId: null, mustAsk: false,
    };
  }
  return null;
}
