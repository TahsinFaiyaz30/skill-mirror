"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "radix-ui";
import { Copy, Download, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { parseCandidateCsv } from "@/lib/hiring/csv";
import { readable } from "@/lib/config/taxonomy";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";
import type {
  CandidateRow,
  InviteResult,
  InviteRow,
  Opening,
  OpeningDetail as Detail,
  PreviewRow,
} from "@/types/hiring";
import {
  DuplicateButton,
  OpeningSummary,
  PreviewButton,
} from "./opening-wizard";
const date = (text: string | null) =>
  text ? new Date(text).toLocaleString() : "—";
const statusColor = (status: string) =>
  status === "completed" || status === "active"
    ? "accent"
    : status === "started" || status === "accepted"
      ? "primary"
      : status === "expired" || status === "revoked"
        ? "warning"
        : "";
const onCopy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch (error) {
    showError(error);
  }
};
type CandidateList = {
  items: (CandidateRow & { reportReady: boolean })[];
  previews: PreviewRow[];
  superseded: PreviewRow[];
};

export function CandidatesTable({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["candidates", id],
    queryFn: () =>
      requestJSON<CandidateList>("/api/openings/" + id + "/candidates"),
  });
  const [status, setStatus] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [decision, setDecision] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const data = query.data;
  const filtered = (data?.items ?? []).filter(
    (item) =>
      (!status || item.status === status) &&
      (!recommendation || item.recommendation === recommendation) &&
      (!decision || item.decision === decision),
  );
  return (
    <section className="card stack">
      <div className="cluster between">
        <h2>Candidates</h2>
        <div className="cluster">
          {selected.length >= 2 && (
            <Link
              className="button"
              href={"/hiring/compare?ids=" + selected.join(",")}
            >
              Compare ({selected.length})
            </Link>
          )}
          <a
            className="button secondary"
            href={"/api/openings/" + id + "/export.csv"}
            download
          >
            <Download size={16} />
            Export CSV
          </a>
        </div>
      </div>
      <div className="grid-3">
        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              "pending",
              "accepted",
              "started",
              "completed",
              "expired",
              "revoked",
            ].map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Recommendation
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
          >
            <option value="">All recommendations</option>
            {[
              "Recommend advance",
              "Consider",
              "Not recommended",
              "Integrity review needed",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Decision
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="">All decisions</option>
            {["advance", "hold", "reject"].map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Loading candidates…</p>
      ) : query.isError ? (
        <div className="stack-sm">
          <p role="alert" className="danger">
            {errorMessage(query.error)}
          </p>
          <button className="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : filtered.length ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Compare",
                  "Name",
                  "Email",
                  "Status",
                  "Completed",
                  "Weighted score",
                  "Recommendation",
                  "Ceiling / θ",
                  "Maturity",
                  "Integrity",
                  "Decision",
                  "Rating",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const key = item.sessionId ?? "";
                return (
                  <tr
                    key={item.invitationId}
                    className={item.candidateDeleted ? "muted" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"Compare " + (item.name ?? item.email)}
                        checked={selected.includes(key)}
                        disabled={
                          !item.reportReady ||
                          (!selected.includes(key) && selected.length >= 3)
                        }
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, key]
                              : current.filter((id) => id !== key),
                          )
                        }
                      />
                    </td>
                    <td>
                      {item.candidateDeleted ? (
                        "Candidate deleted their data"
                      ) : item.reportReady && item.sessionId ? (
                        <Link href={"/hiring/candidates/" + item.sessionId}>
                          {item.name ?? "Open report"}
                        </Link>
                      ) : (
                        (item.name ?? "—")
                      )}
                    </td>
                    <td>{item.candidateDeleted ? "—" : item.email}</td>
                    <td>
                      <span className={"badge " + statusColor(item.status)}>
                        {readable(item.status)}
                      </span>
                    </td>
                    <td>{date(item.completedAt)}</td>
                    <td className="mono">{item.weightedScore ?? "—"}</td>
                    <td>
                      {item.recommendation && (
                        <span className="badge primary">
                          {item.recommendation}
                        </span>
                      )}
                    </td>
                    <td className="mono">
                      {item.avgCeiling ??
                        (item.techTheta != null ? "θ " + item.techTheta : "—")}
                    </td>
                    <td>{item.maturityLevel ?? "—"}</td>
                    <td>
                      {item.integrityBadge
                        ? readable(item.integrityBadge)
                        : "—"}
                    </td>
                    <td>{item.decision ? readable(item.decision) : "—"}</td>
                    <td>{item.rating ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          {data?.items.length
            ? "No interviews match the filters."
            : "Candidates appear here after you create invitations."}
        </p>
      )}
      {(Boolean(data?.previews.length) || Boolean(data?.superseded.length)) && (
        <details>
          <summary>Previews and past attempts</summary>
          {[...(data?.previews ?? []), ...(data?.superseded ?? [])].map(
            (item) => (
              <div className="inset cluster between" key={item.sessionId}>
                <span>
                  {item.name ?? "Preview"} · {readable(item.status)} ·{" "}
                  {date(item.createdAt)}
                </span>
                {item.weightedScore !== null ? (
                  <Link href={"/hiring/candidates/" + item.sessionId}>
                    Open report · {item.weightedScore}
                  </Link>
                ) : item.status === "ready" ||
                  item.status === "draft" ||
                  item.status === "planning" ? (
                  <Link href={"/interview/" + item.sessionId + "/prepare"}>
                    Continue preview
                  </Link>
                ) : null}
              </div>
            ),
          )}
        </details>
      )}
    </section>
  );
}
export function InviteForm({ opening }: { opening: Opening }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const expiresInDays = Number(
      new FormData(event.currentTarget).get("expiry"),
    );
    try {
      const candidates = parseCandidateCsv(text);
      if (!candidates.length) throw new Error("Enter at least one email.");
      const result = await send<InviteResult>(
        "/api/openings/" + opening.id + "/invitations",
        "POST",
        { candidates, expiresInDays },
      );
      setResult(result);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>Invite candidates</h2>
      {opening.status !== "active" && (
        <p className="muted">
          Publish this opening before sending invitations.
        </p>
      )}
      <form onSubmit={submit} className="stack">
        <fieldset
          className="stack"
          disabled={opening.status !== "active" || busy}
        >
          <label className="field">
            Candidate emails
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                "jamie@example.com, Jamie Morgan\nlee@example.com, Lee Martin"
              }
              required
            />
            <small>
              One email and optional name per line. Up to 50 candidates.
            </small>
          </label>
          <label className="field">
            Upload candidate CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const csv = e.target.files?.[0];
                if (csv) void csv.text().then(setText, showError);
              }}
            />
          </label>
          <label className="field">
            Expires after (days)
            <input
              type="number"
              name="expiry"
              min={1}
              max={30}
              defaultValue={opening.config.candidate.inviteExpiryDays}
              required
            />
          </label>
          <div>
            <button className="button">Send invites</button>
          </div>
        </fieldset>
      </form>
      {error && (
        <p className="danger" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="stack">
          {result.invitations.some((item) => !item.emailed) && (
            <p className="inset">
              Email sending isn&apos;t configured or delivery failed. Share
              these links yourself.
            </p>
          )}
          {result.invitations.length > 0 && (
            <div>
              <button
                className="button secondary"
                onClick={() =>
                  void onCopy(
                    result.invitations.map((item) => item.link).join("\n"),
                  )
                }
              >
                Copy all links
              </button>
            </div>
          )}
          {result.invitations.map((item) => (
            <div className="inset cluster between" key={item.id}>
              <div className="stack-sm">
                <strong>{item.email}</strong>
                <a className="wrap-anywhere" href={item.link}>
                  {item.link}
                </a>
              </div>
              <button
                className="button secondary"
                onClick={() => void onCopy(item.link)}
              >
                <Copy size={16} />
                Copy link
              </button>
            </div>
          ))}
          {result.skipped.map((item, i) => (
            <p className="muted" key={i}>
              {item.email} · {item.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
function Invitations({ id }: { id: string }) {
  const [lastLink, setLastLink] = useState("");
  const query = useQuery({
    queryKey: ["invitations", id],
    queryFn: () =>
      requestJSON<{ items: InviteRow[] }>(
        "/api/openings/" + id + "/invitations",
      ),
  });
  const action = async (
    row: InviteRow,
    action: "resend" | "revoke" | "allow-retake",
  ) => {
    try {
      const result = await send<{ ok: boolean; link?: string }>(
        "/api/invitations/" + row.id + "/" + action,
        "POST",
      );
      if (result.link) setLastLink(result.link);
      await query.refetch();
    } catch (error) {
      showError(error);
    }
  };
  return (
    <section className="card stack">
      <h2>Invitations</h2>
      {lastLink && (
        <div className="inset cluster">
          <a className="wrap-anywhere" href={lastLink}>
            {lastLink}
          </a>
          <button
            className="button secondary"
            onClick={() => void onCopy(lastLink)}
          >
            Copy link
          </button>
        </div>
      )}
      {query.isError && (
        <p className="danger" role="alert">
          {errorMessage(query.error)}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading invitations…</p>
      ) : !query.data?.items.length ? (
        <p>No invitations yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {["Email", "Name", "Status", "Sent", "Expires", "Actions"].map(
                  (label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.name ?? "—"}</td>
                  <td>
                    <span className={"badge " + statusColor(row.status)}>
                      {readable(row.status)}
                    </span>
                  </td>
                  <td>{date(row.lastSentAt)}</td>
                  <td>{date(row.expiresAt)}</td>
                  <td>
                    <div className="cluster">
                      {row.status === "pending" && (
                        <button
                          className="button secondary"
                          onClick={() => void action(row, "resend")}
                        >
                          Resend
                        </button>
                      )}
                      {["pending", "accepted"].includes(row.status) && (
                        <button
                          className="button ghost danger"
                          onClick={() => {
                            if (confirm("Revoke this invitation?"))
                              void action(row, "revoke");
                          }}
                        >
                          Revoke
                        </button>
                      )}
                      {row.canRetake && (
                        <button
                          className="button secondary"
                          onClick={() => void action(row, "allow-retake")}
                        >
                          Allow retake
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function OpeningDetail({ data }: { data: Detail }) {
  const router = useRouter(),
    opening = data.opening;
  const [status, setStatus] = useState(opening.status);
  const statusAction = async (action: "publish" | "close") => {
    try {
      await send("/api/openings/" + opening.id + "/" + action, "POST");
      setStatus(action === "publish" ? "active" : "closed");
      router.refresh();
    } catch (error) {
      showError(error);
    }
  };
  return (
    <div className="stack">
      <div className="cluster between">
        <div className="stack-sm">
          <Link href="/hiring">Openings</Link>
          <h1>{opening.title}</h1>
          <p className="muted">
            {opening.roleTitle} · {readable(opening.seniority)}
          </p>
        </div>
        <div className="cluster">
          {opening.locked && (
            <span className="badge">
              <LockKeyhole size={15} />
              Locked
            </span>
          )}
          <span className={"badge " + statusColor(status)}>
            {readable(status)}
          </span>
        </div>
      </div>
      <Tabs.Root defaultValue="candidates" className="stack">
        <Tabs.List className="hiring-tabs" aria-label="Opening details">
          {["Candidates", "Invite", "Invitations", "Settings"].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab.toLowerCase()}
              className="button secondary data-[state=active]:tabs-active"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="candidates">
          <CandidatesTable id={opening.id} />
        </Tabs.Content>
        <Tabs.Content value="invite">
          <InviteForm opening={{ ...opening, status }} />
        </Tabs.Content>
        <Tabs.Content value="invitations">
          <Invitations id={opening.id} />
        </Tabs.Content>
        <Tabs.Content value="settings">
          <section className="card stack">
            <h2>Settings</h2>
            <OpeningSummary
              opening={opening}
              questions={data.questions.length}
              validation={data.validation}
            />
            <div className="cluster">
              {opening.locked ? (
                <DuplicateButton id={opening.id} label="Duplicate to edit" />
              ) : (
                <Link
                  href={"/hiring/openings/" + opening.id + "/edit"}
                  className="button secondary"
                >
                  Edit
                </Link>
              )}
              <PreviewButton
                id={opening.id}
                disabled={!!data.validation.errors.length}
              />
              {status === "active" ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    if (
                      confirm("Close this opening and expire pending invites?")
                    )
                      void statusAction("close");
                  }}
                >
                  Close opening
                </button>
              ) : (
                <button
                  className="button"
                  disabled={!!data.validation.errors.length}
                  onClick={() => void statusAction("publish")}
                >
                  Publish
                </button>
              )}
              {!opening.locked && (
                <button
                  className="button ghost danger"
                  onClick={() => {
                    if (confirm("Delete this opening?"))
                      void send("/api/openings/" + opening.id, "DELETE").then(
                        () => router.push("/hiring"),
                        showError,
                      );
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
