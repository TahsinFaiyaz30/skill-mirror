import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOpening, requireOrgMember } from "@/lib/auth/guards";
import { db, type Transaction } from "@/lib/db";
import {
  candidateCvs,
  interviewSessions,
  invitations,
  openingQuestions,
  openings,
  reports,
} from "@/lib/db/schema";
import { companySessionInput, questionsFor } from "@/lib/hiring/openingData";
import {
  buildSessionConfig,
  defaultOpeningConfig,
  validateOpening,
} from "@/lib/config/sessionConfig";
import { serverEnv } from "@/lib/config/env";
import {
  mergeOpening,
  openingBasics,
  partialOpening,
  questionInput,
} from "@/lib/hiring/validation";
import { sampleParsedCv } from "@/lib/ai/mock/sampleParsedCv";
import { removePrefix } from "@/lib/supabase/storage";
import {
  body,
  fail,
  json,
  ok,
  optionalBody,
  route,
  type Params,
} from "@/lib/utils/http";
import { getParsedCv } from "./session";

const key = (id: string) => eq(openings.id, id);
async function latest(tx: Transaction, id: string) {
  const [row] = await tx.select().from(openings).where(key(id)).for("update");
  if (!row) fail("NOT_FOUND", "Opening not found.");
  return row;
}
export const createOpening = route(async (request) => {
  const { user, org } = await requireOrgMember();
  const input = await body(request, openingBasics);
  const [result] = await (
    await db()
  )
    .insert(openings)
    .values({
      ...input,
      orgId: org.id,
      createdBy: user.id,
      config: defaultOpeningConfig,
    })
    .returning({ id: openings.id });
  return json({ openingId: result.id }, 201);
});
export const listOpenings = route(async () => {
  const { org } = await requireOrgMember(),
    database = await db();
  const rows = await database
    .select()
    .from(openings)
    .where(eq(openings.orgId, org.id))
    .orderBy(desc(openings.updatedAt));
  const all = await database
    .select({
      openingId: invitations.openingId,
      status: invitations.status,
      verdict: reports.verdict,
    })
    .from(invitations)
    .leftJoin(reports, eq(reports.sessionId, invitations.sessionId))
    .where(eq(invitations.orgId, org.id));
  return json({
    items: rows.map(({ id, title, status, locked, updatedAt }) => {
      const items = all.filter((candidate) => candidate.openingId === id);
      return {
        id,
        title,
        status,
        locked,
        updatedAt,
        counts: {
          invited: items.length,
          completed: items.filter((item) => item.status === "completed").length,
          advance: items.filter((item) => item.verdict === "Recommend advance")
            .length,
        },
      };
    }),
  });
});
export const getOpening = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  const questions = await questionsFor(database, opening.id);
  return json({
    opening,
    questions,
    validation: validateOpening(opening, questions),
    featureGithub: serverEnv().FEATURE_GITHUB,
  });
});
export const validateRoute = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  return json(
    validateOpening(opening, await questionsFor(database, opening.id)),
  );
});
export const patchOpening = route(async (request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  const input = await body(
    request,
    openingBasics
      .partial()
      .extend({
        config: partialOpening.optional(),
        status: z.enum(["draft", "active", "closed"]).optional(),
      }),
  );
  const { config: changes, status, ...basics } = input;
  return database.transaction(async (tx) => {
    const row = await latest(tx, opening.id);
    if (
      row.locked &&
      ((changes && Object.keys(changes).length) ||
        Object.keys(basics).some(
          (field) => field !== "title" && field !== "department",
        ))
    )
      fail(
        "LOCKED",
        "This opening is locked. Duplicate it to edit the interview.",
      );
    const config = changes ? mergeOpening(row.config, changes) : row.config;
    const validation = validateOpening(config, await questionsFor(tx, row.id));
    if (status === "active" && validation.errors.length)
      fail("BAD_REQUEST", validation.errors[0].message);
    const [saved] = await tx
      .update(openings)
      .set({
        ...basics,
        config,
        updatedAt: new Date(),
        ...(status && { status }),
        ...(status === "active" &&
          !row.publishedAt && { publishedAt: new Date() }),
      })
      .where(key(row.id))
      .returning();
    if (status === "closed")
      await tx
        .update(invitations)
        .set({ status: "expired" })
        .where(
          and(
            eq(invitations.openingId, row.id),
            eq(invitations.status, "pending"),
          ),
        );
    return json({ opening: saved, validation });
  });
});
export const publishOpening = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  return database.transaction(async (tx) => {
    const row = await latest(tx, opening.id);
    const validation = validateOpening(row, await questionsFor(tx, row.id));
    if (validation.errors.length)
      fail("BAD_REQUEST", validation.errors[0].message);
    await tx
      .update(openings)
      .set({
        status: "active",
        publishedAt: row.publishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(key(row.id));
    return ok();
  });
});
export const closeOpening = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  await database.transaction(async (tx) => {
    await latest(tx, opening.id);
    await tx
      .update(openings)
      .set({ status: "closed", updatedAt: new Date() })
      .where(key(opening.id));
    await tx
      .update(invitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(invitations.openingId, opening.id),
          eq(invitations.status, "pending"),
        ),
      );
  });
  return ok();
});
export const deleteOpening = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  await database.transaction(async (tx) => {
    await latest(tx, opening.id);
    const exists = await tx
      .select({ id: interviewSessions.id })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.openingId, opening.id),
          eq(interviewSessions.kind, "company"),
        ),
      )
      .limit(1);
    if (exists.length) fail("CONFLICT", "Close the opening instead.");
    const previews = await tx
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.openingId, opening.id));
    for (const preview of previews)
      await Promise.all([
        removePrefix("recordings", preview.userId + "/" + preview.id),
        removePrefix("artifacts", preview.userId + "/" + preview.id),
      ]);
    await removePrefix("artifacts", "org/" + opening.orgId + "/" + opening.id);
    await tx.delete(openings).where(key(opening.id));
  });
  return ok();
});
export const duplicateOpening = route(
  async (_request, context: Params<"id">) => {
    const { opening, user, database } = await requireOpening(
      (await context.params).id,
    );
    return database.transaction(async (tx) => {
      const row = await latest(tx, opening.id);
      const [copy] = await tx
        .insert(openings)
        .values({
          orgId: row.orgId,
          title: row.title.slice(0, 113) + " (copy)",
          roleTitle: row.roleTitle,
          roleFamily: row.roleFamily,
          seniority: row.seniority,
          department: row.department,
          jobDescription: row.jobDescription,
          config: row.config,
          createdBy: user.id,
        })
        .returning();
      const questions = await questionsFor(tx, row.id);
      if (questions.length)
        await tx.insert(openingQuestions).values(
          questions.map(({ id: oldId, ...question }) => {
            void oldId;
            return { ...question, id: randomUUID(), openingId: copy.id };
          }),
        );
      return json({ openingId: copy.id });
    });
  },
);
export const previewOpening = route(async (request, context: Params<"id">) => {
  const { opening, org, user, database } = await requireOpening(
    (await context.params).id,
  );
  const input = await optionalBody(
    request,
    z.object({
      cvId: z.uuid().optional(),
      useSampleCandidate: z.boolean().optional(),
    }),
  );
  return database.transaction(async (tx) => {
    const row = await latest(tx, opening.id);
    const questions = await questionsFor(tx, row.id);
    const validation = validateOpening(row, questions);
    if (validation.errors.length)
      fail("BAD_REQUEST", validation.errors[0].message);
    let cvId = input.cvId;
    if (cvId) await getParsedCv(tx, cvId, user.id);
    else if (
      input.useSampleCandidate ||
      buildSessionConfig("preview", {
        config: row.config,
        questions,
        company: { name: org.name, logoUrl: null },
      }).cvRequired
    ) {
      const [sample] = await tx
        .select({ id: candidateCvs.id })
        .from(candidateCvs)
        .where(
          and(
            eq(candidateCvs.userId, user.id),
            eq(candidateCvs.storagePath, user.id + "/sample.pdf"),
          ),
        );
      if (sample) cvId = sample.id;
      else {
        const [created] = await tx
          .insert(candidateCvs)
          .values({
            userId: user.id,
            storagePath: user.id + "/sample.pdf",
            fileName: "Sample candidate",
            parseStatus: "parsed",
            parsed: sampleParsedCv,
          })
          .returning();
        cvId = created.id;
      }
    }
    const [session] = await tx
      .insert(interviewSessions)
      .values(
        companySessionInput("preview", row, org, questions, user.id, cvId),
      )
      .returning();
    return json({ sessionId: session.id });
  });
});
export const replaceQuestions = route(
  async (request, context: Params<"id">) => {
    const { opening, database } = await requireOpening(
      (await context.params).id,
    );
    const { questions } = await body(
      request,
      z.object({ questions: z.array(questionInput).max(200) }),
    );
    return database.transaction(async (tx) => {
      const row = await latest(tx, opening.id);
      if (row.locked)
        fail(
          "LOCKED",
          "This opening is locked. Duplicate it to edit the interview.",
        );
      const old = await questionsFor(tx, row.id);
      const allowed = new Set(old.map((q) => q.id));
      const kept = questions.flatMap((q) => (q.id ? [q.id] : []));
      if (
        kept.some((id) => !allowed.has(id)) ||
        new Set(kept).size !== kept.length
      )
        fail("BAD_REQUEST", "A question ID is invalid for this opening.");
      const removed = old.filter((q) => !kept.includes(q.id)).map((q) => q.id);
      if (removed.length)
        await tx
          .delete(openingQuestions)
          .where(inArray(openingQuestions.id, removed));
      for (const [orderIdx, { id, ...question }] of questions.entries()) {
        const record = {
          ...question,
          orderIdx,
          competencyKey: question.competencyKey ?? null,
          subLabel: question.subLabel ?? null,
          difficulty: question.difficulty ?? null,
        };
        if (id)
          await tx
            .update(openingQuestions)
            .set(record)
            .where(eq(openingQuestions.id, id));
        else
          await tx
            .insert(openingQuestions)
            .values({ ...record, openingId: row.id });
      }
      const saved = await questionsFor(tx, row.id);
      await tx
        .update(openings)
        .set({ updatedAt: new Date() })
        .where(key(row.id));
      return json({
        questions: saved,
        validation: validateOpening(row, saved),
      });
    });
  },
);
