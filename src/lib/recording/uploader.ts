import { send } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { SessionMedia } from "@/types/interview";
export type UploadKind =
  | "video_segment"
  | "mic_audio"
  | "timeline"
  | "landmarks"
  | "pitch"
  | "snapshot";
type Job = {
  sessionId: string;
  kind: UploadKind;
  blob: Blob;
  index?: number;
  captureIndex?: number;
  eventId?: string;
  commit?: (path: string, bytes: number) => Promise<unknown> | unknown;
};
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export class Uploader {
  private queued: Job[] = [];
  private broken: Job[] = [];
  private current?: Job;
  private worker: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  status(sessionId: string) {
    const jobs = this.queued.filter((job) => job.sessionId === sessionId);
    if (this.current?.sessionId === sessionId) jobs.push(this.current);
    return {
      pending: jobs.length,
      bytes: jobs.reduce((total, job) => total + job.blob.size, 0),
      failed: this.broken.filter((job) => job.sessionId === sessionId).length,
    };
  }
  onProgress(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private update() {
    this.listeners.forEach((listener) => listener());
  }
  push(job: Job) {
    this.queued.push(job);
    this.run();
  }
  retry(sessionId: string) {
    this.queued.unshift(
      ...this.broken.filter((job) => job.sessionId === sessionId),
    );
    this.broken = this.broken.filter((job) => job.sessionId !== sessionId);
    this.run();
  }
  async drain(sessionId: string) {
    while (this.status(sessionId).pending && this.worker) await this.worker;
  }
  private run() {
    if (!this.worker)
      this.worker = this.work().finally(() => {
        this.worker = null;
        if (this.queued.length) this.run();
      });
    this.update();
  }
  private async work() {
    for (let job = this.queued.shift(); job; job = this.queued.shift()) {
      this.current = job;
      this.update();
      let signed: SignedUpload | null = null,
        uploaded = false,
        success = false;
      for (const backoff of [0, 1000, 3000, 9000]) {
        if (backoff) await pause(backoff);
        try {
          if (!uploaded) {
            signed ??= await send<SignedUpload>(
              "/api/sessions/" + job.sessionId + "/upload-url",
              "POST",
              {
                kind: job.kind,
                index: job.index,
                eventId: job.eventId,
                captureIndex: job.captureIndex,
              },
            );
            const bucket =
              job.kind === "video_segment" || job.kind === "mic_audio"
                ? "recordings"
                : "artifacts";
            await uploadFile(bucket, signed, job.blob, job.blob.type);
            uploaded = true;
          }
          await job.commit?.(signed!.path, job.blob.size);
          success = true;
          break;
        } catch {
          /* Resume the same upload or its metadata write after backoff. */
        }
      }
      if (!success) this.broken.push(job);
      this.current = undefined;
      this.update();
    }
  }
}
export const uploader = new Uploader();
export const patchMedia = (
  sessionId: string,
  media: SessionMedia,
  captureIndex = 0,
) =>
  send("/api/sessions/" + sessionId + "/media", "PATCH", {
    ...media,
    captureIndex,
  });
export async function gzip(blob: Blob) {
  const compressed = await new Response(
    blob.stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  return new Blob([compressed], { type: "application/gzip" });
}
