import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { pgSchema, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import { fail } from "@/lib/utils/http";

export const MOCK_COOKIE = "skill_mirror_mock_session";
const cookieDays = 7;
const mockSessions = pgSchema("auth").table("skill_mirror_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  return salt + ":" + scryptSync(password, salt, 32).toString("hex");
}
function verifyPassword(password: string, encoded: string | null) {
  const salt = encoded?.split(":")[0] ?? "invalid";
  const actual = Buffer.from(passwordHash(password, salt));
  const expected = Buffer.from(encoded ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function mockUser() {
  const raw = (await cookies()).get(MOCK_COOKIE)?.value;
  if (!raw) return null;
  const database = await db();
  const [user] = await database
    .select({ id: authIdentity.id, email: authIdentity.email })
    .from(mockSessions)
    .innerJoin(authIdentity, eq(authIdentity.id, mockSessions.userId))
    .where(
      and(
        eq(mockSessions.tokenHash, digest(raw)),
        gt(mockSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return user ? { ...user, provider: "email" } : null;
}
export async function mockSignOut() {
  const jar = await cookies();
  const raw = jar.get(MOCK_COOKIE)?.value;
  if (raw)
    await (
      await db()
    )
      .delete(mockSessions)
      .where(eq(mockSessions.tokenHash, digest(raw)));
  jar.delete(MOCK_COOKIE);
}
export async function mockSignIn(
  email: string,
  password: string,
  fullName?: string,
) {
  const database = await db();
  const normalized = email.toLowerCase();
  let id: string;
  if (fullName !== undefined) {
    id = randomUUID();
    const created = await database
      .insert(authIdentity)
      .values({
        id,
        email: normalized,
        encryptedPassword: passwordHash(password),
        emailConfirmedAt: new Date(),
        rawUserMetaData: { full_name: fullName },
      })
      .onConflictDoNothing()
      .returning({ id: authIdentity.id });
    if (!created.length)
      fail("CONFLICT", "An account already exists. Log in to continue.");
  } else {
    const [user] = await database
      .select()
      .from(authIdentity)
      .where(eq(sql`lower(${authIdentity.email})`, normalized))
      .limit(1);
    if (!verifyPassword(password, user?.encryptedPassword ?? null) || !user)
      fail("UNAUTHORIZED", "Email or password is incorrect.");
    id = user.id;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + cookieDays * 86_400_000);
  await database
    .insert(mockSessions)
    .values({ tokenHash: digest(token), userId: id, expiresAt });
  (await cookies()).set(MOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function mockChangePassword(userId: string, password: string) {
  await (
    await db()
  )
    .update(authIdentity)
    .set({ encryptedPassword: passwordHash(password) })
    .where(eq(authIdentity.id, userId));
}
