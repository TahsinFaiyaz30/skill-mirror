import { notFound, redirect } from "next/navigation";
import { AdminProviders } from "@/components/common/admin-providers";
import { AdminShell } from "@/components/shell/admin-shell";
import { isAdminEmail } from "@/lib/auth/admin";
import { getUser } from "@/lib/auth/guards";
import { authPath } from "@/lib/auth/navigation";

export const metadata = { title: "Admin" };

export default async function Page() {
  const user = await getUser();
  if (!user) redirect(authPath("/login", "/admin"));
  if (!isAdminEmail(user.email)) notFound();
  return (
    <AdminShell email={user.email ?? ""}>
      <AdminProviders />
    </AdminShell>
  );
}
