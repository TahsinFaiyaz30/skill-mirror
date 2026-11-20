import { notFound } from "next/navigation";
import { Brand } from "@/components/shell/brand";
import { certificateBySlug } from "@/lib/api/practice";
import { readable } from "@/lib/config/taxonomy";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const result = await certificateBySlug((await params).slug);
  if (!result) notFound();
  const { valid, revoked, payload } = result;
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
        </div>
      </header>
      <main className="container page">
        <section className="card stack narrow">
          <h1>Verified Interview Performance</h1>
          <div className="stack-sm">
            <h2>{payload.name}</h2>
            <p>
              {payload.role} · {payload.company}
            </p>
            <p className="muted">
              Issued {new Date(payload.issuedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="cluster">
            <span className="badge primary">{payload.overallScore} / 100</span>
            <span className="badge">{payload.verdict}</span>
            {payload.maturityLevel && (
              <span className="badge">
                Level {payload.maturityLevel} · {payload.maturityLabel}
              </span>
            )}
            <span className="badge">
              {readable(payload.integrity)} integrity
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Competency</th>
                <th scope="col">Ceiling</th>
                <th scope="col">Expected level</th>
              </tr>
            </thead>
            <tbody>
              {payload.competencies.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.ceiling ?? "—"}</td>
                  <td>{c.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <span
              className={"badge " + (valid && !revoked ? "accent" : "danger")}
            >
              {valid && !revoked ? "✓ Signature valid" : "Invalid or revoked"}
            </span>
          </div>
          <p className="muted">
            This certificate verifies the results of a SkillMirror practice
            assessment. It is a coaching signal and does not represent a hiring
            decision.
          </p>
        </section>
      </main>
    </>
  );
}
