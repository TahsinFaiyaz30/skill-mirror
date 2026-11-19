import type { SessionEvent, VisionSummary } from "@/types/interview";

export type FaceVisibility = Pick<
  VisionSummary,
  "faceVisiblePct" | "multiFacePct"
>;

export function integrityOnly(event: Pick<SessionEvent, "category" | "type">) {
  return (
    (event.category === "integrity" &&
      [
        "face_missing",
        "multiple_faces",
        "reading_pattern",
        "tab_hidden",
        "window_blur",
      ].includes(event.type)) ||
    (event.category === "live_vision" &&
      [
        "second_person",
        "reading_notes",
        "phone_use",
        "left_frame",
        "looking_off_screen",
      ].includes(event.type))
  );
}

export function faceVisibility(vision?: FaceVisibility | null): FaceVisibility {
  return {
    faceVisiblePct: vision?.faceVisiblePct ?? null,
    multiFacePct: vision?.multiFacePct ?? null,
  };
}

export class FacePresence {
  private samples: { time: number; count: number }[] = [];
  add(time: number, count: number) {
    this.samples.push({ time, count });
  }
  between(start: number, end: number): FaceVisibility {
    const samples = this.samples.filter(
      ({ time }) => time >= start && time <= end,
    );
    if (!samples.length) return faceVisibility();
    return {
      faceVisiblePct:
        samples.filter(({ count }) => count > 0).length / samples.length,
      multiFacePct:
        samples.filter(({ count }) => count > 1).length / samples.length,
    };
  }
}
