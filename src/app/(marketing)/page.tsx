import Footer01 from "@/components/ui/footer-01";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
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
import { ThemeToggle } from "@/components/common/theme-toggle";
import { LandingAuthGuard } from "@/components/landing/auth-guard";
import { Brand } from "@/components/shell/brand";
import { authenticatedHome, getUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

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

// The three people in the hero scene, read left to right.
const roles = [
  [
    "01 · You",
    "Answer out loud, on camera",
    "Questions come from your CV, the role and the company.",
  ],
  [
    "02 · AI interviewer",
    "Asks, listens, follows up",
    "Vague answers get a follow-up, like in a real interview.",
  ],
  [
    "03 · The report",
    "Scored, with video clips",
    "For your own practice, or shared with the team that invited you.",
  ],
] as const;

export default async function Landing() {
  const user = await getUser();
  if (user) redirect(await authenticatedHome(user.id));

  return (
    <div className="lp">
      <LandingAuthGuard />
      <header className="nav">
        <div className="container nav-inner">
          <div className="nav-left">
            <Brand />
          </div>
          <div className="cluster" style={{ gap: 8 }}>
            <ThemeToggle variant="icon" />
            <Link className="lp-login" href="/login">
              Log in
            </Link>
            <Link className="button sm lp-signup" href="/signup">
              Sign up
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">
                <i aria-hidden="true" />
                For job seekers and hiring teams
              </span>
              <h1 className="lp-title">
                Practice job interviews with an{" "}
                <span className="lp-title-accent">AI&nbsp;interviewer</span>
              </h1>
              <p className="lp-lead">
                Answer real interview questions out loud, on camera, for the job
                you want. Then get a detailed report showing what went well and
                what to improve.
              </p>
              <div className="lp-cta">
                <Link className="button lg accent" href="/signup">
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
              <ul className="lp-chips">
                <li>
                  <Clock size={15} aria-hidden="true" />
                  10 or 20 minutes
                </li>
                <li>
                  <Play size={15} aria-hidden="true" />
                  Video clips in every report
                </li>
                <li>
                  <Lock size={15} aria-hidden="true" />
                  Private by default
                </li>
              </ul>
            </div>

            {/* A candidate, the AI interviewer and a hiring manager. */}
            <div className="lp-stage" aria-hidden="true">
              <Image
                className="lp-stage-photo"
                src="/landing/interview-scene.webp"
                alt=""
                width={1672}
                height={941}
                sizes="(max-width: 1199px) 100vw, 65vw"
                priority
              />
            </div>
          </div>

          <ol className="container lp-roles">
            {roles.map(([who, title, text]) => (
              <li key={who}>
                <span>{who}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
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
                <Link className="button lg accent" href="/signup">
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

      <Footer01 />
      <Reveal />
    </div>
  );
}
