import { LANDMARK_LOG_FPS } from "@/lib/config/constants";
import { LOG_FACE, LOG_POSE, type PointSet } from "./landmarks";
export const LANDMARK_POINT_COUNT = 104;
const headerBytes = 14;
const frameBytes = 4 + LANDMARK_POINT_COUNT * 4;
export type LandmarkFrame = { tMs: number; points: PointSet };
export function landmarkPoints(
  face: PointSet,
  pose: PointSet,
  left: PointSet,
  right: PointSet,
) {
  return [
    ...LOG_FACE.map((index) => face[index]),
    ...LOG_POSE.map((index) => pose[index]),
    ...Array.from({ length: 21 }, (_, i) => left[i]),
    ...Array.from({ length: 21 }, (_, i) => right[i]),
  ];
}
export function writeLandmarkLog(frames: LandmarkFrame[]) {
  const coordinate = (value: number) =>
    Math.max(-32768, Math.min(32767, Math.round(value * 10000)));
  const bytes = new Uint8Array(headerBytes + frames.length * frameBytes);
  bytes.set(new TextEncoder().encode("LMK1"));
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 1, true);
  view.setUint16(6, LANDMARK_LOG_FPS, true);
  view.setUint16(8, LANDMARK_POINT_COUNT, true);
  view.setUint32(10, frames.length, true);
  frames.forEach(({ tMs, points }, i) => {
    const offset = headerBytes + i * frameBytes;
    view.setInt32(offset, tMs, true);
    for (let j = 0; j < LANDMARK_POINT_COUNT; j++) {
      const point = points[j];
      view.setInt16(offset + 4 + j * 4, point ? coordinate(point.x) : -1, true);
      view.setInt16(offset + 6 + j * 4, point ? coordinate(point.y) : -1, true);
    }
  });
  return bytes;
}
export function readLandmarkLog(bytes: Uint8Array) {
  if (
    bytes.byteLength < headerBytes ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== "LMK1"
  )
    throw new Error("Invalid landmark log");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(10, true);
  if (
    view.getUint16(4, true) !== 1 ||
    view.getUint16(6, true) !== LANDMARK_LOG_FPS ||
    view.getUint16(8, true) !== LANDMARK_POINT_COUNT ||
    bytes.length !== headerBytes + count * frameBytes
  )
    throw new Error("Invalid landmark log");
  return Array.from({ length: count }, (_, i): LandmarkFrame => {
    const offset = headerBytes + i * frameBytes;
    const points = Array.from({ length: LANDMARK_POINT_COUNT }, (_, j) => {
      const x = view.getInt16(offset + 4 + j * 4, true),
        y = view.getInt16(offset + 6 + j * 4, true);
      return x === -1 && y === -1 ? undefined : { x: x / 10000, y: y / 10000 };
    });
    return { tMs: view.getInt32(offset, true), points };
  });
}
export function nearestLandmark(frames: LandmarkFrame[], tMs: number) {
  let lo = 0,
    hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((frames[mid].tMs + frames[mid + 1].tMs) / 2 < tMs) lo = mid + 1;
    else hi = mid;
  }
  return frames[lo];
}
