import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail, requireAdmin } from "@/lib/auth/admin";
import { getUser } from "@/lib/auth/guards";
import {
  docsDocumentSchema,
  docsSettingsPatchSchema,
} from "@/lib/docs/access";
import { getLiveDocsTelemetry } from "@/lib/docs/live-data";
import { exportDocsMarkdown } from "@/lib/docs/markdown";
import {
  ensureDocsConfig,
  getDocsAccessStatus,
  listDocsRevisions,
  publishDocsDraft,
  restoreDocsRevisionToDraft,
  rowToSettings,
  updateDocsDraftAndSettings,
} from "@/lib/docs/store";
import { uploadURL } from "@/lib/supabase/storage";
import type { DocsAdminPayload, DocsPublicPayload } from "@/types/docs";
import { body, fail, json, route } from "@/lib/utils/http";

export const getPublicDocs = route(async (request) => {
  const [{ row, access }, user] = await Promise.all([
    getDocsAccessStatus(),
    getUser(),
  ]);
  const isAdmin = isAdminEmail(user?.email);
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (!access.allowed && !isAdmin) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Documentation is currently not publicly available.",
        },
        access,
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const live = await getLiveDocsTelemetry();

  if (format === "md") {
    const markdown = exportDocsMarkdown(row.published, live, {
      publishedVersion: row.publishedVersion,
      publishedAt: row.publishedAt.toISOString(),
    });
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="skillmirror-docs-v${row.publishedVersion}.md"`,
        "cache-control": "no-store",
      },
    });
  }

  const payload: DocsPublicPayload = {
    access,
    isAdmin,
    publishedVersion: row.publishedVersion,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    document: row.published,
    live,
  };
  return NextResponse.json(payload, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
});

export const getAdminDocs = route(async () => {
  await requireAdmin();
  const [row, revisions, live] = await Promise.all([
    ensureDocsConfig(),
    listDocsRevisions(),
    getLiveDocsTelemetry(true),
  ]);
  const settings = rowToSettings(row);
  const { access } = await getDocsAccessStatus();
  const payload: DocsAdminPayload = {
    settings,
    access,
    publishedVersion: row.publishedVersion,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    draft: row.draft,
    published: row.published,
    revisions,
    live,
  };
  return json(payload);
});

const adminDocsSaveSchema = z
  .object({
    draft: docsDocumentSchema.optional(),
    settings: docsSettingsPatchSchema.optional(),
  })
  .refine((v) => Boolean(v.draft || v.settings), {
    message: "Provide draft content or access settings to update.",
  });

export const saveAdminDocs = route(async (request) => {
  const user = await requireAdmin();
  const input = await body(request, adminDocsSaveSchema);
  const updated = await updateDocsDraftAndSettings({
    userId: user.id,
    draft: input.draft,
    settings: input.settings
      ? {
          visibilityMode: input.settings.visibilityMode,
          scheduleStart: input.settings.scheduleStart,
          scheduleEnd: input.settings.scheduleEnd,
          durationStartedAt: input.settings.durationStartedAt ?? null,
          durationHours: input.settings.durationHours ?? null,
        }
      : undefined,
  });
  const [revisions, live, accessInfo] = await Promise.all([
    listDocsRevisions(),
    getLiveDocsTelemetry(true),
    getDocsAccessStatus(),
  ]);
  const payload: DocsAdminPayload = {
    settings: rowToSettings(updated),
    access: accessInfo.access,
    publishedVersion: updated.publishedVersion,
    publishedAt: updated.publishedAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    draft: updated.draft,
    published: updated.published,
    revisions,
    live,
  };
  return json(payload);
});

const publishOrRestoreSchema = z.union([
  z.object({
    action: z.literal("publish").optional(),
    summary: z.string().trim().max(200).optional(),
    draft: docsDocumentSchema.optional(),
    settings: docsSettingsPatchSchema.optional(),
  }),
  z.object({
    action: z.literal("restore"),
    version: z.number().int().positive(),
  }),
]);

export const publishAdminDocs = route(async (request) => {
  const user = await requireAdmin();
  const input = await body(request, publishOrRestoreSchema);

  let updated;
  if ("action" in input && input.action === "restore") {
    updated = await restoreDocsRevisionToDraft({
      userId: user.id,
      version: input.version,
    });
    if (!updated) fail("NOT_FOUND", "Revision not found.");
  } else {
    updated = await publishDocsDraft({
      userId: user.id,
      summary: input.summary,
      draft: input.draft,
      settings: input.settings
        ? {
            visibilityMode: input.settings.visibilityMode,
            scheduleStart: input.settings.scheduleStart,
            scheduleEnd: input.settings.scheduleEnd,
            durationStartedAt: input.settings.durationStartedAt ?? null,
            durationHours: input.settings.durationHours ?? null,
          }
        : undefined,
    });
  }

  const [revisions, live, accessInfo] = await Promise.all([
    listDocsRevisions(),
    getLiveDocsTelemetry(true),
    getDocsAccessStatus(),
  ]);
  const payload: DocsAdminPayload = {
    settings: rowToSettings(updated),
    access: accessInfo.access,
    publishedVersion: updated.publishedVersion,
    publishedAt: updated.publishedAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    draft: updated.draft,
    published: updated.published,
    revisions,
    live,
  };
  return json(payload);
});

export const teamPhotoUploadUrl = route(async (request) => {
  await requireAdmin();
  const { ext, sizeBytes } = await body(
    request,
    z.object({
      ext: z.enum(["webp", "jpg", "png"]),
      sizeBytes: z.number().int().positive().max(1_048_576),
    }),
  );
  if (sizeBytes > 1_048_576) fail("BAD_REQUEST", "Photo must be under 1 MB.");
  const path = `docs/team/${randomUUID()}.${ext}`;
  return json(await uploadURL("org-assets", path, true));
});
