import { AudioLines, Gauge, ScanFace } from "lucide-react";
import { Brand } from "./brand";

const points = [
  [Gauge, "Difficulty adapts after each answer"],
  [ScanFace, "Gaze, posture and gestures read against your baseline"],
  [AudioLines, "Pace, pauses and fillers, tied to timestamps"],
] as const;

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <aside className="auth-brand">
        <Brand />
        <div className="auth-copy">
          <div className="auth-visual" aria-hidden="true">
            <span className="auth-ring outer" />
            <span className="auth-ring" />
            <div className="orb auth-orb" />
          </div>
          <span className="eyebrow">AI interviewer</span>
          <h2>Pressure-tested interviews.</h2>
          <p className="muted">Every answer, every gesture, every second.</p>
          <ul className="auth-points">
            {points.map(([Icon, text]) => (
              <li key={text}>
                <Icon size={18} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <small>Runs in desktop Chrome or Edge.</small>
      </aside>
      <section className="auth-form">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="card">{children}</div>
      </section>
    </main>
  );
}
