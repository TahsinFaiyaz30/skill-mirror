import { clamp } from "@/lib/utils/math";
import { COMPETENCY_KEYS, PHASE_LABELS, SENIORITIES, TAXONOMY } from "@/lib/config/taxonomy";
import type { SessionRow } from "@/lib/db/schema";
import type { GithubProject, InterviewPlan, ParsedCV, PlanSummary } from "@/types/interview";
import { mockBlueprint, mockLadder } from "./mock/fixtures";
import { blueprintSchema, ladderSchema } from "./schemas";
import { geminiJSON } from "./gemini";
import { p2 } from "./prompts/p2_blueprint";
import { p3 } from "./prompts/p3_ladder";

export const taxonomyLines = COMPETENCY_KEYS.map((key) => key + " · " + TAXONOMY[key][0] + " · " + TAXONOMY[key].slice(1).join(", ")).join("\n");
const enabled = (s: SessionRow, phase: SessionRow["config"]["phaseOrder"][number]) => s.config.phaseOrder.includes(phase);
export function getPlanSummary(s: SessionRow): PlanSummary | null {
  if (!s.plan) return null;
  return {
    interviewerName: s.plan.persona.interviewer_name,
    competencies: s.plan.technical.map((comp) => ({ key: comp.key, displayName: TAXONOMY[comp.key][0], subLabel: comp.sub_label })),
    phases: s.config.phaseOrder.map((key) => ({ key, budgetMs: s.config.phaseBudgetsMs[key] ?? 0 })),
  };
}

export async function generatePlan(s: SessionRow, cv: ParsedCV | null, profileName: string, github: GithubProject[] = []): Promise<InterviewPlan> {
  const config = s.config;
  const { skills_removed: removed = [], ...profile } = cv ?? { full_name: profileName };
  const visible = "skills" in profile ? { ...profile, skills: profile.skills.filter((skill) => !removed.includes(skill.name)) } : profile;
  const scripted = config.mode === "scripted";
  const techCount = scripted ? 0 : config.techCount;
  const cvCount = scripted ? 0 : config.cvQuestionCount;
  const behaviorCount = !scripted && enabled(s, "behavioral") ? 3 : 0;
  const focus = { company: s.company, seniority: s.seniority, roleTitle: s.roleTitle, roleFamily: s.roleFamily, aiInstructionsOrNone: config.ai.instructions || "None" };
  const companyActive = s.kind !== "practice";
  const mock = s.aiMode === "mock";
  const initial = mock ? mockBlueprint(config, s.roleFamily) : await geminiJSON(p2({
    ...focus, company: s.company, parsedCvJsonWithoutRemovedSkillsOrEmptyProfile: JSON.stringify(visible),
    jobDescription: s.jobDescription ?? "", taxonomyListAsKeyNameFamiliesLines: taxonomyLines,
    enabledPhasesList: config.phaseOrder.map((p) => PHASE_LABELS[p]).join(", "),
    aiInstructions: config.ai.instructions, customQuestionTextsBulletedOrNone: config.customQuestions.map((q) => "- " + q.text).join("\n") || "None",
    githubSummaries: github.length ? JSON.stringify(github) : "", techCount, behavioralCountForPlan: behaviorCount, cvQuestionCount: cvCount, presentationEnabled: enabled(s, "presentation"),
    companyBlock: companyActive,
  }), blueprintSchema, { temperature: 0.4, thinking: "high", validate: (plan) => {
    if (plan.technical.length !== techCount || plan.behavioral.length !== behaviorCount || plan.cv_questions.length !== cvCount
      || enabled(s, "presentation") && !plan.presentation && !config.presentation.custom) throw new Error("Blueprint is missing interview items");
  } });
  const expected_level = SENIORITIES.indexOf(s.seniority) + 1;
  let items = initial.technical.slice(0, techCount);
  if (techCount && config.competencies.selection === "manual") {
    items = config.competencies.items.map((item, index) => ({
      ...initial.technical[index], key: item.key, sub_label: item.sub_label, why: initial.technical[index]?.why ?? "Selected by the hiring team.",
      claimed_in_cv: initial.technical[index]?.key === item.key && initial.technical[index]?.claimed_in_cv || false, start_level: 1,
    }));
  }
  const technical = await Promise.all(items.map(async (item) => {
    const display = TAXONOMY[item.key][0];
    const terms = [display, item.sub_label].filter(Boolean).map((term) => term!.toLowerCase());
    const matches = (name: string) => terms.some((term) => term.includes(name.toLowerCase()) || name.toLowerCase().includes(term));
    const skills = "skills" in visible ? visible.skills.filter((skill) => matches(skill.name)) : [];
    const projects = "projects" in visible ? visible.projects.filter((project) => project.tech.some(matches)) : [];
    const claimed_in_cv = item.claimed_in_cv || skills.length > 0;
    const advanced = skills.some((skill) => ["advanced", "expert"].includes(skill.proficiency_claimed));
    const start_level = clamp(clamp(expected_level - 1, 1, 4) + Number(claimed_in_cv && advanced), 1, 4);
    const prompt = p3({
      ...focus, competencyDisplayName: display, subLabelSuffix: item.sub_label ? " (" + item.sub_label + ")" : "",
      cvSnippetForCompetency: skills.length || projects.length ? JSON.stringify({ skills, projects }).slice(0, 1200) : "No directly related CV items.",
      companyTechnicalQuestionTextsOrNone: config.customQuestions.filter((q) => q.phase === "technical").map((q) => q.text).join("; ") || "None",
      companyBlock: companyActive,
    });
    let ladder = mockLadder(item.key);
    if (!mock) {
      try {
        const { levels } = await geminiJSON(prompt, ladderSchema, { temperature: 0.5, thinking: "medium" });
        ladder = Object.fromEntries(Object.entries(levels).map(([level, questions]) => [level, questions.map((q, index) => ({ ...q, id: item.key + "-L" + level + "-" + (index ? "b" : "a") }))]));
      } catch {
        console.warn("SkillMirror could not generate a complete question ladder", { competency: item.key });
      }
    }
    return { ...item, claimed_in_cv, start_level, ladder };
  }));
  return { ...initial, expected_level, technical, behavioral: initial.behavioral.slice(0, behaviorCount), cv_questions: initial.cv_questions.slice(0, cvCount),
    persona: { ...initial.persona, interviewer_name: config.ai.interviewerName || initial.persona.interviewer_name },
    presentation: enabled(s, "presentation") ? config.presentation.custom ?? initial.presentation : null, ...(github.length && { github_projects: github }),
  };
}
