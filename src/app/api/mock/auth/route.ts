import { z } from "zod";
import { localMock } from "@/lib/config/env";
import { mockChangePassword, mockSignIn, mockSignOut } from "@/lib/auth/mock";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { body, fail, ok, route } from "@/lib/utils/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const password = z
  .string()
  .min(8)
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*\d)/i, "Use at least one letter and one number.");
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email: z.email(),
    password: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("signup"),
    email: z.email(),
    password,
    fullName: z.string().trim().min(1).max(120),
  }),
  z.object({ action: z.literal("signout") }),
  z.object({ action: z.literal("password"), password }),
  z.object({
    action: z.literal("profile"),
    fullName: z.string().trim().min(1).max(120),
  }),
]);
export const POST = route(async (request) => {
  if (!localMock) fail("NOT_FOUND", "Not found.");
  const input = await body(request, schema);
  if (input.action === "signup")
    await mockSignIn(input.email, input.password, input.fullName);
  if (input.action === "login") await mockSignIn(input.email, input.password);
  if (input.action === "signout") await mockSignOut();
  if (input.action === "password")
    await mockChangePassword((await requireUser()).id, input.password);
  if (input.action === "profile")
    await (
      await db()
    )
      .update(profiles)
      .set({ fullName: input.fullName })
      .where(eq(profiles.id, (await requireUser()).id));
  return ok();
});
