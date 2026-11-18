import {
  VIDEO_OVERLAP_MS,
  VIDEO_RECORD_SIZE,
  VIDEO_SEGMENT_MS,
} from "@/lib/config/constants";
type Segment = { index: number; startMs: number; endMs: number; blob: Blob };
export class SegmentRecorder {
  private timer?: ReturnType<typeof setInterval>;
  private jobs = new Map<
    MediaRecorder,
    { done: Promise<void>; stop: () => void }
  >();
  private current: MediaRecorder | null = null;
  private nextIndex = 0;
  constructor(
    private stream: MediaStream,
    private clock: () => number,
    private onSegment: (segment: Segment) => void,
  ) {}
  start() {
    this.current = this.create();
    this.timer = setInterval(() => {
      const old = this.current;
      this.current = this.create();
      setTimeout(() => {
        if (old) this.jobs.get(old)?.stop();
      }, VIDEO_OVERLAP_MS);
    }, VIDEO_SEGMENT_MS);
  }
  private create() {
    const settings = VIDEO_RECORD_SIZE;
    const recorder = new MediaRecorder(this.stream, {
      mimeType: settings.mimeType,
      videoBitsPerSecond: settings.videoBitsPerSecond,
      audioBitsPerSecond: settings.audioBitsPerSecond,
    });
    const chunks: Blob[] = [];
    const index = this.nextIndex++,
      startMs = Math.max(0, this.clock());
    let endMs = startMs;
    const done = new Promise<void>((resolve) => {
      recorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      recorder.onstop = () => {
        this.onSegment({
          index,
          startMs,
          endMs,
          blob: new Blob(chunks, { type: settings.mimeType }),
        });
        this.jobs.delete(recorder);
        resolve();
      };
      recorder.onerror = () => {
        this.jobs.delete(recorder);
        resolve();
      };
    });
    this.jobs.set(recorder, {
      done,
      stop: () => {
        if (recorder.state !== "inactive") {
          endMs = Math.max(startMs, this.clock());
          recorder.stop();
        }
      },
    });
    recorder.start();
    return recorder;
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    const jobs = [...this.jobs.values()];
    jobs.forEach((job) => job.stop());
    await Promise.all(jobs.map((job) => job.done));
    this.current = null;
  }
}
