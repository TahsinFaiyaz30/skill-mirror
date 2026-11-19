// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisionEngine } from "@/lib/vision/engine";
import { defaultCalibration } from "@/lib/vision/features";
import { mediaSession } from "@/lib/live/mediaSession";

afterEach(() => {
  mediaSession.close();
  vi.restoreAllMocks();
});

describe("camera sampling and lifecycle", () => {
  it.each([false, true])(
    "samples 30 fps input on schedule with integrity-only mode %s",
    (off) => {
      let callback: VideoFrameRequestCallback;
      const camera = {
        readyState: 2,
        videoWidth: 1280,
        videoHeight: 720,
        requestVideoFrameCallback(cb: VideoFrameRequestCallback) {
          callback = cb;
          return 1;
        },
        cancelVideoFrameCallback: vi.fn(),
      };
      const face = vi.fn(() => ({
        faceLandmarks: [],
        facialTransformationMatrixes: [],
        faceBlendshapes: [],
      }));
      const pose = vi.fn(() => ({ landmarks: [] }));
      const hand = vi.fn(() => ({ landmarks: [], handedness: [] }));
      const models = {
        face: { detectForVideo: face },
        pose: { detectForVideo: pose },
        hand: { detectForVideo: hand },
      };
      const count = vi.fn();
      const engine = new VisionEngine(
        camera as unknown as HTMLVideoElement,
        models as unknown as ConstructorParameters<typeof VisionEngine>[1],
        "full",
        {
          calibration: () => defaultCalibration,
          clock: () => 0,
          context: () => ({ state: "L", turnIdx: 0 }),
          onFrame: vi.fn(),
          onTier: vi.fn(),
          onFaceCount: off ? count : undefined,
        },
      );
      engine.start();
      for (let frame = 0; frame < 900; frame++)
        callback!((frame * 1000) / 30, {} as VideoFrameCallbackMetadata);
      engine.stop();
      expect(face.mock.calls.length).toBeGreaterThanOrEqual(599);
      expect(face.mock.calls.length).toBeLessThanOrEqual(601);
      if (off) {
        expect(count).toHaveBeenCalledTimes(face.mock.calls.length);
        expect(pose).not.toHaveBeenCalled();
        expect(hand).not.toHaveBeenCalled();
        expect(engine.landmarks).toHaveLength(0);
      } else {
        expect(pose.mock.calls.length).toBeGreaterThanOrEqual(299);
        expect(hand.mock.calls.length).toBeGreaterThanOrEqual(299);
      }
    },
  );
  it("closes a device grant that arrives after navigating away", async () => {
    const stop = vi.fn();
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve;
      });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const pending = mediaSession.open();
    mediaSession.close();
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(stop).toHaveBeenCalledOnce();
    expect(mediaSession.stream).toBeNull();
  });
});
