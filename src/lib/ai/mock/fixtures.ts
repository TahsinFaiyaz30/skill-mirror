import type { InterviewConfig, PlanBlueprint, PlanQuestion, RoleFamily, OpeningQuestionInput } from "@/types/interview";
import { COMPETENCY_KEYS, TAXONOMY, type CompetencyKey } from "@/lib/config/taxonomy";

export function mockBlueprint(config: InterviewConfig, family: RoleFamily): PlanBlueprint {
  const keys = [...COMPETENCY_KEYS.filter((key) => (TAXONOMY[key] as readonly string[]).slice(1).includes(family)), ...COMPETENCY_KEYS];
  return {
    persona: { interviewer_name: "Alex", style: "polite, probing and concise" },
    role_summary: "The role calls for clear decisions, technical depth and ownership of outcomes.",
    technical: config.mode === "scripted" ? [] : [...new Set(keys)].slice(0, config.techCount).map((key) => ({ key, sub_label: key === "domain_other" ? "Role expertise" : null, why: "Relevant to the role and the candidate's experience.", claimed_in_cv: false, start_level: 2 })),
    behavioral: config.mode !== "scripted" && config.phaseOrder.includes("behavioral") ? [
      { id: "b1", theme: "ownership", text: "Tell me about a time you took ownership of a difficult project. What did you personally do and what changed?", cv_anchor: "Payments Reliability", look_for: ["Personal action", "Measurable outcome"] },
      { id: "b2", theme: "conflict", text: "Tell me about a disagreement over a project decision and how you resolved it.", cv_anchor: "Northstar Labs", look_for: ["Alternatives", "Resolution"] },
      { id: "b3", theme: "failure_learning", text: "Describe a project setback and how you applied what you learned.", cv_anchor: "Northstar Labs", look_for: ["Learning", "Follow-through"] },
    ] : [],
    cv_questions: Array.from({ length: config.mode === "scripted" ? 0 : config.cvQuestionCount }, (_, index) => ({
      id: ("c" + (index + 1)) as "c1" | "c2" | "c3" | "c4", anchor: "Your projects",
      text: ["What was your personal contribution to the most relevant project on your CV?", "What constraint most shaped the project design?", "What tradeoff did you make, and how did you validate it?", "What measurable result can you attribute to your own work?"][index],
      look_for: ["Specific decision", "First-hand evidence"],
    })),
    presentation: config.phaseOrder.includes("presentation") ? {
      title: "Make the case for a reliability investment", scenario: "A critical service has several recent incidents. Pitch a two-week reliability investment to a skeptical leadership team while protecting an upcoming launch.",
      audience: "Senior leadership", goal: "Agree on a small reliability investment and success metric",
      interrupt_challenge: "Why is this worth delaying any launch work?",
      pushback_angles: ["What would you cut if you only had one week?", "Which metric would demonstrate success?", "What would change your recommendation?"],
    } : null, cv_claims: [],
  };
}
export function mockLadder(key: CompetencyKey): Record<number, PlanQuestion[]> {
  const name = TAXONOMY[key][0];
  const levels = [
    ["Explain a core concept in", "Give a practical example of"],
    ["Walk me through how you applied", "How would you diagnose a routine problem in"],
    ["Compare two approaches you could take in", "How would you test a tradeoff in"],
    ["What changes under tight reliability constraints in", "How would you deal with a partial failure in"],
    ["How would you lead a cross-team redesign in", "What would make you overturn a long-standing decision in"],
  ];
  return Object.fromEntries(levels.map(([a, b], i) => [i + 1, [a, b].map((start, j) => ({
    id: key + "-L" + (i + 1) + "-" + (j ? "b" : "a"), text: start + " " + name + "?",
    ideal_points: ["A specific example", "A clearly explained mechanism", "A justified tradeoff"],
    red_flags: ["An unsupported claim"], expected_minutes: 2,
  }))]));
}
export function mockQuestion(text: string, phase: OpeningQuestionInput["phase"] = "technical"): OpeningQuestionInput {
  return { text: text.trim().slice(0, 300), phase, competencyKey: phase === "technical" ? "system_design" : null, difficulty: phase === "technical" ? 3 : null,
    mustAsk: true, maxFollowUps: 1, idealPoints: ["Explain the approach", "State a relevant constraint", "Justify the tradeoff"],
    redFlags: ["No supporting example"], expectedMinutes: 2, origin: "manual" };
}
