import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { interviewSessions } from "@/lib/db/schema";
import { interrupted, makeSessionPublic } from "@/lib/api/session";
import { authPath } from "@/lib/auth/navigation";

export type InterviewPage = "prepare" | "setup" | "live" | "processing" | "report" | "done";
export async function openSession(id: string, page: InterviewPage) {
  const user = await getUser();
  if (!user) redirect(authPath("/login", "/interview/" + id + "/" + page));
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) notFound();
  const [session] = await (await db()).select().from(interviewSessions).where(eq(interviewSessions.id, id));
  if (!session || session.userId !== user.id) notFound();
  if (interrupted(session) || ["superseded","discarded"].includes(session.status)) redirect("/dashboard");
  if (session.status === "draft" && !session.cvId && session.config.cvRequired) redirect("/interview/new?session=" + id);
  const path = (step: InterviewPage) => "/interview/" + id + "/" + step;
  const allowed: Record<InterviewPage, string[]> = {
    prepare: ["draft", "planning", "ready"], setup: ["ready"], live: ["ready", "in_progress"],
    processing: ["in_progress", "ended", "processing", "failed"], report: ["completed"], done: ["ended", "processing", "failed", "completed"],
  };
  if (session.kind === "company" && page === "report") redirect(path("done"));
  if (session.kind !== "company" && page === "done") redirect(path("report"));
  if (!allowed[page].includes(session.status)) {
    if (session.status === "draft" || session.status === "planning") redirect(path("prepare"));
    if (session.status === "ready") redirect(path("setup"));
    if (session.status === "in_progress") redirect(path("live"));
    if (session.status === "completed") redirect(path(session.kind === "company" ? "done" : "report"));
    redirect(path("processing"));
  }
  if (page === "live" && !session.calibration) redirect(path("setup"));
  return makeSessionPublic(session);
}
