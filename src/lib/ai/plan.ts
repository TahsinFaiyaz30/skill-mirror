import type { z } from "zod";
import { clamp } from "@/lib/utils/math";
import { usesFastReasoning } from "@/lib/config/constants";
import {
  COMPETENCY_KEYS,
  PHASE_LABELS,
  SENIORITIES,
  TAXONOMY,
} from "@/lib/config/taxonomy";
import type { SessionRow } from "@/lib/db/schema";
import type {
  GithubProject,
  InterviewPlan,
  ParsedCV,
  PlanBlueprint,
  PlanCompetency,
  PlanSummary,
} from "@/types/interview";
import { mockBlueprint, mockLadder } from "./mock/fixtures";
import {
  blueprintResponseSchema,
  competencyKey,
  ladderSchema,
} from "./schemas";
import {
  flashModelChain,
  geminiStructuredRequest,
  type Prompt,
} from "./gemini";
import { groqStrategistModelChain, groqStructuredRequest } from "./groq";
import { requestStructuredOutput } from "./structured-output";
import type { ProviderModel } from "./pool";
import { p2 } from "./prompts/p2_blueprint";
import { p3 } from "./prompts/p3_ladder";

export const taxonomyLines = COMPETENCY_KEYS.map(
  (key) =>
    key + " · " + TAXONOMY[key][0] + " · " + TAXONOMY[key].slice(1).join(", "),
).join("\n");
const enabled = (
  s: SessionRow,
  phase: SessionRow["config"]["phaseOrder"][number],
) => s.config.phaseOrder.includes(phase);

export function normalizeBlueprint(
  response: z.infer<typeof blueprintResponseSchema>,
): PlanBlueprint {
  return {
    ...response,
    technical: response.technical.map((item) => {
      const key = competencyKey.safeParse(item.key);
      return key.success
        ? { ...item, key: key.data }
        : {
            ...item,
            key: "domain_other",
            sub_label: item.sub_label?.trim() || item.key,
          };
    }),
    cv_claims: response.cv_claims.map((claim) => {
      const key = competencyKey.safeParse(claim.competency_key);
      return {
        ...claim,
        competency_key: key.success ? key.data : "domain_other",
      };
    }),
  };
}

const levels = [1, 2, 3, 4, 5] as const;
type PartialLadder = z.infer<typeof ladderSchema>["levels"];

export function completeLadder(
  key: PlanCompetency["key"],
  partial: PartialLadder,
): PlanCompetency["ladder"] {
  const fallback = mockLadder(key);
  return Object.fromEntries(
    levels.map((level) => {
      const own = partial[level] ?? [];
      const nearest = levels
        .filter((other) => other !== level && partial[other]?.length)
        .sort((a, b) => Math.abs(a - level) - Math.abs(b - level));
      const questions = [
        ...own,
        ...nearest.flatMap((other) => partial[other] ?? []),
        ...fallback[level],
      ];
      return [
        level,
        questions.slice(0, 2).map((question, index) => ({
          ...question,
          id: `${key}-L${level}-${index ? "b" : "a"}`,
        })),
      ];
    }),
  );
}

export function getPlanSummary(s: SessionRow): PlanSummary | null {
  if (!s.plan) return null;
  return {
    interviewerName: s.plan.persona.interviewer_name,
    competencies: s.plan.technical.map((comp) => ({
      key: comp.key,
      displayName: TAXONOMY[comp.key][0],
      subLabel: comp.sub_label,
    })),
    phases: s.config.phaseOrder.map((key) => ({
      key,
      budgetMs: s.config.phaseBudgetsMs[key] ?? 0,
    })),
  };
}

export const PLAN_PREPARATION_TIMEOUT_MS = 50_000;
const BLUEPRINT_TIMEOUT_MS = 38_000;

async function planOutput<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: {
    thinking: "low" | "medium" | "high";
    timeout: number;
    preferred?: ProviderModel;
    validate: (value: T) => void;
  },
) {
  const geminiRequest = geminiStructuredRequest(prompt, schema, options);
  const groqRequest = groqStructuredRequest(prompt, schema, {
    temperature: 0.4,
    maxTokens: 3_200,
    strict: false,
  });
  const geminiModels = flashModelChain();
  const groqModels = groqStrategistModelChain();
  const models = Array.from(
    { length: Math.max(geminiModels.length, groqModels.length) },
    (_, rank) => [
      {
        provider: "gemini" as const,
        model: geminiModels[rank],
        request: geminiRequest,
      },
      {
        provider: "groq" as const,
        model: groqModels[rank],
        request: groqRequest,
      },
    ],
  )
    .flat()
    .filter(({ model }) => Boolean(model));
  const preferredIndex = models.findIndex(
    ({ provider, model }) =>
      provider === options.preferred?.provider &&
      model === options.preferred.model,
  );
  if (preferredIndex > 0) {
    // Start ladder generation with the model that just produced a valid blueprint.
    const [preferred] = models.splice(preferredIndex, 1);
    models.unshift(preferred);
  }
  return requestStructuredOutput(models, prompt, schema, options);
}

function fallbackBlueprint(s: SessionRow, cv: ParsedCV | null): PlanBlueprint {
  const blueprint = mockBlueprint(s.config, s.roleFamily);
  const anchor = (index: number, generic: string) =>
    cv?.projects[index]?.name.trim().slice(0, 120) || generic;
  return {
    ...blueprint,
    role_summary: `The ${s.roleTitle} interview at ${s.company} focuses on technical decisions, tradeoffs, and ownership.`,
    behavioral: blueprint.behavioral.map((question, index) => ({
      ...question,
      cv_anchor: anchor(index, "Your experience"),
    })),
    cv_questions: blueprint.cv_questions.map((question, index) => ({
      ...question,
      anchor: anchor(index, question.anchor),
    })),
  };
}

export async function generatePlan(
  s: SessionRow,
  cv: ParsedCV | null,
  profileName: string,
  github: GithubProject[] = [],
  deadline = Date.now() + PLAN_PREPARATION_TIMEOUT_MS,
): Promise<InterviewPlan> {
  const config = s.config;
  const { skills_removed: removed = [], ...profile } = cv ?? {
    full_name: profileName,
  };
  const visible =
    "skills" in profile
      ? {
          ...profile,
          skills: profile.skills.filter(
            (skill) => !removed.includes(skill.name),
          ),
        }
      : profile;
  const scripted = config.mode === "scripted";
  const techCount = scripted ? 0 : config.techCount;
  const cvCount = scripted ? 0 : config.cvQuestionCount;
  const behaviorCount =
    !scripted && enabled(s, "behavioral")
      ? config.lengthMinutes <= 5
        ? Math.max(1, config.behavioralCount)
        : 3
      : 0;
  const focus = {
    company: s.company,
    seniority: s.seniority,
    roleTitle: s.roleTitle,
    roleFamily: s.roleFamily,
    aiInstructionsOrNone: config.ai.instructions || "None",
  };
  const companyActive = s.kind !== "practice";
  const mock = s.aiMode === "mock";
  const generated = mock
    ? undefined
    : await planOutput(
        p2({
          ...focus,
          company: s.company,
          parsedCvJsonWithoutRemovedSkillsOrEmptyProfile:
            JSON.stringify(visible),
          jobDescription: s.jobDescription ?? "",
          taxonomyListAsKeyNameFamiliesLines: taxonomyLines,
          enabledPhasesList: config.phaseOrder
            .map((p) => PHASE_LABELS[p])
            .join(", "),
          aiInstructions: config.ai.instructions,
          customQuestionTextsBulletedOrNone:
            config.customQuestions.map((q) => "- " + q.text).join("\n") ||
            "None",
          githubSummaries: github.length ? JSON.stringify(github) : "",
          techCount,
          behavioralCountForPlan: behaviorCount,
          cvQuestionCount: cvCount,
          presentationEnabled: enabled(s, "presentation"),
          companyBlock: companyActive,
        }),
        blueprintResponseSchema,
        {
          thinking: usesFastReasoning(config) ? "low" : "high",
          timeout: Math.min(BLUEPRINT_TIMEOUT_MS, deadline - Date.now()),
          validate: (plan) => {
            if (
              plan.technical.length < techCount ||
              plan.behavioral.length !== behaviorCount ||
              plan.cv_questions.length !== cvCount ||
              (enabled(s, "presentation") &&
                !plan.presentation &&
                !config.presentation.custom)
            )
              throw new Error("Blueprint is missing interview items");
          },
        },
      ).catch(() => {
        console.warn("SkillMirror is using a role-based interview plan", {
          roleFamily: s.roleFamily,
        });
        return undefined;
      });
  const initial = generated
    ? normalizeBlueprint(generated.value)
    : mock
      ? mockBlueprint(config, s.roleFamily)
      : fallbackBlueprint(s, cv);
  const expected_level = SENIORITIES.indexOf(s.seniority) + 1;
  let items = initial.technical.slice(0, techCount);
  if (techCount && config.competencies.selection === "manual") {
    items = config.competencies.items.map((item, index) => ({
      ...initial.technical[index],
      key: item.key,
      sub_label: item.sub_label,
      why: initial.technical[index]?.why ?? "Selected by the hiring team.",
      claimed_in_cv:
        (initial.technical[index]?.key === item.key &&
          initial.technical[index]?.claimed_in_cv) ||
        false,
      start_level: 1,
    }));
  }
  const technical = await Promise.all(
    items.map(async (item) => {
      const display = TAXONOMY[item.key][0];
      const terms = [display, item.sub_label]
        .filter(Boolean)
        .map((term) => term!.toLowerCase());
      const matches = (name: string) =>
        terms.some(
          (term) =>
            term.includes(name.toLowerCase()) ||
            name.toLowerCase().includes(term),
        );
      const skills =
        "skills" in visible
          ? visible.skills.filter((skill) => matches(skill.name))
          : [];
      const projects =
        "projects" in visible
          ? visible.projects.filter((project) => project.tech.some(matches))
          : [];
      const claimed_in_cv = item.claimed_in_cv || skills.length > 0;
      const advanced = skills.some((skill) =>
        ["advanced", "expert"].includes(skill.proficiency_claimed),
      );
      const start_level = clamp(
        clamp(expected_level - 1, 1, 4) + Number(claimed_in_cv && advanced),
        1,
        4,
      );
      const prompt = p3({
        ...focus,
        competencyDisplayName: display,
        subLabelSuffix: item.sub_label ? " (" + item.sub_label + ")" : "",
        cvSnippetForCompetency:
          skills.length || projects.length
            ? JSON.stringify({ skills, projects }).slice(0, 1200)
            : "No directly related CV items.",
        companyTechnicalQuestionTextsOrNone:
          config.customQuestions
            .filter((q) => q.phase === "technical")
            .map((q) => q.text)
            .join("; ") || "None",
        companyBlock: companyActive,
      });
      let partialLadder: PartialLadder = {};
      if (generated && Date.now() < deadline) {
        try {
          const { value } = await planOutput(prompt, ladderSchema, {
            thinking: usesFastReasoning(config) ? "low" : "medium",
            timeout: deadline - Date.now(),
            preferred: generated.source,
            validate: (response) => {
              for (const level of levels) {
                const questions = response.levels[level];
                if (
                  questions &&
                  questions.length > (partialLadder[level]?.length ?? 0)
                ) {
                  partialLadder[level] = questions;
                }
              }
              if (
                levels.some((level) => response.levels[level]?.length !== 2)
              ) {
                throw new Error("Each ladder level requires two questions");
              }
            },
          });
          partialLadder = value.levels;
        } catch {
          console.warn(
            "SkillMirror could not generate a complete question ladder",
            { competency: item.key },
          );
        }
      }
      const ladder = completeLadder(item.key, partialLadder);
      return { ...item, claimed_in_cv, start_level, ladder };
    }),
  );
  return {
    ...initial,
    expected_level,
    technical,
    behavioral: initial.behavioral.slice(0, behaviorCount),
    cv_questions: initial.cv_questions.slice(0, cvCount),
    persona: {
      ...initial.persona,
      interviewer_name:
        config.ai.interviewerName || initial.persona.interviewer_name,
    },
    presentation: enabled(s, "presentation")
      ? (config.presentation.custom ?? initial.presentation)
      : null,
    ...(github.length && { github_projects: github }),
  };
}
