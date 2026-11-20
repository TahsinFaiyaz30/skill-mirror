"use client";
import {
  ArrowRight,
  Camera,
  CircleCheck,
  FileText,
  FileUp,
  Headphones,
  Monitor,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { QUICK_INTERVIEW_MINUTES } from "@/lib/config/constants";
import { unpaidAI } from "@/lib/config/env";
import { ROLE_FAMILIES, SENIORITIES, readable } from "@/lib/config/taxonomy";
import { errorMessage, requestJSON, send } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { ParsedCV, SessionPublic, VoiceName } from "@/types/interview";
import { SuggestInput } from "@/components/ui/suggest-input";
import { Orbit } from "@/components/common/orbit";
type CVRow = {
  cvId: string;
  fileName: string;
  headline: string | null;
  parseStatus: string;
};
type Details = {
  company: string;
  roleTitle: string;
  roleFamily: string;
  seniority: string;
  lengthMinutes: 2 | 3.5 | 10 | 20;
  jobDescription: string;
};
const companies = [
  "Google",
  "Meta",
  "Microsoft",
  "Amazon",
  "Apple",
  "Netflix",
  "Stripe",
  "Generic startup",
];
export const roleOptions = [
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Full-Stack Engineer",
  "Mobile Engineer",
  "ML Engineer",
  "Data Scientist",
  "Data Engineer",
  "DevOps/SRE",
  "Product Manager",
  "Product Designer",
];
const lengths = [
  [20, "20 min", "Full interview"],
  [10, "10 min", "Shorter round"],
  [3.5, "3 min 30 s", "Fast interview"],
  [2, "2 min", "Quick test"],
] as const;
export function VoiceSelect({
  voice,
  setVoice,
}: {
  voice: VoiceName;
  setVoice: (value: VoiceName) => void;
}) {
  const [previewError, setPreviewError] = useState("");
  async function preview(value: VoiceName) {
    setPreviewError("");
    try {
      await new Audio("/audio/voice-" + value.toLowerCase() + ".wav").play();
    } catch {
      setPreviewError("The voice preview could not play. Try again.");
    }
  }
  return (
    <fieldset className="stack-sm">
      <legend>Interviewer voice</legend>
      {previewError && <p role="alert">{previewError}</p>}
      <div className="cluster">
        {(["Kore", "Charon"] as const).map((name) => (
          <div key={name} className="inset cluster">
            <label className="cluster">
              <input
                type="radio"
                name="voiceName"
                checked={voice === name}
                onChange={() => setVoice(name)}
              />
              {name}
            </label>
            <button
              type="button"
              className="button ghost icon"
              aria-label={"Preview " + name}
              onClick={() => void preview(name)}
            >
              ▶
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
// The dashboard asks for one thing first: the CV. Reading starts as soon as a
// file is picked. Once the CV is read, the interview questions slide in one
// after another. Company invites already have their details, so after the
// CV they go straight to Continue.
export function NewInterview({
  existing,
  firstName = "",
}: {
  existing?: SessionPublic;
  firstName?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<
    "idle" | "uploading" | "parsing" | "saving"
  >("idle");
  const [error, setError] = useState("");
  const [cv, setCv] = useState<{ cvId: string; parsed: ParsedCV } | null>(null);
  const [previous, setPrevious] = useState("");
  const [syntheticMaterial, setSyntheticMaterial] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [voice, setVoice] = useState<VoiceName>("Kore");
  const [judgeMode, setJudgeMode] = useState(false);
  const [details, setDetails] = useState<Details>({
    company: "",
    roleTitle: "",
    roleFamily: ROLE_FAMILIES[0],
    seniority: "",
    lengthMinutes: 20,
    jobDescription: "",
  });
  const update = (patch: Partial<Details>) =>
    setDetails((current) => ({ ...current, ...patch }));
  const cvQuery = useQuery({
    queryKey: ["cvs"],
    queryFn: () => requestJSON<{ items: CVRow[] }>("/api/cv"),
  });
  const available = (cvQuery.data?.items ?? []).filter(
    (item) => item.parseStatus === "parsed",
  );
  const role = existing?.session.roleTitle ?? details.roleTitle;
  const company = existing?.session.company ?? details.company;
  const minutes =
    existing?.session.lengthMinutes ??
    (judgeMode ? QUICK_INTERVIEW_MINUTES : details.lengthMinutes);
  const blocked = unpaidAI && !syntheticMaterial;
  // Upload (when there is a new file) and read the CV.
  async function readCv(
    source: { file: File | null; previous: string },
    synthetic = syntheticMaterial,
  ) {
    setError("");
    try {
      let cvId = source.previous;
      if (source.file) {
        if (!/\.pdf$/i.test(source.file.name) || source.file.size > 5242880)
          throw new Error("Select a PDF no larger than 5 MB.");
        setState("uploading");
        const signed = await send<SignedUpload & { cvId: string }>(
          "/api/cv/upload-url",
          "POST",
          { fileName: source.file.name, sizeBytes: source.file.size },
        );
        await uploadFile("cvs", signed, source.file, "application/pdf");
        cvId = signed.cvId;
      }
      setState("parsing");
      setCv(
        await send("/api/cv/" + cvId + "/parse", "POST", {
          syntheticMaterial: synthetic,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setState("idle");
    }
  }
  async function confirmCv() {
    if (!cv) return;
    setState("saving");
    setError("");
    try {
      await send("/api/cv/" + cv.cvId, "PATCH", {
        skillsRemoved: cv.parsed.skills_removed,
      });
      if (existing) {
        const id = existing.session.id;
        await send("/api/sessions/" + id, "PATCH", { cvId: cv.cvId });
        router.push("/interview/" + id + "/prepare");
        return;
      }
      const { sessionId } = await send<{ sessionId: string }>(
        "/api/sessions",
        "POST",
        {
          company: details.company,
          roleTitle: details.roleTitle,
          roleFamily: details.roleFamily,
          seniority: details.seniority || cv.parsed.seniority_estimate,
          lengthMinutes: minutes,
          cvId: cv.cvId,
          ...(judgeMode && { judgeMode: true }),
          voiceName: voice,
          jobDescription: details.jobDescription,
        },
      );
      router.push("/interview/" + sessionId + "/prepare");
    } catch (error) {
      setError(errorMessage(error));
      setState("idle");
    }
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void confirmCv();
  }
  // Picking a file (or an earlier CV) reads it straight away.
  function choose(source: { file: File | null; previous: string }) {
    setFile(source.file);
    setPrevious(source.previous);
    setError("");
    if (!blocked && (source.file || source.previous)) void readCv(source);
  }
  function changeCv() {
    setCv(null);
    setFile(null);
    setPrevious("");
    setError("");
  }
  const busy = state !== "idle";
  const reading = state === "uploading" || state === "parsing";
  const pending = Boolean(file || previous);

  // Step 1: only the CV.
  const upload = (
    <div className="flow-step rise rise-2">
      {unpaidAI && (
        <label className="check">
          <input
            type="checkbox"
            checked={syntheticMaterial}
            onChange={(event) => {
              setSyntheticMaterial(event.target.checked);
              if (event.target.checked && pending && !reading)
                void readCv({ file, previous }, true);
            }}
          />
          I am using a fictional CV without personal or confidential
          information for this unpaid AI demo.
        </label>
      )}
      {reading ? (
        <div className="cv-reading" aria-live="polite">
          <Orbit />
          <strong>
            {state === "uploading" ? "Uploading your CV…" : "Reading your CV…"}
          </strong>
          <div className="prep-bar" aria-hidden="true">
            <i style={{ width: state === "uploading" ? "35%" : "78%" }} />
          </div>
          <small>Finding your skills, experience and projects.</small>
        </div>
      ) : (
        <div
          className="cv-drop big"
          data-drag={drag}
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);
            choose({ file: event.dataTransfer.files[0] ?? null, previous: "" });
          }}
        >
          <span className="cv-drop-icon" aria-hidden="true">
            <FileUp size={28} />
          </span>
          <strong>Drop your CV here</strong>
          <span className="button cv-choose" aria-hidden="true">
            Choose your CV
          </span>
          {file ? (
            <span className="cv-file">
              <FileText size={15} aria-hidden="true" />
              {file.name}
            </span>
          ) : (
            <small>PDF, up to 5 MB</small>
          )}
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose your CV, a PDF up to 5 MB"
            onChange={(event) =>
              choose({ file: event.target.files?.[0] ?? null, previous: "" })
            }
          />
        </div>
      )}
      {error && (
        <div className="flow-error" role="alert">
          <span>{error}</span>
          {pending && !reading && !blocked && (
            <button
              type="button"
              className="button secondary sm"
              onClick={() => void readCv({ file, previous })}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {blocked && pending && !error && (
        <p className="muted small center">
          Tick the box above and we&apos;ll read your CV.
        </p>
      )}
      {available.length > 0 && !reading && (
        <details className="more-link">
          <summary>Use a CV you uploaded before</summary>
          <ul className="previous-cvs">
            {available.map((item) => (
              <li key={item.cvId}>
                <button
                  type="button"
                  onClick={() => choose({ file: null, previous: item.cvId })}
                >
                  <FileText size={17} aria-hidden="true" />
                  <span>
                    <strong>{item.fileName}</strong>
                    {item.headline && <small>{item.headline}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  // The CV, once read: one line, with the details tucked away.
  const summary = cv && (
    <div className="flow-step rise">
      <div className="cv-line">
        <CircleCheck size={20} aria-hidden="true" />
        <span>
          <strong>{cv.parsed.full_name}</strong>
          {" · "}
          {readable(cv.parsed.seniority_estimate)}
          {" · "}
          {cv.parsed.total_years_experience} years
        </span>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={changeCv}
        >
          Change
        </button>
      </div>
      <div className="cv-skills">
        <div className="cv-skills-head">
          <strong>Skills you&apos;ll be asked about</strong>
          <small>Tap × to remove any you don&apos;t want.</small>
        </div>
        <div className="stack-sm">
          <div className="skill-chips">
            {cv.parsed.skills
              .filter((skill) => !cv.parsed.skills_removed.includes(skill.name))
              .map((skill) => (
                <span key={skill.name} className="badge" title={skill.evidence}>
                  {skill.name}
                  <button
                    type="button"
                    className="badge-remove"
                    aria-label={"Remove " + skill.name}
                    onClick={() =>
                      setCv({
                        ...cv,
                        parsed: {
                          ...cv.parsed,
                          skills_removed: [
                            ...cv.parsed.skills_removed,
                            skill.name,
                          ],
                        },
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
          {(cv.parsed.experience.length > 0 ||
            cv.parsed.projects.length > 0) && (
            <p className="cv-from">
              From your CV:{" "}
              {[
                ...cv.parsed.experience.map(
                  (job) => job.title + " at " + job.company,
                ),
                ...cv.parsed.projects.map((project) => project.name),
              ].join(" · ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const ready = (
    <ul className="ready-line" aria-label="Before you start">
      <li>
        <Monitor size={15} aria-hidden="true" />
        Chrome or Edge
      </li>
      <li>
        <Camera size={15} aria-hidden="true" />
        Camera and mic
      </li>
      <li>
        <Headphones size={15} aria-hidden="true" />
        A quiet room
      </li>
    </ul>
  );

  if (existing)
    return (
      <section className="flow">
        <div className="flow-head rise">
          <h1>
            Interview for {existing.session.roleTitle} at{" "}
            {existing.session.company}
          </h1>
          <p>
            {cv
              ? "Check your CV, then continue."
              : "Add your CV so the questions fit your real experience."}
          </p>
        </div>
        {cv ? (
          <>
            {summary}
            <div className="flow-step rise rise-2">
              {error && (
                <p className="danger" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="button accent lg flow-cta"
                disabled={busy}
                aria-busy={state === "saving"}
                onClick={() => void confirmCv()}
              >
                {state === "saving" ? "Saving your CV" : "Continue"}
                {state !== "saving" && (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </button>
              <p className="muted small center" style={{ margin: 0 }}>
                {company} receives your recording, transcript, evaluation and a
                summary of your CV. Recordings are deleted after 30 days by
                default.
              </p>
            </div>
          </>
        ) : (
          upload
        )}
      </section>
    );

  return (
    <section className="flow" aria-label="Start an interview">
      <div className="flow-head rise">
        <h1>{firstName ? "Hi " + firstName + "." : "Hi there."}</h1>
        <p>
          {cv
            ? "Now tell us about the interview."
            : "Let's start with your CV."}
        </p>
      </div>
      {!cv ? (
        upload
      ) : (
        <>
          {summary}
          <form className="flow-form" onSubmit={start}>
            <fieldset className="flow-step rise rise-2">
              <legend className="flow-q">What job are you practising for?</legend>
              <div className="grid-2">
                <label className="field">
                  Role
                  <SuggestInput
                    name="roleTitle"
                    required
                    maxLength={80}
                    placeholder="Backend Engineer"
                    value={details.roleTitle}
                    options={roleOptions}
                    onChange={(roleTitle) => update({ roleTitle })}
                  />
                </label>
                <label className="field">
                  Company
                  <SuggestInput
                    name="company"
                    required
                    maxLength={80}
                    placeholder="Stripe"
                    value={details.company}
                    options={companies}
                    onChange={(company) => update({ company })}
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="flow-step rise rise-3">
              <legend className="flow-q">How long?</legend>
              <div className="length-switch">
                {lengths.map(([value, label, note]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="lengthMinutes"
                      value={value}
                      checked={minutes === value}
                      disabled={judgeMode}
                      onChange={() => update({ lengthMinutes: value })}
                    />
                    <strong>{label}</strong>
                    <small>{note}</small>
                  </label>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={judgeMode}
                  disabled={busy}
                  onChange={(event) => setJudgeMode(event.target.checked)}
                />
                Judge mode (3 minutes 30 seconds with shorter AI reasoning)
              </label>
            </fieldset>
            <fieldset className="flow-step rise rise-4">
              <legend className="flow-q">
                Fine-tune it <span className="flow-optional">optional</span>
              </legend>
              <div className="stack">
                <div className="grid-2">
                  <label className="field">
                    Role family
                    <select
                      name="roleFamily"
                      value={details.roleFamily}
                      onChange={(event) =>
                        update({ roleFamily: event.target.value })
                      }
                    >
                      {ROLE_FAMILIES.map((x) => (
                        <option key={x} value={x}>
                          {readable(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Level
                    <select
                      name="seniority"
                      value={details.seniority}
                      onChange={(event) =>
                        update({ seniority: event.target.value })
                      }
                    >
                      <option value="">Match my CV</option>
                      {SENIORITIES.map((x) => (
                        <option key={x} value={x}>
                          {readable(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <VoiceSelect voice={voice} setVoice={setVoice} />
                <label className="field">
                  Job post (optional)
                  <textarea
                    value={details.jobDescription}
                    onChange={(event) =>
                      update({ jobDescription: event.target.value })
                    }
                    maxLength={6000}
                    rows={3}
                    placeholder="Paste the job post to get questions that match it."
                  />
                  <small>{details.jobDescription.length} / 6,000</small>
                </label>
              </div>
            </fieldset>
            <div className="flow-step rise rise-5">
              {error && (
                <p className="danger" role="alert" style={{ margin: 0 }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="button accent lg flow-cta"
                disabled={busy}
                aria-busy={state === "saving"}
              >
                {state === "saving"
                  ? "Creating your interview"
                  : role && company
                    ? minutes === 3.5
                      ? "Start your 3 min 30 s interview"
                      : "Start your " + minutes + " minute interview"
                    : "Start interview"}
                {state !== "saving" && (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </button>
              {ready}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
