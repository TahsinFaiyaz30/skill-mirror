"use client";
import { useEffect, useRef, type RefObject } from "react";
import {
  FACE_BONES,
  HAND_BONES,
  LOG_FACE,
  LOG_POSE,
  POSE_BONES,
  type Point,
} from "@/lib/vision/landmarks";
import { nearestLandmark, type LandmarkFrame } from "@/lib/vision/landmarkLog";
export function SkeletonOverlay({
  videoRef,
  frames,
  offset,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  frames: LandmarkFrame[];
  offset: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canvas.current) return;
    const target = canvas.current,
      context = target.getContext("2d");
    if (!context) return;
    let handle = 0;
    function draw() {
      if (!context || !video) return;
      const width = video.videoWidth,
        height = video.videoHeight;
      if (
        width &&
        height &&
        (target.width !== width || target.height !== height)
      ) {
        target.width = width;
        target.height = height;
      }
      context.clearRect(0, 0, width, height);
      const frame = nearestLandmark(frames, offset + video.currentTime * 1000);
      if (frame && width && height) {
        const points = frame.points;
        const face = (i: number) => points[LOG_FACE.indexOf(i)];
        const pose = (i: number) =>
          points[LOG_FACE.length + LOG_POSE.indexOf(i)];
        const line = (
          path: number[],
          get: (index: number) => Point | undefined,
          color: string,
        ) => {
          context.strokeStyle = color;
          context.lineWidth = 2;
          let open = false;
          context.beginPath();
          for (const index of path) {
            const item = get(index);
            if (!item) {
              open = false;
              continue;
            }
            if (open) context.lineTo(item.x * width, item.y * height);
            else context.moveTo(item.x * width, item.y * height);
            open = true;
          }
          context.stroke();
        };
        FACE_BONES.forEach((bone) => line(bone, face, "#A78BFA"));
        POSE_BONES.forEach((bone) => line(bone, pose, "#22D3B6"));
        const a = pose(11),
          b = pose(12);
        if (a && b)
          line(
            [0, 1],
            (index) =>
              index ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : pose(0),
            "#22D3B6",
          );
        HAND_BONES.forEach((bone) => {
          for (let side = 0; side < 2; side++)
            line(
              bone,
              (i) => points[LOG_FACE.length + LOG_POSE.length + side * 21 + i],
              "#F5B544",
            );
        });
        for (const idx of [468, 473]) {
          const eye = face(idx);
          if (eye) {
            context.fillStyle = "#fff";
            context.beginPath();
            context.arc(eye.x * width, eye.y * height, 2, 0, 2 * Math.PI);
            context.fill();
          }
        }
      }
      handle = video.requestVideoFrameCallback(draw);
    }
    draw();
    video.addEventListener("seeked", draw);
    return () => {
      video.cancelVideoFrameCallback(handle);
      video.removeEventListener("seeked", draw);
    };
  }, [videoRef, frames, offset]);
  return (
    <canvas className="skeleton-overlay" ref={canvas} aria-hidden="true" />
  );
}
