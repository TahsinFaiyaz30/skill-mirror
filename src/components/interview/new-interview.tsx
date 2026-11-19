"use client";
import {
  BriefcaseBusiness,
  Building2,
  Clock,
  FileUp,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { unpaidAI } from "@/lib/config/env";
import { ROLE_FAMILIES, SENIORITIES, readable } from "@/lib/config/taxonomy";
import { errorMessage, requestJSON, send } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { ParsedCV, SessionPublic, VoiceName } from "@/types/interview";
import {
  GuideCard,
  IconList,
  PhasePlan,
  ReadyChecklist,
} from "@/components/common/guides";
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
  lengthMinutes: 10 | 20;
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
function Summary({
  role,
  company,
  level,
  minutes,
}: {
  role: string;
  company: string;
  level: string;
  minutes: number;
}) {
  return (
    <GuideCard title="Your interview">
      <dl className="summary-list">
        <div>
          <dt>Role</dt>
          <dd>{role || "Not set yet"}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{company || "Not set yet"}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{level}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{minutes} minutes</dd>
        </div>
      </dl>
    </GuideCard>
  );
}
// Practice: name the interview first, then add a CV. Company invites already
// have their details, so they go straight to the CV.
export function NewInterview({ existing }: { existing?: SessionPublic }) {
  const router = useRouter();
  const companyMode = Boolean(existing);
  const [step, setStep] = useState<0 | 1>(companyMode ? 1 : 0);
  const [state, setState] = useState<
    "idle" | "uploading" | "parsing" | "saving"
  >("idle");
  const [error, setError] = useState("");
  const [cv, setCv] = useState<{ cvId: string; parsed: ParsedCV } | null>(null);
  const [previous, setPrevious] = useState("");
  const [syntheticMaterial, setSyntheticMaterial] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceName>("Kore");
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
  const minutes = existing?.session.lengthMinutes ?? details.lengthMinutes;
  const level = companyMode
    ? "Set by " + company
    : details.seniority
      ? readable(details.seniority)
      : "Matched to your CV";
  async function readCv() {
    setError("");
    try {
      let cvId = previous;
      if (file) {
        if (!/\.pdf$/i.test(file.name) || file.size > 5242880)
          throw new Error("Select a PDF no larger than 5 MB.");
        setState("uploading");
        const signed = await send<SignedUpload & { cvId: string }>(
          "/api/cv/upload-url",
          "POST",
          { fileName: file.name, sizeBytes: file.size },
        );
        await uploadFile("cvs", signed, file, "application/pdf");
        cvId = signed.cvId;
      }
      setState("parsing");
      setCv(
        await send("/api/cv/" + cvId + "/parse", "POST", { syntheticMaterial }),
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
          lengthMinutes: details.lengthMinutes,
          cvId: cv.cvId,
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
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStep(1);
  }
  function chooseFile(next: File | null) {
    setFile(next);
    setPrevious("");
    setError("");
  }
  const steps = companyMode ? ["Your CV"] : ["Interview details", "Your CV"];
  return (
    <section className="stack-lg">
      <div className="stack-sm">
        <h1>
          {existing
            ? "Interview for " +
              existing.session.roleTitle +
              " at " +
              existing.session.company
            : "New interview"}
        </h1>
        <p className="muted">
          {step === 0
            ? "Tell us which interview you want to practice."
            : "Add your CV so the questions fit your real experience."}
        </p>
      </div>
      {steps.length > 1 && (
        <ol className="steps" aria-label="Interview setup steps">
          {steps.map((name, index) => (
            <li
              key={name}
              data-state={
                index < step ? "done" : index === step ? "now" : undefined
              }
              aria-current={index === step ? "step" : undefined}
            >
              <span className="steps-num">{index + 1}</span>
              {name}
            </li>
          ))}
        </ol>
      )}
      <div className="with-aside">
        <div className="stack">
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          {step === 0 && (
            <form className="card stack" onSubmit={next}>
              <h2>Interview details</h2>
              <div className="grid-2">
                <label className="field">
                  Role title
                  <input
                    name="roleTitle"
                    list="roles"
                    required
                    maxLength={80}
                    placeholder="e.g. Backend Engineer"
                    value={details.roleTitle}
                    onChange={(event) =>
                      update({ roleTitle: event.target.value })
                    }
                  />
                  <datalist id="roles">
                    {roleOptions.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  Company
                  <input
                    name="company"
                    list="companies"
                    required
                    maxLength={80}
                    placeholder="e.g. Stripe"
                    value={details.company}
                    onChange={(event) =>
                      update({ company: event.target.value })
                    }
                  />
                  <datalist id="companies">
                    {companies.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
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
                  Seniority
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
              <fieldset className="stack-sm">
                <legend>Length</legend>
                <div className="cluster">
                  <label className="check inset">
                    <input
                      type="radio"
                      name="lengthMinutes"
                      value="20"
                      checked={details.lengthMinutes === 20}
                      onChange={() => update({ lengthMinutes: 20 })}
                    />
                    Standard 20 min
                  </label>
                  <label className="check inset">
                    <input
                      type="radio"
                      name="lengthMinutes"
                      value="10"
                      checked={details.lengthMinutes === 10}
                      onChange={() => update({ lengthMinutes: 10 })}
                    />
                    Quick 10 min
                  </label>
                </div>
              </fieldset>
              <VoiceSelect voice={voice} setVoice={setVoice} />
              <label className="field">
                Job description (optional)
                <textarea
                  value={details.jobDescription}
                  onChange={(event) =>
                    update({ jobDescription: event.target.value })
                  }
                  maxLength={6000}
                  placeholder="Paste the job post to get questions that match it."
                />
                <small>{details.jobDescription.length} / 6,000</small>
              </label>
              <div>
                <button className="button lg">Continue to CV</button>
              </div>
            </form>
          )}
          {step === 1 && !cv && (
            <div className="card stack">
              <h2>Upload your CV</h2>
              <div
                className="inset stack-sm dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  chooseFile(e.dataTransfer.files[0] ?? null);
                }}
              >
                <FileUp size={24} aria-hidden="true" />
                <label className="field">
                  Upload your CV
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <small>
                  {file
                    ? file.name
                    : "Drop a PDF here or choose a file. Up to 5 MB and 10 pages."}
                </small>
              </div>
              {unpaidAI && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={syntheticMaterial}
                    onChange={(e) => setSyntheticMaterial(e.target.checked)}
                  />
                  I am using a fictional CV without personal or confidential
                  information for this unpaid AI demo.
                </label>
              )}
              {available.length > 0 && (
                <fieldset className="stack-sm">
                  <legend>Or use a CV you uploaded before</legend>
                  {available.map((item) => (
                    <label className="check inset" key={item.cvId}>
                      <input
                        type="radio"
                        checked={item.cvId === previous}
                        onChange={() => {
                          setFile(null);
                          setPrevious(item.cvId);
                        }}
                      />
                      <span>
                        {item.fileName}
                        <br />
                        <small>{item.headline}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {state !== "idle" && (
                <div className="stack-sm" aria-live="polite">
                  <progress />
                  <p>
                    {state === "uploading"
                      ? "Uploading your CV…"
                      : "Reading your CV…"}
                  </p>
                </div>
              )}
              <div className="cluster">
                {!companyMode && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </button>
                )}
                <button
                  className="button"
                  disabled={
                    state !== "idle" ||
                    (!file && !previous) ||
                    (unpaidAI && !syntheticMaterial)
                  }
                  onClick={() => void readCv()}
                >
                  {error ? "Retry" : "Read CV"}
                </button>
              </div>
            </div>
          )}
          {step === 1 && cv && (
            <div className="card stack">
              <div className="stack-sm">
                <span className="eyebrow">Check what we read</span>
                <h2>{cv.parsed.full_name}</h2>
                <p>{cv.parsed.headline}</p>
                <p className="cluster">
                  <span className="badge">
                    {readable(cv.parsed.seniority_estimate)}
                  </span>
                  {cv.parsed.total_years_experience} years of experience
                </p>
              </div>
              <div className="stack-sm">
                <h3>Skills</h3>
                <small>
                  Remove any skill you don&apos;t want to be asked about.
                </small>
              </div>
              {Object.entries(
                Object.groupBy(
                  cv.parsed.skills.filter(
                    (skill) => !cv.parsed.skills_removed.includes(skill.name),
                  ),
                  (skill) => skill.category,
                ),
              ).map(([category, skills]) => (
                <div key={category} className="stack-sm">
                  <small>{readable(category)}</small>
                  <div className="cluster" style={{ gap: 8 }}>
                    {skills?.map((skill) => (
                      <span
                        key={skill.name}
                        className="badge"
                        title={skill.evidence}
                      >
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
                </div>
              ))}
              <div className="grid-2">
                <div className="stack-sm">
                  <h3>Experience</h3>
                  {cv.parsed.experience.map((job, index) => (
                    <p key={index}>
                      {job.title} · {job.company}
                    </p>
                  ))}
                </div>
                <div className="stack-sm">
                  <h3>Projects</h3>
                  {cv.parsed.projects.map((project, index) => (
                    <p key={index}>
                      {project.name} · {project.role}
                    </p>
                  ))}
                </div>
              </div>
              <div className="cluster">
                <button
                  className="button secondary"
                  disabled={state !== "idle"}
                  onClick={() => setCv(null)}
                >
                  Use another CV
                </button>
                <button
                  className="button"
                  disabled={state !== "idle"}
                  onClick={() => void confirmCv()}
                >
                  This looks right
                </button>
              </div>
              {state === "saving" && (
                <p role="status" className="muted">
                  {companyMode ? "Saving your CV…" : "Creating your interview…"}
                </p>
              )}
            </div>
          )}
        </div>
        <aside aria-label="Interview information">
          <Summary
            role={role}
            company={company}
            level={level}
            minutes={minutes}
          />
          {step === 0 ? (
            <>
              <PhasePlan minutes={details.lengthMinutes} />
              <ReadyChecklist />
            </>
          ) : (
            <GuideCard
              title={companyMode ? "Who sees what" : "Your CV stays private"}
            >
              <IconList
                items={
                  companyMode
                    ? [
                        [
                          Building2,
                          company +
                            " receives your recording, transcript, evaluation and a summary of your CV.",
                        ],
                        [
                          ShieldCheck,
                          "You review the consent terms before recording starts",
                        ],
                        [
                          Clock,
                          "Recordings are deleted after 30 days by default",
                        ],
                      ]
                    : [
                        [
                          BriefcaseBusiness,
                          "Your CV is used only to plan your questions",
                        ],
                        [Lock, "Practice reports are private to you"],
                        [
                          Clock,
                          "Recordings are deleted after 30 days by default",
                        ],
                      ]
                }
              />
            </GuideCard>
          )}
        </aside>
      </div>
    </section>
  );
}
