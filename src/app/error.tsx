"use client";
import { LogoMark } from "@/components/shell/brand";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="status-page">
      <section className="card stack status-card">
        <LogoMark size={40} />
        <h1>Something went wrong</h1>
        <p className="muted">Try loading this page again.</p>
        <div>
          <button className="button" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
