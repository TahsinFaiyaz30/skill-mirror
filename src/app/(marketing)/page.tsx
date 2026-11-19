import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Clock,
  ClipboardCheck,
  Eye,
  FileText,
  Lock,
  MessagesSquare,
  Mic,
  Play,
  ShieldCheck,
  UserRound,
  Video,
} from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { Brand } from "@/components/shell/brand";
import { PRACTICE_TEMPLATES } from "@/lib/config/constants";
import { PHASE_LABELS } from "@/lib/config/taxonomy";

// What the product does, in three plain sentences.
const does = [
  [
    MessagesSquare,
    "It asks you real questions",
    "An AI interviewer asks questions based on your CV, the role and the company, and follows up like a real panel.",
  ],
  [
    Video,
    "It listens and watches",
    "You answer out loud on camera. It notes what you say and how you say it: pace, pauses, eye contact and posture.",
  ],
  [
    ClipboardCheck,
    "It tells you what to fix",
    "You get a score, your strengths, what to improve and short video clips of the moments that mattered.",
  ],
] as const;

// The same order the app uses: name the interview, add a CV, talk, read.
const steps = [
  [
    BriefcaseBusiness,
    "Name your interview",
    "Pick the role, company and level, then choose 10 or 20 minutes.",
  ],
  [
    FileText,
    "Upload your CV",
    "Your skills, experience and projects shape the questions.",
  ],
  [
    Mic,
    "Answer out loud",
    "Talk to the AI interviewer in Chrome or Edge with your camera on.",
  ],
  [
    ClipboardCheck,
    "Read your report",
    "See your score, replay key moments and practice the drills.",
  ],
] as const;

const reportItems = [
  "An overall score out of 100",
  "Your technical level for each skill, from 1 to 5",
  "Notes on your voice and body language",
  "Video clips of key moments, each with one thing to practice",
];

const audiences = [
  {
    icon: UserRound,
    title: "For job seekers",
    points: [
      "Practice for the exact role and company",
      "Reports are private to you",
      "Track your scores over time",
    ],
    cta: "Start practicing",
    href: "/signup",
  },
  {
    icon: Building2,
    title: "For hiring teams",
    points: [
      "Publish an opening with your own questions",
      "Invite candidates with a link",
      "Compare structured reports side by side",
    ],
    cta: "Hire with AI interviews",
    href: "/signup?intent=hiring",
  },
] as const;

const privacy = [
  [
    Eye,
    "Camera preview only during setup",
    "You see yourself only while you check your framing.",
  ],
  [
    ShieldCheck,
    "Explained before you start",
    "Every interview explains what is recorded and who sees it.",
  ],
  [
    Clock,
    "Recordings expire",
    "Recordings are deleted after 30 days by default. Delete your data any time.",
  ],
] as const;

const faqs = [
  [
    "What does SkillMirror do?",
    "It runs a practice job interview with an AI interviewer. You answer questions out loud on camera, and afterwards you get a report that shows what went well and what to improve, with video clips as proof.",
  ],
  [
    "What do I need?",
    "Desktop Chrome or Edge with a camera and microphone. Before you start, a short setup checks your framing, posture, gaze, microphone and audio.",
  ],
  [
    "How long does an interview take?",
    "You choose 10 or 20 minutes. The 20 minute interview adds time for your own questions at the end.",
  ],
  [
    "Who can see my practice report?",
    "Only you. Company interviews are different: the company that invited you receives your recording, transcript, evaluation and a summary of your CV, and this is explained before you start.",
  ],
  [
    "Can my company use it for hiring?",
    "Yes. Hiring teams create openings with their own questions, invite candidates with a link, and compare candidates side by side. AI follow-up questions are labelled separately from your questions.",
  ],
] as const;

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
const moments = [262, 485];
const clock = (seconds: number) =>
  String(Math.floor(seconds / 60)).padStart(2, "0") +
  ":" +
  String(seconds % 60).padStart(2, "0");
const wave = [
  10, 18, 26, 14, 30, 22, 34, 16, 24, 32, 12, 28, 20, 34, 18, 26, 12, 30, 22,
  16, 28, 14, 24, 10,
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="nav">
        <div className="container nav-inner">
          <div className="nav-left">
            <Brand />
            <nav className="lp-nav-links" aria-label="Sections">
              <a href="#what-it-does">What it does</a>
              <a href="#how-it-works">How it works</a>
              <a href="#report">Your report</a>
              <a href="#who-its-for">Who it&apos;s for</a>
              <a href="#faq">FAQ</a>
            </nav>
          </div>
          <div className="cluster" style={{ gap: 8 }}>
            <Link className="lp-login" href="/login">
              Log in
            </Link>
            <Link className="button sm" href="/signup">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-kicker">AI interview practice</span>
              <h1 className="lp-title">
                Practice job interviews with an{" "}
                <span className="grad-text">AI interviewer.</span>
              </h1>
              <p className="lp-lead">
                SkillMirror asks you real interview questions for the job you
                want, listens to your answers on camera, and gives you a clear
                report on what to improve.
              </p>
              <div className="lp-cta">
                <Link className="button lg" href="/signup">
                  Start practicing
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="button secondary lg" href="#how-it-works">
                  See how it works
                </a>
              </div>
              <ul className="lp-chips">
                <li>
                  <Clock size={15} aria-hidden="true" />
                  10 or 20 minutes
                </li>
                <li>
                  <Play size={15} aria-hidden="true" />
                  Report with video clips
                </li>
                <li>
                  <Lock size={15} aria-hidden="true" />
                  Private by default
                </li>
              </ul>
            </div>

            <div className="lp-visual" aria-hidden="true">
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
                    <b>AI interviewer</b> · <em>Listening</em>
                  </p>
                  <div className="lp-question">
                    <span className="eyebrow" style={{ justifySelf: "center" }}>
                      Technical question
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
                            { "--h": height + "px" } as React.CSSProperties
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
                      Part {current + 1} of {timeline.length} ·{" "}
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
            </div>
          </div>
        </section>

        <section id="what-it-does" className="lp-section lp-alt">
          <div className="container">
            <div className="lp-section-head center" data-reveal>
              <span className="eyebrow">What it does</span>
              <h2 className="lp-h2">
                A practice interview that tells you what to fix.
              </h2>
              <p className="lp-sub">
                SkillMirror plays the interviewer, so you can rehearse before
                the real thing and walk in prepared.
              </p>
            </div>
            <div className="lp-trust">
              {does.map(([Icon, title, text]) => (
                <article className="lp-trust-item" key={title} data-reveal>
                  <span className="lp-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="lp-section">
          <div className="container">
            <div className="lp-section-head" data-reveal>
              <span className="eyebrow">How it works</span>
              <h2 className="lp-h2">Four simple steps.</h2>
              <p className="lp-sub">
                From sign up to your first report in about half an hour.
              </p>
            </div>
            <ol className="lp-steps">
              {steps.map(([Icon, title, detail], index) => (
                <li className="lp-step" key={title} data-reveal>
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

        <section id="report" className="lp-section lp-deep">
          <div className="container lp-report">
            <div className="stack" style={{ gap: 22 }} data-reveal>
              <span className="eyebrow">Your report</span>
              <h2 className="lp-h2">Clear feedback you can act on.</h2>
              <p className="lp-sub">
                Every note in your report links back to the moment it happened,
                so you can see it for yourself.
              </p>
              <ul className="lp-checklist">
                {reportItems.map((item) => (
                  <li key={item}>
                    <span className="lp-check">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-report-card" aria-hidden="true" data-reveal>
              <div className="lp-report-top">
                <div className="stack-sm" style={{ gap: 4 }}>
                  <span className="eyebrow">Sample report</span>
                  <strong>Backend Engineer · 20 min</strong>
                </div>
                <span className="badge accent">Strong answers</span>
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

        <section id="who-its-for" className="lp-section">
          <div className="container">
            <div className="lp-section-head center" data-reveal>
              <span className="eyebrow">Who it&apos;s for</span>
              <h2 className="lp-h2">One tool, two ways to use it.</h2>
            </div>
            <div className="lp-audience">
              {audiences.map(({ icon: Icon, title, points, cta, href }) => (
                <article className="lp-audience-card" key={title} data-reveal>
                  <span className="lp-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <ul className="lp-checklist">
                    {points.map((point) => (
                      <li key={point}>
                        <span className="lp-check">
                          <Check size={14} strokeWidth={3} aria-hidden="true" />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <div>
                    <Link className="button secondary" href={href}>
                      {cta}
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-alt">
          <div className="container">
            <div className="lp-section-head center" data-reveal>
              <span className="eyebrow">Privacy</span>
              <h2 className="lp-h2">You stay in control of your data.</h2>
            </div>
            <div className="lp-trust">
              {privacy.map(([Icon, title, text]) => (
                <article className="lp-trust-item" key={title} data-reveal>
                  <span className="lp-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <div className="container">
            <div className="lp-section-head center" data-reveal>
              <span className="eyebrow">FAQ</span>
              <h2 className="lp-h2">Common questions.</h2>
            </div>
            <div className="lp-faq" data-reveal>
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
            <div className="lp-cta-band" data-reveal>
              <h2 className="lp-h2">Ready for your next interview?</h2>
              <p className="lp-sub">
                Name the role, upload your CV and start practicing in minutes.
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
                Practice job interviews with an AI interviewer and learn exactly
                what to fix.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href="#what-it-does">What it does</a>
                </li>
                <li>
                  <a href="#how-it-works">How it works</a>
                </li>
                <li>
                  <a href="#report">Your report</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Teams</h4>
              <ul>
                <li>
                  <a href="#who-its-for">For hiring teams</a>
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
      <Reveal />
    </div>
  );
}
