import { notFound, redirect } from "next/navigation";
import { AdminDocsEditor } from "@/components/docs/admin-docs-editor";
import { AdminShell } from "@/components/shell/admin-shell";
import { isAdminEmail } from "@/lib/auth/admin";
import { getUser } from "@/lib/auth/guards";
import { authPath } from "@/lib/auth/navigation";
import { getLiveDocsTelemetry } from "@/lib/docs/live-data";
import {
  getDocsAccessStatus,
  listDocsRevisions,
} from "@/lib/docs/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Live /docs" };

export default async function AdminDocsPage() {
  const user = await getUser();
  if (!user) redirect(authPath("/login", "/admin/docs"));
  if (!isAdminEmail(user.email)) notFound();

  const [{ row, settings, access }, revisions, live] = await Promise.all([
    getDocsAccessStatus(),
    listDocsRevisions(),
    getLiveDocsTelemetry(true),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <AdminDocsEditor
        initial={{
          settings,
          access,
          publishedVersion: row.publishedVersion,
          publishedAt: row.publishedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          draft: row.draft,
          published: row.published,
          revisions,
          live,
        }}
      />
    </AdminShell>
  );
}
