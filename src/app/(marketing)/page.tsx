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
    "Realistic questions",
    "Questions are based on your CV, the role and the company. Vague answers get follow-up questions, as in a real interview.",
  ],
  [
    Video,
    "Feedback on how you speak",
    "Besides what you say, SkillMirror looks at your pace, pauses, filler words, eye contact and posture.",
  ],
  [
    ClipboardCheck,
    "A report you can use",
    "You get a score, your strengths, the areas to improve and short video clips of the key moments.",
  ],
] as const;

// The same order the app uses: name the interview, add a CV, talk, read.
const steps = [
  [
    BriefcaseBusiness,
    "Set up the interview",
    "Enter the role and company, choose the level and pick 10 or 20 minutes.",
  ],
  [
    FileText,
    "Upload your CV",
    "Your skills, experience and projects are used to plan the questions.",
  ],
  [
    Mic,
    "Take the interview",
    "Answer out loud with your camera on, in Chrome or Edge on a computer.",
  ],
  [
    ClipboardCheck,
    "Review your report",
    "See your score, watch key moments again and practice with the suggested exercises.",
  ],
] as const;

const reportItems = [
  "An overall score out of 100",
  "Your level for each technical skill, from 1 to 5",
  "Feedback on your voice and body language",
  "Video clips of key moments, each with a practice tip",
];

const audiences = [
  {
    icon: UserRound,
    title: "For job seekers",
    points: [
      "Practice for a specific role and company",
      "Your reports are private",
      "See your progress over time",
    ],
    cta: "Start practicing",
    href: "/signup",
  },
  {
    icon: Building2,
    title: "For hiring teams",
    points: [
      "Create an opening with your own questions",
      "Invite candidates with a link",
      "Compare candidates side by side",
    ],
    cta: "Hire with AI interviews",
    href: "/signup?intent=hiring",
  },
] as const;

const privacy = [
  [
    Eye,
    "Camera preview only during setup",
    "You only see yourself while you check your framing.",
  ],
  [
    ShieldCheck,
    "Clear consent before you start",
    "Before each interview, we explain what is recorded and who can see it.",
  ],
  [
    Clock,
    "Recordings are deleted",
    "Recordings are deleted after 30 days by default, and you can delete your data at any time.",
  ],
] as const;

const faqs = [
  [
    "What does SkillMirror do?",
    "It runs a practice job interview with an AI interviewer. You answer the questions out loud on camera. Afterwards you get a report that shows what went well and what to improve, with video clips of the key moments.",
  ],
  [
    "What do I need?",
    "A computer with Chrome or Edge, a camera and a microphone. Before you start, a short setup checks your camera, microphone and sound.",
  ],
  [
    "How long does an interview take?",
    "You choose 10 or 20 minutes. The 20 minute interview adds time for your own questions at the end.",
  ],
  [
    "Who can see my practice report?",
    "Only you. Company interviews work differently: the company that invited you receives your recording, transcript, evaluation and a summary of your CV. This is explained before you start.",
  ],
  [
    "Can my company use it for hiring?",
    "Yes. Hiring teams create openings with their own questions, invite candidates with a link and compare candidates side by side. Follow-up questions from the AI are marked separately from your own questions.",
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

// A candidate in a blazer on a video call, headset on, in a room lit by an
// evening window. Drawn by hand in SVG so it stays sharp and light.
function InterviewScene() {
  return (
    <svg
      className="lp-person"
      viewBox="0 0 480 300"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="lpc-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#343d55" />
          <stop offset="0.55" stopColor="#272e42" />
          <stop offset="1" stopColor="#1b2030" />
        </linearGradient>
        <linearGradient id="lpc-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd6b3" stopOpacity="0.62" />
          <stop offset="1" stopColor="#f39a83" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="lpc-beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd6b3" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffd6b3" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lpc-blazer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4964" />
          <stop offset="1" stopColor="#263046" />
        </linearGradient>
        <linearGradient id="lpc-skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecb390" />
          <stop offset="1" stopColor="#cd8e6c" />
        </linearGradient>
        <linearGradient id="lpc-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d2a24" />
          <stop offset="1" stopColor="#1e1412" />
        </linearGradient>
        <linearGradient id="lpc-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fae8a" />
          <stop offset="1" stopColor="#3f7559" />
        </linearGradient>
        <radialGradient id="lpc-vignette" cx="0.5" cy="0.42" r="0.78">
          <stop offset="0.62" stopColor="#0f121a" stopOpacity="0" />
          <stop offset="1" stopColor="#0f121a" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id="lpc-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#0f121a" stopOpacity="0" />
          <stop offset="1" stopColor="#0f121a" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill="url(#lpc-wall)" />
      <path d="M134 30 300 214 238 300H134z" fill="url(#lpc-beam)" />
      <rect
        x="30"
        y="24"
        width="104"
        height="130"
        rx="8"
        fill="url(#lpc-window)"
      />
      <path d="M82 24v130M30 89h104" stroke="#2b3347" strokeWidth="5" />
      <rect
        x="30"
        y="24"
        width="104"
        height="130"
        rx="8"
        fill="none"
        stroke="#3d4762"
        strokeWidth="3"
      />
      <rect x="22" y="152" width="120" height="6" rx="3" fill="#3d4762" />
      <path d="M44 300l6-56h40l6 56z" fill="#c9725a" />
      <path d="M50 244h40" stroke="#b05f4a" strokeWidth="3" />
      <path
        d="M70 244c-18-14-30-40-22-62 14 10 22 34 22 62zm0 0c4-26 18-46 36-52 2 22-14 44-36 52zm0 0c-4-20-2-44 8-58 8 14 4 40-8 58z"
        fill="url(#lpc-leaf)"
      />
      <rect x="356" y="150" width="104" height="6" rx="3" fill="#4b3d36" />
      <rect
        x="364"
        y="116"
        width="10"
        height="34"
        rx="2"
        fill="#fd7c68"
        opacity="0.75"
      />
      <rect
        x="376"
        y="122"
        width="9"
        height="28"
        rx="2"
        fill="#fdc458"
        opacity="0.7"
      />
      <rect
        x="387"
        y="112"
        width="11"
        height="38"
        rx="2"
        fill="#7aa2d6"
        opacity="0.7"
      />
      <rect
        x="402"
        y="124"
        width="8"
        height="26"
        rx="2"
        fill="#b999fb"
        opacity="0.6"
        transform="rotate(-14 406 150)"
      />
      <path d="M430 150h22l-3-15h-16z" fill="#d7d2c8" opacity="0.85" />
      <path
        d="M441 135c-9-6-13-17-8-24 7 4 10 13 8 24zm0 0c6-8 15-11 20-9-3 7-12 10-20 9z"
        fill="url(#lpc-leaf)"
      />
      <g transform="translate(240 300) scale(1.12) translate(-240 -300)">
        <path
          d="M112 300c6-46 38-74 86-84l20-4h44l20 4c48 10 80 38 86 84z"
          fill="url(#lpc-blazer)"
        />
        <path d="M214 212l26 52 26-52z" fill="#eef1f6" />
        <path d="M214 212l-17 10 34 56 9-14z" fill="#2c3750" />
        <path d="M266 212l17 10-34 56-9-14z" fill="#2c3750" />
        <path d="M219 210l15 17 6-13zM261 210l-15 17-6-13z" fill="#ffffff" />
        <path
          d="M324 232c24 12 40 34 44 66"
          stroke="#fd7c68"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.5"
          fill="none"
        />
        <path d="M223 168h34v42c0 9-34 9-34 0z" fill="#c98a69" />
        <path
          d="M223 176c10 9 24 9 34 0v10c-10 7-24 7-34 0z"
          fill="#b47859"
          opacity="0.55"
        />
        <ellipse cx="201" cy="134" rx="7" ry="11" fill="#d49473" />
        <ellipse cx="279" cy="134" rx="7" ry="11" fill="#d49473" />
        <ellipse cx="240" cy="130" rx="39" ry="47" fill="url(#lpc-skin)" />
        <path
          d="M206 146c6 26 20 40 34 40s28-14 34-40c-8 18-20 28-34 28s-26-10-34-28z"
          fill="#b97a5c"
          opacity="0.28"
        />
        <path
          d="M199 126c-5-32 11-58 41-62 31-4 51 18 50 48 0 8-2 14-4 18-3-18-13-30-27-34-12 10-34 14-53 12-3 6-6 11-7 18z"
          fill="url(#lpc-hair)"
        />
        <path
          d="M226 74c14-6 34-3 46 9"
          stroke="#5c4037"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
          fill="none"
        />
        <path
          d="M216 119q9-6 18-1M246 118q9-5 18 1"
          stroke="#2a1d1a"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="225" cy="134" rx="3.4" ry="4.2" fill="#2a1d1a" />
        <ellipse cx="255" cy="134" rx="3.4" ry="4.2" fill="#2a1d1a" />
        <circle cx="226.3" cy="132.4" r="1.1" fill="#ffffff" />
        <circle cx="256.3" cy="132.4" r="1.1" fill="#ffffff" />
        <path
          d="M240 137q-5 12 0 15q3 1 5-1"
          stroke="#b47859"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="216" cy="149" r="6" fill="#ef8a74" opacity="0.2" />
        <circle cx="264" cy="149" r="6" fill="#ef8a74" opacity="0.2" />
        <path d="M228 159q12 11 24 0q-12 4-24 0z" fill="#8f3f36" />
        <path
          d="M231 160.4q9 2.6 18 0"
          stroke="#ffffff"
          strokeWidth="1.6"
          opacity="0.8"
        />
        <path
          d="M276 102c8 14 9 34 4 52"
          stroke="#fd7c68"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.55"
          fill="none"
        />
        <path
          d="M195 132c-2-46 20-74 45-74s47 28 45 74"
          stroke="#12161f"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="186" y="120" width="15" height="28" rx="6" fill="#12161f" />
        <rect x="279" y="120" width="15" height="28" rx="6" fill="#12161f" />
        <rect x="188.5" y="127" width="3" height="14" rx="1.5" fill="#fd7c68" />
        <rect x="288.5" y="127" width="3" height="14" rx="1.5" fill="#fd7c68" />
        <path
          d="M194 147c4 18 14 24 28 21"
          stroke="#12161f"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="224" cy="168" r="4.5" fill="#fd7c68" />
      </g>
      <rect width="480" height="300" fill="url(#lpc-vignette)" />
      <rect width="480" height="300" fill="url(#lpc-shade)" />
    </svg>
  );
}

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
              <h1 className="lp-title">
                Practice job interviews with an{" "}
                <span className="grad-text">AI interviewer</span>
              </h1>
              <p className="lp-lead">
                Answer real interview questions out loud, on camera, for the job
                you want. Then get a detailed report showing what went well and
                what to improve.
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
                  <Clock size={16} aria-hidden="true" />
                  Takes 10 or 20 minutes
                </li>
                <li>
                  <Play size={16} aria-hidden="true" />
                  Video clips in every report
                </li>
                <li>
                  <Lock size={16} aria-hidden="true" />
                  Your reports stay private
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
                <div className="lp-call">
                  <InterviewScene />
                  <span className="lp-you">
                    <Mic size={13} />
                    You
                    <span className="lp-you-bars">
                      {[8, 14, 10, 16, 7].map((height, index) => (
                        <i key={index} style={{ height }} />
                      ))}
                    </span>
                  </span>
                  <div className="lp-pip">
                    <div className="orb" />
                    <span>AI interviewer</span>
                    <small>Listening</small>
                  </div>
                  <p className="lp-caption">
                    <b>AI interviewer</b>
                    How would your design handle a sudden spike in traffic?
                  </p>
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
              <h2 className="lp-h2">What SkillMirror does</h2>
              <p className="lp-sub">
                SkillMirror takes the role of the interviewer. You practice in a
                realistic setting and see where to improve before the real
                interview.
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
              <h2 className="lp-h2">How it works</h2>
              <p className="lp-sub">
                Four steps, all in your browser. No software to install.
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
              <h2 className="lp-h2">What&apos;s in your report</h2>
              <p className="lp-sub">
                Each comment in the report is linked to the moment in the
                interview where it happened, so you can watch it yourself.
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
              <h2 className="lp-h2">Who it&apos;s for</h2>
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
              <h2 className="lp-h2">Your data and privacy</h2>
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
              <h2 className="lp-h2">Frequently asked questions</h2>
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
              <h2 className="lp-h2">Prepare for your next interview</h2>
              <p className="lp-sub">
                Set up a practice interview in a few minutes.
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
                Practice job interviews and get detailed feedback on every
                answer.
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
