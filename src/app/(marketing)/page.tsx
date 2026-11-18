import Link from "next/link";
import {
  Activity,
  AudioLines,
  FileText,
  Gauge,
  Layers3,
  ScanFace,
  Video,
} from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";

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
export default function Landing() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
          <div className="cluster">
            <ThemeToggle />
            <Link href="/login">Log in</Link>
            <Link className="button" href="/signup">
              Get started
            </Link>
          </div>
        </div>
      </header>
      <main className="container page stack" style={{ gap: 48 }}>
        <section className="landing-hero grid-2">
          <div className="stack" style={{ alignContent: "center", gap: 20 }}>
            <h1>Pressure-tested interviews.</h1>
            <p className="muted">
              An AI interviewer that adapts to your level, reads your body
              language and voice, and shows you exactly what to fix, with video
              proof.
            </p>
            <div className="cluster">
              <Link className="button" href="/signup">
                Start practicing
              </Link>
              <Link className="button secondary" href="/signup?intent=hiring">
                Hire with AI interviews
              </Link>
            </div>
            <a href="#sample-report">See a sample report</a>
          </div>
          <div className="hero-room card stack center">
            <div
              className="orb"
              style={{ width: 145, height: 145, marginInline: "auto" }}
            />
            <div className="inset stack-sm">
              <span className="small muted">Technical · System Design</span>
              <h2>How would your design handle a sudden spike in traffic?</h2>
            </div>
          </div>
        </section>
        <section className="stack">
          <h2>How it works</h2>
          <div className="grid-4">
            {steps.map(([Icon, title, detail]) => (
              <article className="card stack-sm" key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p className="muted">{detail}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="stack">
          <h2>What we measure</h2>
          <div className="grid-3">
            {[
              [
                Gauge,
                "Technical ceiling",
                "Difficulty adapts after each answer.",
              ],
              [
                ScanFace,
                "Body language",
                "Gaze, posture and gestures relative to your baseline.",
              ],
              [
                AudioLines,
                "Voice and tone",
                "Speaking pace, pauses, fillers and delivery.",
              ],
            ].map(([Icon, title, detail]) => {
              const Measure = Icon as typeof Gauge;
              return (
                <article key={String(title)} className="card stack-sm">
                  <Measure size={24} />
                  <h3>{String(title)}</h3>
                  <p className="muted">{String(detail)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section id="sample-report" className="card grid-2">
          <div className="stack">
            <h2>Sample report</h2>
            <p className="muted">
              A sample score and timestamped coaching moment.
            </p>
            <div className="cluster">
              <span className="mono" style={{ fontSize: 36 }}>
                78
              </span>
              <span className="badge accent">Hire signal</span>
            </div>
          </div>
          <div className="inset stack-sm">
            <span className="small muted mono">04:22–04:43</span>
            <h3>Explain the tradeoff earlier</h3>
            <p>
              State your constraint, compare two options, and explain why your
              choice fits.
            </p>
          </div>
        </section>
        <section className="card stack">
          <h2>Run real first-round interviews with AI.</h2>
          <ul className="list-disc pl-5">
            <li>Your own must-ask questions or fully automatic interviews</li>
            <li>AI follow-ups labelled separately from your questions</li>
            <li>Side-by-side candidate comparison</li>
            <li>Fair-by-default body-language settings</li>
          </ul>
          <div>
            <Link className="button" href="/signup?intent=hiring">
              Hire with AI interviews
            </Link>
          </div>
        </section>
        <p className="muted">
          Camera preview is visible only during setup. Recording retention and
          sharing are explained before every interview.
        </p>
      </main>
      <footer className="container page cluster between">
        <small>
          International AI Builders Congress 2026 · LearnSphere / Workforce
          Ready
        </small>
        <div className="cluster">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </>
  );
}
