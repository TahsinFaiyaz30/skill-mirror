import { notFound, redirect } from "next/navigation";
import { AdminProviders } from "@/components/common/admin-providers";
import { Shell } from "@/components/shell/shell";
import { isAdminEmail } from "@/lib/auth/admin";
import { getUser } from "@/lib/auth/guards";
import { authPath } from "@/lib/auth/navigation";

export default async function Page() {
  const user = await getUser();
  if (!user) redirect(authPath("/login", "/admin"));
  if (!isAdminEmail(user.email)) notFound();
  return (
    <Shell>
      <AdminProviders />
    </Shell>
  );
}
