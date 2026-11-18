import { send } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { SessionMedia } from "@/types/interview";
export type UploadKind = "video_segment" | "mic_audio" | "timeline" | "landmarks" | "pitch" | "snapshot";
type Job = { sessionId: string; kind: UploadKind; blob: Blob; index?: number; eventId?: string; commit?: (path: string, bytes: number) => Promise<unknown> | unknown };
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class Uploader {
  private queued: Job[] = [];
  private broken: Job[] = [];
  private current?: Job;
  private worker: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  get pendingCount() { return this.queued.length + Number(!!this.current); }
  get bytesPending() { return this.queued.reduce((n,j) => n + j.blob.size, this.current?.blob.size ?? 0); }
  get failures() { return this.broken.length; }
  onProgress(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update() { this.listeners.forEach((listener) => listener()); }
  push(job: Job) { this.queued.push(job); this.run(); }
  retry() { this.queued.unshift(...this.broken); this.broken = []; this.run(); }
  async drain() { while (this.worker) await this.worker; }
  private run() {
    if (!this.worker) this.worker = this.work().finally(() => { this.worker = null; if (this.queued.length) this.run(); });
    this.update();
  }
  private async work() {
    for (let job = this.queued.shift(); job; job = this.queued.shift()) {
      this.current = job; this.update();
      let signed: SignedUpload | null = null, uploaded = false, success = false;
      for (const backoff of [0, 1000, 3000, 9000]) {
        if (backoff) await pause(backoff);
        try {
          if (!uploaded) {
            signed ??= await send<SignedUpload>("/api/sessions/" + job.sessionId + "/upload-url", "POST", { kind: job.kind, index: job.index, eventId: job.eventId });
            const bucket = job.kind === "video_segment" || job.kind === "mic_audio" ? "recordings" : "artifacts";
            await uploadFile(bucket, signed, job.blob, job.blob.type);
            uploaded = true;
          }
          await job.commit?.(signed!.path, job.blob.size);
          success = true; break;
        } catch { /* Resume the same upload or its metadata write after backoff. */ }
      }
      if (!success) this.broken.push(job);
      this.current = undefined; this.update();
    }
  }
}
export const uploader = new Uploader();
export const patchMedia = (sessionId: string, media: SessionMedia) => send("/api/sessions/" + sessionId + "/media", "PATCH", media);
export async function gzip(blob: Blob) {
  const compressed = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return new Blob([compressed], { type: "application/gzip" });
}
