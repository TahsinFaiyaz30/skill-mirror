"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PHASE_LABELS } from "@/lib/config/taxonomy";
import { errorMessage, send } from "@/lib/utils/client";
import type { PlanSummary, SessionPublic } from "@/types/interview";
const steps = [
  "Analyzing role requirements",
  "Mapping your CV to competencies",
  "Designing question ladders",
  "Preparing your interview",
];
export function Prepare({ state }: { state: SessionPublic }) {
  const id = state.session.id;
  const [tick, setTick] = useState(0);
  const plan = useQuery({
    queryKey: ["plan", id],
    queryFn: () =>
      send<{ planSummary: PlanSummary }>(
        "/api/sessions/" + id + "/plan",
        "POST",
      ),
    enabled: !state.planSummary,
  });
  useEffect(() => {
    const timer = window.setInterval(
      () => setTick((value) => Math.min(3, value + 1)),
      7500,
    );
    return () => window.clearInterval(timer);
  }, []);
  const summary = state.planSummary ?? plan.data?.planSummary;
  if (plan.isError)
    return (
      <section className="card stack narrow">
        <h1>Interview preparation</h1>
        <p role="alert" className="danger">
          {errorMessage(plan.error)}
        </p>
        <button className="button" onClick={() => void plan.refetch()}>
          Retry
        </button>
      </section>
    );
  return (
    <section className="card stack narrow">
      {summary ? (
        <>
          <h1>Your interview</h1>
          <p>
            {state.session.roleTitle} · {state.session.company}
          </p>
          <p>
            {summary.interviewerName} · {state.config.lengthMinutes} minutes
          </p>
          <div className="cluster">
            {summary.competencies.map((item) => (
              <span className="badge" key={item.key}>
                {item.subLabel ?? item.displayName}
              </span>
            ))}
          </div>
          <ul className="stack-sm">
            {summary.phases.map((phase) => (
              <li className="cluster between" key={phase.key}>
                <span>{PHASE_LABELS[phase.key]}</span>
                <span className="mono">{phase.budgetMs / 60000} min</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Questions are hidden until the interview starts.
          </p>
          <div>
            <Link className="button" href={"/interview/" + id + "/setup"}>
              Continue to setup
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1>Preparing your interview</h1>
          <progress
            value={tick + 1}
            max={5}
            aria-label="Interview preparation progress"
          />
          <ol className="stack-sm" aria-live="polite">
            {steps.map((label, index) => (
              <li key={label} className={index > tick ? "muted" : ""}>
                {index < tick ? "✓" : index === tick ? "●" : "○"} {label}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
