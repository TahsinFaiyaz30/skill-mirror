import Link from "next/link";
export default function NotFound() {
  return <main className="container page narrow"><section className="card stack"><h1>Page not found</h1><p className="muted">This link is unavailable.</p><div><Link href="/" className="button">Go to SkillMirror</Link></div></section></main>;
}
