"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { pendingEndKey } from "@/lib/live/turnEngine";
import { uploader } from "@/lib/recording/uploader";
import { errorMessage, requestJSON, send } from "@/lib/utils/client";
import type { SessionPublic, SessionStatus } from "@/types/interview";

type StatusResponse = {
  sessionStatus: SessionStatus;
  reportStatus: string | null;
  progress: number;
  step: string | null;
  error: string | null;
  retryAfterMs: number | null;
};
const labels = [
  "Uploading",
  "Transcribing",
  "Analyzing tone",
  "Scoring",
  "Writing the report",
];
const tips = [
  "Lead with your answer, then give one concrete example.",
  "Before solving a technical problem, state the constraint that matters most.",
  "Describe what you personally did and how you measured the result.",
  "A short pause can make a complex idea easier to follow.",
  "Finish a presentation with the decision you want your audience to make.",
];
const stepIndex: Record<string, number> = {
  verify_media: 0,
  transcribe: 1,
  align: 1,
  rescore: 3,
  tone: 2,
  score: 3,
  narrate: 4,
  finalize: 4,
};
export function Processing({
  data,
  embedded = false,
}: {
  data: SessionPublic;
  embedded?: boolean;
}) {
  const router = useRouter();
  const { id, kind } = data.session;
  const base = "/api/sessions/" + id;
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);
  const [uploads, setUploads] = useState({ pending: 0, bytes: 0, failed: 0 });
  const running = useRef(false);
  const status = useQuery({
    queryKey: ["status", id],
    queryFn: () => requestJSON<StatusResponse>(base + "/status"),
    refetchInterval: 2000,
  });
  const { refetch } = status;
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError("");
    try {
      await uploader.drain(id);
      if (uploader.status(id).failed) return;
      const key = pendingEndKey(id);
      const end = sessionStorage.getItem(key);
      if (end) {
        await send(base + "/end", "POST", JSON.parse(end));
        sessionStorage.removeItem(key);
      }
      await send(
        base + "/process",
        "POST",
        undefined,
        AbortSignal.timeout(295000),
      );
      void refetch();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      running.current = false;
    }
  }, [base, id, refetch]);

  useEffect(() => {
    const sync = () => setUploads(uploader.status(id));
    const unsubscribe = uploader.onProgress(sync);
    sync();
    const timer = setInterval(
      () => setTip((index) => (index + 1) % tips.length),
      6000,
    );
    const warning = (event: BeforeUnloadEvent) => {
      if (uploader.status(id).pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warning);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("beforeunload", warning);
    };
  }, [id]);

  useEffect(() => {
    const current = status.data;
    if (!current) return;
    if (current.sessionStatus === "completed") {
      if (embedded) router.refresh();
      else
        router.replace(
          "/interview/" + id + "/" + (kind === "company" ? "done" : "report"),
        );
      return;
    }
    const pendingEnd =
      current.sessionStatus === "in_progress" &&
      sessionStorage.getItem(pendingEndKey(id));
    const canProcess =
      ["ended", "processing"].includes(current.sessionStatus) &&
      (current.reportStatus === "queued" ||
        current.reportStatus === null ||
        current.retryAfterMs === 0);
    if (!error && (pendingEnd || canProcess)) {
      const task = window.setTimeout(() => void run(), 0);
      return () => window.clearTimeout(task);
    }
  }, [error, status.data, embedded, id, kind, router, run]);

  const progress = status.data?.progress ?? 0;
  const failure =
    error ||
    status.data?.error ||
    (status.isError ? errorMessage(status.error) : "");
  const current = status.data?.step ? (stepIndex[status.data.step] ?? 0) : 0;
  const card = (
    <section className="card stack narrow" style={{ width: "min(540px,94vw)" }}>
      <h1>Preparing your report</h1>
      {uploads.pending > 0 && (
        <p role="status">
          Uploading recording… {(uploads.bytes / 1048576).toFixed(1)} MB left
        </p>
      )}
      <progress aria-label="Report progress" value={progress} max={100} />
      <ol className="stack-sm">
        {labels.map((label, i) => (
          <li key={label} className={i > current ? "muted" : ""}>
            {i < current || progress === 100 ? "✓" : i === current ? "●" : "○"}{" "}
            {label}
          </li>
        ))}
      </ol>
      {uploads.failed > 0 && (
        <div className="stack-sm">
          <p className="danger" role="alert">
            Some uploads could not finish.
          </p>
          <button
            className="button"
            onClick={() => {
              uploader.retry(id);
              void run();
            }}
          >
            Retry upload
          </button>
        </div>
      )}
      {failure && (
        <div className="stack-sm">
          <p className="danger" role="alert">
            {failure}
          </p>
          <button className="button" onClick={() => void run()}>
            Retry processing
          </button>
        </div>
      )}
      <p className="inset muted">{tips[tip]}</p>
    </section>
  );
  if (embedded) return card;
  return (
    <main className="live-room">
      <header className="room-header">
        <Brand company={data.config.company} />
        <ThemeToggle />
      </header>
      <div className="processing-center">{card}</div>
    </main>
  );
}
