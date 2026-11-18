import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { interviewSessions, openings, orgMembers, organizations, profiles } from "@/lib/db/schema";
import { localMock, publicEnv } from "@/lib/config/env";
import { serverSupabase } from "@/lib/supabase/server";
import { mockUser } from "./mock";
import { fail, uuidParam } from "@/lib/utils/http";

export const getUser = cache(async () => {
  if (localMock) return mockUser();
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  const { data: { user } } = await (await serverSupabase()).auth.getUser();
  return user ? { id: user.id, email: user.email ?? null, provider: String(user.app_metadata.provider ?? "email") } : null;
});
export async function requireUser() {
  const user = await getUser();
  if (!user) fail("UNAUTHORIZED", "Log in to continue.");
  return user;
}
export const getProfile = cache(async (userId: string) => {
  const [profile] = await (await db()).select().from(profiles).where(eq(profiles.id, userId));
  return profile ?? null;
});
export const getOrg = cache(async (userId: string) => {
  const [membership] = await (await db()).select({ org: organizations, role: orgMembers.role }).from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId)).where(eq(orgMembers.userId, userId));
  return membership ?? null;
});
export async function requireOrgMember(owner = false) {
  const user = await requireUser();
  const membership = await getOrg(user.id);
  if (!membership) fail("NOT_FOUND", "Organization not found.");
  if (owner && membership.role !== "owner") fail("FORBIDDEN", "Only organization owners can do that.");
  return { user, ...membership };
}
export async function requireSessionAccess(sessionId: string, roles: readonly ("owner" | "org_member")[] = ["owner", "org_member"]) {
  const user = await requireUser();
  const database = await db();
  const [session] = await database.select().from(interviewSessions).where(eq(interviewSessions.id, uuidParam(sessionId)));
  if (!session) fail("NOT_FOUND", "Interview not found.");
  if (roles.includes("owner") && session.userId === user.id) return { user, session, role: "owner" as const, database };
  if (roles.includes("org_member") && session.orgId && (await getOrg(user.id))?.org.id === session.orgId)
    return { user, session, role: "org_member" as const, database };
  fail("NOT_FOUND", "Interview not found.");
}
export async function requireOpening(id: string) {
  const member = await requireOrgMember();
  const database = await db();
  const [opening] = await database.select().from(openings).where(and(eq(openings.id, uuidParam(id)), eq(openings.orgId, member.org.id)));
  if (!opening) fail("NOT_FOUND", "Opening not found.");
  return { ...member, opening, database };
}
