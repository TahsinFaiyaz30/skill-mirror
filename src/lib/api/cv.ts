import { and, desc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { candidateCvs } from "@/lib/db/schema";
import { readObject, uploadURL } from "@/lib/supabase/storage";
import { publicEnv, unpaidAI } from "@/lib/config/env";
import { p1 } from "@/lib/ai/prompts/p1_cv";
import { attachment, geminiJSON } from "@/lib/ai/gemini";
import { parsedCvSchema } from "@/lib/ai/schemas";
import { sampleParsedCv } from "@/lib/ai/mock/sampleParsedCv";
import {
  body,
  fail,
  json,
  ok,
  route,
  uuidParam,
  type Params,
} from "@/lib/utils/http";

const maxBytes = 5_242_880;
const cvPath = (userId: string, cvId: string) => userId + "/" + cvId + ".pdf";
export const createCvUpload = route(async (request) => {
  const user = await requireUser();
  const { fileName } = await body(
    request,
    z.object({
      fileName: z
        .string()
        .max(255)
        .regex(/\.pdf$/i),
      sizeBytes: z.number().int().positive().max(maxBytes),
    }),
  );
  const cvId = randomUUID();
  const path = cvPath(user.id, cvId);
  await (
    await db()
  )
    .insert(candidateCvs)
    .values({ id: cvId, userId: user.id, storagePath: path, fileName });
  return json({ cvId, ...(await uploadURL("cvs", path, true)) });
});
async function ownedCv(cvId: string) {
  const user = await requireUser();
  const database = await db();
  const [cv] = await database
    .select()
    .from(candidateCvs)
    .where(
      and(
        eq(candidateCvs.id, uuidParam(cvId)),
        eq(candidateCvs.userId, user.id),
      ),
    );
  if (!cv) fail("NOT_FOUND", "CV not found.");
  return { cv, database, user };
}
export const parseCv = route(async (request, context: Params<"cvId">) => {
  const { cv, database } = await ownedCv((await context.params).cvId);
  const path = cvPath(cv.userId, cv.id);
  const sample =
    cv.storagePath === cv.userId + "/sample.pdf" && cv.parseStatus === "parsed";
  if (cv.storagePath !== path && !sample) fail("NOT_FOUND", "CV not found.");
  if (unpaidAI)
    await body(
      request,
      z.object({
        syntheticMaterial: z.literal(true, {
          error: "Confirm that this is a fictional CV for the demo.",
        }),
      }),
    );
  if (cv.parseStatus === "parsed" && cv.parsed)
    return json({ cvId: cv.id, parsed: cv.parsed });
  const pdf = await readObject("cvs", path);
  if (!pdf) fail("UPLOAD_MISSING", "Upload your CV before reading it.");
  if (pdf.length > maxBytes || pdf.subarray(0, 5).toString() !== "%PDF-")
    fail("BAD_REQUEST", "Upload a PDF smaller than 5 MB.");
  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(pdf)).getPageCount();
  } catch {
    fail(
      "BAD_REQUEST",
      "This PDF cannot be read. Export an unlocked PDF and try again.",
    );
  }
  if (pageCount > 10 || pageCount === 0)
    fail("BAD_REQUEST", "The CV must be a PDF of 1 to 10 pages.");
  const where = eq(candidateCvs.id, cv.id);
  await database
    .update(candidateCvs)
    .set({ parseStatus: "parsing", error: null })
    .where(where);
  try {
    const parsed =
      publicEnv.aiMode === "mock"
        ? structuredClone(sampleParsedCv)
        : {
            ...(await geminiJSON(p1({}), parsedCvSchema, {
              inline: attachment("document", "application/pdf", pdf),
            })),
            skills_removed: [],
          };
    await database
      .update(candidateCvs)
      .set({ parseStatus: "parsed", parsed, pageCount })
      .where(where);
    return json({ cvId: cv.id, parsed });
  } catch (error) {
    console.error(
      "SkillMirror parseCv failed:",
      error instanceof Error ? error.message : String(error),
    );
    await database
      .update(candidateCvs)
      .set({
        parseStatus: "failed",
        error: "We couldn't read your CV. Please try again.",
      })
      .where(where);
    fail("AI_UNAVAILABLE", "We couldn't read your CV. Please try again.");
  }
});
export const patchCv = route(async (request, context: Params<"cvId">) => {
  const { cv, database } = await ownedCv((await context.params).cvId);
  if (!cv.parsed) fail("CONFLICT", "Your CV is still being read.");
  const { skillsRemoved } = await body(
    request,
    z.object({ skillsRemoved: z.array(z.string().max(160)).max(40) }),
  );
  const parsed = {
    ...cv.parsed,
    skills_removed: [...new Set(skillsRemoved)].filter((name) =>
      cv.parsed?.skills.some((skill) => skill.name === name),
    ),
  };
  await database
    .update(candidateCvs)
    .set({ parsed })
    .where(eq(candidateCvs.id, cv.id));
  return ok();
});
export const listCv = route(async () => {
  const user = await requireUser();
  const rows = await (
    await db()
  )
    .select()
    .from(candidateCvs)
    .where(eq(candidateCvs.userId, user.id))
    .orderBy(desc(candidateCvs.createdAt))
    .limit(10);
  return json({
    items: rows.map((cv) => ({
      cvId: cv.id,
      fileName: cv.fileName,
      createdAt: cv.createdAt,
      parseStatus: cv.parseStatus,
      headline: cv.parsed?.headline ?? null,
    })),
  });
});
