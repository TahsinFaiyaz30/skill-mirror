import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db, type Database } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import {
  interviewSessions,
  invitations,
  openings,
  orgMembers,
  organizations,
  pendingAccountDeletions,
  profiles,
} from "@/lib/db/schema";
import { getOrg, requireUser } from "@/lib/auth/guards";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  listObjects,
  removeObjects,
  removePrefix,
} from "@/lib/supabase/storage";
import { localMock, serverEnv } from "@/lib/config/env";
import { fail, json, ok, route } from "@/lib/utils/http";

export async function isLastOwnerWithMembers(userId: string) {
  const membership = await getOrg(userId);
  if (!membership || membership.role !== "owner") return false;
  const rows = await (
    await db()
  )
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.orgId, membership.org.id));
  return (
    rows.length > 1 &&
    !rows.some((row) => row.userId !== userId && row.role === "owner")
  );
}
async function beginAccountDeletion(database: Database, userId: string) {
  return database.transaction(async (tx) => {
    const [profile] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .for("update");
    const [pending] = await tx
      .select()
      .from(pendingAccountDeletions)
      .where(eq(pendingAccountDeletions.userId, userId));
    if (pending) return pending;
    if (!profile) {
      const [identity] = await tx
        .select({ id: authIdentity.id })
        .from(authIdentity)
        .where(eq(authIdentity.id, userId));
      if (!identity) return null;
    }

    let removedOrg: string | null = null;
    const [membership] = await tx
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(eq(orgMembers.userId, userId));
    if (membership) {
      const { orgId } = membership;
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for("update");
      const members = await tx
        .select()
        .from(orgMembers)
        .where(eq(orgMembers.orgId, orgId));
      const member = members.find((row) => row.userId === userId);
      if (member?.role === "owner") {
        if (
          members.length > 1 &&
          !members.some((row) => row.userId !== userId && row.role === "owner")
        ) {
          fail("CONFLICT", "Transfer ownership or remove members first.");
        }
        if (members.length === 1) {
          await tx
            .update(invitations)
            .set({ status: "revoked" })
            .where(
              and(
                eq(invitations.orgId, orgId),
                inArray(invitations.status, ["pending", "accepted", "started"]),
              ),
            );
          // Candidate sessions own their report snapshots and recordings.
          // Detach them before removing the company and its openings.
          await tx
            .update(interviewSessions)
            .set({
              orgId: null,
              openingId: null,
              invitationId: null,
              organizationRemoved: true,
            })
            .where(
              or(
                eq(interviewSessions.orgId, orgId),
                inArray(
                  interviewSessions.openingId,
                  tx
                    .select({ id: openings.id })
                    .from(openings)
                    .where(eq(openings.orgId, orgId)),
                ),
              ),
            );
          await tx.delete(organizations).where(eq(organizations.id, orgId));
          removedOrg = orgId;
        }
      }
    }

    const ownedCompanySessions = tx
      .select({ id: interviewSessions.id })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.userId, userId),
          eq(interviewSessions.kind, "company"),
        ),
      );
    await tx
      .update(invitations)
      .set({ status: "completed", sessionId: null, candidateUserId: null })
      .where(inArray(invitations.sessionId, ownedCompanySessions));
    await tx.delete(profiles).where(eq(profiles.id, userId));
    const [job] = await tx
      .insert(pendingAccountDeletions)
      .values({ userId, orgId: removedOrg })
      .onConflictDoUpdate({
        target: pendingAccountDeletions.userId,
        set: { userId },
      })
      .returning();
    return job;
  });
}

async function finishAccountDeletion(
  database: Database,
  { userId, orgId }: typeof pendingAccountDeletions.$inferSelect,
) {
  const folders = (["cvs", "recordings", "artifacts"] as const).map((bucket) =>
    removePrefix(bucket, userId),
  );
  if (orgId) {
    folders.push(removePrefix("org-assets", orgId));
    folders.push(removePrefix("artifacts", "org/" + orgId));
  }
  await Promise.all(folders);
  if (localMock) {
    await database.delete(authIdentity).where(eq(authIdentity.id, userId));
  } else {
    const { error } = await adminSupabase().auth.admin.deleteUser(userId);
    if (error && error.code !== "user_not_found" && error.status !== 404)
      throw error;
  }
  await database
    .delete(pendingAccountDeletions)
    .where(eq(pendingAccountDeletions.userId, userId));
}

export const deleteAccount = route(async () => {
  const user = await requireUser();
  const database = await db();
  const job = await beginAccountDeletion(database, user.id);
  if (job) await finishAccountDeletion(database, job);
  return ok();
});

export const retention = route(async (request) => {
  const secret = serverEnv().CRON_SECRET;
  const incoming = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + (secret ?? ""));
  if (
    !secret ||
    expected.length !== incoming.length ||
    !timingSafeEqual(expected, incoming)
  )
    fail("UNAUTHORIZED", "Unauthorized.");
  const database = await db();
  const pending = await database
    .select()
    .from(pendingAccountDeletions)
    .orderBy(asc(pendingAccountDeletions.createdAt))
    .limit(25);
  for (const job of pending) {
    try {
      await finishAccountDeletion(database, job);
    } catch {
      console.warn("SkillMirror could not finish a pending account deletion.");
    }
  }
  const cutoff = new Date(
    Date.now() - serverEnv().RECORDING_RETENTION_DAYS * 86400000,
  );
  const old = await database
    .select()
    .from(interviewSessions)
    .where(
      and(
        lt(interviewSessions.endedAt, cutoff),
        sql`coalesce((${interviewSessions.media}->>'deleted')::boolean,false) = false`,
      ),
    );
  for (const session of old) {
    await removePrefix("recordings", session.userId + "/" + session.id);
    if (session.media.landmarks)
      await removeObjects("artifacts", [session.media.landmarks.path]);
    await database
      .update(interviewSessions)
      .set({ media: { ...session.media, deleted: true } })
      .where(eq(interviewSessions.id, session.id));
  }
  const current = await database
    .select({ id: openings.id, orgId: openings.orgId })
    .from(openings);
  let count = 0;
  for (const opening of current) {
    const docs = await listObjects(
      "artifacts",
      "org/" + opening.orgId + "/" + opening.id + "/docs",
    );
    const expired = docs
      .filter((item) => item.createdAt.getTime() < Date.now() - 86400000)
      .map((item) => item.path);
    await removeObjects("artifacts", expired);
    count += expired.length;
  }
  const revoked = await database
    .update(invitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(invitations.status, "pending"),
        lt(invitations.expiresAt, new Date()),
      ),
    )
    .returning({ id: invitations.id });
  return json({
    ok: true,
    recordingsDeleted: old.length,
    documentsDeleted: count,
    invitationsExpired: revoked.length,
  });
});
