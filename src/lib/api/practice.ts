import { and, asc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { getProfile, requireSessionAccess, requireUser } from "@/lib/auth/guards";
import { localMock, publicEnv, serverEnv } from "@/lib/config/env";
import { db, mockDir } from "@/lib/db";
import { certificates, competencyResults, interviewSessions, reports, softSkillResults } from "@/lib/db/schema";
import { signCertificate, verifyCertificate } from "@/lib/cert/sign";
import type { CertificatePayload } from "@/types/report";
import { fail, json, route, type Params } from "@/lib/utils/http";
import { owner } from "./session";

async function signingSecret() {
  const configured = serverEnv().CERT_SIGNING_SECRET;
  if (configured) return configured;
  if (!localMock) fail("INTERNAL","Certificate signing is not configured.");
  const root = mockDir();
  await mkdir(root,{ recursive:true });
  const file = join(root,"certificate-key");
  try { await writeFile(file,randomBytes(32).toString("hex"),{ flag:"wx",mode:0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return readFile(file,"utf8");
}
export const createCertificate = route(async (_request, context: Params<"id">) => {
  const { session,database } = await requireSessionAccess((await context.params).id,owner);
  if (session.kind !== "practice") fail("NOT_FOUND","Practice interview not found.");
  const [report] = await database.select().from(reports).where(eq(reports.sessionId,session.id));
  if (report?.status !== "completed" || !report.data?.eligibility.certificate) fail("CONFLICT","This interview is not eligible for a certificate.");
  let [existing] = await database.select().from(certificates).where(eq(certificates.sessionId,session.id));
  if (!existing) {
    const { headline,softSkills,technical } = report.data;
    const slug = nanoid(12);
    const payload: CertificatePayload = {
      certId:slug,name:(await getProfile(session.userId))?.fullName ?? "",role:session.roleTitle+" ("+session.seniority+")",company:session.company,
      issuedAt:new Date().toISOString(),overallScore:headline.overallScore,verdict:headline.verdict ?? "",maturityLevel:softSkills.maturityLevel,
      maturityLabel:softSkills.maturityLabel,competencies:technical.competencies.filter((item) => !item.notAssessed).map((item) => ({ name:item.subLabel ?? item.displayName,ceiling:item.ceiling,expected:technical.expectedLevel })),
      integrity:headline.integrityBadge === "clean" ? "clean" : "minor",sessionId:session.id,
    };
    [existing] = await database.insert(certificates).values({ slug,sessionId:session.id,userId:session.userId,payload,signature:signCertificate(payload,await signingSecret()) })
      .onConflictDoNothing({ target:certificates.sessionId }).returning();
    if (!existing) [existing] = await database.select().from(certificates).where(eq(certificates.sessionId,session.id));
  }
  return json({ slug:existing.slug,url:new URL("/verify/"+existing.slug,publicEnv.appUrl).href });
});
export async function certificateBySlug(slug: string) {
  if (!/^[\w-]{12}$/.test(slug)) return null;
  const [row] = await (await db()).select().from(certificates).where(eq(certificates.slug,slug));
  if (!row) return null;
  return { valid:verifyCertificate(row.payload,row.signature,await signingSecret()),revoked:row.revoked,payload:row.payload };
}
export const verifyRoute = route(async (_request, context: Params<"slug">) => {
  const certificate = await certificateBySlug((await context.params).slug);
  if (!certificate) fail("NOT_FOUND","Certificate not found.");
  return json(certificate);
});
function group<T>(items: T[], key: (item:T)=>string) {
  const group: Record<string,T[]> = {};
  for (const item of items) (group[key(item)] ??= []).push(item);
  return group;
}
function gain<T>(items: T[], measure:(item:T)=>number|null) {
  const numbers = items.map(measure).filter((value): value is number => value !== null);
  const first=numbers[0] ?? null, latest=numbers.at(-1) ?? null;
  return { first,latest,delta:first === null || latest === null || numbers.length < 2 ? null : latest-first };
}
export const progressRoute = route(async () => {
  const user = await requireUser(), database = await db();
  const rows = await database.select({ sessionId:interviewSessions.id,date:reports.completedAt,overallScore:reports.overallScore,
    roleTitle:interviewSessions.roleTitle,company:interviewSessions.company })
    .from(interviewSessions).innerJoin(reports,eq(reports.sessionId,interviewSessions.id))
    .where(and(eq(interviewSessions.userId,user.id),eq(interviewSessions.kind,"practice"),eq(reports.status,"completed"))).orderBy(asc(reports.completedAt));
  const ids = rows.map((row) => row.sessionId);
  const [technical,soft] = ids.length ? await Promise.all([
    database.select().from(competencyResults).where(inArray(competencyResults.sessionId,ids)).orderBy(asc(competencyResults.createdAt)),
    database.select().from(softSkillResults).where(inArray(softSkillResults.sessionId,ids)).orderBy(asc(softSkillResults.createdAt)),
  ]) : [[],[]];
  const dates = new Map(rows.map((row) => [row.sessionId,row.date]));
  const competencies = group(technical.filter((row) => row.ceiling !== null), (row) => row.competencyKey);
  const softSkills = group(soft,(row)=>row.dimension);
  const mapObject = <T,R>(obj:Record<string,T[]>, transform:(items:T[])=>R) => Object.fromEntries(Object.entries(obj).map(([key,items])=>[key,transform(items)]));
  return json({ sessions:rows,competencies:mapObject(competencies,(items)=>items.map((row)=>({ date:dates.get(row.sessionId),ceiling:row.ceiling,theta:row.theta,score:row.score,subLabel:row.subLabel }))),
    softSkills:mapObject(softSkills,(items)=>items.map((row)=>({ date:dates.get(row.sessionId),score:row.score,level:row.level }))),
    gains:{ overall:gain(rows,(row)=>row.overallScore),competencies:mapObject(competencies,(items)=>gain(items,(row)=>row.ceiling)),
      softSkills:mapObject(softSkills,(items)=>gain(items,(row)=>row.score)) },
  });
});
