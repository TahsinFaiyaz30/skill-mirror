import { redirect } from "next/navigation";
import { Onboarding } from "@/components/common/onboarding";
import { Shell } from "@/components/shell/shell";
import { getProfile, getUser } from "@/lib/auth/guards";
import { authPath } from "@/lib/auth/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ intent?: string; next?: string }> }) {
  const { intent, next } = await searchParams;
  const user = await getUser();
  if (!user) redirect(authPath("/login", "/onboarding", intent));
  if ((await getProfile(user.id))?.onboardedAt) redirect(authPath("/auth/continue", next));
  return <Shell><Onboarding initialIntent={intent} next={next} /></Shell>;
}
