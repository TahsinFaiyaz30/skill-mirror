import { createHmac, timingSafeEqual } from "node:crypto";
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map((item) => canonicalJSON(item ?? null)).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const fields = value as Record<string, unknown>;
    return "{" + Object.keys(fields).sort().filter((key) => fields[key] !== undefined)
      .map((key) => JSON.stringify(key) + ":" + canonicalJSON(fields[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
export function signCertificate(payload: unknown, secret: string) {
  const key = /^(?:[a-f\d]{2}){32,}$/i.test(secret) ? Buffer.from(secret,"hex") : secret;
  return createHmac("sha256",key).update(canonicalJSON(payload)).digest("hex");
}
export function verifyCertificate(payload: unknown, signature: string, secret: string) {
  if (!/^[a-f\d]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signCertificate(payload,secret),"hex"),Buffer.from(signature,"hex"));
}
