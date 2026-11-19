import type {
  Baseline,
  Dimension,
  EndReason,
  EventCategory,
  ItemKind,
  NonverbalPolicy,
  Phase,
  QuestionSource,
  ScoreOutcome,
  Seniority,
  SessionKind,
  TurnScores,
  TurnTone,
  VisionSummary,
  Weights,
} from "./interview";

export type TimedWord = { w: string; s: number; e: number };
export type TimedSegment = { text: string; s: number; e: number };
export type WordTrack = { words: TimedWord[]; segments: TimedSegment[] };
export type PitchFrame = { tMs: number; st: number | null; rmsDb: number };
export type FinalVoice = {
  wordCount: number;
  speakingMs: number;
  wpm: number | null;
  responseLatencyMs: number | null;
  longPauses: { count: number; totalMs: number };
  hardFillers: number;
  softFillers: number;
  fillerPerMin: number | null;
  hedges: number;
  hedgePerMin: number | null;
  iRatio: number | null;
  pitchMedianSt: number | null;
  pitchRangeSt: number | null;
  uptalkRate: number | null;
  rmsMedianDb: number | null;
};
export type FinalVision = Partial<VisionSummary> & {
  nodsPerMinListening?: number | null;
  selfTouchPerMin?: number | null;
  smileTimeFrac?: number | null;
  lowVolumeMs?: number;
};
export type FinalTurnMetrics = {
  voice: FinalVoice | null;
  vision: FinalVision | null;
  stress?: number | null;
  composure?: number | null;
};
export type IntegrityBadge = "clean" | "minor" | "review";
export type Integrity = {
  badge: IntegrityBadge;
  flags: { type: string; count: number; totalMs: number }[];
};
export type Clip = { clipStartMs: number; clipEndMs: number };
export type MomentCandidate = Clip & {
  id: string;
  kind: "event" | "answer";
  category: EventCategory | "answer";
  type: string;
  startMs: number;
  endMs: number;
  turnIdx: number | null;
  questionShort: string;
  questionSource: QuestionSource | null;
  transcriptExcerpt: string;
  context: string;
  severity: number;
  eventId: string | null;
};
export type KeyMoment = Pick<
  MomentCandidate,
  | "id"
  | "kind"
  | "category"
  | "type"
  | "clipStartMs"
  | "clipEndMs"
  | "turnIdx"
  | "eventId"
  | "questionSource"
  | "transcriptExcerpt"
> & {
  title: string;
  sentiment: "positive" | "improve";
  whatHappened: string;
  whyItMatters: string;
  howToFix: string;
  betterAnswer: string | null;
};
export type ComponentScores = Record<keyof Weights, number | null>;
export type CompetencyResult = {
  key: string;
  displayName: string;
  subLabel: string | null;
  ceiling: number | null;
  bracketed: boolean;
  theta: number;
  score: number;
  notAssessed: boolean;
  path: {
    turnIdx: number;
    level: number | null;
    total: number | null;
    outcome: ScoreOutcome | null;
    isFollowUp: boolean;
    source: QuestionSource;
  }[];
  cvClaim: {
    claimedLevel: number;
    signal: "verified" | "overstated" | "unverified";
  } | null;
  commentary: string;
};
export type SkillDriver = {
  name: string;
  value: number | null;
  baseline: number | null;
  unit: string;
};
export type SoftDimension = {
  key: Dimension;
  label: string;
  score: number | null;
  level: number | null;
  levelLabel: string | null;
  drivers: SkillDriver[];
  commentary: string;
};
export type StatRow = {
  metric: string;
  value: number | null;
  baseline: number | null;
  unit: string;
  verdict: "good" | "watch" | "improve" | null;
};
export type NarrativeSummary = { strengths: string[]; growthAreas: string[] };
export type PracticeDrill = {
  title: string;
  why: string;
  drill: string;
  targetMetric: string;
};
export type ReportTurn = {
  turnIdx: number;
  phase: Phase;
  kind: ItemKind;
  label: string;
  questionSource: QuestionSource;
  question: string;
  transcript: string;
  scores: TurnScores | Omit<TurnScores, "note"> | null;
  outcome: ScoreOutcome | null;
  composure: number | null;
  voice: FinalVoice | null;
  vision: FinalVision | null;
  tone: TurnTone | null;
  feedback: string;
  idealOutline: string[];
};
export type CompanyView = {
  weightedScore: number;
  effectiveWeights: Weights;
  recommendation: string;
  passThreshold: number;
  nonverbalPolicy: NonverbalPolicy;
  coverage: {
    openingQuestionId: string;
    text: string;
    phase: Phase;
    mustAsk: boolean;
    status: "asked" | "unasked" | "skipped_by_candidate";
    turnIdx: number | null;
    total: number | null;
    outcome: ScoreOutcome | null;
    followUpsAsked: number;
  }[];
  provenanceCounts: Record<"company" | "ai_plan" | "ai_followup", number>;
  transcript: {
    speaker: "Interviewer" | "Candidate";
    text: string;
    startMs: number;
    endMs: number;
    turnIdx: number | null;
    questionSource: QuestionSource | null;
  }[];
  githubProjects: { name: string; url: string; summary: string }[];
};
export interface ReportData {
  version: 1;
  generatedAt: string;
  session: {
    kind: SessionKind;
    company: string;
    roleTitle: string;
    seniority: Seniority;
    lengthMinutes: number;
    durationMs: number;
    endReason: EndReason | null;
    startedAt: string | null;
    transcriptSource: "whisper" | "live";
    nonverbalPolicy: NonverbalPolicy;
  };
  headline: {
    overallScore: number;
    verdict: string | null;
    recommendation: string | null;
    summary: string;
    integrityBadge: IntegrityBadge;
    disclaimer: string;
  };
  components: ComponentScores & { effectiveWeights: Weights };
  technical: {
    score: number | null;
    expectedLevel: number;
    competencies: CompetencyResult[];
    companyQuestionsScore: number | null;
  };
  softSkills: {
    policy: NonverbalPolicy;
    maturityScore: number | null;
    maturityLevel: number | null;
    maturityLabel: string | null;
    dimensions: SoftDimension[];
  };
  composure: {
    points: {
      turnIdx: number;
      label: string;
      difficulty: number | null;
      total: number | null;
      composure: number | null;
      outcome: ScoreOutcome | null;
    }[];
    pressureDelta: number | null;
    commentary: string;
  } | null;
  timeline: {
    durationMs: number;
    buckets: {
      t: number;
      ec: number | null;
      f0: number | null;
      tension: number | null;
    }[];
    turns: {
      turnIdx: number;
      startMs: number;
      endMs: number;
      answerStartMs: number | null;
      label: string;
      phase: Phase;
      difficulty: number | null;
      questionSource: QuestionSource;
    }[];
    fillers: TimedWord[];
    events: {
      id: string;
      category: EventCategory;
      type: string;
      startMs: number;
      endMs: number;
      severity: number;
    }[];
  };
  keyMoments: KeyMoment[];
  turns: ReportTurn[];
  stats: { vision: StatRow[]; voice: StatRow[] };
  integrity: Integrity | { badge: IntegrityBadge };
  practicePlan: PracticeDrill[];
  summaryLists: NarrativeSummary;
  eligibility: { certificate: boolean; reasons: string[] };
  baseline: Baseline | null;
  companyView?: CompanyView;
}
export type CandidateSummary = {
  summary: NarrativeSummary;
  practicePlan: PracticeDrill[];
};
export type CertificatePayload = {
  certId: string;
  name: string;
  role: string;
  company: string;
  issuedAt: string;
  overallScore: number;
  verdict: string;
  maturityLevel: number | null;
  maturityLabel: string | null;
  competencies: { name: string; ceiling: number | null; expected: number }[];
  integrity: "clean" | "minor";
  sessionId: string;
};
