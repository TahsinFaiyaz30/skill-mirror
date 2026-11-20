import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  docsConfig,
  docsRevisions,
  type DocsConfigRow,
} from "@/lib/db/schema";
import type {
  DocsAccessSettings,
  DocsDocument,
  DocsRevisionSummary,
} from "@/types/docs";
import {
  DEFAULT_SCHEDULE_END,
  DEFAULT_SCHEDULE_START,
  evaluateDocsAccess,
} from "./access";
import { createDefaultDocsDocument } from "./defaults";
import { invalidateLiveDocsTelemetryCache } from "./live-data";

const PRIMARY_ID = "primary";

export function rowToSettings(row: DocsConfigRow): DocsAccessSettings {
  return {
    visibilityMode: row.visibilityMode,
    scheduleStart: row.scheduleStart.toISOString(),
    scheduleEnd: row.scheduleEnd.toISOString(),
    durationStartedAt: row.durationStartedAt
      ? row.durationStartedAt.toISOString()
      : null,
    durationHours: row.durationHours ?? null,
  };
}

export async function ensureDocsConfig(): Promise<DocsConfigRow> {
  const database = await db();
  const [existing] = await database
    .select()
    .from(docsConfig)
    .where(eq(docsConfig.id, PRIMARY_ID));
  if (existing) return existing;

  const initial = createDefaultDocsDocument();
  const now = new Date();
  await database
    .insert(docsConfig)
    .values({
      id: PRIMARY_ID,
      visibilityMode: "on",
      scheduleStart: new Date(DEFAULT_SCHEDULE_START),
      scheduleEnd: new Date(DEFAULT_SCHEDULE_END),
      durationStartedAt: null,
      durationHours: 72,
      publishedVersion: 1,
      draft: initial,
      published: initial,
      updatedAt: now,
      publishedAt: now,
    })
    .onConflictDoNothing();

  await database
    .insert(docsRevisions)
    .values({
      version: 1,
      summary: "Initial SkillMirror pitch deck & technical documentation",
      snapshot: initial,
      createdAt: now,
    })
    .onConflictDoNothing();

  const [created] = await database
    .select()
    .from(docsConfig)
    .where(eq(docsConfig.id, PRIMARY_ID));
  if (!created) throw new Error("Could not initialize docs configuration.");
  return created;
}

export async function listDocsRevisions(): Promise<DocsRevisionSummary[]> {
  const database = await db();
  const rows = await database
    .select({
      id: docsRevisions.id,
      version: docsRevisions.version,
      summary: docsRevisions.summary,
      createdAt: docsRevisions.createdAt,
    })
    .from(docsRevisions)
    .orderBy(desc(docsRevisions.version))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function updateDocsDraftAndSettings(params: {
  userId: string;
  draft?: DocsDocument;
  settings?: DocsAccessSettings;
}): Promise<DocsConfigRow> {
  await ensureDocsConfig();
  const database = await db();
  const patch: Partial<typeof docsConfig.$inferInsert> = {
    updatedBy: params.userId,
    updatedAt: new Date(),
  };
  if (params.draft) patch.draft = params.draft;
  if (params.settings) {
    patch.visibilityMode = params.settings.visibilityMode;
    patch.scheduleStart = new Date(params.settings.scheduleStart);
    patch.scheduleEnd = new Date(params.settings.scheduleEnd);
    patch.durationStartedAt = params.settings.durationStartedAt
      ? new Date(params.settings.durationStartedAt)
      : null;
    patch.durationHours = params.settings.durationHours ?? null;
  }
  const [updated] = await database
    .update(docsConfig)
    .set(patch)
    .where(eq(docsConfig.id, PRIMARY_ID))
    .returning();
  invalidateLiveDocsTelemetryCache();
  return updated;
}

export async function publishDocsDraft(params: {
  userId: string;
  summary?: string;
  draft?: DocsDocument;
  settings?: DocsAccessSettings;
}): Promise<DocsConfigRow> {
  await ensureDocsConfig();
  const database = await db();
  const updated = await database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(docsConfig)
      .where(eq(docsConfig.id, PRIMARY_ID))
      .for("update");
    if (!current) throw new Error("Docs config missing.");
    const nextDraft = params.draft ?? current.draft;
    const nextVersion = current.publishedVersion + 1;
    const now = new Date();
    const patch: Partial<typeof docsConfig.$inferInsert> = {
      draft: nextDraft,
      published: nextDraft,
      publishedVersion: nextVersion,
      updatedBy: params.userId,
      updatedAt: now,
      publishedAt: now,
    };
    if (params.settings) {
      patch.visibilityMode = params.settings.visibilityMode;
      patch.scheduleStart = new Date(params.settings.scheduleStart);
      patch.scheduleEnd = new Date(params.settings.scheduleEnd);
      patch.durationStartedAt = params.settings.durationStartedAt
        ? new Date(params.settings.durationStartedAt)
        : null;
      patch.durationHours = params.settings.durationHours ?? null;
    }
    const [saved] = await tx
      .update(docsConfig)
      .set(patch)
      .where(eq(docsConfig.id, PRIMARY_ID))
      .returning();
    await tx.insert(docsRevisions).values({
      version: nextVersion,
      summary: params.summary?.trim() || `Published v${nextVersion}`,
      snapshot: nextDraft,
      publishedBy: params.userId,
      createdAt: now,
    });
    return saved;
  });
  invalidateLiveDocsTelemetryCache();
  return updated;
}

export async function restoreDocsRevisionToDraft(params: {
  userId: string;
  version: number;
}): Promise<DocsConfigRow | null> {
  await ensureDocsConfig();
  const database = await db();
  const [revision] = await database
    .select()
    .from(docsRevisions)
    .where(eq(docsRevisions.version, params.version));
  if (!revision) return null;
  const [saved] = await database
    .update(docsConfig)
    .set({
      draft: revision.snapshot,
      updatedBy: params.userId,
      updatedAt: new Date(),
    })
    .where(eq(docsConfig.id, PRIMARY_ID))
    .returning();
  invalidateLiveDocsTelemetryCache();
  return saved;
}

export async function getDocsAccessStatus() {
  const row = await ensureDocsConfig();
  const settings = rowToSettings(row);
  return { row, settings, access: evaluateDocsAccess(settings) };
}
