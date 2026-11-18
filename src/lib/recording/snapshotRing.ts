import { SNAPSHOT_RING_SECONDS } from "@/lib/config/constants";
export class SnapshotRing {
  private frames: { time: number; jpeg: Blob }[] = [];
  push(time: number, jpeg: Blob) {
    this.frames.push({ time, jpeg });
    if (this.frames.length > SNAPSHOT_RING_SECONDS) this.frames.shift();
  }
  nearest(time: number) {
    if (time < (this.frames[0]?.time ?? 0)) return this.frames.at(-1)?.jpeg;
    return this.frames.reduce<{ time: number; jpeg: Blob } | undefined>((best, frame) => !best || Math.abs(frame.time - time) < Math.abs(best.time - time) ? frame : best, undefined)?.jpeg;
  }
}
