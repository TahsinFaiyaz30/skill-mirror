"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyInvites } from "./company-invites";
import {
  BriefcaseBusiness,
  CircleCheck,
  FileUp,
  Gauge,
  MessagesSquare,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";
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
type Status = DashboardSession["displayStatus"];
// Plain-language status, its colour and where the row leads next.
const statusInfo: Record<
  Status,
  { label: string; tone: string; page: string | null; action: string }
> = {
  completed: {
    label: "Report ready",
    tone: "success",
    page: "report",
    action: "View report",
  },
  processing: {
    label: "Preparing report",
    tone: "primary",
    page: "processing",
    action: "View status",
  },
  ended: {
    label: "Preparing report",
    tone: "primary",
    page: "processing",
    action: "View status",
  },
  failed: {
    label: "Report needs a retry",
    tone: "warning",
    page: "processing",
    action: "Retry report",
  },
  ready: {
    label: "Ready to start",
    tone: "",
    page: "setup",
    action: "Continue setup",
  },
  in_progress: {
    label: "In progress",
    tone: "primary",
    page: "live",
    action: "Continue",
  },
  draft: {
    label: "Not started",
    tone: "",
    page: "prepare",
    action: "Continue",
  },
  planning: {
    label: "Not started",
    tone: "",
    page: "prepare",
    action: "Continue",
  },
  interrupted: {
    label: "Stopped early",
    tone: "warning",
    page: null,
    action: "",
  },
  discarded: { label: "Discarded", tone: "", page: null, action: "" },
  superseded: { label: "Replaced", tone: "", page: null, action: "" },
};
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const firstSteps = [
  [BriefcaseBusiness, "Set up the interview", "Role, company and length"],
  [FileUp, "Upload your CV", "A PDF up to 5 MB"],
  [MessagesSquare, "Take the interview", "Then review your report"],
] as const;
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
          <h1>Welcome back{firstName ? ", " + firstName : ""}</h1>
          <p className="muted">
            Start a new mock interview or pick up where you left off.
          </p>
        </div>
        {items.length > 0 && (
          <Link className="button" href="/interview/new">
            <Plus size={18} aria-hidden="true" />
            New interview
          </Link>
        )}
      </div>
      <div className="grid-3 stagger">
        <div className="card stat">
          <span className="stat-icon">
            <CircleCheck size={19} aria-hidden="true" />
          </span>
          <small>Interviews completed</small>
          <strong className="stat-value">{completed.length}</strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <TrendingUp size={19} aria-hidden="true" />
          </span>
          <small>Latest score</small>
          <strong className="stat-value">
            {latest ?? "–"}
            {latest != null && <span className="stat-unit">/ 100</span>}
          </strong>
          {gain !== null && (
            <small className={gain > 0 ? "stat-note up" : "stat-note"}>
              {gain > 0
                ? "+" + gain + " since your first interview"
                : gain === 0
                  ? "Same as your first interview"
                  : "Your first interview scored " + first}
            </small>
          )}
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <Gauge size={19} aria-hidden="true" />
          </span>
          <small>Best technical level</small>
          <strong className="stat-value">
            {ceilings.length ? "Level " + Math.max(...ceilings) : "–"}
            {ceilings.length > 0 && <span className="stat-unit">of 5</span>}
          </strong>
        </div>
      </div>
      <CompanyInvites />
      <section className="stack">
        <h2>Your interviews</h2>
        {sessions.isPending ? (
          <p role="status">Loading interviews…</p>
        ) : sessions.isError ? (
          <div className="card stack">
            <p role="alert" className="danger">
              {errorMessage(sessions.error)}
            </p>
            <div>
              <button
                className="button secondary"
                onClick={() => void sessions.refetch()}
              >
                Retry
              </button>
            </div>
          </div>
        ) : !items.length ? (
          <div className="card stack center empty-state">
            <h3>No interviews yet</h3>
            <p className="muted">
              Your first mock interview takes 10 or 20 minutes. Your report
              appears here when it&apos;s ready.
            </p>
            <ol className="first-steps">
              {firstSteps.map(([Icon, title, text], index) => (
                <li key={title}>
                  <span className="first-step-num">{index + 1}</span>
                  <Icon size={20} aria-hidden="true" />
                  <strong>{title}</strong>
                  <small>{text}</small>
                </li>
              ))}
            </ol>
            <div>
              <Link className="button lg" href="/interview/new">
                New interview
              </Link>
            </div>
          </div>
        ) : (
          <div className="card scroll">
            <table className="simple-table">
              <thead>
                <tr>
                  {["Interview", "Date", "Status", "Score", ""].map((label) => (
                    <th key={label || "action"} scope="col">
                      {label || <span className="sr-only">Action</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const info = statusInfo[item.displayStatus];
                  return (
                    <tr key={item.sessionId}>
                      <td>
                        <strong className="cell-title">{item.roleTitle}</strong>
                        <small>
                          {item.company} · {item.lengthMinutes} min
                        </small>
                      </td>
                      <td className="nowrap">{date(item.createdAt)}</td>
                      <td>
                        <span className={"badge " + info.tone}>
                          {info.label}
                        </span>
                      </td>
                      <td>
                        {item.overallScore != null ? (
                          <strong className="score-cell">
                            {item.overallScore}
                            <small>/100</small>
                          </strong>
                        ) : (
                          <small>Not scored yet</small>
                        )}
                      </td>
                      <td className="action-cell">
                        {info.page && (
                          <Link
                            className={
                              "button sm " +
                              (item.displayStatus === "completed"
                                ? ""
                                : "secondary")
                            }
                            href={
                              "/interview/" + item.sessionId + "/" + info.page
                            }
                          >
                            {info.action}
                          </Link>
                        )}
                        {item.displayStatus === "interrupted" && (
                          <div className="cluster" style={{ gap: 8 }}>
                            {(item.durationMs ?? 0) >= 300000 && (
                              <button
                                className="button secondary sm"
                                onClick={() => void action(item, "partial")}
                              >
                                Generate partial report
                              </button>
                            )}
                            <button
                              className="button ghost sm danger"
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
