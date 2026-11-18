import { localMock } from "@/lib/config/env";
import { BUCKETS, putObject, readObject, verifyStorageURL, type Bucket } from "@/lib/supabase/storage";
import { fail, ok, route } from "@/lib/utils/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ bucket: string; parts: string[] }> };
async function object(request: Request, context: Context, method: "GET" | "PUT") {
  const { bucket: name, parts } = await context.params;
  const bucket = name as Bucket;
  if (!localMock || !BUCKETS.includes(bucket) || parts.some((part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) fail("NOT_FOUND", "Object not found.");
  const path = parts.join("/");
  const query = new URL(request.url).searchParams;
  if (!(method === "GET" && bucket === "org-assets") && !verifyStorageURL(bucket, path, method, query)) fail("FORBIDDEN", "This storage URL is invalid or expired.");
  return { path, bucket, query };
}
export const PUT = route(async (request, context: Context) => {
  const { path, bucket, query } = await object(request, context, "PUT");
  const limit = bucket === "org-assets" ? 1048576 : 52428800;
  if (Number(request.headers.get("content-length")) > limit) fail("BAD_REQUEST", "This file is too large.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) fail("BAD_REQUEST", "This file is too large.");
  await putObject(bucket, path, bytes, request.headers.get("content-type") || "application/octet-stream", query.get("upsert") === "1");
  return ok();
});
const mime: Record<string, string> = { pdf: "application/pdf", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml", gz: "application/gzip", json: "application/json" };
export const GET = route(async (request, context: Context) => {
  const { path, bucket } = await object(request, context, "GET");
  const data = await readObject(bucket, path);
  if (!data) fail("NOT_FOUND", "Object not found.");
  const type = mime[path.split(".").at(-1) ?? ""] ?? "application/octet-stream";
  const headers = new Headers({ "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Accept-Ranges": "bytes" });
  const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : data.length - 1, data.length - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + data.length } });
    headers.set("Content-Range", "bytes " + start + "-" + end + "/" + data.length);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
  }
  headers.set("Content-Length", String(data.length));
  return new Response(new Uint8Array(data), { headers });
});
