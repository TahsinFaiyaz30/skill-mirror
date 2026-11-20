import { redirect } from "next/navigation";
import { getOrg, getProfile, getUser } from "@/lib/auth/guards";
import { AppNav } from "./app-nav";
import Footer01 from "@/components/ui/footer-01";
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
  const homeHref =
    profile?.intent === "hiring" && membership ? "/hiring" : "/dashboard";
  return (
    <div className="app-shell">
      <AppNav
        name={profile?.fullName ?? ""}
        email={user.email ?? ""}
        homeHref={homeHref}
        org={
          membership && {
            name: membership.org.name,
            logoUrl: publicLogoURL(membership.org.logoPath),
          }
        }
        company={company}
      />
      <main className="app-main">
        <div className="container page">{children}</div>
      </main>
      <Footer01 authenticated homeHref={homeHref} hasOrg={Boolean(membership)} />
    </div>
  );
}
