import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { localMock, serverEnv } from "@/lib/config/env";
import { mockDir } from "@/lib/db";
import { fail } from "@/lib/utils/http";
import type {
  CertificatePayload,
  CompetencyResult,
  ReportData,
} from "@/types/report";
import { canonicalJSON, signCertificate, verifyCertificate } from "./sign";

export async function signingSecret() {
  const configured = serverEnv().CERT_SIGNING_SECRET;
  if (configured) return configured;
  if (!localMock) fail("INTERNAL", "Certificate signing is not configured.");
  const root = mockDir();
  await mkdir(root, { recursive: true });
  const file = join(root, "certificate-key");
  try {
    await writeFile(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFile(file, "utf8");
}

export function assessmentFields(
  report: ReportData,
  competencies: CompetencyResult[],
) {
  const { headline, softSkills, technical } = report;
  return {
    overallScore: headline.overallScore,
    verdict: headline.verdict ?? "",
    maturityLevel: softSkills.maturityLevel,
    maturityLabel: softSkills.maturityLabel,
    competencies: competencies.map((item) => ({
      name: item.subLabel ?? item.displayName,
      ceiling: item.ceiling,
      expected: technical.expectedLevel,
    })),
    integrity: headline.integrityBadge === "clean" ? "clean" : "minor",
  } satisfies Partial<CertificatePayload>;
}

export async function correctedCertificate(
  existing: { payload: CertificatePayload; signature: string },
  report: ReportData,
  competencies: CompetencyResult[],
) {
  if (!report.eligibility.certificate || !competencies.length)
    return { revoked: true };
  const payload = {
    ...existing.payload,
    ...assessmentFields(report, competencies),
  };
  if (canonicalJSON(payload) === canonicalJSON(existing.payload)) return null;
  const secret = await signingSecret();
  if (!verifyCertificate(existing.payload, existing.signature, secret))
    return { revoked: true };
  return { payload, signature: signCertificate(payload, secret) };
}
