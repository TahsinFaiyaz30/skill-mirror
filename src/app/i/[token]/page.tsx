import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getInvite } from "@/lib/api/invitation";
import { getUser } from "@/lib/auth/guards";
import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { InviteLanding } from "@/components/hiring/invite-landing";
import type { PublicInvite } from "@/types/hiring";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token;
  await headers();
  const [response, user] = await Promise.all([
    getInvite(new Request("http://localhost"), {
      params: Promise.resolve({ token }),
    }),
    getUser(),
  ]);
  if (response.status === 404) notFound();
  const data = (await response.json()) as PublicInvite;
  if (!response.ok) throw new Error("Invitation details unavailable");
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand company={data.company} />
          <ThemeToggle />
        </div>
      </header>
      <main className="container page">
        <InviteLanding data={data} token={token} signedIn={Boolean(user)} />
      </main>
    </>
  );
}
