import { AudioLines, Gauge, ScanFace } from "lucide-react";
import { Brand } from "./brand";

const points = [
  [Gauge, "Adapts to every answer"],
  [ScanFace, "Reads gaze and posture"],
  [AudioLines, "Times pace and fillers"],
] as const;

// A single centered card on a soft warm backdrop, after Huru's sign-in page.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <span className="auth-blob one" aria-hidden="true" />
      <span className="auth-blob two" aria-hidden="true" />
      <span className="auth-blob three" aria-hidden="true" />
      <header className="auth-top">
        <Brand />
      </header>
      <section className="auth-form">
        <div className="card auth-card">{children}</div>
        <ul className="auth-points" aria-label="What SkillMirror does">
          {points.map(([Icon, text]) => (
            <li key={text}>
              <Icon size={16} aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
        <small>Interviews run in desktop Chrome or Edge.</small>
      </section>
    </main>
  );
}
