import * as C from "@/lib/config/constants";
import { clamp, deviation, mean } from "@/lib/utils/math";
import type { Calibration, MetricState } from "@/types/interview";
import {
  area,
  boundingBox,
  distance,
  isotropic,
  midpoint,
  type Box,
  type Point,
} from "./landmarks";

export type Stamped<T> = { tMs: number; value: T };
export type HeadPose = { yaw: number; pitch: number; roll: number };
const degrees = 180 / Math.PI;
export function headPose(d: ArrayLike<number>): HeadPose {
  return {
    yaw: Math.atan2(d[8], d[10]) * degrees,
    pitch: Math.asin(clamp(-d[9], -1, 1)) * degrees,
    roll: Math.atan2(d[1], d[5]) * degrees,
  };
}
export function irisProjection(p: Point, a: Point, b: Point) {
  const x = b.x - a.x,
    y = b.y - a.y;
  return x || y ? ((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y) : 0.5;
}
export class BlinkDetector {
  private closedAt: number | null = null;
  update(value: number, tMs: number) {
    if (this.closedAt === null && value > C.BLINK_CLOSE) this.closedAt = tMs;
    else if (this.closedAt !== null && value < C.BLINK_OPEN) {
      const start = this.closedAt;
      this.closedAt = null;
      if (tMs - start <= 400) return start;
    }
    return null;
  }
}
class NodDetector {
  private history: Stamped<number>[] = [];
  private lastNod = -Infinity;
  update(pitch: number, tMs: number) {
    const previous = this.history.at(-1);
    if (!previous || Math.abs(previous.value - pitch) >= 0.35)
      this.history.push({ tMs, value: pitch });
    this.history = this.history.filter((item) => tMs - item.tMs <= 1500);
    const values = this.history.map((item) => item.value);
    let changes = 0;
    for (let i = 2; i < values.length; i++)
      if ((values[i] - values[i - 1]) * (values[i - 1] - values[i - 2]) < 0)
        changes++;
    if (
      tMs - this.lastNod < 1500 ||
      Math.max(...values) - Math.min(...values) < C.NOD_PITCH_RANGE_DEG ||
      changes < 2
    )
      return false;
    this.lastNod = tMs;
    return true;
  }
}
export type FaceInput = {
  points: Point[];
  matrix?: ArrayLike<number>;
  shapes?: Record<string, number>;
};
export type FaceFeatures = HeadPose & {
  count: number;
  box: Box | null;
  h: number;
  ev: number;
  gazeYaw: number;
  gazePitch: number;
  eyeContact: boolean;
  blinkAt: number | null;
  nod: boolean;
  smile: number;
  browTension: number;
  lipPress: number;
  jawOpen: number;
  expression: number[];
  points: Point[];
};
export type PoseFeatures = {
  valid: boolean;
  mid: Point | null;
  sw: number;
  tilt: number;
  neckRatio: number;
  slouch: boolean;
  leanRatio: number;
  swayStd: number;
  armsCrossed: boolean;
  points: Point[];
};
export type Hand = { side: "Left" | "Right"; points: Point[] };
export type HandFeatures = {
  count: number;
  gesturing: boolean;
  fidgeting: boolean;
  selfTouch: boolean;
  hands: Hand[];
};
export type FrameFeatures = {
  tMs: number;
  state: MetricState;
  turnIdx: number | null;
  face?: FaceFeatures;
  pose?: PoseFeatures;
  hand?: HandFeatures;
};
export const defaultCalibration: Calibration = {
  gaze: { yaw0: 0, pitch0: 0, h0: 0.5, v0: 0 },
  posture: {
    neckRatio0: 0.7,
    shoulderWidth0: 0.5,
    shoulderMidX0: 0.5,
    shoulderMidY0: 0.56,
  },
  audio: { noiseFloorDb: -60, micPeakDb: -25 },
  headphones: false,
  echoSafe: true,
  device: { userAgent: "", gpu: "", visionTier: "full" },
};
export function armsCrossed(
  left: Point,
  right: Point,
  wristLeft: Point,
  wristRight: Point,
) {
  if (!left || !right || !wristLeft || !wristRight) return false;
  const mid = midpoint(left, right);
  const gap = 0.1 * distance(left, right);
  return (
    [wristLeft, wristRight].every(
      (wrist) =>
        (wrist.visibility ?? 0) >= 0.5 &&
        wrist.y > mid.y &&
        Math.abs(wrist.x - mid.x) > gap,
    ) &&
    Math.sign(wristLeft.x - mid.x) === Math.sign(right.x - mid.x) &&
    Math.sign(wristRight.x - mid.x) === Math.sign(left.x - mid.x)
  );
}
export function inTouchZone(p: Point, box: Box, shoulderWidth: number) {
  return (
    p.x >= box.left - 0.1 * shoulderWidth &&
    p.x <= box.right + 0.1 * shoulderWidth &&
    p.y >= box.top - 0.1 * shoulderWidth &&
    p.y <= box.bottom + C.SELF_TOUCH_DIST_SW * shoulderWidth
  );
}
export function fidgetJerk(frames: readonly Point[][], sw: number) {
  if (frames.length < 3 || sw <= 0) return 0;
  const values: number[] = [];
  for (let i = 2; i < frames.length; i++)
    for (const tip of [4, 8, 12, 16, 20]) {
      const a = frames[i - 2][tip],
        b = frames[i - 1][tip],
        c = frames[i][tip];
      if (a && b && c)
        values.push(Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y) / sw);
    }
  return mean(values) ?? 0;
}

export class FeatureExtractor {
  private blink = new BlinkDetector();
  private nod = new NodDetector();
  private shoulderHistory: Stamped<number>[] = [];
  private handHistory: Record<Hand["side"], Stamped<Point[]>[]> = {
    Left: [],
    Right: [],
  };

  face(
    faces: FaceInput[],
    ratio: number,
    tMs: number,
    calibration: Calibration["gaze"],
  ): FaceFeatures {
    const best = faces
      .map((face) => ({ ...face, box: boundingBox(face.points) }))
      .sort((a, b) => area(b.box) - area(a.box))[0];
    const points = best?.points ?? [];
    const get = (key: string) => best?.shapes?.[key] ?? 0;
    const pair = (name: string) =>
      (get(name + "Left") + get(name + "Right")) / 2;
    const head =
      best?.matrix?.length === 16
        ? headPose(best.matrix)
        : { yaw: 0, pitch: 0, roll: 0 };
    let h = 0.5;
    if (points.length > 473) {
      const p = (i: number) => isotropic(points[i], ratio);
      h =
        (irisProjection(p(468), p(33), p(133)) +
          irisProjection(p(473), p(362), p(263))) /
        2;
    }
    const ev = pair("eyeLookUp") - pair("eyeLookDown"),
      smile = pair("mouthSmile"),
      browTension = pair("browDown"),
      lipPress = pair("mouthPress"),
      jawOpen = get("jawOpen");
    const gazeYaw =
      head.yaw - calibration.yaw0 + (h - calibration.h0) * C.EYE_YAW_GAIN_DEG;
    const gazePitch =
      head.pitch -
      calibration.pitch0 +
      (ev - calibration.v0) * C.EYE_PITCH_GAIN_DEG;
    return {
      ...head,
      points,
      count: faces.length,
      box: best?.box ?? null,
      h,
      ev,
      gazeYaw,
      gazePitch,
      eyeContact:
        Boolean(best) &&
        Math.abs(gazeYaw) <= C.EYE_CONTACT_YAW_DEG &&
        Math.abs(gazePitch) <= C.EYE_CONTACT_PITCH_DEG,
      blinkAt: best ? this.blink.update(pair("eyeBlink"), tMs) : null,
      nod: Boolean(best && this.nod.update(head.pitch, tMs)),
      smile,
      browTension,
      lipPress,
      jawOpen,
      expression: [
        smile,
        get("browInnerUp"),
        browTension,
        lipPress,
        jawOpen,
        pair("eyeSquint"),
        pair("mouthFrown"),
        pair("cheekSquint"),
        get("mouthPucker"),
        pair("eyeWide"),
      ],
    };
  }

  pose(
    points: Point[],
    ratio: number,
    tMs: number,
    baseline: Calibration["posture"],
  ): PoseFeatures {
    const p = points.map((item) => isotropic(item, ratio));
    const [l, r] = [p[11], p[12]];
    const sw = l && r ? distance(l, r) : 0;
    const valid =
      !!l &&
      !!r &&
      !!p[0] &&
      sw > 0 &&
      (l.visibility ?? 0) >= 0.6 &&
      (r.visibility ?? 0) >= 0.6;
    if (!valid)
      return {
        valid,
        mid: null,
        sw: 0,
        tilt: 0,
        neckRatio: 0,
        slouch: false,
        leanRatio: 1,
        swayStd: 0,
        armsCrossed: false,
        points,
      };
    const mid = midpoint(l, r);
    const tilt = Math.abs(Math.atan2(r.y - l.y, r.x - l.x) * degrees);
    const neckRatio = (mid.y - p[0].y) / sw;
    this.shoulderHistory.push({ tMs, value: mid.x });
    this.shoulderHistory = this.shoulderHistory.filter(
      (frame) => tMs - frame.tMs <= 3000,
    );
    return {
      valid,
      mid,
      sw,
      tilt: Math.min(tilt, 180 - tilt),
      neckRatio,
      slouch: neckRatio < C.SLOUCH_RATIO * baseline.neckRatio0,
      leanRatio: sw / baseline.shoulderWidth0,
      swayStd:
        (deviation(this.shoulderHistory.map((frame) => frame.value)) ?? 0) / sw,
      armsCrossed: armsCrossed(l, r, p[15], p[16]),
      points,
    };
  }

  hand(
    hands: Hand[],
    ratio: number,
    tMs: number,
    face: FaceFeatures | undefined,
    pose: PoseFeatures | undefined,
  ): HandFeatures {
    const box = face?.box && {
      ...face.box,
      left: face.box.left * ratio,
      right: face.box.right * ratio,
    };
    const sw = pose?.sw || (box ? 2.2 * (box.right - box.left) : 0);
    let gesturing = false,
      fidgeting = false,
      selfTouch = false;
    for (const side of ["Left", "Right"] as const) {
      const hand = hands.find((item) => item.side === side);
      const series = this.handHistory[side].filter(
        (item) => tMs - item.tMs <= 1000,
      );
      this.handHistory[side] = series;
      if (!hand || !sw) continue;
      const points = hand.points.map((point) => isotropic(point, ratio));
      const previous = series.at(-1);
      const centroid = points[9];
      if (!centroid) continue;
      if (previous && tMs > previous.tMs) {
        const speed =
          distance(centroid, previous.value[9]) /
          ((tMs - previous.tMs) / 1000) /
          sw;
        gesturing ||=
          speed >= C.GESTURE_SPEED_MIN &&
          speed <= C.GESTURE_SPEED_MAX &&
          (!pose?.mid || centroid.y < pose.mid.y + 1.2 * sw);
      }
      series.push({ tMs, value: points });
      const range = boundingBox(series.map((item) => item.value[9]));
      fidgeting ||=
        Math.max(range.right - range.left, range.bottom - range.top) / sw <
          C.FIDGET_MAX_RANGE_SW &&
        fidgetJerk(
          series.map((item) => item.value),
          sw,
        ) > C.FIDGET_JERK_THRESHOLD;
      selfTouch ||= Boolean(
        box && points.some((point) => inTouchZone(point, box, sw)),
      );
    }
    return { hands, count: hands.length, gesturing, fidgeting, selfTouch };
  }
}

export function calibrateGaze(frames: FaceFeatures[]) {
  const usable = frames.filter((f) => f.count === 1);
  const values = (field: "yaw" | "pitch" | "h" | "ev") =>
    usable.map((f) => f[field]);
  if (
    usable.length < 2 ||
    (deviation(values("h")) ?? Infinity) >= 0.05 ||
    (deviation(values("yaw")) ?? Infinity) >= 4
  )
    return null;
  return {
    yaw0: mean(values("yaw"))!,
    pitch0: mean(values("pitch"))!,
    h0: mean(values("h"))!,
    v0: mean(values("ev"))!,
  };
}
export function calibratePosture(frames: PoseFeatures[]) {
  const usable = frames.filter((f) => f.valid && f.mid);
  if (!usable.length) return null;
  return {
    neckRatio0: mean(usable.map((f) => f.neckRatio))!,
    shoulderWidth0: mean(usable.map((f) => f.sw))!,
    shoulderMidX0: mean(usable.map((f) => f.mid!.x))!,
    shoulderMidY0: mean(usable.map((f) => f.mid!.y))!,
  };
}
export function framingChecks(
  face: FaceFeatures | undefined,
  pose: PoseFeatures | undefined,
  luma: number | null,
) {
  const b = face?.box;
  const width = b ? b.right - b.left : 0;
  const x = b ? (b.left + b.right) / 2 : 0,
    y = b ? (b.top + b.bottom) / 2 : 0;
  return [
    {
      label: "One face",
      pass: face?.count === 1,
      message: "Make sure only you are in the frame.",
    },
    {
      label: "Distance",
      pass: width >= 0.18 && width <= 0.45,
      message: width < 0.18 ? "Move closer" : "Move back a little",
    },
    {
      label: "Centered",
      pass: x >= 0.3 && x <= 0.7 && y >= 0.25 && y <= 0.65,
      message: "Center yourself in the frame",
    },
    {
      label: "Shoulders",
      pass: Boolean(pose?.valid),
      message: "Make sure both shoulders are visible",
    },
    {
      label: "Lighting",
      pass: luma !== null && luma >= 70 && luma <= 200,
      message:
        (luma ?? 0) < 70
          ? "It's too dark. Face a light source."
          : "Too bright or backlit.",
    },
  ];
}
