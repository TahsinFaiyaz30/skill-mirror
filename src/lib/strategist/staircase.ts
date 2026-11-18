import type { ScoreOutcome } from "@/types/interview";
export type CompetencyState = {
  level: number; theta: number; passed: number[]; failed: number[]; items: number; ceiling: number | null;
  bracketed: boolean; done: boolean; notAssessed: boolean; usedQuestionIds: string[]; tradeoffProbed: boolean;
};
export function newCompetency(level: number): CompetencyState {
  return { level, theta: level - .5, passed: [], failed: [], items: 0, ceiling: null, bracketed: false, done: false, notAssessed: false, usedQuestionIds: [], tradeoffProbed: false };
}
export function applyStaircase(comp: CompetencyState, level: number, outcome: "pass" | "fail") {
  const result = { ...comp, passed: [...comp.passed], failed: [...comp.failed] };
  const seen = outcome === "pass" ? result.passed : result.failed;
  if (!seen.includes(level)) seen.push(level);
  const bracket = outcome === "pass" ? level === 5 || result.failed.includes(level + 1) : level === 1 || result.passed.includes(level - 1);
  if (bracket) return { ...result, done: true, bracketed: true, ceiling: outcome === "pass" ? level : level - 1 };
  return { ...result, level: level + (outcome === "pass" ? 1 : -1) };
}
export function finishAtCap(comp: CompetencyState, cap: number) {
  return !comp.done && comp.items >= cap ? { ...comp, done: true, ceiling: Math.max(0, ...comp.passed), bracketed: false } : comp;
}
export function stepStaircase(comp: CompetencyState, action: { level: number; outcome: ScoreOutcome; followUp?: "weak" | "strong"; pendingWeak?: boolean }, cap: number) {
  const primary = !action.followUp;
  let next = { ...comp, items: comp.items + Number(primary) };
  if (action.pendingWeak) return next;
  if (action.followUp === "weak") next = applyStaircase(next, action.level, action.outcome === "pass" ? "pass" : "fail");
  else if (primary && action.outcome !== "na") next = applyStaircase(next, action.level, action.outcome === "pass" ? "pass" : "fail");
  return finishAtCap(next, cap);
}
