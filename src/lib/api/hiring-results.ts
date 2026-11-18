import { and,asc,desc,eq,inArray } from "drizzle-orm";
import { z } from "zod";
import { requireOpening,requireOrgMember,requireSessionAccess } from "@/lib/auth/guards";
import { db,type Database } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import { candidateCvs,candidateReviews,interviewSessions,invitations,openings,profiles,reports } from "@/lib/db/schema";
import { encodeCSV } from "@/lib/hiring/csv";
import { mean,present } from "@/lib/utils/math";
import { body,fail,json,route,type Params } from "@/lib/utils/http";
import { playbackLinks } from "./reports";

const org=["org_member"] as const;
async function candidateRows(database:Database,openingId:string) {
  return database.select({invite:invitations,session:interviewSessions,profile:profiles,report:reports,review:candidateReviews})
    .from(invitations).leftJoin(interviewSessions,eq(interviewSessions.id,invitations.sessionId)).leftJoin(profiles,eq(profiles.id,invitations.candidateUserId))
    .leftJoin(reports,eq(reports.sessionId,interviewSessions.id)).leftJoin(candidateReviews,eq(candidateReviews.sessionId,interviewSessions.id))
    .where(eq(invitations.openingId,openingId)).orderBy(desc(invitations.createdAt));
}
export const candidates=route(async(_request,context:Params<"id">)=>{
  const {opening,database}=await requireOpening((await context.params).id);
  const [rows,previews,superseded]=await Promise.all([
    candidateRows(database,opening.id),
    database.select({sessionId:interviewSessions.id,name:profiles.fullName,status:interviewSessions.status,createdAt:interviewSessions.createdAt,
      weightedScore:reports.overallScore,recommendation:reports.verdict}).from(interviewSessions).leftJoin(reports,eq(reports.sessionId,interviewSessions.id))
      .innerJoin(profiles,eq(profiles.id,interviewSessions.userId)).where(and(eq(interviewSessions.openingId,opening.id),eq(interviewSessions.kind,"preview"))).orderBy(desc(interviewSessions.createdAt)),
    database.select({sessionId:interviewSessions.id,name:profiles.fullName,status:interviewSessions.status,createdAt:interviewSessions.createdAt,
      weightedScore:reports.overallScore,recommendation:reports.verdict}).from(interviewSessions).leftJoin(reports,eq(reports.sessionId,interviewSessions.id))
      .innerJoin(profiles,eq(profiles.id,interviewSessions.userId)).where(and(eq(interviewSessions.openingId,opening.id),eq(interviewSessions.status,"superseded"))).orderBy(desc(interviewSessions.createdAt)),
  ]);
  const items=rows.map(({invite,session,profile,report,review})=>{
    const data=report?.data, active=data?.technical.competencies.filter((item)=>!item.notAssessed)??[];
    const average=(values:number[])=>values.length?Math.round(mean(values)!*10)/10:null;
    return {invitationId:invite.id,sessionId:session?.id??null,name:profile?.fullName||invite.name,email:invite.email,status:invite.status,
      completedAt:report?.completedAt??null,weightedScore:report?.overallScore??null,recommendation:data?.headline.recommendation??null,
      avgCeiling:average(active.map((x)=>x.ceiling).filter(present)),techTheta:average(active.map((x)=>x.theta)),maturityLevel:data?.softSkills.maturityLevel??null,
      integrityBadge:data?.integrity.badge??null,decision:review?.decision??null,rating:review?.rating??null,candidateDeleted:invite.status==="completed"&&!invite.sessionId,
      reportReady:report?.status==="completed"};
  });
  return json({items,previews,superseded});
});
async function hiringSession(id:string) {
  await requireOrgMember();
  const result=await requireSessionAccess(id,org);
  if(result.session.kind==="practice")fail("NOT_FOUND","Interview not found.");
  return result;
}
export const hiringReport=route(async(_request,context:Params<"id">)=>{
  const {session,database}=await hiringSession((await context.params).id);
  const [[report],[review],[candidate],[opening],[cv]]=await Promise.all([
    database.select().from(reports).where(eq(reports.sessionId,session.id)),
    database.select().from(candidateReviews).where(eq(candidateReviews.sessionId,session.id)),
    database.select({name:profiles.fullName,email:authIdentity.email}).from(profiles).innerJoin(authIdentity,eq(authIdentity.id,profiles.id)).where(eq(profiles.id,session.userId)),
    database.select({id:openings.id,title:openings.title}).from(openings).where(eq(openings.id,session.openingId!)),
    session.cvId?database.select({parsed:candidateCvs.parsed}).from(candidateCvs).where(eq(candidateCvs.id,session.cvId)):[],
  ]);
  if(!report?.data||report.status!=="completed")fail("NOT_FOUND","The report is not available yet.");
  const parsed=cv?.parsed;
  return json({report:report.data,review:review??null,candidate:{name:candidate?.name??"",email:candidate?.email??"",
    cvSummary:parsed?{headline:parsed.headline,seniority:parsed.seniority_estimate,years:parsed.total_years_experience,topSkills:parsed.skills.filter((s)=>!parsed.skills_removed.includes(s.name)).slice(0,8).map((s)=>s.name)}:null},opening});
});
export const hiringPlayback=route(async(_request,context:Params<"id">)=>{
  const {session,database}=await hiringSession((await context.params).id);
  return json(await playbackLinks(database,session));
});
export const updateReview=route(async(request,context:Params<"id">)=>{
  const {session,database,user}=await hiringSession((await context.params).id);
  const input=await body(request,z.object({decision:z.enum(["advance","hold","reject"]).nullable().optional(),rating:z.number().int().min(1).max(5).nullable().optional(),notes:z.string().max(5000).optional()}));
  const [review]=await database.insert(candidateReviews).values({sessionId:session.id,orgId:session.orgId!,reviewerId:user.id,...input})
    .onConflictDoUpdate({target:candidateReviews.sessionId,set:{...input,reviewerId:user.id,updatedAt:new Date()}}).returning();
  return json({review});
});
export const compare=route(async(request)=>{
  const {org}=await requireOrgMember(),database=await db();
  const ids=z.array(z.uuid()).min(2).max(3).parse(new URL(request.url).searchParams.get("ids")?.split(",")??[]);
  if(new Set(ids).size!==ids.length)fail("BAD_REQUEST","Choose two or three different candidates.");
  const rows=await database.select({session:interviewSessions,profile:profiles,report:reports,review:candidateReviews})
    .from(interviewSessions).innerJoin(reports,eq(reports.sessionId,interviewSessions.id)).innerJoin(profiles,eq(profiles.id,interviewSessions.userId))
    .leftJoin(candidateReviews,eq(candidateReviews.sessionId,interviewSessions.id))
    .where(and(inArray(interviewSessions.id,ids),eq(interviewSessions.orgId,org.id),eq(reports.status,"completed"))).orderBy(asc(interviewSessions.createdAt));
  if(rows.length!==ids.length)fail("NOT_FOUND","Candidate interview not found.");
  if(new Set(rows.map(({session})=>session.openingId)).size!==1)fail("BAD_REQUEST","Choose completed interviews from the same opening.");
  return json({items:ids.map((id)=>{
    const row=rows.find(({session})=>session.id===id)!;
    const data=row.report.data!;
    const must=data.companyView?.coverage.filter((item)=>item.mustAsk)??[];
    return {sessionId:id,name:row.profile.fullName,recommendation:data.headline.recommendation,weightedScore:data.headline.overallScore,
      components:data.components,competencies:data.technical.competencies,softSkills:data.softSkills.dimensions,
      coveragePct:must.length?Math.round(must.filter((item)=>item.status==="asked").length*100/must.length):100,
      strengths:data.summaryLists.strengths,gaps:data.summaryLists.growthAreas,decision:row.review?.decision??null};
  })});
});
export const exportCsv=route(async(_request,context:Params<"id">)=>{
  const {opening,database}=await requireOpening((await context.params).id);
  const rows=await candidateRows(database,opening.id);
  const keys=[...new Set(rows.flatMap(({report})=>report?.data?.technical.competencies.map((c)=>c.key)??[]))].sort();
  const header=["name","email","status","completed_at","weighted_score","recommendation","technical","behavioral","cv","soft",
    ...keys.flatMap((key)=>[key+"_ceiling",key+"_theta"]),"integrity","decision","rating","notes"];
  const result=encodeCSV([header,...rows.map(({invite,profile,report,review})=>{
    const data=report?.data;
    return [profile?.fullName||invite.name,invite.email,invite.status,report?.completedAt?.toISOString(),report?.overallScore,data?.headline.recommendation,
      data?.components.technical,data?.components.behavioral,data?.components.cv,data?.components.soft,
      ...keys.flatMap((key)=>{const comp=data?.technical.competencies.find((c)=>c.key===key&&!c.notAssessed);return [comp?.ceiling,comp?.theta];}),
      data?.integrity.badge,review?.decision,review?.rating,review?.notes];
  })]);
  return new Response(result,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="skill-mirror-candidates.csv"',"Cache-Control":"no-store"}});
});
