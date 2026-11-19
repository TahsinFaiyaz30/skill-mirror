import { and, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import {
  getOrg,
  requireOpening,
  requireOrgMember,
  requireUser,
} from "@/lib/auth/guards";
import { db, type Database } from "@/lib/db";
import {
  interviewSessions,
  invitations,
  openings,
  orgMembers,
  organizations,
  profiles,
  type InviteRow,
} from "@/lib/db/schema";
import { buildSessionConfig } from "@/lib/config/sessionConfig";
import { serverEnv } from "@/lib/config/env";
import { companySessionInput, questionsFor } from "@/lib/hiring/openingData";
import {
  emailMatches,
  inviteExpires,
  inviteLink,
  maskEmail,
  newInviteToken,
  sendInviteEmail,
} from "@/lib/hiring/invitations";
import { publicLogoURL } from "@/lib/supabase/storage";
import {
  body,
  fail,
  json,
  ok,
  route,
  uuidParam,
  type Params,
} from "@/lib/utils/http";
import { interrupted } from "./session";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const allowedRetake = (session: typeof interviewSessions.$inferSelect | null) =>
  Boolean(
    session &&
    (session.status === "failed" ||
      session.endReason === "connection_lost" ||
      session.endReason === "interrupted" ||
      interrupted(session)),
  );
const publicFields = (invite: InviteRow) => ({
  id: invite.id,
  email: invite.email,
  name: invite.name,
  status: invite.status,
  createdAt: invite.createdAt,
  lastSentAt: invite.lastSentAt,
  expiresAt: invite.expiresAt,
  sessionId: invite.sessionId,
});
async function lookup(database: Pick<Database, "select">, token: string) {
  if (!tokenPattern.test(token)) fail("NOT_FOUND", "Invitation not found.");
  const [row] = await database
    .select({ invite: invitations, opening: openings, org: organizations })
    .from(invitations)
    .innerJoin(openings, eq(openings.id, invitations.openingId))
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.token, token));
  if (!row) fail("NOT_FOUND", "Invitation not found.");
  return row;
}
export const getInvite = route(async (_request, context: Params<"token">) => {
  const database = await db();
  const { invite, opening, org } = await lookup(
    database,
    (await context.params).token,
  );
  let status = invite.status;
  if (status === "pending" && invite.expiresAt.getTime() <= Date.now()) {
    await database
      .update(invitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(invitations.id, invite.id),
          eq(invitations.status, "pending"),
          lt(invitations.expiresAt, new Date()),
        ),
      );
    status = "expired";
  }
  const brand = { name: org.name, logoUrl: publicLogoURL(org.logoPath) };
  const config = buildSessionConfig("company", {
    config: opening.config,
    questions: await questionsFor(database, opening.id),
    company: brand,
  });
  return json({
    status,
    company: brand,
    roleTitle: opening.roleTitle,
    seniority: opening.seniority,
    lengthMinutes: config.lengthMinutes,
    phases: config.phaseOrder,
    expiresAt: invite.expiresAt,
    emailHint: maskEmail(invite.email),
    requireHeadphones: config.requireHeadphones,
  });
});
const inviteMessage: Partial<Record<InviteRow["status"], string>> = {
  started: "You've already started this interview.",
  completed: "You've already completed this interview.",
  revoked: "This invitation is no longer valid.",
  expired: "This invitation has expired.",
};
export const acceptInvite = route(
  async (_request, context: Params<"token">) => {
    const user = await requireUser(),
      database = await db(),
      token = (await context.params).token;
    const found = await lookup(database, token);
    return database.transaction(async (tx) => {
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, found.org.id))
        .for("update");
      const rows = await lookup(tx, token);
      const [opening] = await tx
        .select()
        .from(openings)
        .where(eq(openings.id, rows.opening.id))
        .for("update");
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, rows.invite.id))
        .for("update");
      if (!invite || invite.token !== token)
        fail("NOT_FOUND", "Invitation not found.");
      if (invite.status !== "pending" && invite.status !== "accepted")
        fail(
          "CONFLICT",
          inviteMessage[invite.status] ?? "This invitation cannot be accepted.",
        );
      if (invite.expiresAt.getTime() <= Date.now())
        fail("CONFLICT", "This invitation has expired.");
      if (opening.status !== "active")
        fail("CONFLICT", "This opening is no longer accepting interviews.");
      const [member] = await tx
        .select()
        .from(orgMembers)
        .where(eq(orgMembers.userId, user.id));
      if (member?.orgId === rows.org.id)
        fail("BAD_REQUEST", "Use Preview instead.");
      if (
        opening.config.candidate.requireEmailMatch &&
        !emailMatches(user.email, invite.email)
      )
        fail(
          "FORBIDDEN",
          "This invitation was sent to " +
            maskEmail(invite.email) +
            ". Log in with that email.",
        );
      if (invite.candidateUserId && invite.candidateUserId !== user.id)
        fail("CONFLICT", "This invitation has already been accepted.");
      if (invite.sessionId) {
        const [session] = await tx
          .select()
          .from(interviewSessions)
          .where(eq(interviewSessions.id, invite.sessionId));
        if (session?.userId === user.id)
          return json({
            sessionId: session.id,
            next: session.config.cvRequired ? "cv" : "prepare",
          });
      }
      const [daily] = await tx
        .select({ value: count() })
        .from(interviewSessions)
        .where(
          and(
            eq(interviewSessions.kind, "company"),
            eq(interviewSessions.orgId, rows.org.id),
            gt(interviewSessions.createdAt, new Date(Date.now() - 86400000)),
          ),
        );
      if (daily.value >= serverEnv().MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG)
        fail(
          "RATE_LIMITED",
          "This interview is temporarily unavailable. Please try again tomorrow.",
        );
      const questions = await questionsFor(tx, opening.id);
      const creation = companySessionInput(
        "company",
        opening,
        rows.org,
        questions,
        user.id,
        null,
        invite.id,
      );
      const [session] = await tx
        .insert(interviewSessions)
        .values(creation)
        .returning();
      await tx
        .update(invitations)
        .set({
          status: "accepted",
          candidateUserId: user.id,
          sessionId: session.id,
        })
        .where(eq(invitations.id, invite.id));
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id));
      if (!profile?.onboardedAt)
        await tx
          .update(profiles)
          .set({ intent: "practice", onboardedAt: new Date() })
          .where(eq(profiles.id, user.id));
      return json({
        sessionId: session.id,
        next: session.config.cvRequired ? "cv" : "prepare",
      });
    });
  },
);

export const myInvites = route(async () => {
  const user = await requireUser(),
    database = await db();
  const rows = await database
    .select({
      invite: invitations,
      session: interviewSessions,
      org: organizations,
      roleTitle: openings.roleTitle,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .innerJoin(openings, eq(openings.id, invitations.openingId))
    .leftJoin(
      interviewSessions,
      eq(interviewSessions.id, invitations.sessionId),
    )
    .where(eq(invitations.candidateUserId, user.id))
    .orderBy(desc(invitations.createdAt));
  return json({
    items: rows.map(({ invite, session, org, roleTitle }) => {
      let next: string | null = null;
      if (session && !["expired", "revoked"].includes(invite.status)) {
        next =
          session.status === "draft" &&
          session.config.cvRequired &&
          !session.cvId
            ? "cv"
            : session.status === "draft" || session.status === "planning"
              ? "prepare"
              : session.status === "ready"
                ? "setup"
                : session.status === "in_progress"
                  ? interrupted(session)
                    ? null
                    : "live"
                  : ["ended", "processing", "completed", "failed"].includes(
                        session.status,
                      )
                    ? "done"
                    : null;
      }
      return {
        invitationId: invite.id,
        company: org.name,
        logoUrl: publicLogoURL(org.logoPath),
        roleTitle,
        status: invite.status,
        expiresAt: invite.expiresAt,
        sessionId: invite.sessionId,
        next,
      };
    }),
  });
});
export const createInvites = route(async (request, context: Params<"id">) => {
  const { opening, org, user, database } = await requireOpening(
    (await context.params).id,
  );
  const input = await body(
    request,
    z.object({
      candidates: z
        .array(
          z.object({
            email: z.string().trim().max(254),
            name: z.string().trim().max(120).optional(),
          }),
        )
        .min(1)
        .max(50),
      expiresInDays: z.number().int().min(1).max(30).optional(),
    }),
  );
  const skipped: { email: string; reason: string }[] = [];
  const ready = await database.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .for("update");
    const [current] = await tx
      .select()
      .from(openings)
      .where(eq(openings.id, opening.id))
      .for("update");
    if (!current || current.status !== "active")
      fail("CONFLICT", "Publish the opening before inviting candidates.");
    await tx
      .update(invitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(invitations.openingId, opening.id),
          eq(invitations.status, "pending"),
          lt(invitations.expiresAt, new Date()),
        ),
      );
    const [daily] = await tx
      .select({ value: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, org.id),
          gt(invitations.createdAt, new Date(Date.now() - 86400000)),
        ),
      );
    let created = daily.value;
    const items: InviteRow[] = [];
    for (const person of input.candidates) {
      if (!z.email().safeParse(person.email).success) {
        skipped.push({ email: person.email, reason: "Invalid email address." });
        continue;
      }
      const email = person.email.toLowerCase();
      const [existing] = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.openingId, opening.id),
            eq(invitations.email, email),
            inArray(invitations.status, ["pending", "accepted", "started"]),
          ),
        )
        .limit(1);
      if (existing) {
        skipped.push({ email, reason: "An active invitation already exists." });
        continue;
      }
      if (created >= 200)
        fail(
          "RATE_LIMITED",
          "The organization has reached its daily invitation limit.",
        );
      const [invite] = await tx
        .insert(invitations)
        .values({
          openingId: opening.id,
          orgId: org.id,
          email,
          name: person.name || null,
          token: newInviteToken(),
          expiresAt: inviteExpires(
            input.expiresInDays ?? current.config.candidate.inviteExpiryDays,
          ),
          createdBy: user.id,
        })
        .onConflictDoNothing()
        .returning();
      if (invite) {
        items.push(invite);
        created++;
      } else
        skipped.push({ email, reason: "An active invitation already exists." });
    }
    return items;
  });
  const sent = [];
  for (const invite of ready) {
    const link = inviteLink(invite.token);
    const emailed = await sendInviteEmail({
      email: invite.email,
      company: org.name,
      roleTitle: opening.roleTitle,
      lengthMinutes: opening.config.lengthMinutes,
      expiresAt: invite.expiresAt,
      link,
    });
    if (emailed)
      await database
        .update(invitations)
        .set({ lastSentAt: new Date() })
        .where(eq(invitations.id, invite.id));
    sent.push({ id: invite.id, email: invite.email, link, emailed });
  }
  return json({ invitations: sent, skipped });
});
export const listInvites = route(async (_request, context: Params<"id">) => {
  const { opening, database } = await requireOpening((await context.params).id);
  await database
    .update(invitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(invitations.openingId, opening.id),
        eq(invitations.status, "pending"),
        lt(invitations.expiresAt, new Date()),
      ),
    );
  const rows = await database
    .select({ invite: invitations, session: interviewSessions })
    .from(invitations)
    .leftJoin(
      interviewSessions,
      eq(interviewSessions.id, invitations.sessionId),
    )
    .where(eq(invitations.openingId, opening.id))
    .orderBy(desc(invitations.createdAt));
  return json({
    items: rows.map(({ invite, session }) => ({
      ...publicFields(invite),
      canRetake: allowedRetake(session),
    })),
  });
});
async function ownedInvite(id: string) {
  const { org } = await requireOrgMember(),
    database = await db();
  const [record] = await database
    .select({ invite: invitations, opening: openings })
    .from(invitations)
    .innerJoin(openings, eq(openings.id, invitations.openingId))
    .where(
      and(eq(invitations.id, uuidParam(id)), eq(invitations.orgId, org.id)),
    );
  if (!record) fail("NOT_FOUND", "Invitation not found.");
  return { ...record, org, database };
}
export const resendInvite = route(async (_request, context: Params<"id">) => {
  const { invite, opening, org, database } = await ownedInvite(
    (await context.params).id,
  );
  if (invite.status !== "pending")
    fail("CONFLICT", "Only pending invitations can be resent.");
  if (opening.status !== "active") fail("CONFLICT", "This opening is closed.");
  const expiresAt =
    invite.expiresAt.getTime() <= Date.now()
      ? inviteExpires(opening.config.candidate.inviteExpiryDays)
      : invite.expiresAt;
  const [saved] = await database
    .update(invitations)
    .set({ expiresAt, lastSentAt: new Date() })
    .where(
      and(eq(invitations.id, invite.id), eq(invitations.status, "pending")),
    )
    .returning();
  if (!saved) fail("CONFLICT", "Only pending invitations can be resent.");
  const link = inviteLink(saved.token);
  await sendInviteEmail({
    email: saved.email,
    company: org.name,
    roleTitle: opening.roleTitle,
    lengthMinutes: opening.config.lengthMinutes,
    expiresAt,
    link,
  });
  return json({ ok: true, link });
});
export const revokeInvite = route(async (_request, context: Params<"id">) => {
  const { invite, database } = await ownedInvite((await context.params).id);
  const [changed] = await database
    .update(invitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitations.id, invite.id),
        inArray(invitations.status, ["pending", "accepted"]),
      ),
    )
    .returning();
  if (!changed) fail("CONFLICT", "This invitation can no longer be revoked.");
  return ok();
});
export const retakeInvite = route(async (_request, context: Params<"id">) => {
  const { invite, opening, database } = await ownedInvite(
    (await context.params).id,
  );
  if (opening.status !== "active")
    fail("CONFLICT", "Publish the opening before allowing a retake.");
  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invite.id))
      .for("update");
    const [session] = current.sessionId
      ? await tx
          .select()
          .from(interviewSessions)
          .where(eq(interviewSessions.id, current.sessionId))
      : [];
    if (!session || !allowedRetake(session))
      fail("CONFLICT", "This interview does not qualify for a retake.");
    await tx
      .update(interviewSessions)
      .set({
        status: "superseded",
        endedAt: session.endedAt ?? session.lastActiveAt ?? new Date(),
        endReason: session.endReason ?? "interrupted",
      })
      .where(eq(interviewSessions.id, session.id));
    const token = newInviteToken();
    await tx
      .update(invitations)
      .set({
        token,
        sessionId: null,
        status: "pending",
        expiresAt: inviteExpires(opening.config.candidate.inviteExpiryDays),
        lastSentAt: null,
      })
      .where(eq(invitations.id, current.id));
    return json({ ok: true, link: inviteLink(token) });
  });
});
export const orgForUser = getOrg;
