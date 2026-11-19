import { z } from "zod";
import {
  COMPETENCY_KEYS,
  DIMENSIONS,
  QUESTION_PHASES,
  SENIORITIES,
  THEMES,
} from "@/lib/config/taxonomy";

const short = (length: number) => z.string().max(length);
const list = (items: number, chars: number, min = 0) =>
  z.array(short(chars)).min(min).max(items);
const level = z.number().int().min(1).max(5);
export const competencyKey = z.enum(COMPETENCY_KEYS);
export const voiceName = z.enum(["Kore", "Charon"]);
const lookFor = list(4, 100, 2);
export const presentationSchema = z.object({
  title: short(80),
  scenario: short(600),
  audience: short(120),
  goal: short(160),
  interrupt_challenge: short(200),
  pushback_angles: z.array(short(200)).length(3),
});
export const parsedCvSchema = z.object({
  full_name: z.string(),
  headline: short(120),
  total_years_experience: z.number().nonnegative(),
  seniority_estimate: z.enum(SENIORITIES),
  skills: z
    .array(
      z.object({
        name: z.string(),
        category: z.enum(["language", "framework", "tool", "domain", "soft"]),
        proficiency_claimed: z.enum([
          "basic",
          "intermediate",
          "advanced",
          "expert",
          "unspecified",
        ]),
        evidence: short(160),
      }),
    )
    .max(40),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        start: z.string().regex(/^(?:\d{4}-\d{2})?$/),
        end: z.string().regex(/^(?:\d{4}-\d{2}|present)?$/),
        highlights: z.array(z.string()).max(4),
      }),
    )
    .max(10),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: short(240),
        tech: z.array(z.string()),
        role: z.string(),
        impact: short(160),
      }),
    )
    .max(8),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        year: z.string(),
      }),
    )
    .max(5),
  leadership_signals: z.array(z.string()).max(6),
  risks_or_gaps: z.array(z.string()).max(5),
  links: z.object({
    github: z
      .array(
        z.string().regex(/^https:\/\/github\.com\/[\w.-]+(?:\/[\w.-]+)?\/?$/i),
      )
      .max(5),
    linkedin: z.string(),
    portfolio: z.string(),
  }),
});
const blueprintCompetency = z.object({
  key: competencyKey,
  sub_label: z.string().nullable(),
  why: short(200),
  claimed_in_cv: z.boolean(),
  start_level: level,
});
const blueprintClaim = z.object({
  claim: short(160),
  competency_key: competencyKey,
  claimed_level: level,
});
export const blueprintSchema = z.object({
  persona: z.object({ interviewer_name: short(20), style: short(160) }),
  role_summary: short(400),
  technical: z.array(blueprintCompetency).max(4),
  behavioral: z
    .array(
      z.object({
        id: z.enum(["b1", "b2", "b3"]),
        theme: z.enum(THEMES),
        text: short(300),
        cv_anchor: short(120),
        look_for: lookFor,
      }),
    )
    .max(3),
  cv_questions: z
    .array(
      z.object({
        id: z.enum(["c1", "c2", "c3", "c4"]),
        anchor: short(120),
        text: short(300),
        look_for: lookFor,
      }),
    )
    .max(4),
  presentation: presentationSchema.nullable(),
  cv_claims: z.array(blueprintClaim).max(6),
});
export const blueprintResponseSchema = blueprintSchema.extend({
  technical: z.array(blueprintCompetency.extend({ key: short(120) })).max(4),
  cv_claims: z
    .array(blueprintClaim.extend({ competency_key: short(120) }))
    .max(6),
});
export const planQuestionSchema = z.object({
  text: short(300),
  ideal_points: list(6, 160, 3),
  red_flags: list(4, 160, 1),
  expected_minutes: z.number().min(1).max(3),
});
const pair = z.array(planQuestionSchema).max(2).optional();
export const ladderSchema = z.object({
  levels: z.object({ "1": pair, "2": pair, "3": pair, "4": pair, "5": pair }),
});
export const rubricKeys = [
  "communication",
  "relevance",
  "authenticity",
  "ownership",
  "impact",
  "correctness",
  "depth",
  "structure",
  "audience_fit",
  "persuasiveness",
  "handling_challenge",
  "handling_pushback",
  "question_quality",
] as const;
export type RubricKey = (typeof rubricKeys)[number];
const nullableScore = z.number().int().min(0).max(4).nullable();
const rubric = z.object(
  Object.fromEntries(rubricKeys.map((key) => [key, nullableScore])) as Record<
    RubricKey,
    typeof nullableScore
  >,
);
export const p4Schema = z.object({
  intent: z.enum([
    "answer",
    "clarification_request",
    "repeat_request",
    "skip_request",
    "off_topic",
  ]),
  clarification_reply: short(400),
  rubric,
  star: z
    .object({
      situation: z.boolean(),
      task: z.boolean(),
      action: z.boolean(),
      result: z.boolean(),
    })
    .nullable(),
  evidence: list(3, 160),
  strengths: list(2, 120),
  gaps: list(2, 120),
  follow_up_if_weak: z.object({
    tactic: z.enum(["probe_vague", "ask_why", "edge_case", "star_probe"]),
    text: short(250),
  }),
  follow_up_if_strong: z.object({
    tactic: z.enum([
      "tradeoff_challenge",
      "constraint_twist",
      "devils_advocate",
      "pushback",
      "clarify_claim",
    ]),
    text: short(250),
  }),
  ack: short(60),
  cv_claim_signal: z.enum(["supports", "contradicts", "none"]),
  note: short(200),
});
export const interruptSchema = z.object({ challenge: short(200) });
export const toneSchema = z.object({
  turns: z.array(
    z.object({
      turnIdx: z.number().int().nonnegative(),
      label: z.enum([
        "confident",
        "composed",
        "enthusiastic",
        "hesitant",
        "anxious",
        "defensive",
        "monotone",
        "rushed",
      ]),
      vocalConfidence: z.number().min(0).max(100),
      energy: z.enum(["low", "medium", "high"]),
      steadiness: z.number().min(0).max(100),
      evidence: short(160),
      moments: z
        .array(
          z.object({
            at: z.string().regex(/^\d{2}:[0-5]\d\.\d$/),
            note: short(100),
          }),
        )
        .max(2),
    }),
  ),
});
export const narrativeSchema = z.object({
  summary: short(600),
  summary_lists: z.object({
    strengths: list(2, 120, 2),
    growth_areas: list(2, 120, 2),
  }),
  technical_commentary: z.array(
    z.object({ key: z.string(), text: short(300) }),
  ),
  soft_skill_commentary: z.array(
    z.object({ key: z.enum(DIMENSIONS), text: short(300) }),
  ),
  composure_commentary: short(300),
  key_moments: z
    .array(
      z.object({
        candidate_id: z.string(),
        title: short(60),
        sentiment: z.enum(["positive", "improve"]),
        what_happened: short(240),
        why_it_matters: short(200),
        how_to_fix: short(240),
        better_answer: short(400),
      }),
    )
    .max(7),
  turn_feedback: z.array(
    z.object({
      turnIdx: z.number().int().nonnegative(),
      feedback: short(300),
      ideal_outline: list(5, 120),
    }),
  ),
  practice_plan: z
    .array(
      z.object({
        title: short(60),
        why: short(200),
        drill: short(300),
        target_metric: short(80),
      }),
    )
    .min(3)
    .max(5),
});
export const generatedQuestion = z.object({
  text: short(300),
  phase: z.enum(QUESTION_PHASES),
  competency_key: competencyKey.nullable(),
  difficulty: level.nullable(),
  ideal_points: list(6, 160, 3),
  red_flags: list(3, 160, 1),
  expected_minutes: z.number().min(1).max(5),
});
export const importSchema = z.object({
  questions: z
    .array(generatedQuestion.extend({ answer_found: z.boolean() }))
    .max(40),
});
export const generateSchema = z.object({
  questions: z.array(generatedQuestion).min(1).max(10),
});
export const enrichSchema = z.object({ question: generatedQuestion });
