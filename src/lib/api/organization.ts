import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getOrg, requireOrgMember, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import { orgMembers, organizations, profiles } from "@/lib/db/schema";
import { publicLogoURL, uploadURL } from "@/lib/supabase/storage";
import { orgRoleInput, site } from "@/lib/hiring/validation";
import {
  body,
  fail,
  json,
  ok,
  route,
  uuidParam,
  type Params,
} from "@/lib/utils/http";

export const getOrganization = route(async () => {
  const user = await requireUser(),
    membership = await getOrg(user.id);
  if (!membership) return json({ org: null });
  const { org, role } = membership;
  const members = await (
    await db()
  )
    .select({
      userId: orgMembers.userId,
      name: profiles.fullName,
      email: authIdentity.email,
      role: orgMembers.role,
      joinedAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(profiles, eq(profiles.id, orgMembers.userId))
    .innerJoin(authIdentity, eq(authIdentity.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, org.id))
    .orderBy(orgMembers.createdAt);
  return json({
    org: { ...org, logoUrl: publicLogoURL(org.logoPath) },
    role,
    members,
  });
});
export const patchOrganization = route(async (request) => {
  const { org } = await requireOrgMember(true);
  const input = await body(
    request,
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      website: site.nullable().optional(),
      logoPath: z.string().max(150).nullable().optional(),
    }),
  );
  if (
    input.logoPath &&
    !new RegExp("^" + org.id + "/logo\\.(png|jpg|svg)$").test(input.logoPath)
  )
    fail("BAD_REQUEST", "Invalid organization logo path.");
  const database = await db();
  const [result] = Object.keys(input).length
    ? await database
        .update(organizations)
        .set(input)
        .where(eq(organizations.id, org.id))
        .returning()
    : [org];
  return json({ org: { ...result, logoUrl: publicLogoURL(result.logoPath) } });
});
export const logoUpload = route(async (request) => {
  const { org } = await requireOrgMember(true);
  const input = await body(
    request,
    z.object({
      fileName: z
        .string()
        .max(255)
        .regex(/\.(png|jpe?g|svg)$/i),
      sizeBytes: z.number().int().positive().max(1048576),
    }),
  );
  const extension = input.fileName
    .split(".")
    .at(-1)!
    .toLowerCase()
    .replace("jpeg", "jpg");
  return json(
    await uploadURL("org-assets", org.id + "/logo." + extension, true),
  );
});
export const addMember = route(async (request) => {
  const { org } = await requireOrgMember(true);
  const { email, role } = await body(
    request,
    z.object({ email: z.email(), role: orgRoleInput }),
  );
  const database = await db();
  await database.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .for("update");
    const [person] = await tx
      .select({ id: authIdentity.id })
      .from(authIdentity)
      .where(eq(sql`lower(${authIdentity.email})`, email.toLowerCase()))
      .for("update");
    if (!person) fail("BAD_REQUEST", "Ask them to sign up first.");
    const saved = await tx
      .insert(orgMembers)
      .values({ orgId: org.id, userId: person.id, role })
      .onConflictDoNothing()
      .returning();
    if (!saved.length)
      fail("BAD_REQUEST", "This person already belongs to an organization.");
  });
  return ok();
});
export const removeMember = route(
  async (_request, context: Params<"userId">) => {
    const { org } = await requireOrgMember(true);
    const id = uuidParam((await context.params).userId);
    await (
      await db()
    ).transaction(async (tx) => {
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .for("update");
      const rows = await tx
        .select()
        .from(orgMembers)
        .where(eq(orgMembers.orgId, org.id));
      const current = rows.find((member) => member.userId === id);
      if (!current) fail("NOT_FOUND", "Member not found.");
      if (
        current.role === "owner" &&
        !rows.some((member) => member.role === "owner" && member.userId !== id)
      )
        fail("CONFLICT", "The organization needs at least one owner.");
      await tx
        .delete(orgMembers)
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, id)));
    });
    return ok();
  },
);
