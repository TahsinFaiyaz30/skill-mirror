import { asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  openingQuestions,
  type OpeningRow,
  type OrgRow,
} from "@/lib/db/schema";
import { buildSessionConfig } from "@/lib/config/sessionConfig";
import { publicEnv, serverEnv } from "@/lib/config/env";
import { publicLogoURL } from "@/lib/supabase/storage";
import type { OpeningQuestion } from "@/types/interview";
export const questionsFor = (
  database: Pick<Database, "select">,
  id: string,
): Promise<OpeningQuestion[]> =>
  database
    .select()
    .from(openingQuestions)
    .where(eq(openingQuestions.openingId, id))
    .orderBy(asc(openingQuestions.orderIdx));
export function companySessionInput(
  kind: "company" | "preview",
  opening: OpeningRow,
  org: OrgRow,
  questions: OpeningQuestion[],
  userId: string,
  cvId?: string | null,
  invitationId?: string,
) {
  const config = buildSessionConfig(kind, {
    config: opening.config,
    questions,
    company: { name: org.name, logoUrl: publicLogoURL(org.logoPath) },
    featureGithub: serverEnv().FEATURE_GITHUB,
  });
  return {
    kind,
    userId,
    orgId: org.id,
    openingId: opening.id,
    invitationId,
    cvId: cvId ?? null,
    company: org.name,
    roleTitle: opening.roleTitle,
    roleFamily: opening.roleFamily,
    seniority: opening.seniority,
    jobDescription: opening.jobDescription,
    lengthMinutes: config.lengthMinutes,
    voiceName: config.ai.voiceName,
    aiMode: publicEnv.aiMode,
    config,
  };
}
