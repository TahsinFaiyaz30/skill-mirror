"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { PHASE_LABELS } from "@/lib/config/taxonomy";
import { errorMessage, send } from "@/lib/utils/client";
import { Orbit } from "@/components/common/orbit";
import type { PlanSummary, SessionPublic } from "@/types/interview";
const steps = [
  "Analyzing role requirements",
  "Mapping your CV to competencies",
  "Designing question ladders",
  "Preparing your interview",
];
// Short, useful things to read while the plan is generated.
const tips = [
  "Think out loud. How you reason counts as much as the final answer.",
  "For behavioral questions, try STAR: situation, task, action, result.",
  "It's fine to pause for a few seconds before you answer.",
  "If a question is vague, ask a clarifying question first.",
  "Vague answers get follow-up questions, so name concrete numbers and tools.",
  "Look at the camera, not the screen, when you make a key point.",
];
// "20 s", "1 min", "1 min 30 s": the 2 minute test has phases under a minute.
function phaseLength(ms: number) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60),
    rest = seconds % 60;
  if (!minutes) return rest + " s";
  return minutes + " min" + (rest ? " " + rest + " s" : "");
}
export function Prepare({ state }: { state: SessionPublic }) {
  const id = state.session.id;
  const [tick, setTick] = useState(0);
  const [tip, setTip] = useState(0);
  const plan = useQuery({
    queryKey: ["plan", id],
    queryFn: () =>
      send<{ planSummary: PlanSummary | null }>(
        "/api/sessions/" + id + "/plan",
        "POST",
      ),
    enabled: !state.planSummary,
    staleTime: Infinity,
    refetchInterval: (query) =>
      query.state.status === "success" && query.state.data?.planSummary === null
        ? 2_000
        : false,
  });
  useEffect(() => {
    const steps = window.setInterval(
      () => setTick((value) => Math.min(3, value + 1)),
      7500,
    );
    const tips = window.setInterval(() => setTip((value) => value + 1), 5000);
    return () => {
      window.clearInterval(steps);
      window.clearInterval(tips);
    };
  }, []);
  const summary = state.planSummary ?? plan.data?.planSummary;
  if (plan.isError && !plan.isFetching && !summary)
    return (
      <section className="panel prep">
        <h1>Interview preparation</h1>
        <p role="alert" className="danger">
          {errorMessage(plan.error)}
        </p>
        <button
          className="button"
          onClick={() => {
            setTick(0);
            setTip(0);
            void plan.refetch();
          }}
        >
          Retry
        </button>
      </section>
    );
  if (summary)
    return (
      <section className="panel prep rise">
        <div className="prep-ready">
          <div className="stack-sm">
            <span className="eyebrow">Your interview is ready</span>
            <h1>
              {state.session.roleTitle} · {state.session.company}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              With {summary.interviewerName} ·{" "}
              {state.config.hardCapMs % 60_000
                ? phaseLength(state.config.hardCapMs)
                : `${state.config.lengthMinutes} minutes`}
            </p>
            {state.config.judgeMode && (
              <p className="muted small" style={{ margin: 0 }}>
                Judge mode · Shorter AI reasoning
              </p>
            )}
          </div>
          <div className="skill-chips">
            {summary.competencies.map((item) => (
              <span className="badge" key={item.key}>
                {item.subLabel ?? item.displayName}
              </span>
            ))}
          </div>
          <ul className="phase-list">
            {summary.phases.map((phase) => (
              <li key={phase.key}>
                <span>{PHASE_LABELS[phase.key]}</span>
                <span className="mono">{phaseLength(phase.budgetMs)}</span>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ margin: 0 }}>
            Questions are hidden until the interview starts.
          </p>
          <div>
            <Link
              className="button accent lg"
              href={"/interview/" + id + "/setup"}
            >
              Continue to setup
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    );
  return (
    <section className="panel prep rise" aria-busy="true">
      <Orbit />
      <div className="stack-sm">
        <h1>Preparing your interview</h1>
        <p className="muted" style={{ margin: 0 }}>
          {state.session.roleTitle} · {state.session.company}
        </p>
      </div>
      <div
        className="prep-bar"
        role="progressbar"
        aria-label="Interview preparation progress"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={tick + 1}
      >
        <i style={{ width: ((tick + 1) / 5) * 100 + "%" }} />
      </div>
      <ol className="prep-steps" aria-live="polite">
        {steps.map((label, index) => {
          const status =
            index < tick ? "done" : index === tick ? "now" : undefined;
          return (
            <li key={label} data-state={status}>
              <span className="prep-dot" aria-hidden="true">
                {status === "done" && <Check size={14} strokeWidth={3} />}
              </span>
              {label}
              {status === "done" && <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
      </ol>
      <p className="prep-tip">
        <span key={tip}>{tips[tip % tips.length]}</span>
      </p>
    </section>
  );
}
