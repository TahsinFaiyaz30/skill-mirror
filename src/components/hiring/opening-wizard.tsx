"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { Check, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import {
  COMPETENCY_KEYS,
  OPTIONAL_PHASES,
  PHASE_LABELS,
  ROLE_FAMILIES,
  SENIORITIES,
  TAXONOMY,
  readable,
  type CompetencyKey,
} from "@/lib/config/taxonomy";
import {
  defaultOpeningConfig,
  validateOpening,
  buildSessionConfig,
  WEIGHT_KEYS,
  type OpeningValidation,
} from "@/lib/config/sessionConfig";
import {
  errorMessage,
  RequestError,
  requestJSON,
  send,
  showError,
} from "@/lib/utils/client";
import { roleOptions, VoiceSelect } from "@/components/interview/new-interview";
import type { Opening, OpeningDetail } from "@/types/hiring";
import type {
  OpeningConfig,
  OpeningQuestion,
  PresentationScenario,
  Weights,
} from "@/types/interview";
import {
  QuestionEditor,
  editableQuestion,
  stripEditor,
  type EditableQuestion,
} from "./question-editor";

const steps = [
  "Basics",
  "Interview design",
  "Questions",
  "AI behavior",
  "Evaluation",
  "Review & publish",
];
const modeDetails = {
  scripted: ["Scripted", "The AI asks only your questions."],
  hybrid: [
    "Hybrid",
    "Your must-ask questions first, then adaptive AI questions.",
  ],
  auto: [
    "Full auto",
    "The AI plans everything from your instructions and the CV.",
  ],
} as const;
const initialBasics: Pick<
  Opening,
  | "title"
  | "roleTitle"
  | "roleFamily"
  | "seniority"
  | "department"
  | "jobDescription"
> = {
  title: "",
  roleTitle: "",
  roleFamily: "software_engineering",
  seniority: "mid",
  department: null,
  jobDescription: null,
};
const emptyScenario: PresentationScenario = {
  title: "",
  scenario: "",
  audience: "",
  goal: "",
  interrupt_challenge: "",
  pushback_angles: ["", "", ""],
};
const phaseLabels = {
  ...PHASE_LABELS,
  cv_deep_dive: "CV & projects",
  candidate_questions: "Candidate questions",
};
const weightLabels = {
  technical: "Technical",
  behavioral: "Behavioral",
  cv: "CV & projects",
  soft: "Soft skills",
};
const formats = {
  scored: "Scored",
  coaching_only: "Coaching only (recommended)",
  off: "Off",
};
const visibility = {
  none: "Thank-you page",
  summary: "Two strengths, two growth areas, and a practice plan",
  full: "Full candidate report and clip playback",
};

export function BudgetBar({ validation }: { validation: OpeningValidation }) {
  const phases = Object.entries(validation.budgets) as [
    keyof typeof PHASE_LABELS,
    number,
  ][];
  const colors = [
    "primary",
    "accent",
    "ev-nonverbal",
    "ev-live-vision",
    "warning",
    "success",
  ];
  return (
    <div className="stack-sm">
      <div className="budget-bar" aria-hidden="true">
        {phases.map(([phase, budget], i) => (
          <span
            key={phase}
            style={{
              flex: budget,
              background: "var(--" + colors[i % colors.length] + ")",
            }}
          />
        ))}
      </div>
      <ul className="cluster small">
        {phases.map(([phase, budget], i) => (
          <li key={phase}>
            <span
              aria-hidden="true"
              style={{ color: "var(--" + colors[i % colors.length] + ")" }}
            >
              ●{" "}
            </span>
            {phaseLabels[phase]} · {budget / 60000} min
          </li>
        ))}
      </ul>
    </div>
  );
}
export function OpeningSummary({
  opening,
  questions,
  validation,
}: {
  opening: Pick<
    Opening,
    | "title"
    | "roleTitle"
    | "seniority"
    | "config"
    | "department"
    | "jobDescription"
  >;
  questions: number;
  validation: OpeningValidation;
}) {
  const c = opening.config;
  return (
    <div className="stack">
      <div className="grid-2">
        <section className="inset stack-sm">
          <h3>Interview design</h3>
          <p>
            {opening.roleTitle} · {readable(opening.seniority)}
            {opening.department && " · " + opening.department}
          </p>
          <p>
            {modeDetails[c.mode][0]} · {c.lengthMinutes} minutes · {questions}{" "}
            company questions
          </p>
          <p>
            Competencies ·{" "}
            {c.competencies.selection === "auto"
              ? "Automatic"
              : c.competencies.items
                  .map((q) => q.sub_label ?? TAXONOMY[q.key][0])
                  .join(", ")}
          </p>
        </section>
        <section className="inset stack-sm">
          <h3>Evaluation</h3>
          <p>
            {formats[c.evaluation.nonverbalPolicy]} · Pass threshold{" "}
            {c.evaluation.passThreshold}
          </p>
          <p>
            {WEIGHT_KEYS.map(
              (key) =>
                weightLabels[key] + " " + c.evaluation.weights[key] + "%",
            ).join(" · ")}
          </p>
          <p>
            {readable(c.candidate.feedbackVisibility)} feedback ·{" "}
            {c.candidate.inviteExpiryDays} day invite expiry
          </p>
        </section>
        <section className="inset stack-sm">
          <h3>AI behavior</h3>
          <p>
            {readable(c.ai.strictness)} · {readable(c.ai.adversarialIntensity)}{" "}
            intensity · {c.ai.voiceName}
          </p>
          {c.ai.interviewerName && <p>{c.ai.interviewerName}</p>}
          {c.ai.instructions && <p>{c.ai.instructions}</p>}
          {c.ai.toneInstructions && <p>{c.ai.toneInstructions}</p>}
          {c.presentation.custom && <p>{c.presentation.custom.title}</p>}
        </section>
        <section className="inset stack-sm">
          <h3>Candidate requirements</h3>
          <p>
            {c.cv.required ? "CV required" : "CV optional"} · Email match{" "}
            {c.candidate.requireEmailMatch ? "required" : "optional"} ·
            Headphones{" "}
            {c.integrity.requireHeadphones ? "required" : "recommended"}
          </p>
          {opening.jobDescription && <p>{opening.jobDescription}</p>}
        </section>
      </div>
      <BudgetBar validation={validation} />
    </div>
  );
}
function ValidationPanel({ validation }: { validation: OpeningValidation }) {
  return (
    <aside className="card stack validation-panel">
      <h2>Time & validation</h2>
      <BudgetBar validation={validation} />
      {!validation.errors.length && !validation.warnings.length && (
        <p className="cluster">
          <Check size={18} />
          Ready to publish
        </p>
      )}
      {validation.errors.map((issue, i) => (
        <p className="danger" key={issue.code + i}>
          {issue.message}
        </p>
      ))}
      {validation.warnings.map((issue, i) => (
        <p className="inset small" key={issue.code + i}>
          {issue.phase ? phaseLabels[issue.phase] + " · " : ""}
          {issue.message}
        </p>
      ))}
    </aside>
  );
}
function PreviewDialog({ id, close }: { id: string; close: () => void }) {
  const router = useRouter();
  const [cv, setCv] = useState("sample");
  const [error, setError] = useState("");
  const cvList = useQuery({
    queryKey: ["cvs"],
    queryFn: () =>
      requestJSON<{
        items: { cvId: string; fileName: string; parseStatus: string }[];
      }>("/api/cv"),
  });
  const ready =
    cvList.data?.items.filter((item) => item.parseStatus === "parsed") ?? [];
  async function start() {
    try {
      const { sessionId } = await send<{ sessionId: string }>(
        "/api/openings/" + id + "/preview",
        "POST",
        cv === "sample" ? { useSampleCandidate: true } : { cvId: cv },
      );
      router.push("/interview/" + sessionId + "/prepare");
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content card stack">
          <Dialog.Title>Preview interview</Dialog.Title>
          <Dialog.Description>
            Test the current interview design and questions.
          </Dialog.Description>
          <label className="field">
            Candidate CV
            <select value={cv} onChange={(e) => setCv(e.target.value)}>
              <option value="sample">Use a sample candidate</option>
              {ready.map((item) => (
                <option value={item.cvId} key={item.cvId}>
                  Use my CV · {item.fileName}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
          <div className="cluster">
            <Dialog.Close className="button secondary">Cancel</Dialog.Close>
            <button className="button" onClick={() => void start()}>
              Start preview
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PreviewButton({
  id,
  disabled = false,
}: {
  id: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Preview interview
      </button>
      {open && <PreviewDialog id={id} close={() => setOpen(false)} />}
    </>
  );
}
export function DuplicateButton({
  id,
  label = "Duplicate",
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      onClick={() => {
        void send<{ openingId: string }>(
          "/api/openings/" + id + "/duplicate",
          "POST",
        ).then(
          (result) =>
            router.push("/hiring/openings/" + result.openingId + "/edit"),
          showError,
        );
      }}
    >
      {label}
    </button>
  );
}
export function OpeningWizard({ initial }: { initial?: OpeningDetail }) {
  const router = useRouter();
  const [id, setId] = useState(initial?.opening.id ?? "");
  const [step, setStep] = useState(0);
  const [locked, setLocked] = useState(initial?.opening.locked ?? false);
  const [basics, setBasics] = useState(() =>
    initial
      ? {
          title: initial.opening.title,
          roleTitle: initial.opening.roleTitle,
          roleFamily: initial.opening.roleFamily,
          seniority: initial.opening.seniority,
          department: initial.opening.department,
          jobDescription: initial.opening.jobDescription,
        }
      : initialBasics,
  );
  const [config, setConfig] = useState(() =>
    structuredClone(initial?.opening.config ?? defaultOpeningConfig),
  );
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    () => initial?.questions.map(editableQuestion) ?? [],
  );
  const [saved, setSaved] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const request = useRef<Promise<OpeningQuestion[]> | null>(null);
  const latest = useRef(questions);
  const savedQuestions = useRef(JSON.stringify(stripEditor(questions)));
  const validation = validateOpening(config, stripEditor(questions));
  const changeConfig = <K extends keyof OpeningConfig>(
    key: K,
    value: OpeningConfig[K],
  ) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  };
  const changeQuestions = (next: EditableQuestion[]) => {
    latest.current = next;
    setQuestions(next);
    setSaved(false);
  };
  const handleError = useCallback((error: unknown) => {
    setError(errorMessage(error));
    showError(error);
    if (error instanceof RequestError && error.code === "LOCKED")
      setLocked(true);
  }, []);
  const saveQuestions = useCallback(async () => {
    if (!id || locked) return;
    if (request.current) await request.current;
    const draft = latest.current;
    const content = JSON.stringify(stripEditor(draft));
    if (content === savedQuestions.current || draft.some((q) => !q.text.trim()))
      return;
    const call = send<{ questions: OpeningQuestion[] }>(
      "/api/openings/" + id + "/questions",
      "PUT",
      { questions: stripEditor(draft) },
    ).then(({ questions }) => questions);
    request.current = call;
    try {
      const result = await call;
      savedQuestions.current = JSON.stringify(
        stripEditor(result.map(editableQuestion)),
      );
      const ids = new Map(
        draft.map((item, i) => [item.editorId, result[i]?.id]),
      );
      const current = latest.current;
      const next =
        current === draft
          ? result.map((q, i) => ({ ...q, editorId: draft[i].editorId }))
          : current.map((q) => ({ ...q, id: q.id ?? ids.get(q.editorId) }));
      latest.current = next;
      setQuestions(next);
      if (current === draft) setSaved(true);
      setError("");
    } finally {
      if (request.current === call) request.current = null;
    }
  }, [id, locked]);
  useEffect(() => {
    if (step !== 2 || !id || config.mode === "auto" || locked) return;
    const timer = setTimeout(
      () => void saveQuestions().catch(handleError),
      1000,
    );
    return () => clearTimeout(timer);
  }, [step, questions, id, locked, config.mode, saveQuestions, handleError]);
  async function persist() {
    if (!basics.title.trim() || !basics.roleTitle.trim())
      throw new Error("Enter an opening title and role title.");
    let active = id;
    if (!active) {
      active = (
        await send<{ openingId: string }>("/api/openings", "POST", basics)
      ).openingId;
      setId(active);
      history.replaceState(null, "", "/hiring/openings/" + active + "/edit");
    } else if (step === 2 && config.mode !== "auto") {
      if (questions.some((q) => !q.text.trim()))
        throw new Error(
          "Enter text for each question or remove the empty question.",
        );
      await saveQuestions();
    } else {
      await send("/api/openings/" + active, "PATCH", { ...basics, config });
    }
    setSaved(true);
    return active;
  }
  async function navigate(
    next: number,
    action?: "draft" | "publish" | "preview",
  ) {
    setBusy(true);
    setError("");
    try {
      const active = await persist();
      if (action === "publish") {
        await send("/api/openings/" + active + "/publish", "POST");
        toast.success("Opening published");
        router.push("/hiring/openings/" + active);
      } else if (action === "draft") {
        toast.success("Draft saved");
        router.push("/hiring/openings/" + active);
      } else if (action === "preview") setPreview(true);
      else setStep(next);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  function changeWeight(key: keyof Weights, value: number) {
    const old = config.evaluation.weights;
    const remaining = WEIGHT_KEYS.filter((k) => k !== key);
    const enabled = remaining.filter(
      (k) => k === "soft" || config.phases[k === "cv" ? "cv_deep_dive" : k],
    );
    if (!enabled.length) {
      changeConfig("evaluation", {
        ...config.evaluation,
        weights: { technical: 0, behavioral: 0, cv: 0, soft: 100 },
      });
      return;
    }
    const budget = 100 - value,
      total = enabled.reduce((sum, k) => sum + old[k], 0);
    const updated: Weights = {
      technical: 0,
      behavioral: 0,
      cv: 0,
      soft: 0,
      [key]: value,
    };
    for (const k of enabled)
      updated[k] = Math.floor(
        total ? (old[k] * budget) / total : budget / enabled.length,
      );
    updated[enabled[0]] +=
      100 - Object.values(updated).reduce((a, b) => a + b, 0);
    changeConfig("evaluation", { ...config.evaluation, weights: updated });
  }
  const effective = buildSessionConfig("preview", {
    config,
    questions: questions.map((q, i) => ({
      ...q,
      id: q.id ?? q.editorId,
      orderIdx: i,
    })),
    company: { name: "", logoUrl: null },
  }).evaluation.weights;
  const basic = (name: keyof typeof initialBasics, value: string) => {
    setBasics((previous) => ({
      ...previous,
      [name]:
        value || (["department", "jobDescription"].includes(name) ? null : ""),
    }));
    setSaved(false);
  };
  if (locked)
    return (
      <div className="stack">
        <h1>{basics.title}</h1>
        <div className="card stack">
          <p className="cluster">
            <LockKeyhole size={18} />
            This opening is locked because a candidate has started an interview.
          </p>
          <OpeningSummary
            opening={{ ...basics, config }}
            questions={questions.length}
            validation={validation}
          />
          <div>
            <DuplicateButton id={id} label="Duplicate to edit" />
          </div>
        </div>
      </div>
    );
  return (
    <div className="stack">
      <div className="cluster between">
        <h1>{initial ? "Edit opening" : "New opening"}</h1>
        <Link href={id ? "/hiring/openings/" + id : "/hiring"}>
          Back to openings
        </Link>
      </div>
      <div className="opening-wizard">
        <nav className="stack-sm no-print" aria-label="Opening steps">
          {steps.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-current={i === step ? "step" : undefined}
              disabled={busy || (!id && i !== 0)}
              onClick={() => {
                if (i !== step) void navigate(i);
              }}
              className={"button " + (i === step ? "" : "ghost")}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>
        <section className="card stack">
          <div className="cluster between">
            <h2>{steps[step]}</h2>
            {saved && (
              <span className="badge accent" role="status">
                Saved
              </span>
            )}
          </div>
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          {step === 0 && (
            <div className="stack">
              <label className="field">
                Opening title
                <input
                  value={basics.title}
                  maxLength={120}
                  onChange={(e) => basic("title", e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Role title
                <input
                  list="opening-roles"
                  value={basics.roleTitle}
                  maxLength={80}
                  onChange={(e) => basic("roleTitle", e.target.value)}
                  required
                />
                <datalist id="opening-roles">
                  {roleOptions.map((role) => (
                    <option key={role} value={role} />
                  ))}
                </datalist>
              </label>
              <div className="grid-2">
                <label className="field">
                  Role family
                  <select
                    value={basics.roleFamily}
                    onChange={(e) => basic("roleFamily", e.target.value)}
                  >
                    {ROLE_FAMILIES.map((family) => (
                      <option value={family} key={family}>
                        {readable(family)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Seniority
                  <select
                    value={basics.seniority}
                    onChange={(e) => basic("seniority", e.target.value)}
                  >
                    {SENIORITIES.map((seniority) => (
                      <option value={seniority} key={seniority}>
                        {readable(seniority)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                Department (optional)
                <input
                  value={basics.department ?? ""}
                  maxLength={80}
                  onChange={(e) => basic("department", e.target.value)}
                />
              </label>
              <label className="field">
                Job description (optional)
                <textarea
                  value={basics.jobDescription ?? ""}
                  maxLength={6000}
                  onChange={(e) => basic("jobDescription", e.target.value)}
                />
                <small>{basics.jobDescription?.length ?? 0} / 6,000</small>
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="stack">
              <fieldset className="stack-sm">
                <legend>Mode</legend>
                {Object.entries(modeDetails).map(([key, [title, detail]]) => (
                  <label key={key} className="inset check">
                    <input
                      type="radio"
                      name="opening-mode"
                      checked={config.mode === key}
                      onChange={() =>
                        changeConfig("mode", key as OpeningConfig["mode"])
                      }
                    />
                    <span>
                      <strong>{title}</strong>
                      <br />
                      <small>{detail}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="stack-sm">
                <legend>Length</legend>
                <div className="cluster">
                  {([15, 20, 30, 45] as const).map((n) => (
                    <label className="check inset" key={n}>
                      <input
                        name="opening-length"
                        type="radio"
                        checked={config.lengthMinutes === n}
                        onChange={() => changeConfig("lengthMinutes", n)}
                      />
                      {n} min
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="stack-sm">
                <legend>Phases</legend>
                {OPTIONAL_PHASES.map((phase) => (
                  <label className="check" key={phase}>
                    <input
                      type="checkbox"
                      checked={config.phases[phase]}
                      onChange={(e) => {
                        changeConfig("phases", {
                          ...config.phases,
                          [phase]: e.target.checked,
                        });
                        if (phase === "cv_deep_dive" && e.target.checked)
                          setConfig((prev) => ({
                            ...prev,
                            cv: { ...prev.cv, required: true },
                          }));
                      }}
                    />
                    {phaseLabels[phase]}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                Competency selection
                <select
                  value={config.competencies.selection}
                  onChange={(e) =>
                    changeConfig("competencies", {
                      ...config.competencies,
                      selection: e.target.value as "auto" | "manual",
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              {config.competencies.selection === "manual" && (
                <div className="stack-sm">
                  <label className="field">
                    Add a competency
                    <select
                      value=""
                      onChange={(e) => {
                        const key = e.target.value as CompetencyKey;
                        if (key)
                          changeConfig("competencies", {
                            ...config.competencies,
                            items: [
                              ...config.competencies.items,
                              { key, sub_label: null, weight: 1 },
                            ],
                          });
                      }}
                      disabled={config.competencies.items.length >= 4}
                    >
                      <option value="">Choose up to four</option>
                      {COMPETENCY_KEYS.filter(
                        (key) =>
                          !config.competencies.items.some(
                            (item) => item.key === key,
                          ),
                      ).map((key) => (
                        <option key={key} value={key}>
                          {TAXONOMY[key][0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {config.competencies.items.map((item, i) => (
                    <div className="inset stack-sm" key={item.key}>
                      <strong>{TAXONOMY[item.key][0]}</strong>
                      {(item.key === "domain_other" ||
                        item.key === "language_depth") && (
                        <label className="field">
                          Sub-label
                          <input
                            value={item.sub_label ?? ""}
                            onChange={(e) =>
                              changeConfig("competencies", {
                                ...config.competencies,
                                items: config.competencies.items.map((v, j) =>
                                  i === j
                                    ? { ...v, sub_label: e.target.value }
                                    : v,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                      <label className="field">
                        Weight
                        <select
                          value={item.weight}
                          onChange={(e) =>
                            changeConfig("competencies", {
                              ...config.competencies,
                              items: config.competencies.items.map((v, j) =>
                                i === j ? { ...v, weight: +e.target.value } : v,
                              ),
                            })
                          }
                        >
                          {[1, 2, 3].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button ghost danger"
                        onClick={() =>
                          changeConfig("competencies", {
                            ...config.competencies,
                            items: config.competencies.items.filter(
                              (_, j) => i !== j,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {step === 2 &&
            (config.mode === "auto" ? (
              <p>
                The AI will create all questions from your instructions and the
                candidate&apos;s CV.
              </p>
            ) : (
              <QuestionEditor
                id={id}
                questions={questions}
                change={changeQuestions}
              />
            ))}
          {step === 3 && (
            <div className="stack">
              <label className="field">
                Company instructions
                <textarea
                  maxLength={2000}
                  value={config.ai.instructions}
                  placeholder="Focus on payment systems and Kubernetes. Ask about their final-year project. Be friendly but rigorous."
                  onChange={(e) =>
                    changeConfig("ai", {
                      ...config.ai,
                      instructions: e.target.value,
                    })
                  }
                />
                <small>{config.ai.instructions.length} / 2,000</small>
              </label>
              <label className="field">
                Tone guidance
                <textarea
                  maxLength={300}
                  value={config.ai.toneInstructions}
                  onChange={(e) =>
                    changeConfig("ai", {
                      ...config.ai,
                      toneInstructions: e.target.value,
                    })
                  }
                />
                <small>{config.ai.toneInstructions.length} / 300</small>
              </label>
              <label className="field">
                Interviewer name
                <input
                  maxLength={20}
                  value={config.ai.interviewerName ?? ""}
                  onChange={(e) =>
                    changeConfig("ai", {
                      ...config.ai,
                      interviewerName: e.target.value,
                    })
                  }
                />
              </label>
              <VoiceSelect
                voice={config.ai.voiceName}
                setVoice={(voiceName) =>
                  changeConfig("ai", { ...config.ai, voiceName })
                }
              />
              <div className="grid-2">
                <label className="field">
                  Strictness
                  <select
                    value={config.ai.strictness}
                    onChange={(e) =>
                      changeConfig("ai", {
                        ...config.ai,
                        strictness: e.target
                          .value as typeof config.ai.strictness,
                      })
                    }
                  >
                    {["lenient", "balanced", "strict"].map((x) => (
                      <option value={x} key={x}>
                        {readable(x)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Adversarial intensity
                  <select
                    value={config.ai.adversarialIntensity}
                    onChange={(e) =>
                      changeConfig("ai", {
                        ...config.ai,
                        adversarialIntensity: e.target
                          .value as typeof config.ai.adversarialIntensity,
                      })
                    }
                  >
                    {["low", "medium", "high"].map((x) => (
                      <option value={x} key={x}>
                        {readable(x)}
                      </option>
                    ))}
                  </select>
                  <small>Controls follow-ups after strong answers.</small>
                </label>
              </div>
              {config.mode === "scripted" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.ai.allowFollowUps}
                    onChange={(e) =>
                      changeConfig("ai", {
                        ...config.ai,
                        allowFollowUps: e.target.checked,
                      })
                    }
                  />
                  Allow AI follow-ups
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(config.presentation.custom)}
                  onChange={(e) =>
                    changeConfig("presentation", {
                      custom: e.target.checked
                        ? structuredClone(emptyScenario)
                        : null,
                    })
                  }
                />
                Use a custom presentation scenario
              </label>
              {config.presentation.custom && (
                <div className="inset stack">
                  {(
                    [
                      "title",
                      "scenario",
                      "audience",
                      "goal",
                      "interrupt_challenge",
                    ] as const
                  ).map((key, i) => (
                    <label className="field" key={key}>
                      {readable(key)}
                      <textarea
                        maxLength={[80, 600, 120, 160, 200][i]}
                        value={config.presentation.custom![key]}
                        onChange={(e) =>
                          changeConfig("presentation", {
                            custom: {
                              ...config.presentation.custom!,
                              [key]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  {config.presentation.custom.pushback_angles.map((item, i) => (
                    <label className="field" key={i}>
                      Pushback angle {i + 1}
                      <input
                        maxLength={200}
                        value={item}
                        onChange={(e) =>
                          changeConfig("presentation", {
                            custom: {
                              ...config.presentation.custom!,
                              pushback_angles:
                                config.presentation.custom!.pushback_angles.map(
                                  (x, j) => (i === j ? e.target.value : x),
                                ),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {initial?.featureGithub && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.cv.useGithub}
                    onChange={(e) =>
                      changeConfig("cv", {
                        ...config.cv,
                        useGithub: e.target.checked,
                      })
                    }
                  />
                  GitHub-aware project questions (Beta)
                </label>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="stack">
              <fieldset className="stack-sm">
                <legend>Score weights</legend>
                {WEIGHT_KEYS.map((key) => (
                  <label className="field" key={key}>
                    {weightLabels[key]} · {config.evaluation.weights[key]}%{" "}
                    <small>Effective weight {effective[key]}%</small>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={config.evaluation.weights[key]}
                      disabled={
                        key !== "soft" &&
                        !config.phases[key === "cv" ? "cv_deep_dive" : key]
                      }
                      onChange={(e) => changeWeight(key, +e.target.value)}
                    />
                  </label>
                ))}
              </fieldset>
              <fieldset className="stack-sm">
                <legend>Non-verbal policy</legend>
                {Object.entries(formats).map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="radio"
                      name="nonverbal"
                      checked={config.evaluation.nonverbalPolicy === key}
                      onChange={() =>
                        changeConfig("evaluation", {
                          ...config.evaluation,
                          nonverbalPolicy:
                            key as typeof config.evaluation.nonverbalPolicy,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <p className="inset small">
                Body language and voice-delivery signals can disadvantage
                candidates for reasons unrelated to job performance (disability,
                neurodivergence, culture, camera quality). We recommend
                &apos;Coaching only&apos;.
              </p>
              <label className="field">
                Pass threshold · {config.evaluation.passThreshold}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.evaluation.passThreshold}
                  onChange={(e) =>
                    changeConfig("evaluation", {
                      ...config.evaluation,
                      passThreshold: +e.target.value,
                    })
                  }
                />
              </label>
              <fieldset className="stack-sm">
                <legend>Candidate feedback</legend>
                {Object.entries(visibility).map(([key, detail]) => (
                  <label className="check" key={key}>
                    <input
                      type="radio"
                      name="feedback"
                      checked={config.candidate.feedbackVisibility === key}
                      onChange={() =>
                        changeConfig("candidate", {
                          ...config.candidate,
                          feedbackVisibility:
                            key as typeof config.candidate.feedbackVisibility,
                        })
                      }
                    />
                    <span>
                      {readable(key)} · <small>{detail}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="field">
                Invite expires after (days)
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.candidate.inviteExpiryDays}
                  onChange={(e) =>
                    changeConfig("candidate", {
                      ...config.candidate,
                      inviteExpiryDays: +e.target.value,
                    })
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.candidate.requireEmailMatch}
                  onChange={(e) =>
                    changeConfig("candidate", {
                      ...config.candidate,
                      requireEmailMatch: e.target.checked,
                    })
                  }
                />
                Require email match
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.integrity.requireHeadphones}
                  onChange={(e) =>
                    changeConfig("integrity", {
                      requireHeadphones: e.target.checked,
                    })
                  }
                />
                Require headphones
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.cv.required}
                  disabled={config.phases.cv_deep_dive}
                  onChange={(e) =>
                    changeConfig("cv", {
                      ...config.cv,
                      required: e.target.checked,
                    })
                  }
                />
                Require candidate CV
              </label>
            </div>
          )}
          {step === 5 && (
            <OpeningSummary
              opening={{ ...basics, config }}
              questions={questions.length}
              validation={validation}
            />
          )}
          <div className="cluster">
            {step > 0 && (
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => void navigate(step - 1)}
              >
                Back
              </button>
            )}
            {step < 5 ? (
              <button
                className="button"
                disabled={busy}
                onClick={() => void navigate(step + 1)}
              >
                Save and continue
              </button>
            ) : (
              <>
                <button
                  className="button secondary"
                  disabled={busy || !!validation.errors.length}
                  onClick={() => void navigate(step, "preview")}
                >
                  Preview interview
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void navigate(step, "draft")}
                >
                  Save draft
                </button>
                <button
                  className="button"
                  disabled={busy || !!validation.errors.length}
                  onClick={() => void navigate(step, "publish")}
                >
                  Publish
                </button>
              </>
            )}
          </div>
        </section>
        <ValidationPanel validation={validation} />
      </div>
      {preview && <PreviewDialog id={id} close={() => setPreview(false)} />}
    </div>
  );
}
