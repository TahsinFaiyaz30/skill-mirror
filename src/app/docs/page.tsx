import type { Metadata } from "next";
import { DocsUnavailable } from "@/components/docs/docs-unavailable";
import { DocsViewer } from "@/components/docs/docs-viewer";
import { isAdminEmail } from "@/lib/auth/admin";
import { getUser } from "@/lib/auth/guards";
import { getLiveDocsTelemetry } from "@/lib/docs/live-data";
import { getDocsAccessStatus } from "@/lib/docs/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Docs & Pitch Deck",
  description:
    "SkillMirror live YC-style pitch deck, architecture whitepaper, API reference, and real-time system telemetry.",
};

export default async function DocsPage() {
  const [{ row, access }, user] = await Promise.all([
    getDocsAccessStatus(),
    getUser(),
  ]);
  const isAdmin = isAdminEmail(user?.email);

  if (!access.allowed && !isAdmin) {
    return <DocsUnavailable access={access} />;
  }

  const live = await getLiveDocsTelemetry();

  return (
    <DocsViewer
      authenticated={Boolean(user)}
      initial={{
        access,
        isAdmin,
        publishedVersion: row.publishedVersion,
        publishedAt: row.publishedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        document: row.published,
        live,
      }}
    />
  );
}
