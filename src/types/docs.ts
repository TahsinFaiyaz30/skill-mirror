export const DOCS_VISIBILITY_MODES = [
  "off",
  "on",
  "scheduled",
  "duration",
] as const;
export type DocsVisibilityMode = (typeof DOCS_VISIBILITY_MODES)[number];

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  bio?: string;
  photoPath: string | null;
  github?: string;
}

export interface PitchItem {
  key: string;
  title: string;
  eyebrow: string;
  summary: string;
  body: string;
}

export interface FeatureItem {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "live" | "beta" | "upcoming" | "planned";
  liveMetricKey?:
    | "sessions"
    | "completedReports"
    | "cvs"
    | "openings"
    | "certificates"
    | "events"
    | "organizations"
    | "users";
}

export interface RoadmapPhase {
  horizon: "short" | "mid" | "long";
  label: string;
  timeframe: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export interface DocsSectionConfig {
  id: string;
  code: string;
  title: string;
  category: "pitch" | "technical" | "operations" | "custom";
  enabled: boolean;
  summary: string;
  bodyMarkdown: string;
  diagramSource?: string;
}

export interface DocsDocument {
  tagline: string;
  heroSubtitle: string;
  teamName: string;
  teamMembers: TeamMember[];
  pitchItems: PitchItem[];
  features: FeatureItem[];
  roadmap: RoadmapPhase[];
  changelog: ChangelogEntry[];
  sections: DocsSectionConfig[];
}

export interface DocsAccessSettings {
  visibilityMode: DocsVisibilityMode;
  scheduleStart: string;
  scheduleEnd: string;
  durationStartedAt: string | null;
  durationHours: number | null;
}

export interface DocsAccessDecision {
  allowed: boolean;
  mode: DocsVisibilityMode;
  reason:
    | "always_on"
    | "within_schedule"
    | "within_duration"
    | "disabled"
    | "outside_schedule"
    | "duration_expired";
  label: string;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface LiveDocsTelemetry {
  syncedAt: string;
  environment: {
    appUrl: string;
    aiMode: string;
    dataTier: string;
    retentionDays: number;
    maxPracticePerDay: number;
    maxCompanyPerDayPerOrg: number;
    githubEnrichmentEnabled: boolean;
    emailConfigured: boolean;
  };
  counts: {
    users: number;
    practiceUsers: number;
    hiringUsers: number;
    organizations: number;
    openings: number;
    activeOpenings: number;
    invitations: number;
    sessions: number;
    completedSessions: number;
    practiceSessions: number;
    companySessions: number;
    turns: number;
    reports: number;
    completedReports: number;
    averageScore: number | null;
    cvs: number;
    parsedCvs: number;
    certificates: number;
    events: number;
  };
  eventsByCategory: { category: string; count: number }[];
  sessionsByDay: {
    day: string;
    practice: number;
    company: number;
    total: number;
  }[];
  providers: {
    geminiKeyCount: number;
    groqKeyCount: number;
    activeCooldowns: number;
    flashModels: string[];
    liveModels: string[];
    transcribeLiveModel: string;
    ttsModels: string[];
    groqStrategistModels: string[];
    groqWhisperModels: string[];
  };
  apiEndpointsCount: number;
}

export interface DocsRevisionSummary {
  id: string;
  version: number;
  summary: string;
  createdAt: string;
}

export interface DocsPublicPayload {
  access: DocsAccessDecision;
  isAdmin: boolean;
  publishedVersion: number;
  publishedAt: string;
  updatedAt: string;
  document: DocsDocument;
  live: LiveDocsTelemetry;
}

export interface DocsAdminPayload {
  settings: DocsAccessSettings;
  access: DocsAccessDecision;
  publishedVersion: number;
  publishedAt: string;
  updatedAt: string;
  draft: DocsDocument;
  published: DocsDocument;
  revisions: DocsRevisionSummary[];
  live: LiveDocsTelemetry;
}
