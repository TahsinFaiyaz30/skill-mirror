"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Tabs } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { requestJSON, errorMessage } from "@/lib/utils/client";
import {
  DIMENSIONS,
  readable,
  TAXONOMY,
  type CompetencyKey,
} from "@/lib/config/taxonomy";
import { useThemeColors } from "./charts";
import {
  InterviewHistory,
  type DashboardSession,
} from "@/components/interview/interview-history";
import { CompanyInvites } from "@/components/interview/company-invites";

// Interviews that were started but not finished, and where each one resumes.
const unfinished: Record<string, string> = {
  in_progress: "live",
  ready: "setup",
  draft: "prepare",
  planning: "prepare",
};

type Point = { date: string; score: number; ceiling?: number | null };
type Gain = {
  first: number | null;
  latest: number | null;
  delta: number | null;
};
type Progress = {
  sessions: { date: string; overallScore: number; sessionId: string }[];
  competencies: Record<string, Point[]>;
  softSkills: Record<string, Point[]>;
  gains: {
    overall: Gain;
    competencies: Record<string, Gain>;
    softSkills: Record<string, Gain>;
  };
};
const format = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
export const deltaText = (n: number | null) =>
  n === null ? "—" : (n > 0 ? "+" : "") + n;
function best(values: Record<string, Gain>) {
  return Object.entries(values)
    .filter(([, item]) => item.delta !== null)
    .sort((a, b) => b[1].delta! - a[1].delta!)[0];
}

// Headline numbers: the three figures that used to sit on the dashboard, with
// the biggest gains underneath, all in one strip.
function Summary({
  sessions,
  data,
}: {
  sessions: DashboardSession[];
  data: Progress | undefined;
}) {
  const completed = sessions.filter(
    (item) => item.displayStatus === "completed",
  );
  const latest = completed[0]?.overallScore,
    first = completed.at(-1)?.overallScore;
  const gain =
    latest != null && first != null && completed.length > 1
      ? latest - first
      : null;
  const ceilings = Object.values(data?.competencies ?? {})
    .flat()
    .map((item) => item.ceiling)
    .filter((value): value is number => value != null);
  const technical = data && best(data.gains.competencies),
    soft = data && best(data.gains.softSkills);
  const gains = [
    ["Overall", data?.gains.overall.delta ?? null],
    technical
      ? [
          TAXONOMY[technical[0] as CompetencyKey]?.[0] ?? technical[0],
          technical[1].delta,
        ]
      : null,
    soft ? [readable(soft[0]), soft[1].delta] : null,
  ].filter((item): item is [string, number | null] => item !== null);
  return (
    <section className="summary-strip rise rise-2" aria-label="Summary">
      <div className="summary-stat">
        <small>Interviews completed</small>
        <strong className="stat-value">{completed.length}</strong>
      </div>
      <div className="summary-stat">
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
      <div className="summary-stat">
        <small>Best technical level</small>
        <strong className="stat-value">
          {ceilings.length ? "Level " + Math.max(...ceilings) : "–"}
          {ceilings.length > 0 && <span className="stat-unit">of 5</span>}
        </strong>
      </div>
      {gains.some(([, n]) => n !== null) && (
        <div className="gain-row">
          <span>Biggest gains</span>
          {gains.map(([label, n]) => (
            <span
              key={label}
              className={"gain-chip" + (n !== null && n > 0 ? " up" : "")}
            >
              {label}
              <b>{deltaText(n)}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProgressView() {
  const query = useQuery({
    queryKey: ["progress"],
    queryFn: () => requestJSON<Progress>("/api/progress"),
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => requestJSON<{ items: DashboardSession[] }>("/api/sessions"),
  });
  const colors = useThemeColors();
  const [hidden, setHidden] = useState<string[]>([]);
  const data = query.data;
  const open = sessions.data?.items.find(
    (item) => item.displayStatus in unfinished,
  );
  const colorsByDim = [
    colors.primary,
    colors.accent,
    colors["ev-nonverbal"],
    colors.warning,
    colors["ev-live-vision"],
    colors.danger,
    colors.muted,
  ];
  const samples = (data?.sessions ?? []).map((session) => ({
    ...session,
    ...Object.fromEntries(
      DIMENSIONS.map((dim) => [
        dim,
        data?.softSkills[dim]?.find((point) => point.date === session.date)
          ?.score ?? null,
      ]),
    ),
  }));
  return (
    <div className="stack-lg">
      <div className="page-intro rise">
        <h1>Your progress</h1>
        <p>
          How your scores, technical levels and soft skills change from one
          interview to the next, and every interview you have taken.
        </p>
      </div>
      {open && (
        <div className="resume-line rise">
          <span>
            You have an unfinished interview:{" "}
            <strong>
              {open.roleTitle} at {open.company}
            </strong>
          </span>
          <Link
            className="button sm"
            href={
              "/interview/" +
              open.sessionId +
              "/" +
              unfinished[open.displayStatus]
            }
          >
            Continue
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      <CompanyInvites />
      <Summary sessions={sessions.data?.items ?? []} data={data} />
      <section className="stack rise rise-3" aria-label="Charts">
        {query.isPending ? (
          <p role="status">Loading progress…</p>
        ) : query.isError ? (
          <div className="stack-sm">
            <p role="alert" className="danger">
              {errorMessage(query.error)}
            </p>
            <div>
              <button className="button" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          </div>
        ) : samples.length === 0 ? (
          <div className="stack-sm center empty-state">
            <h2>No progress yet</h2>
            <p className="muted">
              Finish your first interview. Your scores and how they change over
              time will show up here.
            </p>
            <div>
              <Link className="button" href="/dashboard">
                Start practicing
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <Tabs.Root defaultValue="overall" className="stack">
            <div className="panel-head">
              <h2>Trends</h2>
              <Tabs.List className="tabs-list" aria-label="Chart">
                <Tabs.Trigger value="overall">Overall score</Tabs.Trigger>
                <Tabs.Trigger value="technical">Technical levels</Tabs.Trigger>
                <Tabs.Trigger value="soft">Soft skills</Tabs.Trigger>
              </Tabs.List>
            </div>
            {samples.length < 2 && (
              <p className="muted" style={{ margin: 0 }}>
                Complete two interviews to see a trend.
              </p>
            )}
            <Tabs.Content value="overall">
              <p className="sr-only">
                {samples
                  .map((s) => format(s.date) + " " + s.overallScore)
                  .join(", ")}
              </p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={samples}>
                    <CartesianGrid stroke={colors.border} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={format}
                      stroke={colors.muted}
                    />
                    <YAxis domain={[0, 100]} stroke={colors.muted} />
                    <Tooltip
                      labelFormatter={(label) => format(String(label))}
                      contentStyle={{ background: colors.surface }}
                    />
                    <Line
                      dataKey="overallScore"
                      name="Overall score"
                      stroke={colors.primary}
                      strokeWidth={2.5}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Tabs.Content>
            <Tabs.Content value="technical">
              <div className="ceiling-grid">
                {Object.entries(data!.competencies).map(([key, points]) => (
                  <div key={key}>
                    <h3>{TAXONOMY[key as CompetencyKey]?.[0] ?? key}</h3>
                    <p className="sr-only">
                      {points
                        .map((p) => format(p.date) + " Level " + p.ceiling)
                        .join(", ")}
                    </p>
                    <div className="chart">
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={points}>
                          <XAxis
                            dataKey="date"
                            tickFormatter={format}
                            stroke={colors.muted}
                          />
                          <YAxis
                            domain={[0, 5]}
                            allowDecimals={false}
                            stroke={colors.muted}
                          />
                          <Line
                            type="stepAfter"
                            dataKey="ceiling"
                            stroke={colors.primary}
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </Tabs.Content>
            <Tabs.Content value="soft" className="stack">
              <div className="cluster">
                {DIMENSIONS.map((dim, i) => (
                  <button
                    className="button secondary sm"
                    key={dim}
                    aria-pressed={!hidden.includes(dim)}
                    onClick={() =>
                      setHidden((current) =>
                        current.includes(dim)
                          ? current.filter((d) => d !== dim)
                          : [...current, dim],
                      )
                    }
                  >
                    <span style={{ color: colorsByDim[i] }} aria-hidden="true">
                      ●
                    </span>
                    {readable(dim)}
                  </button>
                ))}
              </div>
              <p className="sr-only">
                {Object.entries(data!.softSkills)
                  .map(
                    ([dim, points]) =>
                      readable(dim) +
                      ": " +
                      points.map((p) => p.score).join(", "),
                  )
                  .join(". ")}
              </p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={samples}>
                    <CartesianGrid stroke={colors.border} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={format}
                      stroke={colors.muted}
                    />
                    <YAxis domain={[0, 100]} stroke={colors.muted} />
                    <Tooltip
                      contentStyle={{ background: colors.surface }}
                      labelFormatter={(label) => format(String(label))}
                    />
                    {DIMENSIONS.map((dim, i) => (
                      <Line
                        key={dim}
                        dataKey={dim}
                        name={readable(dim)}
                        stroke={colorsByDim[i]}
                        hide={hidden.includes(dim)}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        )}
      </section>
      <section className="stack section-rule rise rise-3" aria-labelledby="history">
        <h2 id="history" style={{ margin: 0 }}>
          Interview history
        </h2>
        <InterviewHistory sessions={sessions} />
      </section>
    </div>
  );
}
