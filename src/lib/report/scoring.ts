import { SCORING, SWAY_STD_SW } from "@/lib/config/constants";
import { DIMENSIONS, readable, TAXONOMY, type CompetencyKey } from "@/lib/config/taxonomy";
import { normalizeWeights, WEIGHT_KEYS } from "@/lib/config/sessionConfig";
import { clamp, mean, percentile, present } from "@/lib/utils/math";
import { expressionVariation, fieldMean, secondsIn } from "@/lib/vision/aggregator";
import { initialTechnical } from "@/lib/strategist/state";
import { replayTechnical } from "@/lib/strategist/engine";
import { pronounCounts } from "./voiceMetrics";
import type { SessionRow, TurnRow } from "@/lib/db/schema";
import type { BaselineFields, InterviewConfig, NonverbalPolicy, SessionEvent, MetricSecond, Weights, ItemKind } from "@/types/interview";
import type { ComponentScores, CompetencyResult, FinalTurnMetrics, Integrity, PitchFrame, SkillDriver, SoftDimension, StatRow, TimedWord } from "@/types/report";

const C = (n: number) => Math.round(clamp(n,0,100));
const percent = (n: number | null | undefined) => n == null ? null : n * 100;
const display = (key: string) => TAXONOMY[key as CompetencyKey]?.[0] ?? readable(key);
const contentKinds = ["technical","behavioral","cv_deep_dive"];
const totalTo100 = (values: (number | null | undefined)[]) => { const value = mean(values.filter(present)); return value === null ? null : C(value * 25); };
export function stressForTurn(metrics: FinalTurnMetrics, base: BaselineFields, kind: ItemKind, duration: number) {
  if (duration < 10000) return null;
  const v = metrics.vision, a = metrics.voice;
  const diff = (x: number | null | undefined, y: number | null, den: number) => x == null || y == null ? null : (x-y)/den;
  const factors = {
    blink:diff(v?.blinkPerMin,base.blinkPerMin,10), brow:diff(v?.browTensionMean,base.browTension,.15),
    lip:diff(v?.lipPressMean,base.lipPress,.15), fidget:diff(v?.fidgetPct,base.fidgetFrac,.30),
    touch:diff(v?.selfTouchPerMin,base.selfTouchPerMin,2), gaze:v?.eyeContactPct == null ? null : (base.eyeContact-v.eyeContactPct)/.25,
    pitch:diff(a?.pitchMedianSt,base.pitchMedianSt,2), filler:diff(a?.fillerPerMin,base.fillerPerMin,4),
    latency:contentKinds.includes(kind) ? diff(a?.responseLatencyMs,1500,3000) : null,
  };
  let numerator = 0, denominator = 0;
  for (const key of Object.keys(factors) as Array<keyof typeof factors>) {
    const value = factors[key];
    if (value === null) continue;
    const weight = SCORING.stressWeights[key];
    numerator += weight * clamp(value,0,2); denominator += weight;
  }
  return denominator ? numerator / denominator / 2 : null;
}
export function levelFor(score: number | null) {
  if (score == null) return { level:null,levelLabel:null };
  const level = SCORING.levelMinimums.findLastIndex((min) => score >= min) + 1;
  return { level,levelLabel:SCORING.levels[level-1] };
}
export function overallScore(components: ComponentScores, weights: Weights) {
  const eligible = { ...weights };
  for (const key of WEIGHT_KEYS) if (components[key] == null) eligible[key] = 0;
  const denominator = WEIGHT_KEYS.reduce((sum,key) => sum+eligible[key],0);
  const score = denominator ? C(WEIGHT_KEYS.reduce((sum,key) => sum+eligible[key]*(components[key] ?? 0),0)/denominator) : 0;
  return { score,effectiveWeights:normalizeWeights(eligible) };
}
export function practiceVerdict(review: boolean, technical: number | null, ceilingRatio: number, soft: number | null, maturity: number | null) {
  if (review) return "Integrity review needed";
  if (technical === null) { const score = maturity ?? soft ?? 0; return score >= 70 ? "Hire signal" : score >= 55 ? "Borderline" : "Not yet ready"; }
  if (ceilingRatio >= 1 && (soft ?? 0) >= 70) return "Strong hire signal";
  if (ceilingRatio >= .85 && (soft ?? 0) >= 55) return "Hire signal";
  return ceilingRatio >= .65 ? "Borderline" : "Not yet ready";
}
export function recommendation(review: boolean, score: number, threshold: number) {
  if (review) return "Integrity review needed";
  if (score >= threshold) return "Recommend advance";
  return score >= threshold - SCORING.recommendationMargin ? "Consider" : "Not recommended";
}
export function calculateIntegrity(events: SessionEvent[]): Integrity {
  const flags = new Map<string,{ type:string;count:number;totalMs:number }>();
  const liveTypes = new Set(["second_person","phone_use","reading_notes","left_frame","looking_off_screen"]);
  for (const event of events) {
    if (event.category !== "integrity" && !(event.category === "live_vision" && liveTypes.has(event.type))) continue;
    const value = flags.get(event.type) ?? { type:event.type,count:0,totalMs:0 };
    value.count++; value.totalMs += Math.max(0,event.endMs-event.startMs); flags.set(event.type,value);
  }
  const tabs = flags.get("tab_hidden");
  const live = events.filter((event) => event.category === "live_vision" && ["second_person","phone_use"].includes(event.type)).length;
  const review = (flags.get("multiple_faces")?.totalMs ?? 0) >= 10000 || (tabs?.count ?? 0) >= 3
    || (tabs?.totalMs ?? 0) >= 30000 || (flags.get("reading_pattern")?.count ?? 0) >= 3 || live >= 2;
  return { badge:review ? "review" : flags.size ? "minor" : "clean", flags:[...flags.values()] };
}
export function certificateEligibility(kind: InterviewConfig["kind"], end: SessionRow["endReason"], integrity: Integrity["badge"], technical: CompetencyResult[]) {
  if (kind !== "practice") return { certificate:false,reasons:["Certificates are only issued for practice interviews."] };
  const reasons = [];
  if (end !== "completed" && end !== "hard_cap") reasons.push("Complete the interview to earn a certificate.");
  if (integrity === "review") reasons.push("This interview needs an integrity review.");
  if (!technical.some((c) => !c.notAssessed)) reasons.push("At least one technical competency must be assessed.");
  return { certificate:reasons.length === 0,reasons };
}
export function technicalResults(session: SessionRow, rows: TurnRow[]) {
  if (!session.plan) return { score:null,expectedLevel:1,competencies:[],companyQuestionsScore:null };
  const strategy = initialTechnical(session.config,session.plan);
  const states = replayTechnical(session.config,strategy,rows.map((row) => ({
    ...row,followUpType:row.strategistOutput?.followUpType as "weak"|"strong"|undefined,
    parentSource:row.strategistOutput?.parentSource as TurnRow["questionSource"]|undefined,
  })));
  const competencies: CompetencyResult[] = strategy.order.map((key) => {
    const state = states[key];
    const original = session.plan?.technical.find((item) => item.key === key);
    const custom = session.config.customQuestions.find((item) => item.competencyKey === key);
    const claim = session.plan?.cv_claims.find((item) => item.competency_key === key);
    return {
      key,displayName:display(key),subLabel:original?.sub_label ?? custom?.subLabel ?? null,
      ceiling:state.ceiling,bracketed:state.bracketed,theta:state.theta,score:C(state.theta*20),notAssessed:state.notAssessed,
      path:rows.filter((row) => row.itemKind === "technical" && row.competencyKey === key).map((row) => ({
        turnIdx:row.idx,level:row.difficulty,total:row.scoreTotal,outcome:row.scores?.outcome ?? null,isFollowUp:row.isFollowUp,source:row.questionSource,
      })),
      cvClaim:claim ? { claimedLevel:claim.claimed_level,signal:state.ceiling !== null && state.ceiling >= claim.claimed_level ? "verified" :
        state.bracketed && state.ceiling !== null && state.ceiling <= claim.claimed_level-2 ? "overstated" : "unverified" } : null,
      commentary:"",
    };
  });
  const extra = rows.filter((row) => row.itemKind === "technical" && (row.questionSource === "company" || row.strategistOutput?.parentSource === "company") &&
    (!row.competencyKey || !strategy.order.includes(row.competencyKey) || row.difficulty === null));
  const companyQuestionsScore = totalTo100(extra.map((row) => row.scoreTotal));
  const values = [...competencies.filter((c) => !c.notAssessed).map((c) => c.score),companyQuestionsScore].filter(present);
  return { score:values.length ? C(mean(values)!) : null,expectedLevel:session.plan.expected_level,competencies,companyQuestionsScore };
}

export type SessionDelivery = {
  ec:number|null; postureOkPct:number|null; swayPct:number|null; armsCrossedPct:number|null; gesturePct:number|null; fidgetPct:number|null;
  selfTouchPerMin:number|null; expressiveness:number|null; nodsPerMinListening:number|null; smileTimeFrac:number|null; wpm:number|null;
  fillerPerMin:number|null; hedgePerMin:number|null; pitchRangeSt:number|null; lowVolumeFrac:number|null; iRatio:number|null;
  vocalConfidence:number|null; blinkPerMin:number|null; latency:number|null; uptalkRate:number|null;
};
export function aggregateDelivery(turns: TurnRow[], timeline: MetricSecond[], pitch: PitchFrame[], words: Map<number,TimedWord[]>): SessionDelivery {
  const answerTurns = turns.filter((turn) => turn.idx !== 0 && turn.answerEndMs != null && (turn.answerStartMs ?? turn.askEndMs) != null);
  const windows = answerTurns.map((t) => ({ start:t.answerStartMs ?? t.askEndMs!,end:t.answerEndMs! }));
  const answers = timeline.filter(({t}) => windows.some((w) => t*1000 >= w.start && t*1000 < w.end));
  const asks = turns.flatMap((turn) => turn.askStartMs !== null && turn.askEndMs !== null ? secondsIn(timeline,turn.askStartMs,turn.askEndMs) : []);
  const track = pitch.filter(({tMs}) => windows.some((w) => tMs >= w.start && tMs < w.end)).map((f) => f.st).filter(present);
  const voices = answerTurns.flatMap((t) => t.finalMetrics?.voice ? [t.finalMetrics.voice] : []);
  const durationMs = windows.reduce((sum,w) => sum+Math.max(0,w.end-w.start),0);
  const askMs = turns.reduce((sum,t) => sum+Math.max(0,(t.askEndMs ?? 0)-(t.askStartMs ?? 0)),0);
  const speaking = voices.reduce((sum,voice) => sum+voice.speakingMs,0);
  const totalWords = voices.reduce((sum,voice) => sum+voice.wordCount,0);
  const counts = pronounCounts(answerTurns.filter((turn) => ["behavioral","cv_deep_dive","presentation"].includes(turn.itemKind)).flatMap((turn) => words.get(turn.idx) ?? []));
  const nv = answerTurns.map((turn) => turn.finalMetrics?.vision);
  const timedRate = (n: number) => durationMs > 0 ? n*60000/durationMs : null;
  const slouch = fieldMean(answers,"sl");
  const smiles = [...asks,...answers].map((s) => s.sm).filter(present);
  return {
    ec:fieldMean(answers,"ec"),postureOkPct:slouch === null ? null : 1-slouch, swayPct:mean(answers.map((s) => s.sw).filter(present).map((v) => Number(v > SWAY_STD_SW))),
    armsCrossedPct:fieldMean(answers,"ac"),gesturePct:fieldMean(answers,"gs"),fidgetPct:fieldMean(answers,"fg"),
    selfTouchPerMin:answers.length ? timedRate(nv.reduce((n,v) => n+(v?.selfTouchCount ?? 0),0)) : null,expressiveness:expressionVariation(answers),
    nodsPerMinListening:askMs && asks.length ? asks.reduce((n,s) => n+s.nd,0)*60000/askMs : null,smileTimeFrac:mean(smiles.map((v) => Number(v>.3))),
    wpm:speaking >= 5000 ? totalWords*60000/speaking : null,
    fillerPerMin:voices.length ? timedRate(voices.reduce((n,v) => n+v.hardFillers+v.softFillers,0)) : null,
    hedgePerMin:voices.length ? timedRate(voices.reduce((n,v) => n+v.hedges,0)) : null,
    pitchRangeSt:track.length ? percentile(track,.9)!-percentile(track,.1)! : null,
    lowVolumeFrac:durationMs && track.length ? nv.reduce((n,v) => n+(v?.lowVolumeMs ?? 0),0)/durationMs : null,
    iRatio:counts.i+counts.we >= 5 ? counts.i/(counts.i+counts.we) : null,
    vocalConfidence:mean(answerTurns.map((t) => t.tone?.vocalConfidence).filter(present)),
    blinkPerMin:answers.length ? timedRate(answers.reduce((n,s) => n+s.bl,0)) : null,
    latency:mean(voices.map((v) => v.responseLatencyMs).filter(present)),uptalkRate:mean(voices.map((v) => v.uptalkRate).filter(present)),
  };
}
export function pressureTurns(turns: TurnRow[], results: CompetencyResult[]) {
  const chosen = turns.filter((turn) => {
    if (turn.finalMetrics?.stress == null) return false;
    const ceiling = results.find((c) => c.key === turn.competencyKey)?.ceiling;
    return turn.itemKind === "presentation" || turn.itemKind === "presentation_followup" || turn.itemKind === "technical" &&
      (turn.scores?.outcome === "fail" || ceiling != null && (turn.difficulty ?? 0) >= ceiling);
  });
  if (chosen.length) return chosen;
  const tech = turns.filter((turn) => turn.itemKind === "technical" && turn.finalMetrics?.stress != null);
  return tech.length ? tech : turns.filter((turn) => turn.scores && turn.finalMetrics?.stress != null);
}
export function softSkills(policy: NonverbalPolicy, turns: TurnRow[], delivery: SessionDelivery, base: BaselineFields, pressure: TurnRow[]) {
  const d = delivery;
  const scored = turns.filter((t) => t.scores && !t.scores.scoringFailed);
  const content = totalTo100(scored.map((t) => t.scores?.rubric.communication));
  const own = totalTo100(scored.filter((t) => t.itemKind === "behavioral" || t.itemKind === "cv_deep_dive").map((t) => t.scores?.rubric.ownership));
  const presentTurn = scored.find((t) => t.itemKind === "presentation");
  const pres = presentTurn?.scoreTotal == null ? null : presentTurn.scoreTotal*25;
  const neutral = (value: number | null | undefined, f: (x:number)=>number) => value == null ? 50 : C(f(value));
  const ec = neutral(d.ec,(value) => 100*(value-.30)/.50);
  const po = neutral(d.postureOkPct,(value) => 100*value - 50*(d.swayPct ?? 0) - 30*(d.armsCrossedPct ?? 0));
  const pv = neutral(d.pitchRangeSt,(value) => 100*(value-2)/5);
  const vc = neutral(d.lowVolumeFrac,(value) => 100-300*value);
  const ge = neutral(d.gesturePct,(value) => 100-100*Math.abs(value-.35)/.35-100*(d.fidgetPct ?? 0));
  const st = neutral(d.selfTouchPerMin,(value) => 100-25*value);
  const averageStress = mean(scored.map((t) => t.finalMetrics?.stress).filter(present));
  const pressureStress = mean(pressure.map((t) => t.finalMetrics?.stress).filter(present));
  const ownership = own == null ? null : d.iRatio == null ? own : C(.8*own + .2*C(100-100*Math.abs(d.iRatio-.65)/.65));
  const scores = {
    executive_presence:C(.30*ec+.25*po+.20*C(.5*pv+.5*vc)+.15*ge+.10*st),
    composure:neutral(pressureStress,(value) => 100*(1-value)),
    clarity_structure:content === null ? null : C(.5*content+.3*neutral(d.wpm,(v) => 100-2*Math.abs(v-145))+.2*neutral(d.fillerPerMin,(v) => 100-12*v)),
    engagement:C(.4*ec+.2*neutral(d.expressiveness,(v) => 100*(v-.02)/.06)+.2*neutral(d.nodsPerMinListening,(v) => 100*v/3)+.2*neutral(d.smileTimeFrac,(v) => 100*v/.15)),
    ownership,
    persuasion:pres === null ? null : C(.7*pres+.3*(presentTurn?.finalMetrics?.composure ?? 50)),
    vocal_confidence:C(.6*(d.vocalConfidence ?? 60)+.2*neutral(d.hedgePerMin,(v) => 100-15*v)+.2*neutral(averageStress,(v) => 100*(1-v))),
  };
  const driver = (name:string,value:number|null,baseline:number|null = null,unit = ""):SkillDriver => ({ name,value,baseline,unit });
  const drivers: Record<(typeof DIMENSIONS)[number],SkillDriver[]> = {
    executive_presence:[driver("Eye contact",percent(d.ec),base.eyeContact*100,"%"),driver("Upright posture",percent(d.postureOkPct),null,"%"),driver("Pitch variety",d.pitchRangeSt,base.pitchRangeSt,"st"),driver("Gestures",percent(d.gesturePct),base.gestureFrac*100,"%"),driver("Self-touch",d.selfTouchPerMin,base.selfTouchPerMin,"/min")],
    composure:[driver("Pressure stress",pressureStress)],clarity_structure:[driver("Content",content,null,"%"),driver("Pace",d.wpm,base.wpm,"wpm"),driver("Fillers",d.fillerPerMin,base.fillerPerMin,"/min")],
    engagement:[driver("Eye contact",percent(d.ec),base.eyeContact*100,"%"),driver("Expression variation",d.expressiveness,base.expressiveness),driver("Listening nods",d.nodsPerMinListening,null,"/min"),driver("Smiling",percent(d.smileTimeFrac),base.smile*100,"%")],
    ownership:[driver("Content ownership",own,null,"%"),driver("Individual contribution",percent(d.iRatio),null,"%")],
    persuasion:[driver("Presentation",pres,null,"%"),driver("Presentation composure",presentTurn?.finalMetrics?.composure ?? null,null,"%")],
    vocal_confidence:[driver("Tone confidence",d.vocalConfidence,null,"%"),driver("Hedges",d.hedgePerMin,base.hedgePerMin,"/min"),driver("Average stress",averageStress)],
  };
  const dimensions: SoftDimension[] = policy === "off" ? [] : DIMENSIONS.map((key) => ({
    key,label:readable(key),score:scores[key],...levelFor(scores[key]),drivers:drivers[key],commentary:"",
  }));
  const maturity = mean(dimensions.map((item) => item.score).filter(present));
  const maturityScore = maturity === null ? null : C(maturity);
  const { level:maturityLevel,levelLabel:maturityLabel } = levelFor(maturityScore);
  const contentOnly = mean([content,policy === "off" ? own : ownership,pres].filter(present));
  return { score:policy === "scored" ? maturityScore : contentOnly === null ? null : C(contentOnly), data:{ policy,maturityScore,maturityLevel,maturityLabel,dimensions } };
}

function stat(metric: string, value: number|null, baseline: number|null, unit: string, good:(v:number)=>boolean, watch:(v:number)=>boolean): StatRow {
  return { metric,value,baseline,unit,verdict:value === null ? null : good(value) ? "good" : watch(value) ? "watch" : "improve" };
}
export function statRows(d: SessionDelivery, b: BaselineFields, policy: NonverbalPolicy) {
  if (policy === "off") return { vision:[],voice:[] };
  const rate = d.blinkPerMin === null || b.blinkPerMin === 0 ? null : d.blinkPerMin/b.blinkPerMin;
  return { vision:[
    stat("Eye contact",percent(d.ec),b.eyeContact*100,"%",x=>x>=65,x=>x>=45),
    stat("Blink rate vs baseline",rate,1,"×",x=>x<=1.3,x=>x<=1.6),
    stat("Upright posture",percent(d.postureOkPct),null,"%",x=>x>=85,x=>x>=65),
    stat("Fidgeting",percent(d.fidgetPct),b.fidgetFrac*100,"%",x=>x<=10,x=>x<=25),
    stat("Self-touch",d.selfTouchPerMin,b.selfTouchPerMin,"/min",x=>x<=.5,x=>x<=1.5),
    stat("Gesturing",percent(d.gesturePct),b.gestureFrac*100,"%",x=>x>=20&&x<=50,x=>x>=10&&x<=65),
  ],voice:[
    stat("Speaking pace",d.wpm,b.wpm,"wpm",x=>x>=120&&x<=170,x=>x>=100&&x<=190),
    stat("Fillers",d.fillerPerMin,b.fillerPerMin,"/min",x=>x<=3,x=>x<=6),
    stat("Pitch variety",d.pitchRangeSt,b.pitchRangeSt,"st",x=>x>=4,x=>x>=2.5),
    stat("Hedges",d.hedgePerMin,b.hedgePerMin,"/min",x=>x<=2,x=>x<=4),
    stat("Response latency",d.latency===null?null:d.latency/1000,null,"s",x=>x<=3,x=>x<=6),
    stat("Uptalk rate",d.uptalkRate,null,"",x=>x<=.2,x=>x<=.4),
  ] };
}

export const meanComponent = (turns: TurnRow[], kind: ItemKind) => totalTo100(turns.filter((t) => t.itemKind === kind).map((t) => t.scoreTotal));
