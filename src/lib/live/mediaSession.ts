import { defaultCalibration } from "@/lib/vision/features";
import type { Calibration } from "@/types/interview";
export const captureConstraints = {
  video: { width: 1280, height: 720, frameRate: 30, facingMode: "user" },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    channelCount: 1,
  },
} satisfies MediaStreamConstraints;
class MediaSession {
  stream: MediaStream | null = null;
  video: HTMLVideoElement | null = null;
  calibration: Calibration = structuredClone(defaultCalibration);
  mockCalibration = false;
  async open(force = false) {
    if (
      this.stream &&
      this.video &&
      !force &&
      this.stream.getTracks().every((t) => t.readyState === "live")
    )
      return { stream: this.stream, video: this.video };
    this.close();
    const stream =
      await navigator.mediaDevices.getUserMedia(captureConstraints);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });
    video.srcObject = stream;
    document.body.append(video);
    this.stream = stream;
    this.video = video;
    await video.play();
    return { stream, video };
  }
  close() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video?.remove();
    this.stream = null;
    this.video = null;
  }
}
export const mediaSession = new MediaSession();
