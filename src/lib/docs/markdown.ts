import type { DocsDocument, LiveDocsTelemetry } from "@/types/docs";
import { EXPOSED_API_ENDPOINTS, EXTERNAL_APIS } from "./api-catalog";

export function exportDocsMarkdown(
  doc: DocsDocument,
  live: LiveDocsTelemetry,
  meta: { publishedVersion: number; publishedAt: string },
): string {
  const lines: string[] = [];
  lines.push(`# SkillMirror — Live Documentation & Pitch Deck`);
  lines.push("");
  lines.push(`> ${doc.tagline}`);
  lines.push("");
  lines.push(doc.heroSubtitle);
  lines.push("");
  lines.push(
    `- **Version:** v${meta.publishedVersion} (Published ${new Date(meta.publishedAt).toISOString()})`,
  );
  lines.push(`- **Live Snapshot Synced:** ${live.syncedAt}`);
  lines.push(`- **Runtime AI Mode:** \`${live.environment.aiMode}\``);
  lines.push(
    `- **Live System Metrics:** ${live.counts.users} users · ${live.counts.organizations} organizations · ${live.counts.sessions} sessions (${live.counts.completedSessions} completed) · ${live.counts.completedReports} reports · ${live.counts.events} tracked multimodal events · ${live.apiEndpointsCount} API routes`,
  );
  lines.push("");

  for (const section of doc.sections) {
    if (!section.enabled) continue;
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${section.code}. ${section.title}`);
    lines.push("");
    if (section.summary) {
      lines.push(`*${section.summary}*`);
      lines.push("");
    }
    if (section.id === "pitch") {
      for (const item of doc.pitchItems) {
        lines.push(`### ${item.eyebrow}: ${item.title}`);
        lines.push(`**${item.summary}**`);
        lines.push("");
        lines.push(item.body);
        lines.push("");
      }
      lines.push(`### Team — ${doc.teamName}`);
      for (const member of doc.teamMembers) {
        lines.push(`- **${member.name}** — ${member.role} (${member.email})`);
      }
      lines.push("");
    } else if (section.id === "features") {
      lines.push(`| Feature | Category | Status | Details |`);
      lines.push(`| :--- | :--- | :--- | :--- |`);
      for (const f of doc.features) {
        lines.push(
          `| ${f.name} | ${f.category} | ${f.status.toUpperCase()} | ${f.description} |`,
        );
      }
      lines.push("");
    } else if (section.id === "api") {
      lines.push(`### External APIs Used`);
      for (const ext of EXTERNAL_APIS) {
        lines.push(
          `- **${ext.provider}** (${ext.protocol}): ${ext.purpose} — *Auth: ${ext.auth}*`,
        );
      }
      lines.push("");
      lines.push(`### Exposed SkillMirror Endpoints (${EXPOSED_API_ENDPOINTS.length})`);
      lines.push(`| Method | Path | Auth | Summary |`);
      lines.push(`| :--- | :--- | :--- | :--- |`);
      for (const ep of EXPOSED_API_ENDPOINTS) {
        lines.push(
          `| \`${ep.method}\` | \`${ep.path}\` | ${ep.auth} | ${ep.summary} |`,
        );
      }
      lines.push("");
    } else if (section.id === "roadmap") {
      for (const phase of doc.roadmap) {
        lines.push(`### ${phase.label} (${phase.timeframe})`);
        for (const item of phase.items) lines.push(`- ${item}`);
        lines.push("");
      }
    } else if (section.id === "team") {
      lines.push(`### ${doc.teamName}`);
      for (const member of doc.teamMembers) {
        lines.push(
          `- **${member.name}** — ${member.role} · ${member.email}${member.bio ? ` — ${member.bio}` : ""}`,
        );
      }
      lines.push("");
    } else if (section.id === "changelog") {
      for (const entry of doc.changelog) {
        lines.push(`### ${entry.version} (${entry.date}) — ${entry.title}`);
        for (const h of entry.highlights) lines.push(`- ${h}`);
        lines.push("");
      }
    }

    if (section.diagramSource) {
      lines.push("```mermaid");
      lines.push(section.diagramSource);
      lines.push("```");
      lines.push("");
    }

    if (section.bodyMarkdown.trim()) {
      lines.push(section.bodyMarkdown.trim());
      lines.push("");
    }
  }

  return lines.join("\n");
}
