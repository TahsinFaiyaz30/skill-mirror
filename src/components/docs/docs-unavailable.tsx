import Link from "next/link";
import { CalendarClock, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import type { DocsAccessDecision } from "@/types/docs";

export function DocsUnavailable({ access }: { access: DocsAccessDecision }) {
  const isScheduled =
    access.reason === "outside_schedule" &&
    access.windowStart &&
    access.windowEnd;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
        </div>
      </header>
      <main className="container flex min-h-[75vh] items-center justify-center py-16">
        <section className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--orange-text)]">
            {isScheduled ? <CalendarClock size={22} /> : <Lock size={22} />}
          </div>
          <p className="font-mono text-xs font-semibold tracking-wider text-[var(--orange-text)] uppercase">
            HTTP 403 · Access Restricted
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Documentation Not Available
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {access.reason === "outside_schedule"
              ? "SkillMirror's live pitch deck and technical documentation is restricted to its scheduled showcase window."
              : access.reason === "duration_expired"
                ? "The temporary publishing window for this documentation has ended."
                : "Public access to /docs is currently turned off by an administrator."}
          </p>

          {isScheduled && (
            <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--soft)]">
              <p className="font-semibold text-[var(--foreground)]">
                Scheduled Public Window
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {new Date(access.windowStart!).toUTCString()} —{" "}
                {new Date(access.windowEnd!).toUTCString()}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--foreground)] no-underline hover:bg-[var(--hover)]"
            >
              <ArrowLeft size={15} />
              Back to SkillMirror
            </Link>
            <Link
              href="/admin/docs"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-semibold text-[var(--orange-fg)] no-underline hover:bg-[var(--orange-hover)]"
            >
              <ShieldCheck size={15} />
              Admin access
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
