import { redirect } from "next/navigation";
import { getOrg, getProfile, getUser } from "@/lib/auth/guards";
import { authPath, safeNext } from "@/lib/auth/navigation";
export default async function Continue({ searchParams }: { searchParams: Promise<{ next?: string; intent?: string }> }) {
  const { next, intent } = await searchParams;
  const user = await getUser();
  if (!user) redirect(authPath("/login", next, intent));
  const target = safeNext(next);
  if (target && !target.startsWith("/auth/continue")) redirect(target);
  const profile = await getProfile(user.id);
  if (!profile?.onboardedAt) redirect(authPath("/onboarding", null, intent ?? profile?.intent));
  if (profile.intent === "hiring" && await getOrg(user.id)) redirect("/hiring");
  redirect("/dashboard");
}
