import {
  COMPANY_BUDGET as B,
  MAX_ANSWER_MS,
  MINUTE,
  PRACTICE_TEMPLATES,
  PRESENTATION_TIMING as P,
  SCORING,
} from "./constants";
import { OPTIONAL_PHASES, QUESTION_PHASES } from "./taxonomy";
import { clamp } from "@/lib/utils/math";
import type {
  CompanyBrand,
  InterviewConfig,
  InterviewConfigPublic,
  OpeningConfig,
  OpeningQuestion,
  OpeningQuestionInput,
  OptionalPhase,
  Phase,
  PhaseBudgets,
  VoiceName,
  Weights,
} from "@/types/interview";

export const defaultOpeningConfig: OpeningConfig = {
  mode: "hybrid",
  lengthMinutes: 20,
  phases: {
    cv_deep_dive: true,
    behavioral: true,
    technical: true,
    presentation: true,
    candidate_questions: true,
  },
  competencies: { selection: "auto", items: [] },
  presentation: { custom: null },
  ai: {
    instructions: "",
    toneInstructions: "",
    interviewerName: "",
    voiceName: "Kore",
    strictness: "balanced",
    adversarialIntensity: "medium",
    allowFollowUps: true,
  },
  cv: { required: true, useGithub: false },
  evaluation: {
    weights: SCORING.companyWeights,
    nonverbalPolicy: "coaching_only",
    passThreshold: 70,
  },
  candidate: {
    feedbackVisibility: "summary",
    requireEmailMatch: true,
    inviteExpiryDays: 7,
  },
  integrity: { requireHeadphones: false },
};

export const WEIGHT_KEYS = ["technical", "behavioral", "cv", "soft"] as const;
export function normalizeWeights(weights: Weights): Weights {
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total === 0) return { ...weights };
  const exact = WEIGHT_KEYS.map((key) => ({
    key,
    value: (weights[key] * 100) / total,
  }));
  const normalized = { ...weights };
  for (const { key, value } of exact) normalized[key] = Math.floor(value);
  const remainder = 100 - Object.values(normalized).reduce((a, b) => a + b, 0);
  exact
    .sort((a, b) => (b.value % 1) - (a.value % 1))
    .slice(0, remainder)
    .forEach(({ key }) => normalized[key]++);
  return normalized;
}

function companyBudgets(
  config: OpeningConfig,
  questions: OpeningQuestionInput[],
) {
  const T = config.lengthMinutes * MINUTE;
  const intro = T <= 20 * MINUTE ? B.shortIntroMs : B.longIntroMs;
  const remaining = T - intro - B.closingMs - B.safetyMs;
  let enabled = OPTIONAL_PHASES.filter((phase) => config.phases[phase]);
  const budgets: PhaseBudgets = {
    intro_calibration: intro,
    close: B.closingMs,
  };
  const largest = (phases: OptionalPhase[]) =>
    phases.reduce<OptionalPhase | undefined>(
      (winner, phase) =>
        !winner || (budgets[phase] ?? 0) > (budgets[winner] ?? 0)
          ? phase
          : winner,
      undefined,
    );
  const distribute = () => {
    const weight = enabled.reduce((sum, phase) => sum + B.weights[phase], 0);
    for (const phase of OPTIONAL_PHASES) delete budgets[phase];
    for (const phase of enabled)
      budgets[phase] = (remaining * B.weights[phase]) / weight;
    const excess = (budgets.candidate_questions ?? 0) - B.questionsCapMs;
    const other = enabled.includes("technical")
      ? "technical"
      : largest(enabled.filter((phase) => phase !== "candidate_questions"));
    if (excess > 0) {
      budgets.candidate_questions = B.questionsCapMs;
      if (other) budgets[other] = (budgets[other] ?? 0) + excess;
    }
  };
  distribute();
  const presentationDisabled =
    enabled.includes("presentation") &&
    (budgets.presentation ?? 0) < B.presentationMinMs;
  if (presentationDisabled) {
    enabled = enabled.filter((phase) => phase !== "presentation");
    distribute();
  }
  if (config.mode === "scripted") {
    enabled = enabled.filter(
      (phase) =>
        !QUESTION_PHASES.some((key) => key === phase) ||
        questions.some((question) => question.phase === phase),
    );
    distribute();
  }
  const destination =
    largest(enabled.filter((phase) => phase !== "candidate_questions")) ??
    "intro_calibration";
  for (const phase of enabled)
    budgets[phase] = Math.round((budgets[phase] ?? 0) / B.roundMs) * B.roundMs;
  budgets[destination] =
    (budgets[destination] ?? 0) +
    T -
    B.safetyMs -
    Object.values(budgets).reduce((a, b) => a + b, 0);
  const phaseOrder: Phase[] = ["intro_calibration", ...enabled, "close"];
  return { budgets, phaseOrder, presentationDisabled };
}
type CompanyInput = {
  config: OpeningConfig;
  questions: OpeningQuestion[];
  company: CompanyBrand;
  featureGithub?: boolean;
};
type PracticeInput = { lengthMinutes: 10 | 20; voiceName: VoiceName };
export function buildSessionConfig(
  kind: "practice",
  input: PracticeInput,
): InterviewConfig;
export function buildSessionConfig(
  kind: "company" | "preview",
  input: CompanyInput,
): InterviewConfig;
export function buildSessionConfig(
  kind: InterviewConfig["kind"],
  input: PracticeInput | CompanyInput,
): InterviewConfig {
  if (kind === "practice" && "voiceName" in input) {
    const template = PRACTICE_TEMPLATES[input.lengthMinutes];
    return {
      kind,
      mode: "auto",
      lengthMinutes: input.lengthMinutes,
      hardCapMs: input.lengthMinutes * MINUTE,
      phaseOrder: Object.keys(template.budgets) as Phase[],
      phaseBudgetsMs: { ...template.budgets },
      techCount: template.techCount,
      techMaxItems: template.techMaxItems,
      behavioralCount: template.behavioralCount,
      cvQuestionCount: 0,
      maxAnswerMs: { ...MAX_ANSWER_MS },
      presentation: {
        prepMs: P.prepMs,
        talkMs: template.talkMs,
        interruptAtMs: template.interruptAtMs,
        custom: null,
      },
      ai: {
        ...defaultOpeningConfig.ai,
        interviewerName: null,
        voiceName: input.voiceName,
      },
      evaluation: {
        weights: { ...SCORING.practiceWeights },
        nonverbalPolicy: "scored",
        passThreshold: null,
      },
      competencies: { selection: "auto", items: [] },
      customQuestions: [],
      cvRequired: true,
      useGithub: false,
      requireHeadphones: false,
      feedbackVisibility: "full",
      company: null,
      maxStrategistCalls: 60,
    };
  }
  if (!("config" in input))
    throw new Error("Opening configuration is required.");
  const { config, questions, company } = structuredClone(input);
  const { budgets, phaseOrder } = companyBudgets(config, questions);
  const minutes = config.lengthMinutes;
  const enabled = (phase: Phase) => phaseOrder.includes(phase);
  const scripted = config.mode === "scripted";
  const techCount = !enabled("technical")
    ? 0
    : scripted
      ? new Set(
          questions
            .filter((q) => q.phase === "technical" && q.competencyKey)
            .map((q) => q.competencyKey),
        ).size
      : config.competencies.selection === "manual"
        ? config.competencies.items.length
        : minutes <= 20
          ? 2
          : minutes === 30
            ? 3
            : 4;
  const primaryCount = (
    phase: "behavioral" | "cv_deep_dive",
    itemMs: number,
  ) =>
    !enabled(phase)
      ? 0
      : scripted
        ? questions.filter((q) => q.phase === phase).length
        : clamp(Math.round((budgets[phase] ?? 0) / itemMs), 1, 4);
  const longTalk = (budgets.presentation ?? 0) >= B.presentationLongMs;
  const weights = { ...config.evaluation.weights };
  if (!enabled("technical")) weights.technical = 0;
  if (!enabled("behavioral")) weights.behavioral = 0;
  if (!enabled("cv_deep_dive")) weights.cv = 0;
  const normalized = Object.values(weights).some(Boolean)
    ? normalizeWeights(weights)
    : { technical: 0, behavioral: 0, cv: 0, soft: 100 };
  return {
    kind,
    mode: config.mode,
    lengthMinutes: minutes,
    hardCapMs: minutes * MINUTE,
    phaseOrder,
    phaseBudgetsMs: budgets,
    techCount,
    techMaxItems:
      scripted || !techCount
        ? 0
        : clamp(
            Math.floor(
              (budgets.technical ?? 0) / techCount / B.technicalItemMs,
            ),
            2,
            5,
          ),
    behavioralCount: primaryCount("behavioral", B.behavioralItemMs),
    cvQuestionCount: primaryCount("cv_deep_dive", B.cvItemMs),
    maxAnswerMs: { ...MAX_ANSWER_MS },
    presentation: {
      prepMs: P.prepMs,
      talkMs: longTalk ? P.longTalkMs : P.shortTalkMs,
      interruptAtMs: longTalk ? P.interruptAtMs : null,
      custom: config.presentation.custom,
    },
    ai: { ...config.ai, interviewerName: config.ai.interviewerName || null },
    evaluation: { ...config.evaluation, weights: normalized },
    competencies: config.competencies,
    customQuestions: questions.sort((a, b) => a.orderIdx - b.orderIdx),
    company,
    cvRequired: config.phases.cv_deep_dive || config.cv.required,
    useGithub: Boolean(input.featureGithub && config.cv.useGithub),
    requireHeadphones: config.integrity.requireHeadphones,
    feedbackVisibility:
      kind === "preview" ? "full" : config.candidate.feedbackVisibility,
    maxStrategistCalls: minutes <= 20 ? 60 : minutes === 30 ? 90 : 130,
  };
}

export function toPublicConfig(
  config: InterviewConfig,
  interviewerName?: string | null,
): InterviewConfigPublic {
  const {
    kind,
    lengthMinutes,
    hardCapMs,
    phaseOrder,
    phaseBudgetsMs,
    maxAnswerMs,
    company,
    feedbackVisibility,
    requireHeadphones,
  } = config;
  const { prepMs, talkMs, interruptAtMs } = config.presentation;
  return {
    kind,
    lengthMinutes,
    hardCapMs,
    phaseOrder,
    phaseBudgetsMs,
    maxAnswerMs,
    company,
    feedbackVisibility,
    requireHeadphones,
    presentation: { prepMs, talkMs, interruptAtMs },
    collectDelivery: config.evaluation.nonverbalPolicy !== "off",
    voiceName: config.ai.voiceName,
    interviewerName: interviewerName ?? config.ai.interviewerName,
  };
}

const messages = {
  E1: "Scripted interviews need at least one question.",
  E2: "Score weights must add up to 100.",
  E3: "The CV & projects phase needs the CV to be required.",
  E4: "Enable at least one question phase.",
  W1: "Some must-ask questions may not fit in the time.",
  W2: "No time left for adaptive technical questions.",
  W3: "Not enough time for the presentation. It was turned off.",
  W4: "This question will be scored under 'Company questions' only.",
} as const;
type Issue = {
  code: keyof typeof messages;
  message: string;
  phase?: Phase;
  questionId?: string;
};
export function validateOpening(
  opening: OpeningConfig | { config: OpeningConfig },
  questions: OpeningQuestionInput[],
) {
  const config = "config" in opening ? opening.config : opening;
  const { budgets, phaseOrder, presentationDisabled } = companyBudgets(
    config,
    questions,
  );
  const { techCount, techMaxItems, behavioralCount, cvQuestionCount } =
    buildSessionConfig("company", {
      config,
      questions: questions.map((question, orderIdx) => ({
        ...question,
        id: question.id ?? String(orderIdx),
        orderIdx,
      })),
      company: { name: "", logoUrl: null },
    });
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const issue = (code: keyof typeof messages, extras: Partial<Issue> = {}) => ({
    code,
    message: messages[code],
    ...extras,
  });
  if (config.mode === "scripted" && !questions.length) errors.push(issue("E1"));
  if (
    Object.values(config.evaluation.weights).reduce((a, b) => a + b, 0) !== 100
  )
    errors.push(issue("E2"));
  if (config.phases.cv_deep_dive && !config.cv.required)
    errors.push(issue("E3"));
  if (!QUESTION_PHASES.some((phase) => phaseOrder.includes(phase)))
    errors.push(issue("E4"));
  for (const phase of QUESTION_PHASES) {
    const required = questions
      .filter((q) => q.mustAsk && q.phase === phase)
      .reduce((sum, q) => sum + q.expectedMinutes * MINUTE, 0);
    if (required > 0.8 * (budgets[phase] ?? 0))
      warnings.push(issue("W1", { phase }));
    if (
      phase === "technical" &&
      config.mode === "hybrid" &&
      required > 0 &&
      required >= (budgets.technical ?? 0)
    )
      warnings.push(issue("W2", { phase }));
  }
  if (presentationDisabled)
    warnings.push(issue("W3", { phase: "presentation" }));
  for (const question of questions)
    if (question.phase === "technical" && !question.competencyKey)
      warnings.push(
        issue("W4", { phase: "technical", questionId: question.id }),
      );
  return {
    errors,
    warnings,
    budgets,
    counts: { techCount, techMaxItems, behavioralCount, cvQuestionCount },
  };
}
export type OpeningValidation = ReturnType<typeof validateOpening>;
