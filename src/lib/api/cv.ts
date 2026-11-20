import { and, desc, eq, ne } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { db, type Transaction } from "@/lib/db";
import { candidateCvs, profiles } from "@/lib/db/schema";
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
// Finish below the parse route's 120 s maxDuration so a slow provider ends as
// a "failed" parse the user can retry, not a platform timeout that leaves the
// row in "parsing".
const CV_PARSE_TIMEOUT_MS = 100_000;
// A request that finds a read already running waits slightly longer than that
// read may take, still inside the 120 s route limit.
const CV_PARSE_WAIT_MS = CV_PARSE_TIMEOUT_MS + 5_000;
const cvPath = (userId: string, cvId: string) => userId + "/" + cvId + ".pdf";
const sampleCvPath = (userId: string) => userId + "/sample.pdf";

export async function sampleCandidateCv(tx: Transaction, userId: string) {
  // Serialize creation so Practice and Company previews can reuse one sample.
  await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .for("update");
  const storagePath = sampleCvPath(userId);
  const [sample] = await tx
    .select({ cvId: candidateCvs.id, parsed: candidateCvs.parsed })
    .from(candidateCvs)
    .where(
      and(
        eq(candidateCvs.userId, userId),
        eq(candidateCvs.storagePath, storagePath),
        eq(candidateCvs.parseStatus, "parsed"),
      ),
    )
    .limit(1);
  if (sample?.parsed) return { cvId: sample.cvId, parsed: sample.parsed };
  const [created] = await tx
    .insert(candidateCvs)
    .values({
      userId,
      storagePath,
      fileName: "Sample candidate",
      parseStatus: "parsed",
      parsed: sampleParsedCv,
    })
    .returning({ cvId: candidateCvs.id });
  return { cvId: created.cvId, parsed: sampleParsedCv };
}

export const useSampleCv = route(async () => {
  const user = await requireUser();
  const database = await db();
  const sample = await database.transaction((tx) =>
    sampleCandidateCv(tx, user.id),
  );
  return json(sample);
});

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
    cv.storagePath === sampleCvPath(cv.userId) && cv.parseStatus === "parsed";
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
  const pdf = await readObject("cvs", path).catch((error: unknown) => {
    console.error("SkillMirror CV download failed", {
      type: error instanceof Error ? error.name : typeof error,
    });
    fail("INTERNAL", "We couldn't load your CV file. Please try again.");
  });
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
  // Only one request reads a CV at a time. A second click or retry waits for
  // the running read instead of sending the PDF to the model again.
  const [claimed] = await database
    .update(candidateCvs)
    .set({ parseStatus: "parsing", error: null })
    .where(and(where, ne(candidateCvs.parseStatus, "parsing")))
    .returning({ id: candidateCvs.id });
  if (!claimed) return json(await awaitRunningParse(database, cv.id));
  try {
    const parsed =
      publicEnv.aiMode === "mock"
        ? structuredClone(sampleParsedCv)
        : {
            ...(await geminiJSON(p1({}), parsedCvSchema, {
              inline: attachment("document", "application/pdf", pdf),
              timeout: CV_PARSE_TIMEOUT_MS,
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
async function awaitRunningParse(
  database: Awaited<ReturnType<typeof db>>,
  cvId: string,
) {
  const where = eq(candidateCvs.id, cvId);
  const until = Date.now() + CV_PARSE_WAIT_MS;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const [row] = await database
      .select({
        parseStatus: candidateCvs.parseStatus,
        parsed: candidateCvs.parsed,
        error: candidateCvs.error,
      })
      .from(candidateCvs)
      .where(where);
    if (!row) fail("NOT_FOUND", "CV not found.");
    if (row.parseStatus === "parsed" && row.parsed)
      return { cvId, parsed: row.parsed };
    if (row.parseStatus !== "parsing")
      fail(
        "AI_UNAVAILABLE",
        row.error ?? "We couldn't read your CV. Please try again.",
      );
  }
  // A read that outlived its own time limit was cut off. Free the row so the
  // next attempt can start a fresh read.
  await database
    .update(candidateCvs)
    .set({
      parseStatus: "failed",
      error: "We couldn't read your CV. Please try again.",
    })
    .where(and(where, eq(candidateCvs.parseStatus, "parsing")));
  fail("AI_UNAVAILABLE", "We couldn't read your CV. Please try again.");
}
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
