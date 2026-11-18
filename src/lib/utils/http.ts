import { NextResponse } from "next/server";
import { z } from "zod";

const statusCodes = { UNAUTHORIZED:401, FORBIDDEN:403, NOT_FOUND:404, BAD_REQUEST:400, CONFLICT:409, LOCKED:409, RATE_LIMITED:429, AI_UNAVAILABLE:502, UPLOAD_MISSING:400, INTERNAL:500 } as const;
export type ErrorCode = keyof typeof statusCodes;
export class ApiError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}
export function fail(code: ErrorCode, message: string): never { throw new ApiError(code, message); }
export function route<Args extends [Request, ...unknown[]]>(callback: (...args: Args) => Response | Promise<Response>) {
  return async (...args: Args) => {
    try { return await callback(...args); }
    catch (error) {
      if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusCodes[error.code] });
      if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "BAD_REQUEST", message: error.issues[0]?.message || "Check the information and try again." } }, { status: 400 });
      const info = error as { name?: string; code?: string; cause?: { code?: string } };
      console.error("SkillMirror request failed", { type: info?.name, code: info?.cause?.code ?? info?.code });
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
    }
  };
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let data: unknown;
  try { data = await request.json(); } catch { fail("BAD_REQUEST", "A valid JSON body is required."); }
  return schema.parse(data);
}
export async function optionalBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  return request.body ? body(request, schema) : schema.parse({});
}
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status });
export const ok = () => json({ ok: true });
export const uuidParam = (id: string) => { if (!z.uuid().safeParse(id).success) fail("NOT_FOUND", "Not found."); return id; };
export type Params<K extends string> = { params: Promise<Record<K, string>> };
