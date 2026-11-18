import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <aside className="auth-brand">
        <div className="stack center">
          <div>
            <Brand />
          </div>
          <div className="orb auth-orb" aria-hidden="true" />
          <h2>Pressure-tested interviews.</h2>
          <p className="muted">Every answer, every gesture, every second.</p>
        </div>
      </aside>
      <section className="auth-form">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <div className="card">{children}</div>
      </section>
    </main>
  );
}
