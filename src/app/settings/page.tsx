import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/shell";
import { Settings } from "@/components/common/settings";
import { getProfile,getUser } from "@/lib/auth/guards";
import { isLastOwnerWithMembers } from "@/lib/api/account";
export default async function Page() {
  const user = await getUser();
  if (!user) redirect("/login?next=/settings");
  const [profile,blocked] = await Promise.all([getProfile(user.id),isLastOwnerWithMembers(user.id)]);
  return <Shell><Settings id={user.id} name={profile?.fullName ?? ""} email={user.email ?? ""} provider={user.provider} blocked={blocked} /></Shell>;
}
