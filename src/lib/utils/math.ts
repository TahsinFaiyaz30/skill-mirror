export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const mean = (values: readonly number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export const present = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const at = (ordered.length - 1) * p;
  return ordered[Math.floor(at)] + (ordered[Math.ceil(at)] - ordered[Math.floor(at)]) * (at % 1);
}
export const median = (values: readonly number[]) => percentile(values, 0.5);
export function deviation(values: readonly number[]): number | null {
  const average = mean(values);
  return average === null ? null : Math.sqrt(mean(values.map((value) => (value - average) ** 2))!);
}
export const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
