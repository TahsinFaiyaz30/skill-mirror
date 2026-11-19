// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClipPlayer } from "@/components/report/clip-player";
import { SkeletonOverlay } from "@/components/report/skeleton-overlay";
import { VisionEngine } from "@/lib/vision/engine";
import { defaultCalibration } from "@/lib/vision/features";

function frames() {
  const pending = new Map<number, VideoFrameRequestCallback>();
  const video = document.createElement("video");
  let next = 0;
  Object.defineProperties(video, {
    videoWidth: { value: 640, configurable: true },
    videoHeight: { value: 480, configurable: true },
    readyState: { value: 4, configurable: true },
  });
  video.requestVideoFrameCallback = (callback) => {
    pending.set(++next, callback);
    return next;
  };
  video.cancelVideoFrameCallback = (handle) => {
    pending.delete(handle);
  };
  function playFrame(at: number) {
    const queue = [...pending.values()];
    pending.clear();
    for (const callback of queue)
      callback(at, {} as VideoFrameCallbackMetadata);
  }
  return { pending, video, playFrame };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("camera and recording playback", () => {
  it("skips a camera that is not ready and continues after a detector throws", () => {
    const { video, pending, playFrame } = frames();
    const face = vi.fn(() => ({ faceLandmarks: [] }));
    face.mockImplementationOnce(() => {
      throw new Error("Camera switched");
    });
    const onFrame = vi.fn();
    const engine = new VisionEngine(
      video,
      {
        face: { detectForVideo: face },
        pose: { detectForVideo: () => ({ landmarks: [] }) },
        hand: { detectForVideo: () => ({ landmarks: [] }) },
      } as unknown as ConstructorParameters<typeof VisionEngine>[1],
      "full",
      {
        clock: () => -1,
        calibration: () => defaultCalibration,
        context: () => ({ state: "X", turnIdx: null }),
        onFrame,
        onTier: vi.fn(),
      },
    );
    engine.start();
    Object.defineProperty(video, "readyState", {
      value: 1,
      configurable: true,
    });
    playFrame(100);
    expect(face).not.toHaveBeenCalled();
    Object.defineProperty(video, "readyState", {
      value: 4,
      configurable: true,
    });
    expect(() => playFrame(200)).not.toThrow();
    expect(pending.size).toBe(1);
    playFrame(300);
    expect(onFrame).toHaveBeenCalledOnce();
    engine.stop();
    expect(pending.size).toBe(0);
  });

  it("keeps one skeleton callback after repeated seeks and cancels it on unmount", () => {
    const { video, pending, playFrame } = frames();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const { unmount } = render(
      createElement(SkeletonOverlay, {
        videoRef: { current: video },
        frames: [],
        offset: 0,
      }),
    );
    video.dispatchEvent(new Event("seeked"));
    video.dispatchEvent(new Event("seeked"));
    playFrame(100);
    expect(pending.size).toBe(1);
    unmount();
    expect(pending.size).toBe(0);
  });

  it.each([
    [0, "/first.webm"],
    [505, "/second.webm"],
  ])("loads the segment after the gap at %s ms", (clipStartMs, url) => {
    const client = new QueryClient();
    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ClipPlayer, {
          clip: { clipStartMs, clipEndMs: 1000 },
          playback: {
            segments: [
              { index: 0, startMs: 50, endMs: 500, url: "/first.webm" },
              { index: 1, startMs: 510, endMs: 1200, url: "/second.webm" },
            ],
            landmarksUrl: null,
            snapshots: {},
            deleted: false,
          },
          close: vi.fn(),
          onTime: vi.fn(),
          onTimeline: vi.fn(),
        }),
      ),
    );
    expect(
      screen.getByLabelText("Interview recording").getAttribute("src"),
    ).toBe(url);
  });
});
