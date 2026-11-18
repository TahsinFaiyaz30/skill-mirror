export type Point = { x: number; y: number; visibility?: number };
export type PointSet = Array<Point | undefined>;
export const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export const LOG_FACE = [...FACE_OVAL,33,133,362,263,468,473,159,145,386,374,1,61,291,13,14];
export const LOG_POSE = [0,7,8,11,12,13,14,15,16,23,24];
export const HAND_BONES = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
export const FACE_BONES = [[...FACE_OVAL,FACE_OVAL[0]],[33,159,133,145,33],[362,386,263,374,362],[61,13,291,14,61]];
export const POSE_BONES = [[11,12],[11,13,15],[12,14,16],[11,23,24,12]];
export const TIMED_POSE = { nose:0, shoulders:[11,12], wrists:[15,16] } as const;
export type Box = { left: number; top: number; right: number; bottom: number };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const isotropic = (point: Point, ratio: number): Point => ({ ...point, x: point.x * ratio });
export function boundingBox(points: readonly Point[]): Box {
  return points.reduce((box, p) => ({ left: Math.min(box.left, p.x), top: Math.min(box.top, p.y), right: Math.max(box.right, p.x), bottom: Math.max(box.bottom, p.y) }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}
export const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
