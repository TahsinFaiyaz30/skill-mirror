import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  AudioLines,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Gauge,
  Lock,
  MessagesSquare,
  Mic,
  Play,
  ScanFace,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { PRACTICE_TEMPLATES } from "@/lib/config/constants";
import { PHASE_LABELS } from "@/lib/config/taxonomy";

// The same order the app uses: name the interview, add a CV, talk, read.
const steps = [
  [
    BriefcaseBusiness,
    "Name your interview",
    "Pick the role, company and seniority, then choose 10 or 20 minutes.",
  ],
  [
    FileText,
    "Upload your CV",
    "Your skills, experience and projects shape every question you get.",
  ],
  [
    Video,
    "Talk it through",
    "Answer out loud. The interviewer probes, adjusts and follows up.",
  ],
  [
    Activity,
    "Read your report",
    "Get a score, replay key moments and practice with specific drills.",
  ],
] as const;

const roles = [
  "Backend Engineer",
  "Product Manager",
  "Data Scientist",
  "Frontend Engineer",
  "ML Engineer",
  "UX Researcher",
  "DevOps Engineer",
  "Data Analyst",
  "Mobile Developer",
  "Security Engineer",
  "Data Engineer",
  "Product Designer",
];

// The hero mock follows the real 20-minute practice plan, 9:40 in.
const elapsed = 580;
let phaseStart = 0;
const timeline = Object.entries(PRACTICE_TEMPLATES[20].budgets).map(
  ([phase, ms]) => {
    const start = phaseStart;
    phaseStart += ms / 1000;
    return {
      label: PHASE_LABELS[phase as keyof typeof PHASE_LABELS],
      seconds: ms / 1000,
      progress: Math.min(1, Math.max(0, (elapsed - start) / (ms / 1000))),
    };
  },
);
const total = phaseStart;
const current = timeline.findIndex((phase) => phase.progress < 1);
// Key moments at 04:22 (the one in the sample report below) and 08:05.
const moments = [262, 485];
const clock = (seconds: number) =>
  String(Math.floor(seconds / 60)).padStart(2, "0") +
  ":" +
  String(seconds % 60).padStart(2, "0");

const wave = [
  10, 18, 26, 14, 30, 22, 34, 16, 24, 32, 12, 28, 20, 34, 18, 26, 12, 30, 22,
  16, 28, 14, 24, 10,
];

const voice = [
  38, 52, 61, 47, 70, 58, 0, 0, 44, 66, 73, 55, 22, 63, 69, 51, 0, 48, 57, 64,
  40, 59, 71, 46,
];

const candidates = [
  {
    initials: "CA",
    label: "Candidate A",
    score: 84,
    bars: [86, 78],
    top: true,
  },
  {
    initials: "CB",
    label: "Candidate B",
    score: 71,
    bars: [70, 64],
    top: false,
  },
];

const faqs = [
  [
    "What do I need to take an interview?",
    "Desktop Chrome or Edge with a camera and microphone. Before you start, setup checks your framing, posture, gaze, microphone and audio so the interviewer can read you clearly.",
  ],
  [
    "How does the interview adapt to me?",
    "The interviewer plans questions from the role, seniority and your CV, then raises or lowers difficulty after each answer. Vague answers get follow-ups, just like a real panel.",
  ],
  [
    "What's in the feedback report?",
    "An overall score, your technical ceiling, delivery insights on voice and body language, and timestamped key moments you can replay as video clips, each with a specific drill to practice.",
  ],
  [
    "Can my company run first-round interviews?",
    "Yes. Hiring teams create openings with their own must-ask questions or fully automatic interviews, invite candidates with a link, and compare candidates side by side. AI follow-ups are labelled separately from your questions.",
  ],
  [
    "Who can see my recording?",
    "Camera preview is visible only during setup. Recording retention and sharing are explained before every interview, and recordings are kept for 30 days by default.",
  ],
] as const;

export default function Landing() {
  return (
    <div className="lp">
      <header className="nav">
        <div className="container nav-inner">
          <div className="nav-left">
            <Brand />
            <nav className="lp-nav-links" aria-label="Sections">
              <a href="#how-it-works">How it works</a>
              <a href="#what-we-measure">Features</a>
              <a href="#sample-report">Report</a>
              <a href="#hiring">For teams</a>
              <a href="#faq">FAQ</a>
            </nav>
          </div>
          <div className="cluster" style={{ gap: 8 }}>
            <Link className="lp-login" href="/login">
              Log in
            </Link>
            <Link className="button sm" href="/signup">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-kicker">
                AI-powered video interview practice
              </span>
              <h1 className="lp-title">
                AI mock interviews that show you{" "}
                <span className="grad-text">exactly what to fix.</span>
              </h1>
              <p className="lp-tagline">
                Practice out loud. Get scored. Replay every moment.
              </p>
              <p className="lp-lead">
                An interviewer that adapts to your level, reads your voice and
                body language, and backs every note with video.
              </p>
              <div className="lp-cta">
                <Link className="button lg" href="/signup">
                  Start practicing free
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="button secondary lg" href="#how-it-works">
                  See how it works
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
              </div>
              <ul className="lp-chips">
                <li className="hot">
                  <Check size={15} aria-hidden="true" />
                  Free to practice
                </li>
                <li>
                  <BriefcaseBusiness size={15} aria-hidden="true" />
                  11 tech and product roles
                </li>
                <li>
                  <Clock size={15} aria-hidden="true" />
                  10 or 20 minutes
                </li>
              </ul>
              <Link className="lp-sample-link" href="/signup?intent=hiring">
                Hiring? Run first-round interviews with AI
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="lp-visual" aria-hidden="true">
              <div className="lp-float one">
                <span className="lp-float-label">Adaptive difficulty</span>
                <span className="lp-level">
                  <span className="lp-float-value">
                    Level 4<small>/ 5</small>
                    <span className="lp-up">▲</span>
                  </span>
                  <span className="lp-level-bars">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <i
                        key={level}
                        className={
                          level < 4 ? "done" : level === 4 ? "now" : undefined
                        }
                        style={{ height: 4 + level * 4 }}
                      />
                    ))}
                  </span>
                </span>
                <small>Up from level 3 after a strong answer</small>
              </div>
              <div className="lp-window">
                <div className="lp-window-bar">
                  <span className="cluster" style={{ gap: 14 }}>
                    <span className="lp-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="lp-live">
                      <i />
                      LIVE
                    </span>
                  </span>
                  <span>Backend Engineer</span>
                  <span className="lp-timer">
                    <span className="tracking-dot green" />
                    <span className="mono">
                      {clock(elapsed)} / {clock(total)}
                    </span>
                  </span>
                </div>
                <div className="lp-stage">
                  <div className="lp-orb-wrap">
                    <div className="orb" />
                  </div>
                  <p className="lp-speaker">
                    <b>Interviewer</b> · <em>Listening</em>
                  </p>
                  <div className="lp-question">
                    <span className="eyebrow" style={{ justifySelf: "center" }}>
                      Technical · System Design
                    </span>
                    <h3>
                      How would your design handle a sudden spike in traffic?
                    </h3>
                  </div>
                  <div className="lp-answer">
                    <Mic size={14} />
                    <span className="lp-wave">
                      {wave.map((height, index) => (
                        <span
                          key={index}
                          style={
                            {
                              "--h": height + "px",
                              "--d": -(index * 0.09).toFixed(2) + "s",
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </span>
                    <span className="mono">01:12</span>
                  </div>
                </div>
                <div className="lp-progress">
                  <div className="lp-progress-head">
                    <span>
                      Phase {current + 1} of {timeline.length} ·{" "}
                      <b>{timeline[current].label}</b>
                    </span>
                    <span className="lp-saved">
                      <Bookmark size={13} />
                      {moments.length} key moments
                    </span>
                  </div>
                  <div className="lp-track">
                    {timeline.map(({ label, seconds, progress }) => (
                      <span
                        key={label}
                        className={
                          progress === 1 ? "done" : progress > 0 ? "now" : ""
                        }
                        style={{ flexGrow: seconds }}
                      >
                        <i style={{ width: progress * 100 + "%" }} />
                      </span>
                    ))}
                    {moments.map((at) => (
                      <b key={at} style={{ left: (at / total) * 100 + "%" }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="lp-float two">
                <span className="lp-float-head">
                  <span className="lp-float-label">Live signals</span>
                  <small>vs. your baseline</small>
                </span>
                <span className="lp-signal">
                  Gaze
                  <svg viewBox="0 0 48 12" className="lp-spark">
                    <line x1="0" y1="6" x2="48" y2="6" />
                    <polyline points="0,6 6,5 12,6 18,4 24,6 30,5 36,7 42,6 48,6" />
                  </svg>
                  <b>steady</b>
                </span>
                <span className="lp-signal">
                  Posture
                  <svg viewBox="0 0 48 12" className="lp-spark">
                    <line x1="0" y1="6" x2="48" y2="6" />
                    <polyline points="0,5 8,5 14,6 20,9 26,7 32,5 40,5 48,5" />
                  </svg>
                  <b>upright</b>
                </span>
                <span className="lp-signal">
                  Pace
                  <span className="lp-range">
                    <i />
                  </span>
                  <b>142 wpm</b>
                </span>
                <span className="lp-signal warn">
                  Fillers
                  <span className="lp-ticks">
                    <i />
                    <i />
                  </span>
                  <b>um ×2</b>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-statement" aria-label="What SkillMirror is">
          <div className="container">
            <p>
              <span>SkillMirror is an AI interview practice platform.</span> You
              answer real questions out loud while a live AI interviewer adapts
              to every answer. It reads your voice and body language, scores
              your technical depth from level 1 to 5, and then shows you what to
              change, with the video to prove it.
            </p>
            <ul className="lp-stat-row">
              <li>
                <MessagesSquare size={20} aria-hidden="true" />
                <b>Adaptive</b>
                <span>difficulty after every answer</span>
              </li>
              <li>
                <ScanFace size={20} aria-hidden="true" />
                <b>Body language</b>
                <span>read against your own baseline</span>
              </li>
              <li>
                <Play size={20} aria-hidden="true" />
                <b>Video proof</b>
                <span>for every key moment</span>
              </li>
            </ul>
          </div>
        </section>

        <div className="lp-roles">
          <div className="container">
            <p>Practice for the role you want</p>
            <ul>
              {roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </div>
        </div>

        <section id="how-it-works" className="lp-section">
          <div className="container">
            <div className="lp-section-head">
              <span className="eyebrow">How it works</span>
              <h2 className="lp-h2">
                How a SkillMirror interview{" "}
                <span className="grad-text">works.</span>
              </h2>
              <p className="lp-sub">
                Four steps, about 20 minutes, and a report you can act on the
                same day.
              </p>
            </div>
            <ol className="lp-steps">
              {steps.map(([Icon, title, detail], index) => (
                <li className="lp-step" key={title}>
                  <div className="lp-step-top">
                    <span className="lp-icon">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                  </div>
                  <h3>
                    <span className="lp-step-num">{index + 1}</span>
                    {title}
                  </h3>
                  <p>{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="what-we-measure" className="lp-section lp-alt">
          <div className="container">
            <div className="lp-section-head">
              <span className="eyebrow">What we measure</span>
              <h2 className="lp-h2">
                Every answer. Every gesture.{" "}
                <span className="grad-text">Every second.</span>
              </h2>
              <p className="lp-sub">
                SkillMirror listens to what you say and watches how you say it,
                then ties every observation to the moment it happened.
              </p>
            </div>
            <div className="lp-measures">
              <article className="lp-measure">
                <div className="lp-viz" aria-hidden="true">
                  <div className="lp-ladder">
                    <div>
                      Level 5<span>—</span>
                    </div>
                    <div className="now">
                      Level 4<span>Now</span>
                    </div>
                    <div className="pass">
                      Level 3<span>✓</span>
                    </div>
                    <div className="pass">
                      Level 2<span>✓</span>
                    </div>
                    <div className="pass">
                      Level 1<span>✓</span>
                    </div>
                  </div>
                </div>
                <span className="lp-icon">
                  <Gauge size={22} aria-hidden="true" />
                </span>
                <h3>Technical ceiling</h3>
                <p>Difficulty adapts after each answer.</p>
              </article>
              <article className="lp-measure">
                <div className="lp-viz" aria-hidden="true">
                  <svg className="lp-pose" viewBox="0 0 300 168">
                    <g fill="none" stroke="#fd7c68" strokeWidth="1.5">
                      <ellipse
                        cx="150"
                        cy="62"
                        rx="30"
                        ry="36"
                        strokeOpacity="0.35"
                        strokeDasharray="4 5"
                      />
                      <path
                        d="M150 98v18M90 132l60-16 60 16M90 132l-14 34M210 132l14 34"
                        strokeOpacity="0.75"
                      />
                      <path
                        d="M138 56l-60-26M162 56l60-26"
                        stroke="#fdc458"
                        strokeOpacity="0.45"
                        strokeDasharray="2 4"
                      />
                    </g>
                    <g fill="#fd7c68">
                      <circle cx="138" cy="56" r="3.5" />
                      <circle cx="162" cy="56" r="3.5" />
                      <circle cx="150" cy="72" r="3" />
                      <circle cx="150" cy="116" r="3.5" />
                      <circle cx="90" cy="132" r="4" />
                      <circle cx="210" cy="132" r="4" />
                      <circle cx="76" cy="166" r="3" />
                      <circle cx="224" cy="166" r="3" />
                    </g>
                    <g fill="#fdc458">
                      <circle cx="74" cy="28" r="5" fillOpacity="0.25" />
                      <circle cx="74" cy="28" r="2.5" />
                      <circle cx="226" cy="28" r="5" fillOpacity="0.25" />
                      <circle cx="226" cy="28" r="2.5" />
                    </g>
                  </svg>
                </div>
                <span className="lp-icon">
                  <ScanFace size={22} aria-hidden="true" />
                </span>
                <h3>Body language</h3>
                <p>Gaze, posture and gestures relative to your baseline.</p>
              </article>
              <article className="lp-measure">
                <div className="lp-viz" aria-hidden="true">
                  <div className="lp-voice">
                    <div className="lp-voice-head">
                      <span>
                        Pace <b>142 wpm</b>
                      </span>
                      <span>
                        Fillers <b>2</b>
                      </span>
                    </div>
                    <div className="lp-voice-bars">
                      {voice.map((height, index) => (
                        <span
                          key={index}
                          className={
                            height === 0
                              ? "pause"
                              : index === 12
                                ? "filler"
                                : ""
                          }
                          style={
                            {
                              "--h": (height || 8) + "%",
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <span className="lp-icon">
                  <AudioLines size={22} aria-hidden="true" />
                </span>
                <h3>Voice and tone</h3>
                <p>Speaking pace, pauses, fillers and delivery.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="sample-report" className="lp-section lp-deep">
          <div className="container lp-report">
            <div className="stack" style={{ gap: 22 }}>
              <span className="eyebrow">Sample report</span>
              <h2 className="lp-h2">
                Feedback you can <span className="grad-text">replay.</span>
              </h2>
              <p className="lp-sub">
                A sample score and timestamped coaching moment. Every note in
                your report links back to the second it happened.
              </p>
              <ul className="lp-checklist">
                {[
                  "Overall score with a clear hiring signal",
                  "Technical ceiling across the competencies you were tested on",
                  "Delivery insights from your voice and body language",
                  "Key moments as video clips, each with a drill to practice",
                ].map((item) => (
                  <li key={item}>
                    <span className="lp-check">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-report-card" aria-hidden="true">
              <div className="lp-report-top">
                <div className="stack-sm" style={{ gap: 4 }}>
                  <span className="eyebrow">Interview report</span>
                  <strong>Backend Engineer · 20 min</strong>
                </div>
                <span className="badge accent">Hire signal</span>
              </div>
              <div className="lp-score">
                <div className="lp-ring">
                  <div>
                    <strong>78</strong>
                    <small>/ 100</small>
                  </div>
                </div>
                <div className="lp-bars">
                  {[
                    ["Clarity & structure", 82],
                    ["Composure", 76],
                    ["Ownership", 71],
                    ["Vocal confidence", 68],
                  ].map(([label, value]) => (
                    <div className="lp-bar" key={label}>
                      <span>{label}</span>
                      <span className="lp-bar-track">
                        <span
                          style={{ "--v": value + "%" } as React.CSSProperties}
                        />
                      </span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-moment">
                <div className="lp-thumb">
                  <span className="lp-play">
                    <Play size={16} fill="currentColor" />
                  </span>
                  <span className="lp-time">04:22–04:43</span>
                </div>
                <div className="stack-sm" style={{ alignContent: "center" }}>
                  <span
                    className="badge warning"
                    style={{ width: "fit-content" }}
                  >
                    Key moment
                  </span>
                  <h4>Explain the tradeoff earlier</h4>
                  <p>
                    State your constraint, compare two options, and explain why
                    your choice fits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="hiring" className="lp-section">
          <div className="container">
            <div className="lp-hiring">
              <div className="stack" style={{ gap: 22 }}>
                <span className="eyebrow">For hiring teams</span>
                <h2 className="lp-h2">
                  Run real first-round interviews{" "}
                  <span className="grad-text">with AI.</span>
                </h2>
                <p className="lp-sub">
                  Publish an opening, share an invite link, and review
                  structured reports with recordings, not gut feel.
                </p>
                <ul className="lp-checklist">
                  {[
                    "Your own must-ask questions or fully automatic interviews",
                    "AI follow-ups labelled separately from your questions",
                    "Side-by-side candidate comparison",
                    "Fair-by-default body-language settings",
                  ].map((item) => (
                    <li key={item}>
                      <span className="lp-check">
                        <Check size={14} strokeWidth={3} aria-hidden="true" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div>
                  <Link className="button lg" href="/signup?intent=hiring">
                    Hire with AI interviews
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <div className="lp-compare" aria-hidden="true">
                <div className="cluster between">
                  <strong>Compare candidates</strong>
                  <span className="badge">2 selected</span>
                </div>
                {candidates.map((candidate) => (
                  <div
                    key={candidate.label}
                    className={"lp-compare-row" + (candidate.top ? " top" : "")}
                  >
                    <span className="avatar">{candidate.initials}</span>
                    <div>
                      <strong style={{ fontSize: 14 }}>
                        {candidate.label}
                      </strong>
                      <div className="lp-mini-bars">
                        {candidate.bars.map((value, index) => (
                          <span
                            key={index}
                            style={
                              { "--v": value + "%" } as React.CSSProperties
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <span className="lp-score-chip">{candidate.score}</span>
                  </div>
                ))}
                <div className="lp-qa">
                  <span className="badge">Your question</span>
                  Walk me through a migration you led end to end.
                  <span className="badge primary">⚡ AI follow-up</span>
                  How did you roll it back when the error rate climbed?
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-alt">
          <div className="container">
            <div className="lp-section-head center">
              <span className="eyebrow">Privacy by design</span>
              <h2 className="lp-h2">You stay in control of your data.</h2>
            </div>
            <div className="lp-trust">
              {[
                [
                  Eye,
                  "Preview only during setup",
                  "Camera preview is visible only during setup, so you can frame yourself without distraction.",
                ],
                [
                  ShieldCheck,
                  "Explained before every interview",
                  "Recording retention and sharing are explained before every interview starts.",
                ],
                [
                  Clock,
                  "Recordings expire",
                  "Recordings are retained for 30 days by default. Delete your data at any time from settings.",
                ],
              ].map(([Icon, title, text]) => {
                const TrustIcon = Icon as typeof Eye;
                return (
                  <article className="lp-trust-item" key={String(title)}>
                    <span className="lp-icon">
                      <TrustIcon size={22} aria-hidden="true" />
                    </span>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <div className="container">
            <div className="lp-section-head center">
              <span className="eyebrow">FAQ</span>
              <h2 className="lp-h2">Questions, answered.</h2>
            </div>
            <div className="lp-faq">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <ChevronDown size={20} aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="lp-cta-band">
              <span className="lp-pill">
                <Lock size={13} aria-hidden="true" style={{ marginLeft: 4 }} />
                Practice reports are private to you
              </span>
              <h2 className="lp-h2">
                Walk into your next interview{" "}
                <span className="grad-text">already tested.</span>
              </h2>
              <p className="lp-sub">
                Name the role, upload your CV, and get pressure-tested in 10 or
                20 minutes.
              </p>
              <div className="lp-cta" style={{ justifyContent: "center" }}>
                <Link className="button lg" href="/signup">
                  Start practicing
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link
                  className="button secondary lg"
                  href="/signup?intent=hiring"
                >
                  Hire with AI interviews
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="container">
          <div className="lp-footer-grid">
            <div className="stack" style={{ alignContent: "start" }}>
              <Brand />
              <p className="muted" style={{ maxWidth: 300 }}>
                AI mock interviews that show you exactly what to fix. Every
                answer, every gesture, every second.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href="#how-it-works">How it works</a>
                </li>
                <li>
                  <a href="#what-we-measure">What we measure</a>
                </li>
                <li>
                  <a href="#sample-report">Sample report</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Teams</h4>
              <ul>
                <li>
                  <a href="#hiring">For hiring teams</a>
                </li>
                <li>
                  <Link href="/signup?intent=hiring">Create an opening</Link>
                </li>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Account</h4>
              <ul>
                <li>
                  <Link href="/login">Log in</Link>
                </li>
                <li>
                  <Link href="/signup">Sign up</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>
              International AI Builders Congress 2026 · LearnSphere / Workforce
              Ready
            </span>
            <span>Runs in desktop Chrome or Edge</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
