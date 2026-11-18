"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { Pause, Play, X } from "lucide-react";
import { errorMessage, shortTime } from "@/lib/utils/client";
import { readLandmarkLog } from "@/lib/vision/landmarkLog";
import type { Playback } from "@/types/interview";
import type { Clip } from "@/types/report";
import { SkeletonOverlay } from "./skeleton-overlay";

async function loadLandmarks(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error("Landmarks are unavailable.");
  const bytes = await new Response(
    response.body.pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  return readLandmarkLog(new Uint8Array(bytes));
}
export function ClipPlayer({
  clip,
  playback,
  close,
  onTime,
  onTimeline,
}: {
  clip: Clip;
  playback: Playback;
  close: () => void;
  onTime: (ms: number) => void;
  onTimeline: (ms: number) => void;
}) {
  const segments = playback.segments;
  const firstIndex = segments.findIndex(
    (item) => item.startMs <= clip.clipStartMs && item.endMs > clip.clipStartMs,
  );
  const [active, setActive] = useState(Math.max(0, firstIndex));
  const [position, setPosition] = useState(clip.clipStartMs);
  const [playing, setPlaying] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const target = useRef(clip.clipStartMs),
    continuePlaying = useRef(false);
  const segment = segments[active];
  const landmarks = useQuery({
    queryKey: ["landmarks", playback.landmarksUrl],
    queryFn: () => loadLandmarks(playback.landmarksUrl!),
    enabled: overlay && Boolean(playback.landmarksUrl),
    staleTime: 3000000,
  });
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segment) return;
    const seek = () => {
      video.currentTime = Math.max(
        0,
        (target.current - segment.startMs) / 1000,
      );
      if (continuePlaying.current) void video.play().catch(() => {});
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", seek);
    };
  }, [segment]);
  const seek = (ms: number, resume = playing) => {
    const index = segments.findIndex(
      (item) => item.startMs <= ms && item.endMs > ms,
    );
    if (index === -1) return;
    target.current = ms;
    continuePlaying.current = resume;
    setPosition(ms);
    onTime(ms);
    if (index !== active) setActive(index);
    else if (videoRef.current)
      videoRef.current.currentTime = (ms - segments[index].startMs) / 1000;
  };
  function time() {
    const video = videoRef.current;
    if (!video || !segment) return;
    const ms = Math.round(segment.startMs + video.currentTime * 1000);
    setPosition(ms);
    onTime(ms);
    if (ms >= clip.clipEndMs) {
      video.pause();
      continuePlaying.current = false;
      return;
    }
    const next = segments[active + 1];
    if (next && ms >= next.startMs && ms < clip.clipEndMs && !video.paused) {
      target.current = ms;
      continuePlaying.current = true;
      setActive(active + 1);
    }
  }
  const missing = !segment || firstIndex === -1;
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content clip-dialog card stack">
          <div className="cluster between">
            <Dialog.Title className="text-xl font-bold">
              Interview clip
            </Dialog.Title>
            <Dialog.Close aria-label="Close clip">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {shortTime(clip.clipStartMs)}–{shortTime(clip.clipEndMs)}
          </Dialog.Description>
          {playback.deleted ? (
            <p>Recording deleted after 30 days. Insights remain available.</p>
          ) : missing ? (
            <p>This part of the recording is unavailable.</p>
          ) : (
            <>
              <div className="clip-video">
                <video
                  key={segment.index}
                  ref={videoRef}
                  src={segment.url}
                  playsInline
                  preload="metadata"
                  aria-label="Interview recording"
                  onTimeUpdate={time}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => {
                    const next = segments[active + 1];
                    if (next && next.startMs < clip.clipEndMs) {
                      target.current = Math.max(next.startMs, position);
                      continuePlaying.current = true;
                      setActive(active + 1);
                    }
                  }}
                  onError={() =>
                    setError("This video segment could not be played.")
                  }
                />
                {overlay && landmarks.data && (
                  <SkeletonOverlay
                    videoRef={videoRef}
                    frames={landmarks.data}
                    offset={segment.startMs}
                  />
                )}
              </div>
              <label className="stack-sm">
                <span className="sr-only">Clip position</span>
                <input
                  type="range"
                  min={Math.max(0, clip.clipStartMs - 10000)}
                  max={Math.min(
                    segments.at(-1)?.endMs ?? clip.clipEndMs,
                    clip.clipEndMs + 10000,
                  )}
                  value={position}
                  onChange={(event) => seek(+event.target.value)}
                />
              </label>
              <div className="cluster">
                <button
                  className="button secondary"
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      if (position >= clip.clipEndMs) seek(clip.clipStartMs);
                      void video
                        .play()
                        .catch(() =>
                          setError("This video segment could not be played."),
                        );
                    } else video.pause();
                  }}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                  {playing ? "Pause" : "Play"}
                </button>
                <time>{shortTime(position)}</time>
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={!playback.landmarksUrl}
                    checked={overlay}
                    onChange={(event) => setOverlay(event.target.checked)}
                  />
                  Skeleton overlay
                </label>
                <button
                  className="button ghost"
                  onClick={() => {
                    onTimeline(position);
                    close();
                  }}
                >
                  Open in timeline
                </button>
              </div>
              {(error || landmarks.isError) && (
                <p role="alert" className="danger">
                  {error || errorMessage(landmarks.error)}
                </p>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
