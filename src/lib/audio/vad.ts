import {
  VAD_HANGOVER_MS,
  VAD_ON_DB_ABOVE_FLOOR,
  VAD_ON_MS,
} from "@/lib/config/constants";
import { clamp } from "@/lib/utils/math";
export type SpeechSegment = { startMs: number; endMs: number };
export function rmsDb(samples: ArrayLike<number>) {
  let squares = 0;
  for (let i = 0; i < samples.length; i++) squares += samples[i] ** 2;
  return 20 * Math.log10(Math.sqrt(squares / (samples.length || 1)) + 1e-9);
}
export class VoiceActivity {
  private pending: number | null = null;
  private start: number | null = null;
  private lastAbove = 0;
  private readonly threshold: number;
  readonly segments: SpeechSegment[] = [];
  constructor(
    noiseFloorDb: number,
    private readonly change: (
      change: { startMs: number } | SpeechSegment,
    ) => void = () => {},
  ) {
    this.threshold = clamp(noiseFloorDb, -70, -35) + VAD_ON_DB_ABOVE_FLOOR;
  }
  get speaking() {
    return this.start !== null;
  }
  update(db: number, endMs: number, ignored = false) {
    if (ignored) {
      this.pending = null;
      if (this.speaking) this.finish();
      return false;
    }
    if (db > this.threshold) {
      this.pending ??= endMs - 20;
      this.lastAbove = endMs;
      if (!this.speaking && endMs - this.pending >= VAD_ON_MS) {
        this.start = this.pending;
        this.change({ startMs: this.start });
      }
    } else {
      this.pending = null;
      if (this.speaking && endMs - this.lastAbove >= VAD_HANGOVER_MS)
        this.finish();
    }
    return this.speaking;
  }
  finish() {
    if (this.start === null) return;
    const segment = { startMs: this.start, endMs: this.lastAbove };
    this.start = null;
    this.pending = null;
    this.segments.push(segment);
    this.change(segment);
  }
  window(startMs: number, endMs: number) {
    const all =
      this.start === null
        ? this.segments
        : [...this.segments, { startMs: this.start, endMs: this.lastAbove }];
    return all
      .filter((s) => s.endMs > startMs && s.startMs < endMs)
      .map((s) => ({
        startMs: Math.max(startMs, s.startMs),
        endMs: Math.min(endMs, s.endMs),
      }));
  }
}
