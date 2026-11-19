import type {
  FaceLandmarker,
  PoseLandmarker,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import {
  FACE_FPS_TARGET,
  POSE_FPS_TARGET,
  HAND_FPS_TARGET,
  DEGRADE_AVG_MS,
  SEVERE_AVG_MS,
  LANDMARK_LOG_FPS,
} from "@/lib/config/constants";
import { mean } from "@/lib/utils/math";
import type { Calibration, MetricState, VisionTier } from "@/types/interview";
import {
  FeatureExtractor,
  type FrameFeatures,
  type Stamped,
  type FaceFeatures,
  type PoseFeatures,
  type HandFeatures,
} from "./features";
import { landmarkPoints, type LandmarkFrame } from "./landmarkLog";

type Models = {
  face: FaceLandmarker;
  pose: PoseLandmarker;
  hand: HandLandmarker;
};
let modelPromise: Promise<{ models: Models; tier: VisionTier }> | undefined;
async function importModels() {
  const { FilesetResolver, FaceLandmarker, PoseLandmarker, HandLandmarker } =
    await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  async function load(delegate: "GPU" | "CPU") {
    const common = { runningMode: "VIDEO" as const };
    const base = (model: string) => ({
      modelAssetPath: "/mediapipe/models/" + model + ".task",
      delegate,
    });
    const face = await FaceLandmarker.createFromOptions(files, {
      ...common,
      baseOptions: base("face_landmarker"),
      numFaces: 2,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    let pose: PoseLandmarker | null = null;
    try {
      pose = await PoseLandmarker.createFromOptions(files, {
        ...common,
        baseOptions: base("pose_landmarker_lite"),
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      const hand = await HandLandmarker.createFromOptions(files, {
        ...common,
        baseOptions: base("hand_landmarker"),
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { face, pose, hand };
    } catch (error) {
      face.close();
      pose?.close();
      throw error;
    }
  }
  try {
    return { models: await load("GPU"), tier: "full" as const };
  } catch {
    return { models: await load("CPU"), tier: "degraded" as const };
  }
}
export function preloadVision() {
  return (modelPromise ??= importModels().catch((error: unknown) => {
    modelPromise = undefined;
    throw error;
  }));
}
export class VisionEngine {
  face?: Stamped<FaceFeatures>;
  pose?: Stamped<PoseFeatures>;
  hand?: Stamped<HandFeatures>;
  tier: VisionTier;
  luma: number | null = null;
  readonly landmarks: LandmarkFrame[] = [];
  private frame = 0;
  private active = false;
  private callback: number | null = null;
  private extractor = new FeatureExtractor();
  private lastFace = -Infinity;
  private lastPose = -Infinity;
  private lastHand = -Infinity;
  private lastLuma = -Infinity;
  private lastLog = -Infinity;
  private lastCheck = 0;
  private times: number[] = [];
  private canvas = Object.assign(document.createElement("canvas"), {
    width: 160,
    height: 90,
  });
  constructor(
    private video: HTMLVideoElement,
    private models: Models,
    tier: VisionTier,
    private options: {
      calibration: () => Calibration;
      clock: () => number;
      context: () => { state: MetricState; turnIdx: number | null };
      onFrame: (frame: FrameFeatures) => void;
      onTier: (tier: VisionTier) => void;
      setup?: boolean;
    },
  ) {
    this.tier = tier;
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.callback = this.video.requestVideoFrameCallback(this.update);
  }
  stop() {
    this.active = false;
    if (this.callback !== null)
      this.video.cancelVideoFrameCallback(this.callback);
    this.callback = null;
  }
  private update = (now: number) => {
    this.callback = null;
    if (!this.active) return;
    try {
      if (
        this.video.readyState >= 2 &&
        this.video.videoWidth > 0 &&
        this.video.videoHeight > 0
      ) {
        this.processFrame(now);
      }
    } catch {
      // A transient detector error can occur while a replacement camera warms up.
    } finally {
      if (this.active && this.callback === null) {
        this.callback = this.video.requestVideoFrameCallback(this.update);
      }
    }
  };
  private processFrame(now: number) {
    const started = performance.now(),
      tMs = this.options.clock();
    const frame: FrameFeatures = { tMs, ...this.options.context() };
    const interval = this.tier === "full" ? 1 : 4 / 3;
    const ratio = this.video.videoWidth / this.video.videoHeight || 16 / 9;
    const { gaze, posture } = this.options.calibration();
    if (now - this.lastFace >= (1000 / FACE_FPS_TARGET) * interval) {
      const out = this.models.face.detectForVideo(this.video, now);
      const faces = out.faceLandmarks.map((points, i) => ({
        points,
        matrix: out.facialTransformationMatrixes[i]?.data,
        shapes: Object.fromEntries(
          (out.faceBlendshapes[i]?.categories ?? []).map((c) => [
            c.categoryName,
            c.score,
          ]),
        ),
      }));
      frame.face = this.extractor.face(faces, ratio, tMs, gaze);
      this.face = { tMs, value: frame.face };
      this.lastFace = now;
    }
    if (
      this.frame % 2 === 0 &&
      now - this.lastPose >= (1000 / POSE_FPS_TARGET) * interval
    ) {
      const out = this.models.pose.detectForVideo(this.video, now);
      frame.pose = this.extractor.pose(
        out.landmarks[0] ?? [],
        ratio,
        tMs,
        posture,
      );
      this.pose = { tMs, value: frame.pose };
      this.lastPose = now;
    }
    if (
      this.frame % 2 === 1 &&
      this.tier !== "severe" &&
      now - this.lastHand >= (1000 / HAND_FPS_TARGET) * interval
    ) {
      const out = this.models.hand.detectForVideo(this.video, now);
      const hands = out.landmarks.map((points, i) => ({
        points,
        side:
          out.handedness[i]?.[0]?.categoryName === "Left"
            ? ("Left" as const)
            : ("Right" as const),
      }));
      frame.hand = this.extractor.hand(
        hands,
        ratio,
        tMs,
        this.face?.value,
        this.pose?.value,
      );
      this.hand = { tMs, value: frame.hand };
      this.lastHand = now;
    }
    if (now - this.lastLuma >= (this.options.setup ? 250 : 5000)) {
      this.measureLuma();
      this.lastLuma = now;
    }
    if (tMs >= 0 && tMs - this.lastLog >= 1000 / LANDMARK_LOG_FPS) {
      const fresh = <T>(sample?: Stamped<T>) =>
        sample && tMs - sample.tMs <= 300 ? sample.value : undefined;
      const hands = fresh(this.hand)?.hands ?? [];
      this.landmarks.push({
        tMs,
        points: landmarkPoints(
          fresh(this.face)?.points ?? [],
          fresh(this.pose)?.points ?? [],
          hands.find((h) => h.side === "Left")?.points ?? [],
          hands.find((h) => h.side === "Right")?.points ?? [],
        ),
      });
      this.lastLog = tMs;
    }
    const processingMs = performance.now() - started;
    if (frame.face || frame.pose || frame.hand) this.times.push(processingMs);
    this.lastCheck ||= now;
    if (now - this.lastCheck >= 5000) {
      const average = mean(this.times) ?? 0;
      const next =
        this.tier === "full" && average > DEGRADE_AVG_MS
          ? "degraded"
          : this.tier === "degraded" && average > SEVERE_AVG_MS
            ? "severe"
            : this.tier;
      if (next !== this.tier) {
        this.tier = next;
        this.options.onTier(next);
      }
      this.lastCheck = now;
      this.times = [];
    }
    this.options.onFrame(frame);
    this.frame++;
  }
  private measureLuma() {
    const b = this.face?.value.box;
    if (!b) {
      this.luma = null;
      return;
    }
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.drawImage(this.video, 0, 0, width, height);
    const left = Math.max(0, Math.floor(b.left * width)),
      top = Math.max(0, Math.floor(b.top * height));
    const right = Math.min(width, Math.ceil(b.right * width)),
      bottom = Math.min(height, Math.ceil(b.bottom * height));
    if (left >= right || top >= bottom) {
      this.luma = null;
      return;
    }
    const pixels = ctx.getImageData(left, top, right - left, bottom - top).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4)
      sum +=
        0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    this.luma = sum / (pixels.length / 4);
  }
}
