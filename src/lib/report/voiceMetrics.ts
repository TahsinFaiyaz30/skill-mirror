import * as C from "@/lib/config/constants";
import { median, percentile, present } from "@/lib/utils/math";
import type { BaselineFields, ItemKind, SessionEvent } from "@/types/interview";
import type { FinalVoice, PitchFrame, TimedSegment, TimedWord } from "@/types/report";

export const normalizeWord = (text: string) => text.toLowerCase().replaceAll("’","'").replace(/[^a-z0-9']/g,"");
const hard = new Set(["um","umm","uh","uhh","er","erm","ah","hmm","mm","mhm"]);
const soft = new Set(["like","basically","actually","literally","you know","i mean","sort of","kind of"]);
const hedges = ["i'm not sure","not sure","i think","i guess","i believe","i suppose","maybe","probably","perhaps","possibly","might","could be","hopefully"].map((s) => s.split(" "));
const firstPerson = new Set(["i","i'm","i've","i'd","i'll","me","my","mine"]);
const groupPerson = new Set(["we","we're","we've","we'd","we'll","us","our","ours"]);
const contentKinds = ["technical","behavioral","cv_deep_dive"];
export function identifyFillers(words: TimedWord[]) {
  const normalized = words.map((word) => normalizeWord(word.w));
  const hardFillers: TimedWord[] = [], softFillers: TimedWord[] = [];
  for (let i = 0; i < words.length; i++) {
    if (hard.has(normalized[i])) { hardFillers.push(words[i]); continue; }
    const pair = i + 1 < words.length && soft.has(normalized[i] + " " + normalized[i+1]);
    if (!pair && !soft.has(normalized[i])) continue;
    const last = pair ? i + 1 : i;
    const current = words[i], end = words[last];
    const gapBefore = i ? current.s - words[i-1].e : 0;
    const gapAfter = words[last+1] ? words[last+1].s - end.e : 0;
    const comma = /^,|,$/.test(current.w.trim()) || /,$/.test(end.w.trim()) || Boolean(words[i-1]?.w.trim().endsWith(","));
    if (comma || Math.max(gapBefore,gapAfter) >= C.SOFT_FILLER_PAUSE_MS) {
      softFillers.push({ w: pair ? current.w + " " + end.w : current.w, s: current.s, e: end.e }); i = last;
    }
  }
  return { hardFillers, softFillers };
}
export function countHedges(words: TimedWord[]) {
  const terms = words.map((word) => normalizeWord(word.w));
  let total = 0;
  for (let i = 0; i < terms.length; i++) {
    const match = hedges.find((tokens) => tokens.every((token,j) => terms[i+j] === token));
    if (match) { total++; i += match.length - 1; }
  }
  return total;
}
export function pronounCounts(words: TimedWord[]) {
  const wordsFixed = words.map((word) => normalizeWord(word.w));
  return { i:wordsFixed.filter((word) => firstPerson.has(word)).length, we:wordsFixed.filter((word) => groupPerson.has(word)).length };
}
export function uptalkRate(segments: TimedSegment[], pitch: PitchFrame[]) {
  const trials = segments.filter((segment) => !segment.text.trim().endsWith("?")).flatMap((segment) => {
    const values = (a: number,b: number) => median(pitch.filter((item) => item.tMs >= a && item.tMs < b).map((item) => item.st).filter(present));
    const end = values(Math.max(segment.s,segment.e-400),segment.e+1), previous = values(Math.max(segment.s,segment.e-1400),segment.e-400);
    return end === null || previous === null ? [] : [Number(end - previous >= C.UPTALK_ST)];
  });
  return trials.length < 3 ? null : trials.reduce((a,b) => a+b,0) / trials.length;
}
const span = (words: TimedWord[]) => words.reduce((sum, word, index) => {
  const gap = index > 0 ? Math.max(0,word.s - words[index-1].e) : 0;
  return sum + Math.max(0,word.e-word.s) + (gap < 2000 ? gap : 0);
},0);
export function voiceMetrics(words: TimedWord[], segments: TimedSegment[], pitch: PitchFrame[], answer: { kind: ItemKind; startMs: number; endMs: number; askEndMs: number }): FinalVoice {
  const fillers = identifyFillers(words), wordCount = words.length - fillers.hardFillers.length;
  const speakingMs = span(words), answerMs = answer.endMs - answer.startMs;
  const pauses = words.slice(1).map((word,i) => word.s - words[i].e).filter((gap) => gap >= C.LONG_PAUSE_MS);
  const voiced = pitch.filter((f) => f.tMs >= answer.startMs && f.tMs < answer.endMs && f.st !== null);
  const values = voiced.map((f) => f.st!);
  const count = countHedges(words), people = pronounCounts(words), n = people.i + people.we;
  return {
    wordCount,speakingMs,wpm:speakingMs < 5000 ? null : wordCount*60000/speakingMs,
    responseLatencyMs:words.length ? Math.max(0,words[0].s - answer.askEndMs) : null,
    longPauses:{ count:pauses.length, totalMs:pauses.reduce((sum,gap) => sum+gap,0) },
    hardFillers:fillers.hardFillers.length,softFillers:fillers.softFillers.length,fillerPerMin:answerMs > 0 ? (fillers.hardFillers.length+fillers.softFillers.length)*60000/answerMs : null,
    hedges:count,hedgePerMin:answerMs > 0 ? count*60000/answerMs : null,
    iRatio:n >= 5 && ["behavioral","cv_deep_dive","presentation"].includes(answer.kind) ? people.i/n : null,
    pitchMedianSt:median(values),pitchRangeSt:values.length ? percentile(values,.9)!-percentile(values,.1)! : null,
    uptalkRate:uptalkRate(segments,pitch),rmsMedianDb:median(voiced.map((f) => f.rmsDb)),
  };
}
export function vocalEvents(words: TimedWord[], pitch: PitchFrame[], voice: FinalVoice, baseline: BaselineFields, answer: { turnIdx: number; kind: ItemKind; startMs: number; endMs: number }): SessionEvent[] {
  const events: SessionEvent[] = [];
  const { startMs,endMs,turnIdx,kind } = answer;
  function add(type: string, start: number, end: number, severity: number) {
    const prior = events.findLast((event) => event.type === type);
    if (prior && start <= prior.endMs && ["filler_burst","pace_fast","pace_slow","pitch_spike","low_volume"].includes(type)) {
      prior.endMs = Math.max(prior.endMs,end); prior.severity = Math.max(prior.severity,severity); return;
    }
    events.push({ id:crypto.randomUUID(),category:"vocal",type,startMs:start,endMs:end,severity,turnIdx,data:{},snapshotPath:null });
  }
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].s - words[i-1].e;
    if (gap >= C.LONG_PAUSE_MS) add("long_pause",words[i-1].e,words[i].s,Math.min(1,gap/8000));
  }
  const fills = identifyFillers(words);
  const fillers = [...fills.hardFillers,...fills.softFillers].sort((a,b) => a.s-b.s);
  for (let i = C.FILLER_BURST.count - 1; i < fillers.length; i++) {
    const first = fillers[i-C.FILLER_BURST.count+1], last = fillers[i];
    if (last.s-first.s <= C.FILLER_BURST.ms) add("filler_burst",first.s,last.e,.5);
  }
  for (let start = startMs; start + 15000 <= endMs; start += 5000) {
    const end = start + 15000;
    const range = words.filter((word) => word.s >= start && word.s < end && !hard.has(normalizeWord(word.w)));
    const wpm = range.length * 4;
    if (wpm > C.PACE_FAST_WPM && range.length >= 20) add("pace_fast",start,end,.4);
    else if (wpm < C.PACE_SLOW_WPM && range.length >= 5 && !events.some((e) => e.type === "long_pause" && e.startMs < end && e.endMs > start)) add("pace_slow",start,end,.3);
  }
  for (let start = startMs; start + 4000 <= endMs; start += 1000) {
    const speech = pitch.filter((frame) => frame.tMs >= start && frame.tMs < start+5000 && frame.st !== null);
    const volume = median(speech.filter((frame) => frame.tMs < start+4000).map((frame) => frame.rmsDb));
    if (volume !== null && volume < baseline.rmsDb - C.LOW_VOLUME_DB_BELOW_BASE) add("low_volume",start,start+4000,.4);
    if (start+5000 <= endMs && baseline.pitchMedianSt !== null) {
      const center = median(speech.map((frame) => frame.st!));
      if (center !== null && center - baseline.pitchMedianSt > C.PITCH_SPIKE_ST) add("pitch_spike",start,start+5000,Math.min(1,.4+(center-baseline.pitchMedianSt-3)/3));
    }
  }
  if ((voice.uptalkRate ?? 0) >= .4) add("uptalk_pattern",startMs,endMs,.4);
  if (contentKinds.includes(kind) && (voice.responseLatencyMs ?? 0) > 6000) add("slow_start",startMs,endMs,.3);
  return events;
}
