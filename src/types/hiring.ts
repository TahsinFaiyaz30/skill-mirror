import type { OpeningValidation } from "@/lib/config/sessionConfig";
import type {
  OpeningQuestion,
  OpeningConfig,
  RoleFamily,
  Seniority,
  CompanyBrand,
  Phase,
} from "./interview";
import type {
  ComponentScores,
  CompetencyResult,
  IntegrityBadge,
  ReportData,
  SoftDimension,
} from "./report";
export type Opening = {
  id: string;
  title: string;
  roleTitle: string;
  roleFamily: RoleFamily;
  seniority: Seniority;
  department: string | null;
  jobDescription: string | null;
  status: "draft" | "active" | "closed";
  locked: boolean;
  config: OpeningConfig;
  updatedAt: string;
};
export type OpeningDetail = {
  opening: Opening;
  questions: OpeningQuestion[];
  validation: OpeningValidation;
  featureGithub: boolean;
};
export type OpeningListRow = Pick<
  Opening,
  "id" | "title" | "status" | "locked" | "updatedAt"
> & { counts: { invited: number; completed: number; advance: number } };
export type InvitationStatus =
  "pending" | "accepted" | "started" | "completed" | "expired" | "revoked";
export type CandidateDecision = "advance" | "hold" | "reject";
export type CandidateRow = {
  invitationId: string;
  sessionId: string | null;
  name: string | null;
  email: string;
  status: InvitationStatus;
  completedAt: string | null;
  weightedScore: number | null;
  recommendation: string | null;
  avgCeiling: number | null;
  techTheta: number | null;
  maturityLevel: number | null;
  integrityBadge: IntegrityBadge | null;
  decision: CandidateDecision | null;
  rating: number | null;
  candidateDeleted: boolean;
};
export type PreviewRow = {
  sessionId: string;
  name: string | null;
  status: string;
  createdAt: string;
  weightedScore: number | null;
  recommendation: string | null;
};
export type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  status: InvitationStatus;
  createdAt: string;
  lastSentAt: string | null;
  expiresAt: string;
  sessionId: string | null;
  canRetake: boolean;
};
export type InviteResult = {
  invitations: { id: string; email: string; link: string; emailed: boolean }[];
  skipped: { email: string; reason: string }[];
};
export type PublicInvite = {
  status: InvitationStatus;
  company: CompanyBrand;
  roleTitle: string;
  seniority: Seniority;
  lengthMinutes: number;
  phases: Phase[];
  expiresAt: string;
  emailHint: string;
  requireHeadphones: boolean;
};
export type MyInvite = {
  invitationId: string;
  company: string;
  logoUrl: string | null;
  roleTitle: string;
  status: InvitationStatus;
  expiresAt: string;
  sessionId: string | null;
  next: "cv" | "prepare" | "setup" | "live" | "done" | null;
};
export type Review = {
  decision: CandidateDecision | null;
  rating: number | null;
  notes: string;
};
export type RecruiterReport = {
  report: ReportData;
  review: Review | null;
  candidate: {
    name: string;
    email: string;
    cvSummary: {
      headline: string;
      seniority: Seniority;
      years: number;
      topSkills: string[];
    } | null;
  };
  opening: { id: string; title: string };
};
export type Comparison = {
  sessionId: string;
  name: string;
  recommendation: string;
  weightedScore: number;
  components: ComponentScores;
  competencies: CompetencyResult[];
  softSkills: SoftDimension[];
  coveragePct: number;
  strengths: string[];
  gaps: string[];
  decision: CandidateDecision | null;
};
export type OrgResponse =
  | {
      org: {
        id: string;
        name: string;
        website: string | null;
        logoPath: string | null;
        logoUrl: string | null;
      };
      role: "owner" | "recruiter";
      members: {
        userId: string;
        name: string;
        email: string;
        role: "owner" | "recruiter";
        joinedAt: string;
      }[];
    }
  | { org: null };
