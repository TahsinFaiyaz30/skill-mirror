import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { organizations, orgMembers, profiles } from "@/lib/db/schema";
import { body, fail, json, route } from "@/lib/utils/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("practice") }),
  z.object({ intent: z.literal("hiring"), org: z.object({ name: z.string().trim().min(2).max(80), website: z.url({ protocol: /^https?$/ }).optional() }) }),
]);
export const POST = route(async (request) => {
  const user = await requireUser();
  const data = await body(request, input);
  const database = await db();
  return database.transaction(async (tx) => {
    await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, user.id)).for("update");
    let orgId: string | undefined;
    if (data.intent === "hiring") {
      const [member] = await tx.select().from(orgMembers).where(eq(orgMembers.userId, user.id));
      if (member) fail("BAD_REQUEST", "You already belong to an organization.");
      const slug = (data.org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team") + "-" + nanoid(4).toLowerCase();
      const [org] = await tx.insert(organizations).values({ ...data.org, slug, createdBy: user.id }).returning();
      orgId = org.id;
      await tx.insert(orgMembers).values({ orgId, userId: user.id, role: "owner" });
    }
    await tx.update(profiles).set({ intent: data.intent, onboardedAt: new Date() }).where(eq(profiles.id, user.id));
    return json({ ok: true, orgId });
  });
});
