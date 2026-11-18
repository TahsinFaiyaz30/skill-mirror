import { FORCE_CLOSE_BEFORE_CAP_MS, MAX_CLARIFICATIONS_PER_ITEM, MINUTE, PHASE_GRACE_MS } from "@/lib/config/constants";
import type { InterviewConfig, P4Output, Phase, StrategistInput, TurnScores } from "@/types/interview";
import { wordsIn } from "@/lib/utils/math";
import { calibrationQuestion, compose } from "./compose";
import { updateTheta } from "./elo";
import { getQueueItem, pickLadder } from "./queues";
import { buildScores, strongFollowUp } from "./scoring";
import { applyStaircase, finishAtCap, stepStaircase, type CompetencyState } from "./staircase";
import { basicItem, initialState, type InterviewContext, type Item, type StrategistState } from "./state";

export type Evaluation = { output: P4Output; source: TurnScores["source"]; mockTotal?: number };
export type Transition = { state: StrategistState; scores?: TurnScores; clarification?: { request: string; reply: string }; evaluated?: Item; idempotent?: boolean; };
export function startInterview(context: InterviewContext) {
  const item = basicItem("calibration","intro_calibration",calibrationQuestion);
  return initialState(context, compose(context, item, { seq: 1, turnIdx: 0 }), item);
}
export function reserveFor(config: InterviewConfig, index: number) {
  return config.phaseOrder.slice(index + 1).reduce((sum, phase) => sum + (config.phaseBudgetsMs[phase] ?? 0), 0);
}
export function phaseLimits(state: StrategistState, config: InterviewConfig, elapsedMs: number) {
  const spent = elapsedMs - state.phaseStartedMs;
  const budget = config.phaseBudgetsMs[state.phase] ?? 0;
  const remaining = config.hardCapMs - elapsedMs - reserveFor(config, state.phaseIndex);
  return { underBudget: spent < budget && remaining >= MINUTE, mustAskFits: remaining >= FORCE_CLOSE_BEFORE_CAP_MS,
    allowFollowUp: spent < budget + PHASE_GRACE_MS && elapsedMs < config.hardCapMs - FORCE_CLOSE_BEFORE_CAP_MS, spent, budget, remaining };
}
export function finalizeCoverage(state: StrategistState, phase?: Phase, config?: InterviewConfig) {
  const ids = phase && config ? config.customQuestions.filter((q) => q.phase === phase).map((q) => q.id) : Object.keys(state.coverage);
  for (const id of ids) if (state.coverage[id]?.status === "pending") state.coverage[id].status = "unasked";
}
function finishTechnical(state: StrategistState) {
  for (const comp of Object.values(state.technical.comps)) {
    if (comp.done) continue;
    comp.done = true;
    comp.notAssessed = true;
    comp.ceiling = null;
  }
}
function nextPhase(state: StrategistState, config: InterviewConfig, elapsedMs: number) {
  finalizeCoverage(state, state.phase, config);
  if (state.phase === "technical" && config.mode !== "scripted") finishTechnical(state);
  state.phaseIndex = Math.min(state.phaseIndex + 1, config.phaseOrder.length - 1);
  state.phase = config.phaseOrder[state.phaseIndex];
  state.phaseStartedMs = elapsedMs;
}
function technicalItem(state: StrategistState, context: InterviewContext) {
  const { technical } = state;
  while (technical.activeIndex < technical.order.length) {
    const key = technical.order[technical.activeIndex];
    const comp = technical.comps[key];
    const spec = context.plan.technical.find((c) => c.key === key);
    if (!comp.done && spec) {
      const item = pickLadder(spec, comp, context.config);
      if (item) {
        comp.usedQuestionIds.push(item.questionId!);
        if (item.source === "ai_plan") comp.level = item.level!;
        return item;
      }
      comp.done = true; comp.ceiling = Math.max(0, ...comp.passed);
    }
    technical.activeIndex++;
  }
  return null;
}
export function selectNext(state: StrategistState, context: InterviewContext, elapsedMs: number): Item {
  const { config, plan } = context;
  if (state.phase === "intro_calibration") nextPhase(state, config, elapsedMs);
  for (let i = 0; i < config.phaseOrder.length; i++) {
    const { phase } = state;
    if (phase === "close") return basicItem("close", "close");
    const { underBudget, mustAskFits } = phaseLimits(state, config, elapsedMs);
    if (phase === "presentation") {
      if (underBudget && state.presentation.stage === "none" && (plan.presentation || config.presentation.custom)) {
        state.presentation.stage = "prompted";
        return basicItem("presentation", phase, plan.presentation?.title ?? "Presentation");
      }
    } else if (phase === "candidate_questions") {
      if (underBudget && state.current.kind !== "candidate_questions") return basicItem("candidate_questions", phase, "Do you have any questions for me?");
    } else {
      const queue = state.queues[phase] ?? [];
      const limit = phase === "behavioral" ? config.behavioralCount : phase === "cv_deep_dive" ? config.cvQuestionCount : Infinity;
      const total = state.primariesAsked[phase] ?? 0;
      const eligible = (entry: (typeof queue)[number]) => !entry.done && (entry.mustAsk || entry.source === "company" || total < limit);
      const next = queue.find((entry) => eligible(entry) && (underBudget || mustAskFits && entry.mustAsk));
      if (next) {
        next.done = true;
        const item = getQueueItem(next, phase, config, plan, !underBudget && next.mustAsk);
        if (item) return item;
      }
      if (underBudget && phase === "technical" && config.mode !== "scripted") {
        const item = technicalItem(state, context);
        if (item) return item;
      }
    }
    nextPhase(state, config, elapsedMs);
  }
  return basicItem("close", "close");
}
export function shouldScore(state: StrategistState, config: InterviewConfig, input: StrategistInput) {
  return input.directiveSeq === state.lastDirective.seq && input.turnIdx === state.turnIdx && state.current.kind !== "close"
    && input.event !== "presentation_prep_done" && input.event !== "presentation_interrupt"
    && (input.event !== "force_close" || input.timings.answerStartMs !== null)
    && input.answerStatus !== "no_response" && input.answerStatus !== "skipped" && state.llmCalls < config.maxStrategistCalls;
}
function followUp(item: Item, state: StrategistState, text: string, type: "weak" | "strong"): Item {
  return { ...item, source: "ai_followup", openingQuestionId: null, questionId: "fu-" + (state.turnIdx + 1), isFollowUp: true, followUpsUsed: item.followUpsUsed + 1,
    clarificationsUsed: 0, questionText: text, parentQuestionId: item.parentQuestionId ?? item.questionId, parentSource: item.parentSource ?? item.source, followUpType: type };
}
function advance(state: StrategistState, context: InterviewContext, item: Item, scores?: TurnScores, ack?: string, status?: StrategistInput["answerStatus"]) {
  const nextIdx = state.turnIdx + 1;
  const directive = compose(context, item, { seq: state.lastDirective.seq + 1, turnIdx: nextIdx, previous: state.current, ack, status });
  if (!item.isFollowUp && item.kind !== "close") state.primariesAsked[item.phase] = (state.primariesAsked[item.phase] ?? 0) + 1;
  if (item.openingQuestionId) state.coverage[item.openingQuestionId] = { status: "asked", turnIdx: nextIdx };
  if (item.kind === "close") { finishTechnicalIfNeeded(state, context.config); finalizeCoverage(state); }
  state.current = item; state.turnIdx = nextIdx; state.phase = item.phase; state.phaseIndex = directive.phaseIndex; state.lastDirective = directive;
  return { state, scores };
}
function finishTechnicalIfNeeded(state: StrategistState, config: InterviewConfig) {
  if (config.mode === "scripted") {
    for (const key of state.technical.order) {
      const comp = state.technical.comps[key];
      comp.notAssessed = !state.history.some((item) => item.competencyKey === key && item.kind === "technical");
      comp.done = true;
    }
  } else finishTechnical(state);
}
export function transition(original: StrategistState, context: InterviewContext, input: StrategistInput, evaluation?: Evaluation, challenge?: string): Transition {
  if (input.directiveSeq !== original.lastDirective.seq || input.turnIdx !== original.turnIdx || original.current.kind === "close")
    return { state: original, idempotent: true };
  const state = structuredClone(original);
  const item = state.current;
  const { config, plan } = context;
  const seq = original.lastDirective.seq + 1;
  const force = input.event === "force_close" || input.elapsedMs >= config.hardCapMs - FORCE_CLOSE_BEFORE_CAP_MS;
  if (!force && (input.event === "presentation_prep_done" || input.event === "presentation_interrupt") && item.kind === "presentation") {
    const begin = input.event === "presentation_prep_done";
    state.presentation.stage = begin ? "began" : "interrupted";
    if (!begin) { state.presentation.interruptChallenge = challenge || plan.presentation?.interrupt_challenge || "What evidence would support that recommendation?"; state.llmCalls++; }
    state.lastDirective = compose(context, item, { seq, turnIdx: state.turnIdx, mode: begin ? "presentation_begin" : "presentation_interrupt", wording: state.presentation.interruptChallenge ?? undefined });
    return { state };
  }
  if (force && input.timings.answerStartMs === null) {
    return advance(state, context, basicItem("close", "close"), undefined, undefined, input.answerStatus);
  }
  const output = evaluation?.output ?? null;
  if (shouldScore(original, config, input)) state.llmCalls++;
  if (!force && output && ["clarification_request","repeat_request"].includes(output.intent) && wordsIn(input.transcript) < 40 && item.clarificationsUsed < MAX_CLARIFICATIONS_PER_ITEM) {
    item.clarificationsUsed++;
    state.lastDirective = compose(context, item, { seq, turnIdx: state.turnIdx, mode: "ask", clarification: true, wording: output.clarification_reply });
    return { state, clarification: { request: input.transcript, reply: state.lastDirective.sayText } };
  }
  const skipped = input.answerStatus === "skipped" || output?.intent === "skip_request";
  const zero = skipped || input.answerStatus === "no_response";
  const scores = buildScores(item.kind, output, evaluation?.source ?? (zero ? "fallback" : "fallback"), config.ai.strictness, {
    zero, interrupt: state.presentation.stage === "interrupted", mockTotal: evaluation?.mockTotal,
  });
  if (item.openingQuestionId && skipped) state.coverage[item.openingQuestionId].status = "skipped_by_candidate";
  state.history.push({ turnIdx: state.turnIdx, kind: item.kind, competencyKey: item.competencyKey, level: item.level, total: scores.total, outcome: scores.outcome, shortQuestion: item.questionText.slice(0, 80) });
  if (scores.note && state.notes.length < 30) state.notes.push(scores.note);
  let pending: Item | null = null;
  const limits = phaseLimits(state, config, input.elapsedMs);
  const comp = item.competencyKey ? state.technical.comps[item.competencyKey] : undefined;
  const parent = item.parentSource ?? item.source;
  const stack = item.kind === "technical" && parent === "ai_plan" && comp && item.level != null;
  const eligible = Boolean(!force && !zero && output && limits.allowFollowUp && item.followUpsUsed < item.maxFollowUps);
  const weak = eligible && (item.kind === "technical" && scores.outcome === "partial" && (!item.isFollowUp || parent === "company") ||
    item.kind === "cv_deep_dive" && scores.outcome === "partial" ||
    item.kind === "behavioral" && !item.isFollowUp && (!scores.star?.action || !scores.star.result));
  const strong = eligible && strongFollowUp(item, scores, config.ai.adversarialIntensity, comp?.tradeoffProbed);
  if (weak && output?.follow_up_if_weak.text) pending = followUp(item, state, output.follow_up_if_weak.text, "weak");
  else if (strong && output?.follow_up_if_strong.text) {
    pending = followUp(item, state, output.follow_up_if_strong.text, "strong");
    if (stack && comp) comp.tradeoffProbed = true;
  }
  if (item.kind === "technical" && comp && item.level != null) {
    if (!scores.scoringFailed) comp.theta = updateTheta(comp.theta, item.level, scores.total);
    if (stack) state.technical.comps[item.competencyKey!] = stepStaircase(comp, { level: item.level, outcome: scores.outcome,
      followUp: item.followUpType, pendingWeak: pending?.followUpType === "weak" }, config.techMaxItems);
  }
  if (!force && item.kind === "presentation") {
    state.presentation.stage = "ended";
    const wording = output?.follow_up_if_strong.text || plan.presentation?.pushback_angles[0] || "What would change your recommendation?";
    pending = { ...basicItem("presentation_followup", "presentation", wording), source: "ai_followup", isFollowUp: true, questionId: "fu-" + (state.turnIdx + 1) };
  }
  if (item.kind === "presentation_followup") state.presentation.stage = "followup_asked";
  const next = force ? basicItem("close", "close") : pending ?? selectNext(state, context, input.elapsedMs);
  return { ...advance(state, context, next, scores, output?.ack || "Thanks.", skipped ? "skipped" : input.answerStatus), evaluated: item };
}

export type ReplayTurn = { competencyKey: string | null; difficulty: number | null; questionSource: Item["source"]; itemKind: Item["kind"];
  scores: TurnScores | null; isFollowUp: boolean; followUpType?: "weak" | "strong"; parentSource?: Item["source"] };
export function replayTechnical(config: InterviewConfig, original: StrategistState["technical"], turns: ReplayTurn[]) {
  const results: Record<string, CompetencyState> = structuredClone(original.comps);
  for (const key of original.order) {
    let comp = results[key];
    const group = turns.filter((t) => t.itemKind === "technical" && t.competencyKey === key && t.difficulty !== null && t.scores);
    group.forEach((turn, index) => {
      const scores = turn.scores!, level = turn.difficulty!, source = turn.parentSource ?? turn.questionSource;
      if (!scores.scoringFailed) comp.theta = updateTheta(comp.theta, level, scores.total);
      if (source === "company" || config.mode === "scripted" || turn.followUpType === "strong") return;
      if (turn.followUpType === "weak") {
        if (!scores.scoringFailed) comp = applyStaircase(comp, level, scores.outcome === "pass" ? "pass" : "fail");
      } else {
        comp.items++;
        const nextIsWeak = group[index + 1]?.followUpType === "weak" && group[index + 1].difficulty === level;
        if (scores.outcome !== "na" && !nextIsWeak) comp = applyStaircase(comp, level, scores.outcome === "pass" ? "pass" : "fail");
        if (nextIsWeak) return;
      }
      comp = finishAtCap(comp, config.techMaxItems);
    });
    comp.notAssessed = !group.length;
    if (config.mode === "scripted" || comp.notAssessed) comp.ceiling = null;
    else if (comp.ceiling === null) comp.ceiling = Math.max(0,...comp.passed);
    results[key] = comp;
  }
  return results;
}
