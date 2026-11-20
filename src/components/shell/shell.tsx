import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";
import { getOrg, getProfile, getUser } from "@/lib/auth/guards";
import { AppNav } from "./app-nav";
import { publicLogoURL } from "@/lib/supabase/storage";
import type { CompanyBrand } from "@/types/interview";
export async function Shell({
  children,
  company,
}: {
  children: React.ReactNode;
  company?: CompanyBrand | null;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const [profile, membership] = await Promise.all([
    getProfile(user.id),
    getOrg(user.id),
  ]);
  const isAdmin = isAdminEmail(user.email);
  return (
    <div className="app-shell">
      <AppNav
        name={profile?.fullName ?? ""}
        email={user.email ?? ""}
        org={
          membership && {
            name: membership.org.name,
            logoUrl: publicLogoURL(membership.org.logoPath),
          }
        }
        company={company}
        isAdmin={isAdmin}
      />
      <main className="app-main">
        <div className="container page">{children}</div>
      </main>
    </div>
  );
}
