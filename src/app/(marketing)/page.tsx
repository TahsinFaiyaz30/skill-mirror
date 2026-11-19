import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Gauge,
  Layers3,
  Lock,
  Play,
  ScanFace,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Brand } from "@/components/shell/brand";

const steps = [
  [
    FileText,
    "Upload your CV",
    "Start with the experience and skills you want to put to the test.",
  ],
  [
    Layers3,
    "AI plans your interview",
    "Get questions shaped by the role, seniority and your own projects.",
  ],
  [
    Video,
    "Live adaptive interview",
    "Answer out loud as the interviewer probes, adjusts and follows up.",
  ],
  [
    Activity,
    "Timestamped feedback report",
    "Replay key moments and practice with specific drills.",
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

const phases = [
  ["Intro", "done"],
  ["Your experience", "done"],
  ["Technical", "now"],
  ["Behavioral", ""],
  ["Your questions", ""],
  ["Wrap-up", ""],
] as const;

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
              <a href="#what-we-measure">What we measure</a>
              <a href="#sample-report">Report</a>
              <a href="#hiring">For hiring teams</a>
              <a href="#faq">FAQ</a>
            </nav>
          </div>
          <div className="cluster" style={{ gap: 8 }}>
            <Link className="lp-login" href="/login">
              Log in
            </Link>
            <Link className="button" href="/signup">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-pill">
                <span className="lp-pill-dot" aria-hidden="true" />
                AI interviewer for practice and hiring
              </span>
              <h1 className="lp-title">
                Pressure-tested <span className="grad-text">interviews.</span>
              </h1>
              <p className="lp-lead">
                An AI interviewer that adapts to your level, reads your body
                language and voice, and shows you exactly what to fix, with
                video proof.
              </p>
              <div className="lp-cta">
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
              <ul className="lp-points">
                <li>
                  <Check size={16} aria-hidden="true" />
                  Adapts after every answer
                </li>
                <li>
                  <Check size={16} aria-hidden="true" />
                  Reads body language and voice
                </li>
                <li>
                  <Check size={16} aria-hidden="true" />
                  Video proof for every note
                </li>
              </ul>
              <a className="lp-sample-link" href="#sample-report">
                See a sample report
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>

            <div className="lp-visual" aria-hidden="true">
              <div className="lp-float one">
                <span className="lp-float-label">Technical ceiling</span>
                <span className="lp-float-value">
                  Level 5 <span className="lp-up">▲ 1</span>
                </span>
                <small>Difficulty raised after a strong answer</small>
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
                  <span>Technical · System design</span>
                  <span className="mono lp-timer">12:48</span>
                </div>
                <div className="lp-stage">
                  <div className="lp-orb-wrap">
                    <span className="lp-ripple" />
                    <span className="lp-ripple" />
                    <div className="orb" />
                  </div>
                  <p className="lp-speaker">
                    <b>Interviewer</b> · <em>Speaking</em>
                  </p>
                  <div className="lp-question">
                    <span className="eyebrow" style={{ justifySelf: "center" }}>
                      Question 4
                    </span>
                    <h3>
                      How would your design handle a sudden spike in traffic?
                    </h3>
                  </div>
                  <div className="lp-wave">
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
                  </div>
                </div>
                <div className="lp-phases">
                  {phases.map(([label, state]) => (
                    <span
                      key={label}
                      className={
                        "badge " +
                        (state === "now"
                          ? "primary"
                          : state === "done"
                            ? "accent"
                            : "")
                      }
                    >
                      {state === "done" ? "✓ " : ""}
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="lp-float two">
                <span className="lp-float-label">Live signals</span>
                <span className="lp-signal">
                  Gaze <b>steady</b>
                </span>
                <span className="lp-signal">
                  Posture <b>upright</b>
                </span>
                <span className="lp-signal">
                  Pace <b>142 wpm</b>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="lp-marquee">
          <p className="lp-marquee-label">Practice for the role you want</p>
          <div className="lp-marquee-track">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="lp-marquee-group"
                aria-hidden={copy === 1 ? true : undefined}
              >
                {roles.map((role) => (
                  <span key={role}>{role}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section id="how-it-works" className="lp-section">
          <div className="container">
            <div className="lp-section-head">
              <span className="eyebrow">How it works</span>
              <h2 className="lp-h2">
                From CV to <span className="grad-text">video-proof</span>{" "}
                feedback.
              </h2>
              <p className="lp-sub">
                Four steps, one interview engine. The same flow powers practice
                sessions and company interviews.
              </p>
            </div>
            <div className="lp-steps">
              {steps.map(([Icon, title, detail], index) => (
                <article className="lp-step" key={title}>
                  <div className="lp-step-top">
                    <span className="lp-icon">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span className="lp-step-num">0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="what-we-measure" className="lp-section">
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
                      Level 6<span>—</span>
                    </div>
                    <div className="now">
                      Level 5<span>Now</span>
                    </div>
                    <div className="pass">
                      Level 4<span>✓</span>
                    </div>
                    <div className="pass">
                      Level 3<span>✓</span>
                    </div>
                    <div className="pass">
                      Level 2<span>✓</span>
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
                    <g fill="none" stroke="#2fe08a" strokeWidth="1.5">
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
                        stroke="#7ef5c3"
                        strokeOpacity="0.45"
                        strokeDasharray="2 4"
                      />
                    </g>
                    <g fill="#2fe08a">
                      <circle cx="138" cy="56" r="3.5" />
                      <circle cx="162" cy="56" r="3.5" />
                      <circle cx="150" cy="72" r="3" />
                      <circle cx="150" cy="116" r="3.5" />
                      <circle cx="90" cy="132" r="4" />
                      <circle cx="210" cy="132" r="4" />
                      <circle cx="76" cy="166" r="3" />
                      <circle cx="224" cy="166" r="3" />
                    </g>
                    <g fill="#7ef5c3">
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

        <section id="sample-report" className="lp-section">
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

        <section className="lp-section" style={{ paddingTop: 0 }}>
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

        <section id="faq" className="lp-section" style={{ paddingTop: 0 }}>
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
                Upload your CV, pick the role, and get pressure-tested in 10 or
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
                Pressure-tested interviews. Every answer, every gesture, every
                second.
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
