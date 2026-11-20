import { getProfile, getUser } from "@/lib/auth/guards";
import { Shell } from "@/components/shell/shell";
import { Dashboard } from "@/components/interview/dashboard";
export const metadata = { title: "Interview Studio" };
export default async function Page() {
  const user = await getUser();
  const profile = user && (await getProfile(user.id));
  return (
    <Shell>
      <Dashboard firstName={profile?.fullName.trim().split(/\s+/)[0] ?? ""} />
    </Shell>
  );
}
