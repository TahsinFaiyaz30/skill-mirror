import Link from "next/link";
import { LogoMark } from "@/components/shell/brand";
export default function NotFound() {
  return (
    <main className="status-page">
      <section className="card stack status-card">
        <LogoMark size={40} />
        <span className="status-code grad-text">404</span>
        <h1>Page not found</h1>
        <p className="muted">This link is unavailable.</p>
        <div>
          <Link href="/" className="button">
            Go to SkillMirror
          </Link>
        </div>
      </section>
    </main>
  );
}
