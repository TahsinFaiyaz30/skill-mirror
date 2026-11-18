import { PitchDetector } from "pitchy";
import {
  LIVE_AUDIO_IN_RATE,
  PITCH_CLARITY_MIN,
  PITCH_HOP,
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
  PITCH_WINDOW,
  VOICED_RMS_MIN_DB,
} from "@/lib/config/constants";
import type { PitchFrame } from "@/types/report";
import { rmsDb } from "./vad";

export const semitones = (hz: number) => 12 * Math.log2(hz / 100);
const hopMs = (PITCH_HOP * 1000) / LIVE_AUDIO_IN_RATE;
export class PitchTrack {
  private buffer = new Float32Array(PITCH_WINDOW);
  private filled = 0;
  private detector = PitchDetector.forFloat32Array(PITCH_WINDOW);
  readonly frames: PitchFrame[] = [];
  add(frame: Float32Array, endMs: number, speech: boolean) {
    const computed: PitchFrame[] = [];
    for (let i = 0; i < frame.length;) {
      const count = Math.min(frame.length - i, PITCH_WINDOW - this.filled);
      this.buffer.set(frame.subarray(i, i + count), this.filled);
      this.filled += count;
      i += count;
      if (this.filled === PITCH_WINDOW) {
        const rms = rmsDb(this.buffer);
        const [hz, clarity] =
          speech && rms >= VOICED_RMS_MIN_DB
            ? this.detector.findPitch(this.buffer, LIVE_AUDIO_IN_RATE)
            : [0, 0];
        const tMs = Math.max(
          0,
          Math.round(endMs - ((frame.length - i) * 1000) / LIVE_AUDIO_IN_RATE),
        );
        const st =
          clarity >= PITCH_CLARITY_MIN &&
          hz >= PITCH_MIN_HZ &&
          hz <= PITCH_MAX_HZ
            ? semitones(hz)
            : null;
        const item = { tMs, st, rmsDb: rms };
        this.frames.push(item);
        computed.push(item);
        this.buffer.copyWithin(0, PITCH_HOP);
        this.filled -= PITCH_HOP;
      }
    }
    return computed;
  }
}
const headerBytes = 12,
  frameBytes = 8;
export function writePitchTrack(frames: PitchFrame[]) {
  const bytes = new Uint8Array(headerBytes + frames.length * frameBytes);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("PIT1"));
  view.setUint16(4, 1, true);
  view.setUint16(6, hopMs, true);
  view.setUint32(8, frames.length, true);
  frames.forEach((frame, i) => {
    const at = headerBytes + i * frameBytes;
    view.setInt32(at, frame.tMs, true);
    view.setInt16(
      at + 4,
      frame.st === null ? -32768 : Math.round(frame.st * 100),
      true,
    );
    view.setInt16(at + 6, Math.round(frame.rmsDb * 100), true);
  });
  return bytes;
}
export function readPitchTrack(bytes: Uint8Array): PitchFrame[] {
  if (
    bytes.length < headerBytes ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== "PIT1"
  )
    throw new Error("Invalid pitch track");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = view.getUint32(8, true);
  if (
    view.getUint16(4, true) !== 1 ||
    view.getUint16(6, true) !== hopMs ||
    bytes.length !== headerBytes + count * frameBytes
  )
    throw new Error("Invalid pitch track");
  return Array.from({ length: count }, (_, i) => {
    const at = headerBytes + i * frameBytes,
      st = view.getInt16(at + 4, true);
    return {
      tMs: view.getInt32(at, true),
      st: st === -32768 ? null : st / 100,
      rmsDb: view.getInt16(at + 6, true) / 100,
    };
  });
}
