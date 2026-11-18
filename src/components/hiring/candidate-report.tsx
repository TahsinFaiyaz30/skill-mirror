"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Dialog } from "radix-ui";
import { errorMessage, requestJSON, send } from "@/lib/utils/client";
import { readable } from "@/lib/config/taxonomy";
import { ReportView } from "@/components/report/report-view";
import type {
  CandidateDecision,
  CandidateRow,
  RecruiterReport,
  Review,
} from "@/types/hiring";

function DecisionPanel({
  id,
  data,
  next,
}: {
  id: string;
  data: RecruiterReport;
  next?: string;
}) {
  const initial = data.review ?? { decision: null, rating: null, notes: "" };
  const [review, setReview] = useState<Review>(initial);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const last = useRef(JSON.stringify(initial));
  const revision = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const snapshot = JSON.stringify(review);
    if (snapshot === last.current) return;
    const timer = setTimeout(() => {
      const request = revision.current
        .catch(() => {})
        .then(async () => {
          await send("/api/hiring/sessions/" + id + "/review", "PUT", review);
          last.current = snapshot;
          setSaved(true);
          setError("");
        });
      revision.current = request;
      void request.catch((error) => {
        setError(errorMessage(error));
        setSaved(false);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [id, review]);
  const change = (value: Partial<Review>) => {
    setSaved(false);
    setReview((old) => ({ ...old, ...value }));
  };
  const { candidate, report } = data;
  const details = (
    <>
      <div>
        <h2>{candidate.name}</h2>
        <p className="muted">{candidate.email}</p>
      </div>
      {candidate.cvSummary && (
        <div className="inset stack-sm">
          <strong>{candidate.cvSummary.headline}</strong>
          <small>
            {readable(candidate.cvSummary.seniority)} ·{" "}
            {candidate.cvSummary.years} years
          </small>
          <div className="cluster">
            {candidate.cvSummary.topSkills.map((skill) => (
              <span className="badge" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="cluster">
        <span className="badge primary">{report.headline.recommendation}</span>
        <strong className="mono">{report.headline.overallScore} / 100</strong>
      </div>
      <fieldset className="stack-sm">
        <legend>Decision</legend>
        <div className="cluster">
          {(["advance", "hold", "reject"] as CandidateDecision[]).map(
            (option) => (
              <button
                className={
                  "button " + (review.decision === option ? "" : "secondary")
                }
                key={option}
                aria-pressed={review.decision === option}
                onClick={() => change({ decision: option })}
              >
                {readable(option)}
              </button>
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="stack-sm">
        <legend>Rating</legend>
        <div className="cluster">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              className="button ghost icon"
              key={n}
              aria-label={"Rate " + n + " out of 5"}
              aria-pressed={review.rating === n}
              onClick={() => change({ rating: review.rating === n ? null : n })}
            >
              <Star
                size={18}
                fill={(review.rating ?? 0) >= n ? "var(--warning)" : "none"}
              />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        Notes
        <textarea
          value={review.notes}
          maxLength={5000}
          onChange={(e) => change({ notes: e.target.value })}
        />
      </label>
      {error ? (
        <p role="alert" className="danger">
          {error}
        </p>
      ) : (
        <small role="status">{saved ? "Saved" : "Saving…"}</small>
      )}
      {next && (
        <Link href={"/hiring/candidates/" + next}>Next candidate →</Link>
      )}
    </>
  );
  return (
    <>
      <aside className="card decision-panel stack desktop-only no-print">
        {details}
      </aside>
      <button
        className="button mobile-only no-print"
        onClick={() => setOpen(true)}
      >
        Review candidate
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content card stack no-print">
            <Dialog.Title>Review candidate</Dialog.Title>
            <Dialog.Description className="sr-only">
              Decision, rating and notes
            </Dialog.Description>
            {details}
            <Dialog.Close className="button secondary">Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
export function CandidateReport({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["hiring-report", id],
    queryFn: () =>
      requestJSON<RecruiterReport>("/api/hiring/sessions/" + id + "/report"),
  });
  const opening = query.data?.opening;
  const candidateList = useQuery({
    queryKey: ["candidates", opening?.id],
    queryFn: () =>
      requestJSON<{ items: CandidateRow[] }>(
        "/api/openings/" + opening?.id + "/candidates",
      ),
    enabled: Boolean(opening?.id),
  });
  if (query.isPending) return <p role="status">Loading candidate report…</p>;
  if (query.isError)
    return (
      <div className="card stack">
        <h1>Candidate report</h1>
        <p role="alert" className="danger">
          {errorMessage(query.error)}
        </p>
        <Link href="/hiring">Back to openings</Link>
      </div>
    );
  const data = query.data;
  const sequence =
    candidateList.data?.items.filter(
      (item) => item.sessionId && item.completedAt,
    ) ?? [];
  const next =
    sequence[sequence.findIndex((candidate) => candidate.sessionId === id) + 1]
      ?.sessionId ?? undefined;
  return (
    <div className="stack">
      <div className="no-print">
        <Link href={"/hiring/openings/" + data.opening.id}>
          {data.opening.title}
        </Link>
      </div>
      <div className="report-and-decision">
        <ReportView id={id} report={data.report} recruiter />
        <DecisionPanel id={id} data={data} next={next} />
      </div>
    </div>
  );
}
