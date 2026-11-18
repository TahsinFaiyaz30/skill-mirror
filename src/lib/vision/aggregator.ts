import { deviation, mean, median, percentile, present } from "@/lib/utils/math";
import type {
  Baseline,
  BaselineFields,
  Calibration,
  MetricSecond,
  SessionEvent,
  VisionSummary,
} from "@/types/interview";
import type { FrameFeatures, HandFeatures, PoseFeatures } from "./features";

export type AudioSecondPart = {
  tMs: number;
  rmsDb: number;
  speech: boolean;
  st?: number | null;
};
export function reduceSecond(
  t: number,
  frames: FrameFeatures[],
  audio: AudioSecondPart[],
  blinks: number,
): MetricSecond {
  const face = frames.flatMap((f) => (f.face ? [f.face] : []));
  const visible = face.filter((f) => f.count > 0);
  const pose = frames.flatMap((f) => (f.pose ? [f.pose] : []));
  const valid = pose.filter((p) => p.valid);
  const hands = frames.flatMap((f) => (f.hand ? [f.hand] : []));
  const round = (n: number | null) =>
    n === null ? null : Math.round(n * 1000) / 1000;
  const m = (values: number[]) => round(mean(values)),
    md = (values: number[]) => round(median(values));
  const poseMean = (key: "neckRatio" | "leanRatio" | "tilt") =>
    m(valid.map((p) => p[key]));
  const poseFrac = (key: keyof PoseFeatures) =>
    m(valid.map((p) => Number(p[key])));
  const handFrac = (key: keyof HandFeatures) =>
    m(hands.map((h) => Number(h[key])));
  const pitches = audio.filter((a) => a.st !== undefined);
  const subframes = audio.filter((a) => a.st === undefined);
  const context = frames.at(-1);
  return {
    t,
    fv: m(face.map((f) => Number(f.count > 0))),
    mf: m(face.map((f) => Number(f.count > 1))),
    ec: m(visible.map((f) => Number(f.eyeContact))),
    gy: md(visible.map((f) => f.gazeYaw)),
    gp: md(visible.map((f) => f.gazePitch)),
    hy: md(visible.map((f) => f.yaw)),
    hp: md(visible.map((f) => f.pitch)),
    hr: md(visible.map((f) => f.roll)),
    bl: blinks,
    nd: visible.filter((f) => f.nod).length,
    sm: m(visible.map((f) => f.smile)),
    bt: m(visible.map((f) => f.browTension)),
    lp: m(visible.map((f) => f.lipPress)),
    jo: m(visible.map((f) => f.jawOpen)),
    xv: visible.length
      ? Array.from(
          { length: 10 },
          (_, i) => m(visible.map((f) => f.expression[i])) ?? 0,
        )
      : null,
    pv: m(pose.map((p) => Number(p.valid))),
    nr: poseMean("neckRatio"),
    sl: poseFrac("slouch"),
    lr: poseMean("leanRatio"),
    st: poseMean("tilt"),
    sw: round(valid.at(-1)?.swayStd ?? null),
    ac: poseFrac("armsCrossed"),
    hv: m(hands.map((h) => Number(h.count > 0))),
    gs: handFrac("gesturing"),
    fg: handFrac("fidgeting"),
    tc: handFrac("selfTouch"),
    rms: md(subframes.map((a) => a.rmsDb)),
    vad: m(subframes.map((a) => Number(a.speech))),
    f0: md(pitches.map((a) => a.st).filter(present)),
    vf: m(pitches.map((a) => Number(a.st !== null))),
    s: context?.state ?? "X",
    ti: context?.turnIdx ?? null,
  };
}
export class VisionAggregator {
  private bins = new Map<
    number,
    { frames: FrameFeatures[]; audio: AudioSecondPart[]; blinks: number }
  >();
  private bin(ms: number) {
    const second = Math.floor(ms / 1000);
    const existing = this.bins.get(second);
    if (existing) return existing;
    const bucket = { frames: [], audio: [], blinks: 0 };
    this.bins.set(second, bucket);
    return bucket;
  }
  addFrame(frame: FrameFeatures) {
    if (frame.tMs < 0) return;
    this.bin(frame.tMs).frames.push({
      ...frame,
      face: frame.face && { ...frame.face, points: [] },
      pose: frame.pose && { ...frame.pose, points: [] },
      hand: frame.hand && { ...frame.hand, hands: [] },
    });
    const start = frame.face?.blinkAt;
    if (start != null && start >= 0) this.bin(start).blinks++;
  }
  addAudio(audio: AudioSecondPart) {
    if (audio.tMs >= 0) this.bin(audio.tMs).audio.push(audio);
  }
  seconds(from = 0, to = Infinity) {
    return [...this.bins]
      .filter(
        ([t]) => t * 1000 >= Math.floor(from / 1000) * 1000 && t * 1000 < to,
      )
      .sort(([a], [b]) => a - b)
      .map(([t, bin]) => reduceSecond(t, bin.frames, bin.audio, bin.blinks));
  }
}
export const secondsIn = (
  timeline: MetricSecond[],
  start: number,
  end: number,
) => timeline.filter(({ t }) => t * 1000 >= start && t * 1000 < end);
export function expressionVariation(seconds: MetricSecond[]) {
  const vectors = seconds
    .map((second) => second.xv)
    .filter((v): v is number[] => v !== null);
  return vectors.length
    ? mean(
        Array.from(
          { length: 10 },
          (_, k) => deviation(vectors.map((v) => v[k])) ?? 0,
        ),
      )
    : null;
}
export const fieldMean = (seconds: MetricSecond[], key: keyof MetricSecond) =>
  mean(
    seconds
      .map((second) => second[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
  );
export function computeBaseline(
  timeline: MetricSecond[],
  events: SessionEvent[],
  calibration: Calibration,
  answerStartMs: number | null,
  answerEndMs: number | null,
): Baseline {
  const startMs = (answerStartMs ?? 0) + 5000;
  const endMs = Math.min(answerEndMs ?? startMs, (answerStartMs ?? 0) + 65000);
  const window = { startMs, endMs: Math.max(endMs, startMs) };
  const defaults: BaselineFields = {
    eyeContact: 0.65,
    blinkPerMin: 17,
    smile: 0.15,
    browTension: 0.15,
    lipPress: 0.1,
    expressiveness: 0.05,
    fidgetFrac: 0.05,
    gestureFrac: 0.25,
    selfTouchPerMin: 0.5,
    neckRatio: calibration.posture.neckRatio0,
    swayStd: 0.03,
    rmsDb: -30,
    pitchMedianSt: median(timeline.map((s) => s.f0).filter(present)),
    pitchRangeSt: 4,
    wpm: 140,
    fillerPerMin: 3,
    hedgePerMin: 2,
  };
  const seconds = secondsIn(timeline, startMs, endMs);
  if (endMs - startMs < 20000 || (fieldMean(seconds, "fv") ?? 0) < 0.6)
    return { fields: defaults, source: "default", window };
  const f0 = seconds.map((s) => s.f0).filter(present);
  const minutes = (endMs - startMs) / 60000;
  return {
    source: "measured",
    window,
    fields: {
      ...defaults,
      eyeContact: fieldMean(seconds, "ec") ?? defaults.eyeContact,
      blinkPerMin: seconds.reduce((n, s) => n + s.bl, 0) / minutes,
      smile: fieldMean(seconds, "sm") ?? defaults.smile,
      browTension: fieldMean(seconds, "bt") ?? defaults.browTension,
      lipPress: fieldMean(seconds, "lp") ?? defaults.lipPress,
      expressiveness: expressionVariation(seconds) ?? defaults.expressiveness,
      fidgetFrac: fieldMean(seconds, "fg") ?? defaults.fidgetFrac,
      gestureFrac: fieldMean(seconds, "gs") ?? defaults.gestureFrac,
      swayStd: fieldMean(seconds, "sw") ?? defaults.swayStd,
      selfTouchPerMin:
        events.filter(
          (event) =>
            event.type === "self_touch" &&
            event.startMs >= startMs &&
            event.startMs < endMs,
        ).length / minutes,
      rmsDb:
        median(
          seconds
            .filter((s) => (s.vad ?? 0) > 0.5)
            .map((s) => s.rms)
            .filter(present),
        ) ?? defaults.rmsDb,
      pitchMedianSt: median(f0) ?? defaults.pitchMedianSt,
      pitchRangeSt: f0.length
        ? percentile(f0, 0.9)! - percentile(f0, 0.1)!
        : defaults.pitchRangeSt,
    },
  };
}

export function summarizeVision(
  timeline: MetricSecond[],
  events: SessionEvent[],
  start: number,
  end: number,
): VisionSummary {
  const seconds = secondsIn(timeline, start, end);
  const f = (key: keyof MetricSecond) => fieldMean(seconds, key);
  const count = (type: string) =>
    events.filter(
      (event) =>
        event.type === type && event.startMs >= start && event.startMs < end,
    ).length;
  const slouch = f("sl"),
    sway = seconds.map((s) => s.sw).filter(present);
  return {
    faceVisiblePct: f("fv"),
    eyeContactPct: f("ec"),
    gazeAversionCount: count("gaze_aversion"),
    blinkPerMin:
      seconds.length && end > start
        ? (seconds.reduce((n, s) => n + s.bl, 0) * 60000) / (end - start)
        : null,
    smileMean: f("sm"),
    browTensionMean: f("bt"),
    lipPressMean: f("lp"),
    expressiveness: expressionVariation(seconds),
    postureOkPct: slouch == null ? null : 1 - slouch,
    swayPct: mean(sway.map((value) => Number(value > 0.06))),
    armsCrossedPct: f("ac"),
    gesturePct: f("gs"),
    fidgetPct: f("fg"),
    selfTouchCount: count("self_touch"),
    multiFacePct: f("mf"),
  };
}
