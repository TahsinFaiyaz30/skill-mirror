import type {
  MetricSecond,
  NonverbalPolicy,
  SessionEvent,
} from "@/types/interview";
import type { FinalVision } from "@/types/report";
import { secondsIn, summarizeVision } from "@/lib/vision/aggregator";
import { mean, present } from "@/lib/utils/math";

export function nonverbalTurn(
  timeline: MetricSecond[],
  events: SessionEvent[],
  timing: {
    askStartMs: number;
    askEndMs: number;
    answerStartMs: number;
    answerEndMs: number;
  },
  policy: NonverbalPolicy,
): FinalVision {
  const { askStartMs, askEndMs, answerStartMs, answerEndMs } = timing;
  const metrics = summarizeVision(timeline, events, answerStartMs, answerEndMs);
  const { faceVisiblePct, multiFacePct } = metrics;
  if (policy === "off") return { faceVisiblePct, multiFacePct };
  const nods = secondsIn(timeline, askStartMs, askEndMs).reduce(
    (sum, second) => sum + second.nd,
    0,
  );
  const smile = secondsIn(timeline, askStartMs, answerEndMs)
    .map((s) => s.sm)
    .filter(present);
  return {
    ...metrics,
    nodsPerMinListening:
      askEndMs > askStartMs ? (nods * 60000) / (askEndMs - askStartMs) : null,
    selfTouchPerMin:
      answerEndMs > answerStartMs
        ? (metrics.selfTouchCount * 60000) / (answerEndMs - answerStartMs)
        : null,
    smileTimeFrac: mean(smile.map((s) => Number(s > 0.3))),
    lowVolumeMs: events
      .filter((e) => e.type === "low_volume")
      .reduce(
        (sum, e) =>
          sum +
          Math.max(
            0,
            Math.min(e.endMs, answerEndMs) - Math.max(e.startMs, answerStartMs),
          ),
        0,
      ),
  };
}
