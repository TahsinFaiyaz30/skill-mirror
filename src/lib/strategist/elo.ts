import { clamp } from "@/lib/utils/math";
export const expectedPerformance = (theta: number, level: number) =>
  1 / (1 + Math.exp(-1.5 * (theta - level)));
export const updateTheta = (theta: number, level: number, total: number) =>
  clamp(theta + 0.8 * (total / 4 - expectedPerformance(theta, level)), 0, 5);
