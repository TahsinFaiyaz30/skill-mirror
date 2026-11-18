import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { interviewSessions } from "@/lib/db/schema";
import { makeSessionPublic } from "@/lib/api/session";
import { Shell } from "@/components/shell/shell";
import { NewInterview } from "@/components/interview/new-interview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: id } = await searchParams;
  if (!id)
    return (
      <Shell>
        <NewInterview />
      </Shell>
    );
  const user = await getUser();
  if (!user) redirect("/login");
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) notFound();
  const [session] = await (
    await db()
  )
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.id, id));
  if (!session || session.kind !== "company" || session.userId !== user.id)
    notFound();
  if (session.status !== "draft") redirect("/interview/" + id + "/prepare");
  return (
    <Shell company={session.config.company}>
      <NewInterview existing={makeSessionPublic(session)} />
    </Shell>
  );
}
