import { parseKeyList } from "@/lib/ai/pool";
import { requireUser } from "@/lib/auth/guards";
import { localMock, serverEnv } from "@/lib/config/env";
import { fail } from "@/lib/utils/http";

export function adminEmails(): string[] {
  return parseKeyList(serverEnv().ADMIN_EMAILS).map((email) =>
    email.toLowerCase(),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const allowed = adminEmails();
  if (allowed.length === 0) return localMock;
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    fail("FORBIDDEN", "Admin access required.");
  }
  return user;
}
