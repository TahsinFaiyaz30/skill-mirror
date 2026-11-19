"use client";
import { useRouter } from "next/navigation";
import { publicEnv, unpaidAI } from "@/lib/config/env";
import { useEffect, useRef, useState } from "react";
import { mediaSession } from "@/lib/live/mediaSession";
import { preloadVision, VisionEngine } from "@/lib/vision/engine";
import {
  calibrateGaze,
  calibratePosture,
  defaultCalibration,
  framingChecks,
  type FaceFeatures,
  type PoseFeatures,
} from "@/lib/vision/features";
import {
  MIC_CONFIRM_MS,
  MIC_PASS_PEAK_DB,
  NOISY_FLOOR_DB,
  VIDEO_RECORD_SIZE,
} from "@/lib/config/constants";
import { errorMessage, send } from "@/lib/utils/client";
import { median } from "@/lib/utils/math";
import type { Calibration, SessionPublic } from "@/types/interview";

const labels = [
  "Browser and models",
  "Permissions",
  "Framing",
  "Posture",
  "Gaze",
  "Microphone",
  "Audio output",
  "Consent and start",
];
function supported() {
  const match = navigator.userAgent.match(/(?:Edg|Chrome)\/(\d+)/);
  const canvas = document.createElement("canvas");
  return [
    {
      label: "Desktop Chrome or Edge 120+",
      pass:
        !/Android|Mobile|OPR\//.test(navigator.userAgent) &&
        Number(match?.[1]) >= 120,
    },
    { label: "Secure connection", pass: window.isSecureContext },
    { label: "WebGL2", pass: Boolean(canvas.getContext("webgl2")) },
    { label: "AudioWorklet", pass: "AudioWorkletNode" in window },
    {
      label: "WebM recording",
      pass:
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(VIDEO_RECORD_SIZE.mimeType),
    },
  ];
}
function Preview({ stream }: { stream: MediaStream | null }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="setup-preview">
      <video
        ref={video}
        muted
        autoPlay
        playsInline
        aria-label="Mirrored camera preview"
      />
      <span className="framing-oval" aria-hidden="true" />
    </div>
  );
}
export function SetupWizard({
  data,
  debug,
}: {
  data: SessionPublic;
  debug: boolean;
}) {
  const { config, session } = data;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<ReturnType<typeof supported>>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [face, setFace] = useState<FaceFeatures>();
  const [pose, setPose] = useState<PoseFeatures>();
  const [luma, setLuma] = useState<number | null>(null);
  const [framed, setFramed] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(() =>
    structuredClone(session.calibration ?? defaultCalibration),
  );
  const [capture, setCapture] = useState(0);
  const [progress, setProgress] = useState(0);
  const [noise, setNoise] = useState<number | null>(null);
  const [heard, setHeard] = useState<boolean | null>(null);
  const [headphones, setHeadphones] = useState<boolean | null>(null);
  const [consent, setConsent] = useState<boolean[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const calibrationRef = useRef(calibration);
  const visionRef = useRef<VisionEngine | null>(null);
  const mounted = useRef(false);
  const handoff = useRef(false);

  function saveCalibration(value: Calibration) {
    calibrationRef.current = value;
    mediaSession.calibration = value;
    setCalibration(value);
  }

  useEffect(() => {
    let active = true;
    async function check() {
      const results = supported();
      if (!active) return;
      setChecks(results);
      if (!results[0].pass || !results.slice(1).every((x) => x.pass)) return;
      try {
        const result = await preloadVision();
        if (active) {
          calibrationRef.current = {
            ...calibrationRef.current,
            device: {
              userAgent: navigator.userAgent,
              gpu: result.tier === "full" ? "WebGL2" : "CPU",
              visionTier: result.tier,
            },
          };
          setCalibration(calibrationRef.current);
          setStep(1);
        }
      } catch {
        if (active)
          setError(
            "Vision models could not load. Reload this page to try again.",
          );
      }
    }
    void Promise.resolve().then(check);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      visionRef.current?.stop();
      if (
        !handoff.current ||
        window.location.pathname !== "/interview/" + session.id + "/live"
      )
        mediaSession.close();
    };
  }, [session.id]);
  async function open(mock = false) {
    setError("");
    setBusy(true);
    try {
      const media = await mediaSession.open();
      if (!mounted.current) return;
      setStream(media.stream);
      mediaSession.mockCalibration = mock;
      if (mock) {
        const seed = structuredClone(defaultCalibration);
        seed.device.userAgent = navigator.userAgent;
        seed.headphones = true;
        seed.echoSafe = false;
        saveCalibration(seed);
        setHeard(true);
        setHeadphones(true);
        setStep(7);
      } else {
        const { models, tier } = await preloadVision();
        if (!mounted.current) return;
        let last = 0,
          goodSince: number | null = null;
        const vision = new VisionEngine(media.video, models, tier, {
          calibration: () => calibrationRef.current,
          clock: () => -1,
          context: () => ({ state: "X", turnIdx: null }),
          setup: true,
          onFaceCount: config.collectDelivery
            ? undefined
            : (count) => {
                const now = performance.now();
                goodSince = count === 1 ? (goodSince ?? now) : null;
                setFramed(goodSince !== null && now - goodSince >= 2000);
              },
          onFrame: () => {
            const now = performance.now();
            if (now - last < 100) return;
            last = now;
            const latestFace = vision.face?.value,
              latestPose = vision.pose?.value;
            const passed = framingChecks(
              latestFace,
              latestPose,
              vision.luma,
            ).every((check) => check.pass);
            goodSince = passed ? (goodSince ?? now) : null;
            setFace(latestFace);
            setPose(latestPose);
            setLuma(vision.luma);
            setFramed(goodSince !== null && now - goodSince >= 2000);
          },
          onTier: (visionTier) => {
            calibrationRef.current = {
              ...calibrationRef.current,
              device: { ...calibrationRef.current.device, visionTier },
            };
          },
        });
        visionRef.current = vision;
        vision.start();
        setStep(2);
      }
    } catch (error) {
      setError(
        errorMessage(error) +
          " Check camera and microphone permissions in the address bar.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    const started = performance.now();
    const poses: PoseFeatures[] = [],
      faces: FaceFeatures[] = [];
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      setProgress(Math.min(3000, elapsed));
      const vision = visionRef.current;
      if (vision?.pose) poses.push(vision.pose.value);
      if (elapsed > 500 && vision?.face) faces.push(vision.face.value);
      if (elapsed < 3000) return;
      clearInterval(timer);
      const reading =
        step === 3 ? calibratePosture(poses) : calibrateGaze(faces);
      if (!reading) {
        setError(
          step === 4
            ? "Keep your eyes on the orb"
            : "Make sure both shoulders are visible.",
        );
        return;
      }
      const next =
        step === 3
          ? {
              ...calibrationRef.current,
              posture: reading as Calibration["posture"],
            }
          : { ...calibrationRef.current, gaze: reading as Calibration["gaze"] };
      calibrationRef.current = next;
      mediaSession.calibration = next;
      setCalibration(next);
      setStep(step + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [step, capture]);

  useEffect(() => {
    if (step !== 5 || !stream) return;
    const context = new AudioContext();
    void context.resume();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize),
      floor: number[] = [];
    const start = performance.now();
    let peak = -180;
    let noiseFloorDb: number | undefined;
    let loudSince: number | null = null;
    const timer = setInterval(() => {
      const elapsed = performance.now() - start;
      analyser.getFloatTimeDomainData(samples);
      const db =
        20 *
        Math.log10(
          Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length) +
            1e-9,
        );
      setProgress(db);
      if (elapsed < 2000) {
        floor.push(db);
        return;
      }
      if (noiseFloorDb === undefined) {
        noiseFloorDb = median(floor) ?? -60;
        setNoise(noiseFloorDb);
      }
      if (db <= MIC_PASS_PEAK_DB) {
        loudSince = null;
        peak = -180;
        return;
      }
      loudSince ??= elapsed;
      peak = Math.max(peak, db);
      if (elapsed - loudSince < MIC_CONFIRM_MS) return;
      clearInterval(timer);
      const next = {
        ...calibrationRef.current,
        audio: { noiseFloorDb, micPeakDb: peak },
      };
      calibrationRef.current = next;
      mediaSession.calibration = next;
      setCalibration(next);
      setStep(6);
    }, 80);
    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close();
    };
  }, [step, stream]);

  const consentLabels = [
    "I consent to recording and analysis of my interview.",
    config.kind === "company"
      ? "A human at " + session.company + " makes the hiring decision."
      : "AI feedback is coaching, not a hiring decision.",
    session.aiMode === "mock"
      ? "This interview uses simulated AI."
      : publicEnv.aiDataTier === "unpaid"
        ? "I am using fictional materials and simulated camera and microphone input for this demo."
        : "Interview materials will be processed by the configured AI providers.",
    "Recordings auto-delete after 30 days.",
    ...(config.kind === "company"
      ? [
          "Your interview recording, transcript and AI evaluation will be shared with " +
            session.company +
            ".",
        ]
      : []),
  ];
  async function start() {
    setBusy(true);
    setError("");
    const payload = {
      ...calibrationRef.current,
      headphones: Boolean(headphones),
      echoSafe: !headphones,
    };
    mediaSession.calibration = payload;
    try {
      await send("/api/sessions/" + session.id, "PATCH", {
        calibration: payload,
        consent: {
          recording: true,
          coachingOnly: true,
          freeTierData: true,
          ...(unpaidAI && { syntheticInputs: true }),
          retention: true,
          shareWithCompany: config.kind === "company",
          acceptedAt: new Date().toISOString(),
        },
      });
      if (session.aiMode === "live") {
        const { LiveInterviewerClient } = await import("@/lib/live/liveClient");
        const client = new LiveInterviewerClient(() => {});
        await client.connect(session.id);
        client.close();
      }
      visionRef.current?.stop();
      visionRef.current = null;
      if (!mounted.current) return;
      handoff.current = true;
      router.push("/interview/" + session.id + "/live");
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  const blocked = checks.length > 0 && checks.some((check) => !check.pass);
  return (
    <section className="stack narrow">
      <div className="stack-sm">
        <h1>Interview setup</h1>
        <ol className="cluster" aria-label="Setup progress">
          {labels.map((label, index) => (
            <li
              key={label}
              title={label}
              aria-current={index === step ? "step" : undefined}
            >
              <span
                className={
                  "badge " +
                  (index === step ? "primary" : index < step ? "accent" : "")
                }
              >
                {index < step ? "✓" : index + 1}
                <span className="sr-only"> {label}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="card stack">
        <h2>{labels[step]}</h2>
        {step === 1 && unpaidAI && (
          <p>
            This demo uses unpaid AI services. Use synthetic camera and
            microphone input and fictional interview material.
          </p>
        )}
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
        {step === 0 && (
          <>
            <ul className="stack-sm">
              {checks.map((check) => (
                <li key={check.label}>
                  {check.pass ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>
            {blocked ? (
              <p role="alert">SkillMirror needs desktop Chrome or Edge.</p>
            ) : (
              <>
                <progress />
                <p role="status">Loading vision models…</p>
              </>
            )}
          </>
        )}
        {step === 1 && session.aiMode === "mock" && !blocked && (
          <div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void open(true)}
            >
              Use mock calibration
            </button>
          </div>
        )}
        {step === 1 && (
          <button
            className="button"
            disabled={busy}
            onClick={() => void open()}
          >
            Allow camera &amp; microphone
          </button>
        )}
        {(step === 2 || step === 3) && <Preview stream={stream} />}
        {step === 2 && (
          <>
            <ul className="stack-sm">
              {(config.collectDelivery
                ? framingChecks(face, pose, luma)
                : [
                    {
                      label: "One face in view",
                      pass: framed,
                      message: "Face the camera for two seconds.",
                    },
                  ]
              ).map((check) => (
                <li key={check.label}>
                  <span
                    className={"badge " + (check.pass ? "accent" : "warning")}
                  >
                    {check.pass ? "✓ " : ""}
                    {check.label}
                  </span>{" "}
                  {!check.pass && check.message}
                </li>
              ))}
            </ul>
            {debug && face && (
              <pre className="inset mono">
                {JSON.stringify(
                  {
                    yaw: face.yaw,
                    pitch: face.pitch,
                    h: face.h,
                    ev: face.ev,
                    gazeYaw: face.gazeYaw,
                    gazePitch: face.gazePitch,
                    luma,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
            <button
              className="button"
              disabled={!framed}
              onClick={() => {
                setProgress(0);
                setStep(config.collectDelivery ? 3 : 5);
              }}
            >
              Next
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <p>Sit comfortably upright and look at the screen.</p>
            <progress value={progress} max={3000} />
          </>
        )}
        {step === 4 && (
          <>
            <div className="orb mx-auto size-[120px]" />
            <p className="center">Look at the orb</p>
            <progress value={progress} max={3000} />
          </>
        )}
        {(step === 3 || step === 4) && error && (
          <button
            className="button"
            onClick={() => {
              setError("");
              setProgress(0);
              setCapture((count) => count + 1);
            }}
          >
            Retry
          </button>
        )}
        {step === 5 && (
          <>
            <p role="status">
              {noise === null
                ? "Stay quiet for 2 seconds…"
                : "Read aloud: I am ready for my interview."}
            </p>
            <meter
              min={-80}
              max={0}
              value={Math.max(-80, Math.min(0, progress))}
              aria-label="Microphone level"
            />
          </>
        )}
        {step === 6 && (
          <>
            {noise !== null && noise > NOISY_FLOOR_DB && (
              <p className="badge warning">Your room is noisy.</p>
            )}
            <button
              className="button secondary"
              onClick={() =>
                void new Audio("/audio/tone-check.wav")
                  .play()
                  .catch((error) => setError(errorMessage(error)))
              }
            >
              Play test tone
            </button>
            <fieldset className="stack-sm">
              <legend>Did you hear it?</legend>
              <div className="cluster">
                {[true, false].map((value) => (
                  <label className="check" key={String(value)}>
                    <input
                      name="heard"
                      type="radio"
                      checked={heard === value}
                      onChange={() => setHeard(value)}
                    />
                    {value ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
            {heard === false && (
              <p>Check your speaker volume and play the tone again.</p>
            )}
            <fieldset className="stack-sm">
              <legend>Are you using headphones?</legend>
              <div className="cluster">
                {[true, false].map((value) => (
                  <label className="check" key={String(value)}>
                    <input
                      name="headphones"
                      type="radio"
                      checked={headphones === value}
                      onChange={() => setHeadphones(value)}
                    />
                    {value ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
            {headphones === false && (
              <p role="status">
                {config.requireHeadphones
                  ? session.company +
                    " requires headphones for this interview. Please connect headphones to continue."
                  : "Echo-safe mode on: you won't be able to interrupt the interviewer."}
              </p>
            )}
            <button
              className="button"
              disabled={
                !heard ||
                headphones === null ||
                (config.requireHeadphones && !headphones)
              }
              onClick={() => setStep(7)}
            >
              Next
            </button>
          </>
        )}
        {step === 7 && (
          <>
            {consentLabels.map((label, index) => (
              <label key={label} className="check">
                <input
                  type="checkbox"
                  checked={Boolean(consent[index])}
                  onChange={(event) =>
                    setConsent((previous) =>
                      Object.assign([...previous], {
                        [index]: event.target.checked,
                      }),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <div className="inset">
              <strong>{config.lengthMinutes} minutes</strong> ·{" "}
              {headphones ? "Headphones" : "Echo-safe mode"} ·{" "}
              {calibration.device.visionTier} tracking
            </div>
            <button
              className="button"
              disabled={busy || !consentLabels.every((_, i) => consent[i])}
              onClick={() => void start()}
            >
              {busy ? "Connecting…" : "Start interview"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
