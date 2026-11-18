import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getOrg, getUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { openings } from "@/lib/db/schema";
import { questionsFor } from "@/lib/hiring/openingData";
import { validateOpening } from "@/lib/config/sessionConfig";
import { serverEnv } from "@/lib/config/env";
import type { OpeningDetail } from "@/types/hiring";

export async function openingPage(id: string): Promise<OpeningDetail> {
  const user = await getUser();
  if (!user)
    redirect("/login?next=" + encodeURIComponent("/hiring/openings/" + id));
  const membership = await getOrg(user.id);
  if (!membership) redirect("/dashboard");
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) notFound();
  const database = await db();
  const [opening] = await database
    .select()
    .from(openings)
    .where(and(eq(openings.id, id), eq(openings.orgId, membership.org.id)));
  if (!opening) notFound();
  const questions = await questionsFor(database, id);
  return {
    opening: { ...opening, updatedAt: opening.updatedAt.toISOString() },
    questions,
    validation: validateOpening(opening, questions),
    featureGithub: serverEnv().FEATURE_GITHUB,
  };
}
