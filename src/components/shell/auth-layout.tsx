import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./brand";

// A single form on a plain background, with a way back to the home page.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <header className="auth-top">
        <div className="cluster" style={{ gap: 20 }}>
          <Link href="/" className="auth-back">
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </Link>
          <Brand />
        </div>
      </header>
      <section className="auth-form">
        <div className="card auth-card">{children}</div>
        <small>Interviews run in Chrome or Edge on a computer.</small>
      </section>
    </main>
  );
}
