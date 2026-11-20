"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "zustand";
import { Dialog } from "radix-ui";
import { ArrowLeft, LoaderCircle, Mic, Repeat2, X } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { PHASE_LABELS } from "@/lib/config/taxonomy";
import { errorMessage, shortTime } from "@/lib/utils/client";
import { pendingEndKey, TurnEngine } from "@/lib/live/turnEngine";
import type { LiveStage } from "@/stores/liveStore";
import type { SessionPublic } from "@/types/interview";

const labels: Record<LiveStage, string> = {
  CONNECTING: "Connecting…",
  AI_SPEAKING: "Interviewer speaking",
  LISTENING: "Listening",
  EVALUATING: "Thinking…",
  PREP: "Preparing",
  PRESENTING: "Presenting",
  RECONNECTING: "Reconnecting…",
  CLOSING: "Ending interview…",
  ENDED: "Interview ended",
};
const roomMedia = "(min-width: 1024px)";
const visitRoom = () =>
  matchMedia(roomMedia).matches &&
  !/Android|Mobile|OPR\//.test(navigator.userAgent) &&
  Number(navigator.userAgent.match(/(?:Chrome|Edg)\/(\d+)/)?.[1]) >= 120;
function watchRoom(listener: () => void) {
  const size = matchMedia(roomMedia);
  size.addEventListener("change", listener);
  return () => size.removeEventListener("change", listener);
}
// A still orb that only grows with the interviewer's voice level, so the
// candidate can tell when it is speaking. No decorative motion.
export function Orb({ stage, rms }: { stage: LiveStage; rms: number }) {
  const scale = stage === "AI_SPEAKING" ? 1 + 0.2 * Math.min(1, rms) : 1;
  return (
    <div
      className="orb room-orb"
      aria-hidden="true"
      data-stage={stage}
      style={{ transform: "scale(" + scale.toFixed(3) + ")" }}
    />
  );
}
export function LiveRoom({
  data,
  debug,
}: {
  data: SessionPublic;
  debug: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [endDialog, setEndDialog] = useState(false);
  const [lost, setLost] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [offline, setOffline] = useState(false);
  const [answer, setAnswer] = useState("");
  const [debugOpen, setDebugOpen] = useState(data.session.aiMode === "mock");
  const supported = useSyncExternalStore(watchRoom, visitRoom, () => true);
  const [engine] = useState(
    () =>
      new TurnEngine(
        data,
        (payload) => {
          sessionStorage.setItem(
            pendingEndKey(data.session.id),
            JSON.stringify(payload),
          );
          if (payload.endReason === "connection_lost") {
            setLost(true);
            setPendingNavigation(true);
          } else router.push("/interview/" + data.session.id + "/processing");
        },
        (error) => setError(errorMessage(error)),
      ),
  );
  const state = useStore(engine.store);
  const directive = state.directive,
    id = data.session.id;
  const mock = data.session.aiMode === "mock";
  const done = useCallback(() => {
    engine.done(mock ? answer : undefined);
    setAnswer("");
  }, [answer, engine, mock]);
  const pendingDispose = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    clearTimeout(pendingDispose.current);
    return () => {
      pendingDispose.current = setTimeout(() => engine.dispose(), 0);
    };
  }, [engine]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        !["LISTENING", "PRESENTING"].includes(engine.stage) ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest("button,input,a,textarea,select,summary")))
      )
        return;
      event.preventDefault();
      done();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("keydown", key);
    };
  }, [engine, done]);
  const ready = !started || (!directive && error !== "");
  const remaining = data.config.hardCapMs - state.elapsed;
  const isPresentation = Boolean(
    state.scenario &&
    directive?.phase === "presentation" &&
    directive?.cardLabel === "Presentation",
  );
  if (!supported)
    return (
      <main className="center page stack">
        <h1>Please use a larger screen</h1>
        <p>
          SkillMirror interviews need desktop Chrome or Edge and a window at
          least 1024 pixels wide.
        </p>
      </main>
    );
  return (
    <>
      <div className="screen-block center page">
        <h1>Please use a larger screen</h1>
        <p>
          SkillMirror interviews need desktop Chrome or Edge and a window at
          least 1024 pixels wide.
        </p>
      </div>
      <main className="live-room room-shell">
        <header className="room-header">
          <Brand company={data.config.company} href="/dashboard" />
          <ol className="cluster room-phases" aria-label="Interview phases">
            {data.config.phaseOrder.map((phase, index) => (
              <li
                key={phase}
                aria-current={
                  directive?.phaseIndex === index ? "step" : undefined
                }
                className={
                  "badge " + (directive?.phaseIndex === index ? "primary" : "")
                }
              >
                {directive && index < directive.phaseIndex ? "✓ " : ""}
                {PHASE_LABELS[phase]}
              </li>
            ))}
          </ol>
          <time className={remaining <= 120000 ? "badge warning" : "badge"}>
            {shortTime(state.elapsed)} / {shortTime(data.config.hardCapMs)}
          </time>
          <div className="cluster">
            <span
              role="status"
              className={
                "badge " +
                (state.stage === "LISTENING"
                  ? "accent"
                  : state.stage === "RECONNECTING"
                    ? "warning"
                    : "primary")
              }
            >
              {state.stage === "EVALUATING" && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              {labels[state.stage]}
            </span>
            <span
              tabIndex={0}
              role="img"
              aria-label={"Tracking " + state.tracking}
              className={"tracking-dot " + state.tracking}
              title={
                state.tracking === "green"
                  ? "Face and shoulders are visible"
                  : state.tracking === "red"
                    ? "Check that only your face is visible"
                    : "Check lighting and shoulder framing"
              }
            />
          </div>
        </header>
        {offline && (
          <p role="status" className="room-banner badge warning">
            You&apos;re offline. Uploads will resume when you reconnect.
          </p>
        )}
        <div className="room-main stack center">
          <Orb stage={state.stage} rms={state.orb} />
          <p className="muted">
            {data.config.interviewerName ?? "Interviewer"}
            {data.config.company && " · " + data.config.company.name}
          </p>
          {(directive || ready) && (
            <section
              className="card stack room-question"
              key={isPresentation ? "presentation" : (directive?.seq ?? 0)}
            >
              <span className="small muted uppercase tracking-wider">
                {directive?.cardLabel ?? "Interview room"}
              </span>
              {isPresentation && state.scenario ? (
                <>
                  <h2>{state.scenario.title}</h2>
                  <p>{state.scenario.scenario}</p>
                  {state.stage === "PREP" ? (
                    <>
                      <progress
                        max={state.scenario.prepMs}
                        value={state.phaseElapsed}
                      />
                      <p>
                        Prepare: you&apos;ll begin in{" "}
                        {Math.max(
                          0,
                          Math.ceil(
                            (state.scenario.prepMs - state.phaseElapsed) / 1000,
                          ),
                        )}{" "}
                        s
                      </p>
                    </>
                  ) : state.stage === "PRESENTING" ? (
                    <>
                      <progress
                        max={state.scenario.talkMs}
                        value={state.phaseElapsed}
                      />
                      <p>
                        Presenting · {shortTime(state.phaseElapsed)} /{" "}
                        {shortTime(state.scenario.talkMs)}
                      </p>
                    </>
                  ) : (
                    directive?.mode === "presentation_interrupt" && (
                      <p>{directive.questionText}</p>
                    )
                  )}
                </>
              ) : (
                directive?.questionText && <h2>{directive.questionText}</h2>
              )}
            </section>
          )}
          {error && !ready && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          {state.speechUnavailable && (
            <div role="alert">
              <p>
                The interviewer audio could not play. Retry to hear the
                question.
              </p>
              <button className="button" onClick={() => engine.retrySpeech()}>
                Retry audio
              </button>
            </div>
          )}
        </div>
        <div className="room-caption" aria-live="polite" aria-atomic="true">
          {state.caption && <p className="card">{state.caption}</p>}
        </div>
        <footer className="room-controls cluster">
          <button
            className="button"
            disabled={
              !["LISTENING", "PRESENTING"].includes(state.stage) ||
              state.deviceLost
            }
            onClick={done}
          >
            <Mic size={16} />
            Done answering <kbd>Space</kbd>
          </button>
          <button
            className="button ghost"
            disabled={state.stage !== "LISTENING"}
            onClick={() => engine.repeat()}
          >
            <Repeat2 size={16} />
            Repeat question
          </button>
          <button
            className="button ghost danger"
            disabled={!started || !directive}
            onClick={() => setEndDialog(true)}
          >
            End interview
          </button>
        </footer>
        {(debug || mock) && (
          <aside className="room-debug card stack-sm">
            <button
              className="button ghost"
              onClick={() => setDebugOpen(!debugOpen)}
            >
              {debugOpen ? "Hide dev panel" : "Show dev panel"}
            </button>
            {debugOpen && (
              <>
                <small className="mono">
                  {state.stage} · Turn {directive?.turnIdx ?? 0} · Seq{" "}
                  {directive?.seq ?? 0} · {state.count} events
                </small>
                {mock ? (
                  <label className="field">
                    Simulated answer
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      maxLength={12000}
                    />
                  </label>
                ) : (
                  <div>
                    <small>Live transcript</small>
                    <p>{state.transcript}</p>
                  </div>
                )}
              </>
            )}
          </aside>
        )}
        <Dialog.Root open={ready && supported}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content card stack">
              <Dialog.Title className="text-xl font-bold">
                Ready when you are
              </Dialog.Title>
              <Dialog.Description>
                Look at the orb, speak naturally, and pause or press Done when
                finished.
              </Dialog.Description>
              {error && (
                <p className="danger" role="alert">
                  {error}
                </p>
              )}
              <div className="cluster">
                <button
                  className="button"
                  onClick={() => {
                    setError("");
                    setStarted(true);
                    void engine.start();
                  }}
                >
                  Begin interview
                </button>
                <Link
                  className="button secondary"
                  href={"/interview/" + id + "/setup"}
                >
                  <ArrowLeft size={16} />
                  Setup
                </Link>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={endDialog} onOpenChange={setEndDialog}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content card stack">
              <div className="cluster between">
                <Dialog.Title className="text-xl font-bold">
                  End the interview now?
                </Dialog.Title>
                <Dialog.Close aria-label="Close">
                  <X size={20} />
                </Dialog.Close>
              </div>
              <Dialog.Description>
                You&apos;ll still get a report for what you&apos;ve completed.
              </Dialog.Description>
              <div className="cluster">
                <Dialog.Close asChild>
                  <button className="button secondary">Keep going</button>
                </Dialog.Close>
                <button
                  className="button danger"
                  onClick={() => {
                    setEndDialog(false);
                    void engine.finish("user_ended");
                  }}
                >
                  End now
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={lost || state.deviceLost}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content card stack">
              <Dialog.Title className="text-xl font-bold">
                {lost
                  ? "We lost the connection"
                  : "Your camera/microphone disconnected"}
              </Dialog.Title>
              <Dialog.Description>
                {lost
                  ? "Your interview so far is saved and we'll generate a partial report."
                  : "Reconnect the device to continue the interview."}
              </Dialog.Description>
              {lost && pendingNavigation ? (
                <button
                  className="button"
                  onClick={() =>
                    router.push("/interview/" + id + "/processing")
                  }
                >
                  Continue to processing
                </button>
              ) : (
                <button
                  className="button"
                  onClick={() =>
                    void engine
                      .reconnectDevice()
                      .catch((error) => setError(errorMessage(error)))
                  }
                >
                  Reconnect device
                </button>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </main>
    </>
  );
}
