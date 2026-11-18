import * as C from "@/lib/config/constants";
import { mean } from "@/lib/utils/math";
import type {
  BaselineFields,
  EventCategory,
  SessionEvent,
  VisionSummary,
} from "@/types/interview";
import type {
  FaceFeatures,
  FrameFeatures,
  HandFeatures,
  PoseFeatures,
  Stamped,
} from "./features";

type Rule = {
  category: EventCategory;
  min: number;
  severity: (duration: number) => number;
};
const constant = (value: number) => () => value;
export const EVENT_RULES = {
  gaze_aversion: {
    category: "nonverbal",
    min: C.GAZE_AVERSION_MIN_MS,
    severity: (d: number) => Math.min(1, d / 10000),
  },
  reading_pattern: { category: "integrity", min: 0, severity: constant(0.8) },
  face_missing: {
    category: "integrity",
    min: C.FACE_MISSING_MIN_MS,
    severity: (d: number) => Math.min(1, d / 10000),
  },
  multiple_faces: {
    category: "integrity",
    min: C.MULTI_FACE_MIN_MS,
    severity: constant(0.9),
  },
  self_touch: {
    category: "nonverbal",
    min: C.SELF_TOUCH_MIN_MS,
    severity: (d: number) => Math.min(1, 0.3 + d / 5000),
  },
  arms_crossed: {
    category: "nonverbal",
    min: C.ARMS_CROSSED_MIN_MS,
    severity: (d: number) => 0.4 + Math.min(0.4, d / 20000),
  },
  slouch: {
    category: "nonverbal",
    min: C.SLOUCH_MIN_MS,
    severity: (d: number) => 0.5 + Math.min(0.5, d / 30000),
  },
  lean_back: { category: "nonverbal", min: 5000, severity: constant(0.3) },
  swaying: {
    category: "nonverbal",
    min: C.SWAY_MIN_MS,
    severity: constant(0.5),
  },
  fidgeting: {
    category: "nonverbal",
    min: C.FIDGET_MIN_MS,
    severity: (d: number) => Math.min(1, 0.3 + d / 10000),
  },
  warm_smile: { category: "positive", min: 1000, severity: constant(0.3) },
  open_gesture: { category: "positive", min: 3000, severity: constant(0.4) },
  listening_nod: { category: "positive", min: 0, severity: constant(0.2) },
} satisfies Record<string, Rule>;
type Type = keyof typeof EVENT_RULES;
type Active = {
  start: number;
  qualified: boolean;
  falseSince: number | null;
  turnIdx: number | null;
};
export function makeEvent(
  category: EventCategory,
  type: string,
  startMs: number,
  endMs: number,
  severity: number,
  turnIdx: number | null,
  data: Record<string, unknown> = {},
): SessionEvent {
  return {
    id: crypto.randomUUID(),
    category,
    type,
    startMs: Math.max(0, startMs),
    endMs,
    severity,
    turnIdx,
    data,
    snapshotPath: null,
  };
}

class ReadingSweeps {
  private floor: Stamped<number> | null = null;
  private top: Stamped<number> | null = null;
  private endTimes: number[] = [];
  update(tMs: number, face: FaceFeatures) {
    this.endTimes = this.endTimes.filter((t) => tMs - t <= 6000);
    if (!face.count || face.gazePitch >= -15) {
      this.floor = this.top = null;
      return false;
    }
    const current = { tMs, value: face.gazeYaw };
    if (
      !this.floor ||
      tMs - this.floor.tMs > 2500 ||
      (current.value < this.floor.value && !this.top)
    )
      this.floor = current;
    if (
      current.value - this.floor.value >= 8 &&
      tMs - this.floor.tMs >= 400 &&
      (!this.top || current.value >= this.top.value)
    )
      this.top = current;
    if (
      this.top &&
      this.top.value - current.value >= 8 &&
      tMs - this.top.tMs <= 500
    ) {
      this.endTimes.push(tMs);
      this.floor = current;
      this.top = null;
    } else if (this.top && tMs - this.top.tMs > 500) {
      this.top = null;
      this.floor = current;
    }
    return this.endTimes.length >= C.READING_SWEEPS;
  }
}
export class EventDetector {
  private active = new Map<Type, Active>();
  private lastOfType = new Map<string, SessionEvent>();
  private lastOpenGesture = -Infinity;
  private gestureWindow: Stamped<number>[] = [];
  private sweeps = new ReadingSweeps();
  private face?: FaceFeatures;
  private pose?: PoseFeatures;
  private hand?: HandFeatures;
  private reading = false;
  readonly events: SessionEvent[] = [];

  constructor(private onEvent: (event: SessionEvent) => void = () => {}) {}

  observe(type: Type, condition: boolean, tMs: number, turnIdx: number | null) {
    const rule = EVENT_RULES[type];
    let item = this.active.get(type);
    if (condition) {
      if (item?.falseSince != null && !item.qualified) this.active.delete(type);
      item = this.active.get(type);
      if (!item) {
        item = { start: tMs, qualified: false, falseSince: null, turnIdx };
        this.active.set(type, item);
      }
      item.falseSince = null;
      if (tMs - item.start >= rule.min) item.qualified = true;
    } else if (item) {
      item.falseSince ??= tMs;
      if (tMs - item.falseSince >= 1000) this.close(type, item.falseSince);
    }
  }
  private close(type: Type, end: number) {
    const item = this.active.get(type);
    if (!item) return;
    this.active.delete(type);
    if (item.qualified) this.record(type, item.start, end, item.turnIdx);
  }
  private record(
    type: Type,
    start: number,
    end: number,
    turnIdx: number | null,
  ) {
    const rule = EVENT_RULES[type];
    const last = this.lastOfType.get(type);
    if (last && start - last.endMs < 2000 && type !== "listening_nod") {
      last.endMs = Math.max(last.endMs, end);
      last.severity = rule.severity(last.endMs - last.startMs);
      this.onEvent(last);
      return;
    }
    const severity = rule.severity(end - start);
    if (this.events.length >= 400 && severity < 0.5) return;
    const event = makeEvent(rule.category, type, start, end, severity, turnIdx);
    this.events.push(event);
    this.lastOfType.set(type, event);
    this.onEvent(event);
    if (type === "open_gesture") this.lastOpenGesture = start;
  }
  update(frame: FrameFeatures) {
    const { tMs, state, turnIdx } = frame;
    if (frame.face) {
      this.face = frame.face;
      this.reading = this.sweeps.update(tMs, frame.face);
    }
    if (frame.pose) this.pose = frame.pose;
    if (frame.hand) {
      this.hand = frame.hand;
      this.gestureWindow.push({ tMs, value: Number(frame.hand.gesturing) });
    }
    this.gestureWindow = this.gestureWindow.filter(
      (sample) => tMs - sample.tMs <= 6000,
    );
    const { face, pose, hand } = this;
    const answer = state === "L" || state === "P";
    this.observe(
      "face_missing",
      Boolean(face && face.count === 0),
      tMs,
      turnIdx,
    );
    this.observe("multiple_faces", (face?.count ?? 0) >= 2, tMs, turnIdx);
    this.observe(
      "gaze_aversion",
      Boolean(answer && face?.count && !face.eyeContact),
      tMs,
      turnIdx,
    );
    this.observe("reading_pattern", answer && this.reading, tMs, turnIdx);
    this.observe(
      "self_touch",
      Boolean(answer && hand?.selfTouch),
      tMs,
      turnIdx,
    );
    this.observe(
      "arms_crossed",
      Boolean(answer && pose?.armsCrossed),
      tMs,
      turnIdx,
    );
    this.observe("slouch", Boolean(answer && pose?.slouch), tMs, turnIdx);
    this.observe(
      "lean_back",
      Boolean(answer && pose?.valid && pose.leanRatio < C.LEAN_BACK_RATIO),
      tMs,
      turnIdx,
    );
    this.observe(
      "swaying",
      answer && (pose?.swayStd ?? 0) > C.SWAY_STD_SW,
      tMs,
      turnIdx,
    );
    this.observe("fidgeting", Boolean(answer && hand?.fidgeting), tMs, turnIdx);
    this.observe(
      "warm_smile",
      answer && (face?.smile ?? 0) > C.SMILE_THRESHOLD,
      tMs,
      turnIdx,
    );
    this.observe(
      "open_gesture",
      answer &&
        tMs - this.lastOpenGesture >= 20000 &&
        (mean(this.gestureWindow.map((f) => f.value)) ?? 0) >= 0.5,
      tMs,
      turnIdx,
    );
    if (state === "A" && frame.face?.nod)
      this.record("listening_nod", tMs, tMs, turnIdx);
  }
  finish(tMs: number) {
    for (const [type, item] of this.active)
      this.close(type, item.falseSince ?? tMs);
    return this.events;
  }
}

export function perTurnEvents(
  metrics: VisionSummary,
  baseline: BaselineFields,
  start: number,
  end: number,
  turnIdx: number,
) {
  if (end - start < 20000) return [];
  const events: SessionEvent[] = [];
  if (
    metrics.blinkPerMin != null &&
    metrics.blinkPerMin > Math.max(30, 1.6 * baseline.blinkPerMin)
  )
    events.push(
      makeEvent("nonverbal", "excessive_blinking", start, end, 0.5, turnIdx),
    );
  if (
    metrics.expressiveness != null &&
    metrics.expressiveness < 0.5 * baseline.expressiveness
  )
    events.push(
      makeEvent("nonverbal", "flat_affect", start, end, 0.4, turnIdx),
    );
  if (metrics.eyeContactPct != null && metrics.eyeContactPct >= 0.85)
    events.push(
      makeEvent("positive", "steady_eye_contact", start, end, 0.4, turnIdx),
    );
  return events;
}
