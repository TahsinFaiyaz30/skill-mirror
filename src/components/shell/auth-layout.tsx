import { Brand } from "./brand";

// A single centered card on a plain background, after Huru's sign-in page.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <header className="auth-top">
        <Brand />
      </header>
      <section className="auth-form">
        <div className="card auth-card">{children}</div>
        <small>Interviews run in Chrome or Edge on a computer.</small>
      </section>
    </main>
  );
}
