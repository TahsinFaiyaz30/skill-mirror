import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import {
  interviewSessions,
  invitations,
  openings,
  orgMembers,
  organizations,
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
export const deleteAccount = route(async () => {
  const user = await requireUser(),
    membership = await getOrg(user.id),
    database = await db();
  if (await isLastOwnerWithMembers(user.id))
    fail("CONFLICT", "Transfer ownership or remove members first.");
  await Promise.all(
    (["cvs", "recordings", "artifacts"] as const).map((bucket) =>
      removePrefix(bucket, user.id),
    ),
  );
  await database.transaction(async (tx) => {
    const sessions = await tx
      .select({ id: interviewSessions.id })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.userId, user.id),
          eq(interviewSessions.kind, "company"),
        ),
      );
    if (sessions.length)
      await tx
        .update(invitations)
        .set({ status: "completed", sessionId: null, candidateUserId: null })
        .where(
          inArray(
            invitations.sessionId,
            sessions.map((session) => session.id),
          ),
        );
    if (membership) {
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, membership.org.id))
        .for("update");
      const members = await tx
        .select()
        .from(orgMembers)
        .where(eq(orgMembers.orgId, membership.org.id));
      if (
        members.length > 1 &&
        membership.role === "owner" &&
        !members.some((row) => row.userId !== user.id && row.role === "owner")
      )
        fail("CONFLICT", "Transfer ownership or remove members first.");
      await tx.delete(orgMembers).where(eq(orgMembers.userId, user.id));
    }
    if (localMock)
      await tx.delete(authIdentity).where(eq(authIdentity.id, user.id));
  });
  if (!localMock) {
    const { error } = await adminSupabase().auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
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
