"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UseQueryResult } from "@tanstack/react-query";
import { errorMessage, send, showError } from "@/lib/utils/client";
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

// Every interview with its status and the next step for it.
export function InterviewHistory({
  sessions,
}: {
  sessions: UseQueryResult<{ items: DashboardSession[] }>;
}) {
  const router = useRouter();
  const items = sessions.data?.items ?? [];
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
  if (sessions.isPending) return <p role="status">Loading interviews…</p>;
  if (sessions.isError)
    return (
      <div className="stack-sm">
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
    );
  if (!items.length)
    return (
      <p className="muted">
        No interviews yet. Start one from the{" "}
        <Link href="/dashboard">Interview Studio</Link>; it will be listed here with
        its report.
      </p>
    );
  return (
    <div className="scroll">
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
                  <span className={"badge " + info.tone}>{info.label}</span>
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
                        (item.displayStatus === "completed" ? "" : "secondary")
                      }
                      href={"/interview/" + item.sessionId + "/" + info.page}
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
                          if (confirm("Discard this interrupted interview?"))
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
  );
}
