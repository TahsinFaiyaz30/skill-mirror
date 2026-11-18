import { asc, eq } from "drizzle-orm";
import { requireSessionAccess } from "@/lib/auth/guards";
import type { Database } from "@/lib/db";
import { events, reports, type SessionRow } from "@/lib/db/schema";
import { signedURL } from "@/lib/supabase/storage";
import { filterForCandidate } from "@/lib/report/filterForCandidate";
import { processInterview } from "@/lib/report/pipeline";
import { fail, json, route, type Params } from "@/lib/utils/http";
import type { Playback } from "@/types/interview";
import { owner } from "./session";

export const processRoute = route(async (_request, context: Params<"id">) => {
  const { session,database } = await requireSessionAccess((await context.params).id,owner);
  if (session.status === "completed") return json({ status:"completed",progress:100,step:"finalize" });
  if (!["ended","processing","failed"].includes(session.status)) fail("CONFLICT","End the interview before processing.");
  const { busy,...result } = await processInterview(database,session);
  return json(result,busy ? 202 : 200);
});
export const statusRoute = route(async (_request, context: Params<"id">) => {
  const { session,database } = await requireSessionAccess((await context.params).id);
  const [report] = await database.select().from(reports).where(eq(reports.sessionId,session.id));
  return json({ sessionStatus:session.status,reportStatus:report?.status ?? null,progress:report?.progress ?? 0,step:report?.step ?? null,error:report?.error ?? session.error });
});
export const reportRoute = route(async (_request, context: Params<"id">) => {
  const { session,database } = await requireSessionAccess((await context.params).id,owner);
  const [report] = await database.select().from(reports).where(eq(reports.sessionId,session.id));
  const company = session.kind === "company";
  const restricted = company && session.config.feedbackVisibility !== "full";
  const available = report?.status === "completed" ? report.data : null;
  return json({ status:report?.status ?? "queued",progress:report?.progress ?? 0,step:report?.step ?? null,error:report?.error ?? null,
    data:company ? filterForCandidate(available,session.config.feedbackVisibility) : available,
    overallScore:restricted ? null : report?.overallScore ?? null,verdict:restricted ? null : report?.verdict ?? null,
  });
});
export async function playbackLinks(database: Database, session: SessionRow, candidate = false): Promise<Playback> {
  const { media } = session;
  if (media.deleted) return { segments:[],landmarksUrl:null,snapshots:{},deleted:true };
  const policy = session.config.evaluation.nonverbalPolicy;
  const rows = await database.select().from(events).where(eq(events.sessionId,session.id)).orderBy(asc(events.startMs));
  const snapshotRows = rows.filter((e) => e.snapshotPath && (!candidate || e.category !== "integrity" && e.category !== "live_vision"));
  const [urls,landmarksUrl,snapshots] = await Promise.all([
    Promise.all((media.videoSegments ?? []).filter((s) => s.uploaded).map(async ({ index,startMs,endMs,path }) => ({
      index,startMs,endMs,url:await signedURL("recordings",path),
    }))),
    media.landmarks && policy !== "off" ? signedURL("artifacts",media.landmarks.path) : null,
    policy === "off" && candidate ? [] : Promise.all(snapshotRows.map(async (event) => [event.id, await signedURL("artifacts",event.snapshotPath!)] as const)),
  ]);
  return { segments:urls.filter((segment): segment is Playback["segments"][number] => !!segment.url).sort((a,b) => a.index-b.index),
    landmarksUrl,snapshots:Object.fromEntries(snapshots.flatMap(([id,url]) => url ? [[id,url] as const] : [])),deleted:false };
}
export const playbackRoute = route(async (_request, context: Params<"id">) => {
  const { session,database } = await requireSessionAccess((await context.params).id,owner);
  if (session.kind === "company" && session.config.feedbackVisibility !== "full") fail("FORBIDDEN","Playback is not available for this interview.");
  return json(await playbackLinks(database,session,session.kind === "company"));
});
