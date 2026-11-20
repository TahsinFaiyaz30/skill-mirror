"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Award,
  BarChart3,
  Brain,
  CirclePlay,
  Gauge,
  HeartPulse,
  ListChecks,
  MessageSquareText,
  Play,
  Printer,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  errorMessage,
  requestJSON,
  send,
  shortTime,
  showError,
} from "@/lib/utils/client";
import { readable } from "@/lib/config/taxonomy";
import type { Playback, QuestionSource } from "@/types/interview";
import type {
  CandidateSummary,
  Clip,
  CompetencyResult,
  KeyMoment,
  PracticeDrill,
  ReportData,
  ReportTurn,
  StatRow,
} from "@/types/report";
import { ComposureCurve, SoftSkillRadar, TimelineTracks } from "./charts";
import { ClipPlayer } from "./clip-player";

const sourceLabels: Record<QuestionSource, string> = {
  company: "🏢 Company",
  ai_plan: "🤖 AI plan",
  ai_followup: "⚡ AI follow-up",
  system: "System",
};
export function SourceBadge({ source }: { source: QuestionSource | null }) {
  return source && source !== "system" ? (
    <span className="badge">{sourceLabels[source]}</span>
  ) : null;
}
const integrity = {
  clean: "Clean",
  minor: "Minor flags",
  review: "Review needed",
};
export function ScoreHeader({
  report,
  actions,
  recruiter,
}: {
  report: ReportData;
  actions: React.ReactNode;
  recruiter: boolean;
}) {
  const { headline, session } = report;
  const flagText =
    "flags" in report.integrity
      ? report.integrity.flags
          .map((flag) => readable(flag.type) + " · " + flag.count)
          .join(", ")
      : "";
  const levels = report.technical.competencies
    .map((c) => c.ceiling)
    .filter((n): n is number => n !== null);
  const tiles = [
    ["Questions answered", String(report.turns.length)],
    ["Key moments", String(report.keyMoments.length)],
    [
      "Best technical level",
      levels.length ? "Level " + Math.max(...levels) : "–",
    ],
    ["Interview length", shortTime(session.durationMs)],
  ];
  return (
    <section className="card stack report-hero" id="overview">
      <div className="report-hero-top">
        <div
          className="score-gauge"
          style={
            { "--score": headline.overallScore + "%" } as React.CSSProperties
          }
          aria-label={
            (session.kind === "practice" ? "Overall" : "Weighted") +
            " score " +
            headline.overallScore +
            " out of 100"
          }
        >
          <div>
            <strong className="mono">{headline.overallScore}</strong>
            <small>out of 100</small>
          </div>
        </div>
        <div className="stack-sm report-hero-text">
          <div className="cluster between">
            <h1>
              {recruiter
                ? "Candidate interview report"
                : "Your interview report"}
            </h1>
            {recruiter ? (
              <button
                className="button secondary no-print"
                onClick={() => print()}
              >
                <Printer size={16} />
                Print / Save PDF
              </button>
            ) : (
              actions
            )}
          </div>
          <p className="report-meta">
            <span>{session.roleTitle}</span>
            <span>{session.company}</span>
            {session.startedAt && (
              <span>{new Date(session.startedAt).toLocaleDateString()}</span>
            )}
          </p>
          <div className="cluster" style={{ gap: 8 }}>
            {headline.verdict && (
              <span className="badge primary">{headline.verdict}</span>
            )}
            {headline.recommendation && (
              <span className="badge primary">{headline.recommendation}</span>
            )}
            <span
              title={flagText || undefined}
              className={
                "badge " +
                (headline.integrityBadge === "review"
                  ? "danger"
                  : headline.integrityBadge === "minor"
                    ? "warning"
                    : "success")
              }
            >
              {integrity[headline.integrityBadge]}
            </span>
          </div>
          <p className="report-summary">{headline.summary}</p>
          <small>{headline.disclaimer}</small>
          {session.kind === "preview" && headline.recommendation && (
            <small>
              AI recommendation to support, not replace, human judgement.
            </small>
          )}
        </div>
      </div>
      <div className="report-tiles">
        {tiles.map(([label, text]) => (
          <div className="report-tile" key={label}>
            <small>{label}</small>
            <strong>{text}</strong>
          </div>
        ))}
      </div>
      {recruiter && (
        <div className="grid-4">
          {(["technical", "behavioral", "cv", "soft"] as const).map((key) => (
            <div className="inset stack-sm" key={key}>
              <small>{key === "cv" ? "CV" : readable(key)}</small>
              <strong>
                {report.components[key] ?? "—"}{" "}
                <small>· {report.components.effectiveWeights[key]}%</small>
              </strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function CeilingLadder({
  competency,
  expected,
  scripted,
}: {
  competency: CompetencyResult;
  expected: number;
  scripted: boolean;
}) {
  const c = competency;
  return (
    <article className={"inset stack " + (c.notAssessed ? "muted" : "")}>
      <div className="cluster between">
        <h3>{c.subLabel ?? c.displayName}</h3>
        {c.notAssessed && <span className="badge">Not assessed</span>}
      </div>
      {scripted || (c.ceiling === null && !c.notAssessed) ? (
        <div className="stack-sm">
          <strong>Ability estimate</strong>
          <progress max={5} value={c.theta} aria-label="Ability estimate" />
        </div>
      ) : (
        <ol className="ladder" aria-label={"Expected level " + expected}>
          {[5, 4, 3, 2, 1].map((level) => {
            const rows = c.path.filter(
              (p) =>
                p.level === level && !p.isFollowUp && p.source === "ai_plan",
            );
            return (
              <li
                key={level}
                className={
                  (rows.some((r) => r.outcome === "pass")
                    ? "passed "
                    : rows.some((r) => r.outcome === "fail")
                      ? "failed "
                      : "") + (level === expected ? "expected" : "")
                }
              >
                <span className="mono">L{level}</span>
                {level === expected && <small>Expected level</small>}
                {c.ceiling === level && <span title="Ceiling">🏁</span>}
              </li>
            );
          })}
          {c.ceiling === 0 && (
            <li>
              <span className="mono">0</span>
              <span title="Ceiling">🏁</span>
            </li>
          )}
        </ol>
      )}
      <div className="cluster small">
        {c.path.map((p) => (
          <span
            key={p.turnIdx}
            title={
              "Turn " + (p.turnIdx + 1) + " · " + (p.outcome ?? "unscored")
            }
            className={"path-dot " + (p.outcome ?? "")}
          />
        ))}
      </div>
      <div className="cluster">
        <span className="mono">θ {c.theta.toFixed(1)}</span>
        <span className="mono">{c.score} / 100</span>
        {c.cvClaim && (
          <span className="badge">{readable(c.cvClaim.signal)}</span>
        )}
      </div>
      {c.commentary && <p>{c.commentary}</p>}
    </article>
  );
}
export function KeyMomentCard({
  moment,
  thumb,
  question,
  play,
}: {
  moment: KeyMoment;
  thumb?: string;
  question?: string;
  play: () => void;
}) {
  return (
    <article className="inset stack">
      {thumb ? (
        <Image
          src={thumb}
          alt=""
          unoptimized
          width={640}
          height={360}
          className="moment-thumb"
        />
      ) : (
        <div className="moment-placeholder">
          {question || "Interview moment"}
        </div>
      )}
      <div className="cluster between">
        <span
          className={
            "badge " + (moment.sentiment === "positive" ? "accent" : "warning")
          }
        >
          {moment.sentiment === "positive" ? "Positive" : "Improve"}
        </span>
        <small className="mono">
          {shortTime(moment.clipStartMs)}–{shortTime(moment.clipEndMs)}
        </small>
      </div>
      <h3>{moment.title}</h3>
      <div>
        <button className="button secondary" onClick={play}>
          <Play size={16} />
          Play clip
        </button>
      </div>
      {moment.transcriptExcerpt && (
        <blockquote>“{moment.transcriptExcerpt}”</blockquote>
      )}
      <dl className="stack-sm">
        <dt>
          <strong>What happened</strong>
        </dt>
        <dd>{moment.whatHappened}</dd>
        <dt>
          <strong>Why it matters</strong>
        </dt>
        <dd>{moment.whyItMatters}</dd>
        <dt>
          <strong>How to fix</strong>
        </dt>
        <dd>{moment.howToFix}</dd>
      </dl>
      {moment.betterAnswer && (
        <details>
          <summary>Better answer</summary>
          <p>{moment.betterAnswer}</p>
        </details>
      )}
    </article>
  );
}
const value = (n: number | null, unit = "") =>
  n === null
    ? "—"
    : (Number.isInteger(n) ? n : n.toFixed(1)) +
      (unit === "%" || unit === "×" ? "" : " ") +
      unit;
export function TurnAccordion({
  turn,
  onPlay,
  sources,
}: {
  turn: ReportTurn;
  onPlay?: () => void;
  sources: boolean;
}) {
  const s = turn.scores;
  return (
    <details className="turn-row">
      <summary>
        <span className="stack-sm">
          <small>{turn.label}</small>
          <strong>{turn.question || turn.label}</strong>
        </span>
        <span className="cluster">
          {sources && <SourceBadge source={turn.questionSource} />}
          {turn.outcome && turn.outcome !== "na" && (
            <span
              className={
                "badge " +
                (turn.outcome === "pass"
                  ? "accent"
                  : turn.outcome === "fail"
                    ? "danger"
                    : "warning")
              }
            >
              {readable(turn.outcome)}
            </span>
          )}
          {s && <span className="mono">{s.total.toFixed(1)} / 4</span>}
        </span>
      </summary>
      <div className="stack pt-3">
        <p>{turn.transcript || "No candidate transcript is available."}</p>
        {s && (
          <div className="grid-2">
            {Object.entries(s.rubric).map(([key, score]) => (
              <label className="stack-sm" key={key}>
                {readable(key)} · {score}/4 <progress max={4} value={score} />
              </label>
            ))}
          </div>
        )}
        {s && (s.strengths.length > 0 || s.gaps.length > 0) && (
          <div className="grid-2">
            <div>
              <strong>Strengths</strong>
              <ul>
                {s.strengths.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Gaps</strong>
              <ul>
                {s.gaps.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {turn.feedback && <p>{turn.feedback}</p>}
        {turn.idealOutline.length > 0 && (
          <div>
            <strong>Ideal outline</strong>
            <ul className="list-disc pl-5">
              {turn.idealOutline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {turn.tone && (
          <p>
            <span className="badge">{readable(turn.tone.label)}</span>{" "}
            {turn.tone.evidence}
          </p>
        )}
        {(turn.voice || turn.vision) && (
          <div className="cluster small">
            {turn.voice && (
              <span>
                Speaking pace {value(turn.voice.wpm, "wpm")} · Fillers{" "}
                {turn.voice.hardFillers + turn.voice.softFillers}
              </span>
            )}
            {turn.vision?.eyeContactPct != null && (
              <span>
                Eye contact {value(turn.vision.eyeContactPct * 100, "%")}
              </span>
            )}
          </div>
        )}
        {onPlay && (
          <div>
            <button className="button secondary" onClick={onPlay}>
              Play answer
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
function StatTable({
  title,
  rows,
  reviewer,
}: {
  title: string;
  rows: StatRow[];
  reviewer: boolean;
}) {
  return (
    <div className="scroll">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            {[
              "Metric",
              reviewer ? "Candidate" : "You",
              "Baseline",
              "Verdict",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.metric}>
              <th scope="row">{row.metric}</th>
              <td className="mono">{value(row.value, row.unit)}</td>
              <td className="mono">{value(row.baseline, row.unit)}</td>
              <td>
                {row.verdict && (
                  <span
                    className={
                      "badge " +
                      (row.verdict === "good"
                        ? "accent"
                        : row.verdict === "watch"
                          ? "warning"
                          : "danger")
                    }
                  >
                    {readable(row.verdict)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function StatsTable({
  stats,
  recruiter = false,
}: {
  stats: ReportData["stats"];
  recruiter?: boolean;
}) {
  return (
    <div className="grid-2">
      <StatTable
        title="Body language"
        rows={stats.vision}
        reviewer={recruiter}
      />
      <StatTable title="Voice" rows={stats.voice} reviewer={recruiter} />
    </div>
  );
}
export function PracticePlan({ items }: { items: PracticeDrill[] }) {
  return (
    <ol className="stack">
      {items.map((item, index) => (
        <li className="inset stack-sm" key={item.title}>
          <h3>
            {index + 1}. {item.title}
          </h3>
          <p>{item.why}</p>
          <p>{item.drill}</p>
          <small>Target · {item.targetMetric}</small>
        </li>
      ))}
    </ol>
  );
}
const section = [
  "Overview",
  "Technical",
  "Soft skills",
  "Composure",
  "Timeline",
  "Key moments",
  "Questions",
  "Stats",
  "Practice plan",
];
const sectionId = (title: string) => title.toLowerCase().replaceAll(" ", "-");
function SectionHead({ title, hint }: { title: string; hint: string }) {
  const Icon = sectionIcon[title] ?? Activity;
  return (
    <div className="section-head">
      <span className="section-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2>{title}</h2>
        <p className="section-hint">{hint}</p>
      </div>
    </div>
  );
}
const sectionIcon: Record<string, LucideIcon> = {
  Overview: Gauge,
  Technical: Brain,
  "Soft skills": MessageSquareText,
  Composure: HeartPulse,
  Timeline: Activity,
  "Key moments": CirclePlay,
  Questions: ListChecks,
  Stats: BarChart3,
  "Practice plan": Target,
};
export function ReportView({
  id,
  report,
  recruiter = false,
  candidate = false,
}: {
  id: string;
  report: ReportData;
  recruiter?: boolean;
  candidate?: boolean;
}) {
  const router = useRouter();
  const base = recruiter ? "/api/hiring/sessions/" + id : "/api/sessions/" + id;
  const [clip, setClip] = useState<Clip | null>(null);
  const [head, setHead] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const off = report.softSkills.policy === "off";
  const playback = useQuery({
    queryKey: ["playback", base],
    queryFn: () => requestJSON<Playback>(base + "/playback"),
    staleTime: 3000000,
    gcTime: 3000000,
  });
  const jump = (at: number) => {
    setHead(at);
    setClip({
      clipStartMs: at,
      clipEndMs: Math.min(report.timeline.durationMs, at + 25000),
    });
  };
  const playTurn = (turnIdx: number) => {
    const w = report.timeline.turns.find((turn) => turn.turnIdx === turnIdx);
    if (w)
      setClip({
        clipStartMs: w.answerStartMs ?? w.startMs,
        clipEndMs: w.endMs,
      });
  };
  async function certificate() {
    try {
      const result = await send<{ url: string }>(base + "/certificate", "POST");
      location.assign(result.url);
    } catch (error) {
      showError(error);
    }
  }
  const actions =
    recruiter || candidate ? null : (
      <div className="cluster no-print">
        {report.session.kind === "practice" && (
          <>
            <span title={report.eligibility.reasons.join(" ")}>
              <button
                className="button"
                disabled={!report.eligibility.certificate}
                onClick={() => void certificate()}
              >
                <Award size={16} />
                Get certificate
              </button>
            </span>
            <Link className="button secondary" href="/interview/new">
              Practice again
            </Link>
          </>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className="button ghost icon"
            aria-label="More report actions"
          >
            ···
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu">
              <DropdownMenu.Item
                className="menu-item danger"
                onSelect={() => setDeleteOpen(true)}
              >
                Delete session
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
  return (
    <div className={"report-layout " + (recruiter ? "recruiter-report" : "")}>
      <div className="stack">
        <ScoreHeader report={report} actions={actions} recruiter={recruiter} />
        {!recruiter && (
          <nav className="report-tabs no-print" aria-label="Report sections">
            {section
              .filter(
                (name) =>
                  !off || !["Soft skills", "Composure", "Stats"].includes(name),
              )
              .map((name) => {
                const Icon = sectionIcon[name];
                return (
                  <a key={name} href={"#" + sectionId(name)}>
                    <Icon size={16} aria-hidden="true" />
                    {name}
                  </a>
                );
              })}
          </nav>
        )}
        {recruiter && report.companyView && (
          <section className="card stack">
            <h2>Question coverage</h2>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Question",
                      "Source",
                      "Must-ask",
                      "Status",
                      "Score",
                      "Clip",
                    ].map((a) => (
                      <th scope="col" key={a}>
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.companyView.coverage.map((q) => (
                    <tr key={q.openingQuestionId}>
                      <td>{q.text}</td>
                      <td>
                        <SourceBadge source="company" />
                      </td>
                      <td>{q.mustAsk ? "Yes" : "Optional"}</td>
                      <td>
                        {q.status === "asked"
                          ? "Asked"
                          : q.status === "unasked"
                            ? "Not asked"
                            : "Skipped by candidate"}
                      </td>
                      <td>{q.total ?? "—"}</td>
                      <td>
                        {q.turnIdx !== null && (
                          <button
                            className="button ghost"
                            onClick={() => playTurn(q.turnIdx!)}
                          >
                            Play
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.companyView.coverage.length && (
              <p>No company questions were included.</p>
            )}
          </section>
        )}
        <section className="card stack" id="technical">
          <SectionHead
            title="Technical"
            hint="How far you got on each skill, from level 1 to level 5."
          />
          {!report.technical.competencies.length &&
            report.technical.companyQuestionsScore === null && (
              <p className="muted">No technical competencies were assessed.</p>
            )}
          <div className="grid-2">
            {report.technical.competencies.map((c) => (
              <CeilingLadder
                key={c.key}
                competency={c}
                expected={report.technical.expectedLevel}
                scripted={
                  report.session.kind !== "practice" &&
                  c.ceiling === null &&
                  !c.notAssessed
                }
              />
            ))}
          </div>
          {report.technical.companyQuestionsScore !== null && (
            <p className="inset">
              Company questions ·{" "}
              <strong>{report.technical.companyQuestionsScore} / 100</strong>
            </p>
          )}
        </section>
        {!off && (
          <section className="card stack" id="soft-skills">
            <div className="cluster between">
              <h2>
                {report.softSkills.policy === "coaching_only"
                  ? "Delivery insights (not scored)"
                  : "Soft skills & leadership maturity"}
              </h2>
              {report.softSkills.maturityLevel && (
                <span className="badge accent">
                  Level {report.softSkills.maturityLevel} ·{" "}
                  {report.softSkills.maturityLabel}
                </span>
              )}
            </div>
            <SoftSkillRadar
              candidates={[
                {
                  name: recruiter ? "Candidate score" : "Your score",
                  dimensions: report.softSkills.dimensions,
                },
              ]}
            />
            <div className="grid-2">
              {report.softSkills.dimensions.map((d) => (
                <article key={d.key} className="inset stack-sm">
                  <div className="cluster between">
                    <h3>{d.label}</h3>
                    <span className="mono">{d.score ?? "—"}</span>
                  </div>
                  {d.levelLabel && <small>{d.levelLabel}</small>}
                  {d.drivers
                    .filter((driver) => driver.value !== null)
                    .map((driver) => (
                      <small key={driver.name}>
                        {driver.name} {value(driver.value, driver.unit)}
                        {driver.baseline !== null &&
                          (recruiter
                            ? " · candidate baseline "
                            : " · your baseline ") +
                            value(driver.baseline, driver.unit)}
                      </small>
                    ))}
                  {d.commentary && <p>{d.commentary}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
        {report.composure && (
          <section className="card stack" id="composure">
            <SectionHead
              title="Composure"
              hint="How calm and steady you stayed as the questions got harder."
            />
            <ComposureCurve data={report.composure} />
          </section>
        )}
        <section className="card stack" id="timeline">
          <SectionHead
            title="Timeline"
            hint="Your interview minute by minute. Select any mark to replay that moment."
          />
          <TimelineTracks
            timeline={report.timeline}
            playhead={head}
            seek={setHead}
            jump={jump}
          />
        </section>
        <section className="card stack" id="key-moments">
          <SectionHead
            title="Key moments"
            hint="Short clips worth watching, each with one thing to try next time."
          />
          {report.keyMoments.length ? (
            <div className="grid-2">
              {report.keyMoments.map((item) => (
                <KeyMomentCard
                  key={item.id}
                  moment={item}
                  thumb={
                    item.eventId
                      ? playback.data?.snapshots[item.eventId]
                      : undefined
                  }
                  question={
                    report.turns.find((turn) => turn.turnIdx === item.turnIdx)
                      ?.question
                  }
                  play={() => setClip(item)}
                />
              ))}
            </div>
          ) : (
            <p>No key moments were identified in this interview.</p>
          )}
        </section>
        {recruiter && report.companyView && (
          <section className="card stack">
            <h2>Full transcript</h2>
            <ul className="stack">
              {report.companyView.transcript.map((line, i) => (
                <li key={i} className="inset stack-sm">
                  <div className="cluster">
                    <button
                      className="button ghost mono"
                      onClick={() => jump(line.startMs)}
                    >
                      {shortTime(line.startMs)}
                    </button>
                    <strong>{line.speaker}</strong>
                    {line.speaker === "Interviewer" && (
                      <SourceBadge source={line.questionSource} />
                    )}
                  </div>
                  <p>{line.text}</p>
                </li>
              ))}
            </ul>
            {!report.companyView.transcript.length && (
              <p>No transcript is available.</p>
            )}
          </section>
        )}
        <section className="card stack" id="questions">
          <SectionHead
            title="Questions"
            hint="Every question you were asked, with how your answer was rated."
          />
          {report.turns.map((turn) => (
            <TurnAccordion
              key={turn.turnIdx}
              turn={turn}
              sources={recruiter || report.session.kind === "preview"}
              onPlay={
                report.timeline.turns.some((w) => w.turnIdx === turn.turnIdx)
                  ? () => playTurn(turn.turnIdx)
                  : undefined
              }
            />
          ))}
        </section>
        {!off && (
          <section className="card stack" id="stats">
            <SectionHead
              title="Stats"
              hint="Numbers from your voice and delivery."
            />
            <StatsTable stats={report.stats} recruiter={recruiter} />
          </section>
        )}
        {recruiter && "flags" in report.integrity && (
          <section className="card stack">
            <h2>Integrity details</h2>
            {report.integrity.flags.length ? (
              <ul className="stack-sm">
                {report.integrity.flags.map((item) => (
                  <li key={item.type}>
                    {readable(item.type)} · {item.count} ·{" "}
                    {shortTime(item.totalMs)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No integrity flags were recorded.</p>
            )}
          </section>
        )}
        {recruiter && Boolean(report.companyView?.githubProjects.length) && (
          <section className="card stack">
            <h2>Projects discussed</h2>
            {report.companyView?.githubProjects.map((item) => (
              <div className="stack-sm" key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.name}
                </a>
                <p>{item.summary}</p>
              </div>
            ))}
          </section>
        )}
        <section className="card stack" id="practice-plan">
          <SectionHead
            title="Practice plan"
            hint="Drills to practice before your next interview."
          />
          <PracticePlan items={report.practicePlan} />
        </section>
      </div>
      {clip && playback.data && (
        <ClipPlayer
          key={clip.clipStartMs + "-" + clip.clipEndMs}
          clip={clip}
          playback={playback.data}
          close={() => setClip(null)}
          onTime={setHead}
          onTimeline={(at) => {
            setHead(at);
            document.getElementById("timeline")?.scrollIntoView();
          }}
        />
      )}
      {clip && !playback.data && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) setClip(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="card dialog-content stack">
              <Dialog.Title>Interview clip</Dialog.Title>
              <Dialog.Description>
                {playback.isError
                  ? errorMessage(playback.error)
                  : "Loading recording…"}
              </Dialog.Description>
              <Dialog.Close className="button">Close</Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="card dialog-content stack">
            <Dialog.Title>Delete this session?</Dialog.Title>
            <Dialog.Description>
              This removes the recording and report from your account.
            </Dialog.Description>
            <div className="cluster">
              <Dialog.Close className="button secondary">Cancel</Dialog.Close>
              <button
                className="button danger"
                onClick={() => {
                  void send(base, "DELETE").then(
                    () => router.push("/dashboard"),
                    showError,
                  );
                }}
              >
                Delete session
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

type ReportResponse = {
  status: string;
  data: ReportData | CandidateSummary | null;
  error: string | null;
};
export function InterviewReport({
  id,
  company,
}: {
  id: string;
  company?: string;
}) {
  const query = useQuery({
    queryKey: ["report", id],
    queryFn: () =>
      requestJSON<ReportResponse>("/api/sessions/" + id + "/report"),
  });
  const result = query.data;
  if (query.isPending) return <p role="status">Loading report…</p>;
  if (query.isError || result?.error)
    return (
      <section className="card stack">
        <p className="danger" role="alert">
          {result?.error ?? errorMessage(query.error)}
        </p>
        <button className="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </section>
    );
  const data = result?.data;
  return (
    <div className="stack">
      {company && (
        <div className="card stack">
          <h1>Thank you!</h1>
          <p>{company} will review your interview and get back to you.</p>
          <div>
            <Link href="/dashboard" className="button secondary">
              Back to dashboard
            </Link>
          </div>
        </div>
      )}
      {data && "version" in data && (
        <ReportView id={id} report={data} candidate={Boolean(company)} />
      )}
      {data && "summary" in data && (
        <>
          <div className="grid-2">
            <section className="card stack">
              <h2>Your top strengths</h2>
              <ul className="list-disc pl-5">
                {data.summary.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="card stack">
              <h2>Areas to work on</h2>
              <ul className="list-disc pl-5">
                {data.summary.growthAreas.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
          <div className="card stack">
            <SectionHead
              title="Practice plan"
              hint="Drills to practice before your next interview."
            />
            <PracticePlan items={data.practicePlan} />
          </div>
        </>
      )}
    </div>
  );
}
