"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CircleCheck,
  FileCheck,
  GitCompareArrows,
  ListChecks,
  LockKeyhole,
  Plus,
  Send,
  ThumbsUp,
} from "lucide-react";
// What a hiring team does in SkillMirror, shown until the first opening exists.
const hiringSteps = [
  [
    ListChecks,
    "Design the interview",
    "Add your must-ask questions, import them from a document, or let SkillMirror plan the interview.",
  ],
  [
    Send,
    "Invite candidates",
    "Publish the opening and send invite links by email. Candidates interview on their own time.",
  ],
  [
    FileCheck,
    "Review structured reports",
    "See question coverage, AI follow-ups labelled apart from your questions, and delivery insights.",
  ],
  [
    GitCompareArrows,
    "Compare and decide",
    "Compare candidates side by side, advance or reject, and export your decisions as CSV.",
  ],
] as const;
import type { OpeningListRow } from "@/types/hiring";
import { readable } from "@/lib/config/taxonomy";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";
import { DuplicateButton } from "./opening-wizard";
export function OpeningsList() {
  const query = useQuery({
    queryKey: ["openings"],
    queryFn: () => requestJSON<{ items: OpeningListRow[] }>("/api/openings"),
  });
  const items = query.data?.items ?? [];
  const stats = [
    [
      BriefcaseBusiness,
      "Active openings",
      items.filter((row) => row.status === "active").length,
    ],
    [
      Send,
      "Candidates invited",
      items.reduce((n, row) => n + row.counts.invited, 0),
    ],
    [
      CircleCheck,
      "Interviews completed",
      items.reduce((n, row) => n + row.counts.completed, 0),
    ],
    [
      ThumbsUp,
      "Recommended to advance",
      items.reduce((n, row) => n + row.counts.advance, 0),
    ],
  ] as const;
  return (
    <div className="stack-lg">
      <div className="page-header">
        <div className="stack-sm">
          <span className="eyebrow">SkillMirror for Teams</span>
          <h1>Openings</h1>
          <p className="muted">
            Publish AI interviews, invite candidates and review structured
            reports.
          </p>
        </div>
        <Link href="/hiring/openings/new" className="button">
          <Plus size={18} aria-hidden="true" />
          New opening
        </Link>
      </div>
      <div className="grid-4">
        {stats.map(([Icon, label, n]) => (
          <div key={label} className="card stat">
            <span className="stat-icon">
              <Icon size={19} aria-hidden="true" />
            </span>
            <small>{label}</small>
            <strong className="mono stat-value">{n}</strong>
          </div>
        ))}
      </div>
      {query.isPending ? (
        <p role="status">Loading openings…</p>
      ) : query.isError ? (
        <div className="card stack">
          <p role="alert" className="danger">
            {errorMessage(query.error)}
          </p>
          <button className="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : !items.length ? (
        <div className="card stack center empty-state">
          <span className="empty-icon">
            <BriefcaseBusiness size={28} aria-hidden="true" />
          </span>
          <h2>Create your first AI interview.</h2>
          <p className="muted">
            Add your must-ask questions or let SkillMirror plan the interview,
            then share an invite link with candidates.
          </p>
          <div>
            <Link href="/hiring/openings/new" className="button">
              New opening
            </Link>
          </div>
        </div>
      ) : null}
      {!query.isPending && !query.isError && !items.length && (
        <section className="stack" aria-labelledby="hiring-steps">
          <h2 id="hiring-steps">How hiring works</h2>
          <ol className="preview-grid four">
            {hiringSteps.map(([Icon, title, text], index) => (
              <li key={title} className="card preview-card">
                <span className="cluster between">
                  <span className="stat-icon">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="mono muted">0{index + 1}</span>
                </span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {query.isPending || query.isError || !items.length ? null : (
        <div className="card scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Opening",
                  "Status",
                  "Invited",
                  "Completed",
                  "Recommended",
                  "Updated",
                  "Actions",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="cluster">
                      <Link href={"/hiring/openings/" + item.id}>
                        {item.title}
                      </Link>
                      {item.locked && (
                        <LockKeyhole size={16} aria-label="Locked" />
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " + (item.status === "active" ? "accent" : "")
                      }
                    >
                      {readable(item.status)}
                    </span>
                  </td>
                  <td className="mono">{item.counts.invited}</td>
                  <td className="mono">{item.counts.completed}</td>
                  <td className="mono">{item.counts.advance}</td>
                  <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="cluster">
                      <Link
                        className="button ghost"
                        href={"/hiring/openings/" + item.id}
                      >
                        Open
                      </Link>
                      <DuplicateButton id={item.id} />
                      {item.status === "active" && (
                        <button
                          className="button ghost"
                          onClick={() => {
                            if (
                              confirm(
                                "Close this opening and expire pending invitations?",
                              )
                            )
                              void send(
                                "/api/openings/" + item.id + "/close",
                                "POST",
                              ).then(() => query.refetch(), showError);
                          }}
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
