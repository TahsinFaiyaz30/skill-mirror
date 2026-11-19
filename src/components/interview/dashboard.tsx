"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyInvites } from "./company-invites";
import {
  CircleCheck,
  ClipboardList,
  Gauge,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";
import { readable } from "@/lib/config/taxonomy";
import type { SessionStatus } from "@/types/interview";

export type DashboardSession = {
  sessionId: string;
  roleTitle: string;
  company: string;
  lengthMinutes: number;
  displayStatus: SessionStatus | "interrupted";
  createdAt: string;
  durationMs: number | null;
  overallScore: number | null;
  verdict: string | null;
};
const date = (value: string) => new Date(value).toLocaleDateString();
export function Dashboard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => requestJSON<{ items: DashboardSession[] }>("/api/sessions"),
  });
  const items = sessions.data?.items ?? [];
  const progress = useQuery({
    queryKey: ["progress"],
    queryFn: () =>
      requestJSON<{
        competencies: Record<string, { ceiling: number | null }[]>;
      }>("/api/progress"),
  });
  const ceilings = Object.values(progress.data?.competencies ?? {})
    .flat()
    .map((item) => item.ceiling)
    .filter((value): value is number => value !== null);
  const completed = items.filter((item) => item.displayStatus === "completed");
  const latest = completed[0]?.overallScore,
    first = completed.at(-1)?.overallScore;
  const gain =
    latest != null && first != null && completed.length > 1
      ? latest - first
      : null;
  const action = async (
    item: DashboardSession,
    name: "discard" | "partial",
  ) => {
    try {
      await send("/api/sessions/" + item.sessionId + "/" + name, "POST");
      if (name === "partial")
        router.push("/interview/" + item.sessionId + "/processing");
      else void sessions.refetch();
    } catch (error) {
      showError(error);
    }
  };
  return (
    <div className="stack-lg">
      <div className="page-header">
        <div className="stack-sm">
          <span className="eyebrow">Practice</span>
          <h1>Welcome back{firstName ? ", " + firstName : ""}</h1>
          <p className="muted">
            Start a new mock interview or pick up where you left off.
          </p>
        </div>
        <Link className="button" href="/interview/new">
          <Plus size={18} aria-hidden="true" />
          New interview
        </Link>
      </div>
      <div className="grid-3">
        <div className="card stat">
          <span className="stat-icon">
            <CircleCheck size={19} aria-hidden="true" />
          </span>
          <small>Interviews completed</small>
          <strong className="mono stat-value">{completed.length}</strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <TrendingUp size={19} aria-hidden="true" />
          </span>
          <small>Latest overall score</small>
          <strong className="mono stat-value">
            {latest ?? "—"}{" "}
            {gain !== null && (
              <span className="badge accent">
                {gain >= 0 ? "+" : ""}
                {gain} since first
              </span>
            )}
          </strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <Gauge size={19} aria-hidden="true" />
          </span>
          <small>Best technical ceiling</small>
          <strong className="mono stat-value">
            {ceilings.length ? Math.max(...ceilings) : "—"}
          </strong>
        </div>
      </div>
      <CompanyInvites />
      <section className="stack">
        <h2>Practice sessions</h2>
        {sessions.isPending ? (
          <p role="status">Loading interviews…</p>
        ) : sessions.isError ? (
          <div className="card stack">
            <p role="alert" className="danger">
              {errorMessage(sessions.error)}
            </p>
            <button
              className="button secondary"
              onClick={() => void sessions.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !items.length ? (
          <div className="card stack center empty-state">
            <span className="empty-icon">
              <ClipboardList size={28} aria-hidden="true" />
            </span>
            <h3>No interviews yet</h3>
            <p className="muted">
              Upload your CV, choose a role and take a 10 or 20 minute mock
              interview. Your report appears here when it&apos;s ready.
            </p>
            <div>
              <Link className="button" href="/interview/new">
                New interview
              </Link>
            </div>
          </div>
        ) : (
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Role",
                    "Company",
                    "Date",
                    "Length",
                    "Status",
                    "Score",
                    "Action",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const base = "/interview/" + item.sessionId;
                  const status = item.displayStatus;
                  const link =
                    status === "completed"
                      ? "report"
                      : status === "ready"
                        ? "setup"
                        : status === "in_progress"
                          ? "live"
                          : status === "draft" || status === "planning"
                            ? "prepare"
                            : ["ended", "processing", "failed"].includes(status)
                              ? "processing"
                              : null;
                  const label =
                    status === "completed"
                      ? "View report"
                      : status === "ready"
                        ? "Continue setup"
                        : status === "failed"
                          ? "Retry processing"
                          : "Continue";
                  const badge =
                    status === "completed"
                      ? "accent"
                      : status === "processing"
                        ? "primary"
                        : status === "failed"
                          ? "danger"
                          : status === "interrupted"
                            ? "warning"
                            : "";
                  return (
                    <tr key={item.sessionId}>
                      <td>{item.roleTitle}</td>
                      <td>{item.company}</td>
                      <td>{date(item.createdAt)}</td>
                      <td>{item.lengthMinutes} min</td>
                      <td>
                        <span className={"badge " + badge}>
                          {readable(status)}
                        </span>
                      </td>
                      <td className="mono">{item.overallScore ?? "—"}</td>
                      <td>
                        {link && <Link href={base + "/" + link}>{label}</Link>}
                        {status === "interrupted" && (
                          <div className="cluster">
                            {(item.durationMs ?? 0) >= 300000 && (
                              <button
                                className="button secondary"
                                onClick={() => void action(item, "partial")}
                              >
                                Generate partial report
                              </button>
                            )}
                            <button
                              className="button ghost danger"
                              onClick={() => {
                                if (
                                  confirm("Discard this interrupted interview?")
                                )
                                  void action(item, "discard");
                              }}
                            >
                              Discard
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
