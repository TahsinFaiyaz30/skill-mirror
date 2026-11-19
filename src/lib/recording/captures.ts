import type { CaptureFiles, SessionMedia } from "@/types/interview";

// A single capture can hold at most 100 segments. Each page gets its own range.
export const SEGMENTS_PER_CAPTURE = 128;

export function captureFiles(media: SessionMedia): CaptureFiles[] {
  return [media, ...Object.values(media.additionalCaptures ?? {})];
}

export function reserveCapture(
  media: SessionMedia,
  id: string,
  resuming: boolean,
) {
  const ids = media.captureIds ?? (resuming ? [null] : []);
  const existing = ids.indexOf(id);
  if (existing >= 0) return { ids, index: existing };
  return { ids: [...ids, id], index: ids.length };
}
