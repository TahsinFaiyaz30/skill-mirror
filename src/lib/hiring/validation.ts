import { z } from "zod";
import { COMPETENCY_KEYS, QUESTION_PHASES, ROLE_FAMILIES, SENIORITIES } from "@/lib/config/taxonomy";
import { presentationSchema,voiceName } from "@/lib/ai/schemas";
import type { OpeningConfig } from "@/types/interview";

const words=(n:number)=>z.string().trim().min(1).max(n);
const percent=z.number().int().min(0).max(100);
const level=z.number().int().min(1).max(5);
export const orgRoleInput=z.enum(["owner","recruiter"]);
export const site=z.url({protocol:/^https?$/});
export const openingBasics=z.object({
  title:words(120),roleTitle:words(80),roleFamily:z.enum(ROLE_FAMILIES),seniority:z.enum(SENIORITIES),
  department:words(80).nullable().optional(),jobDescription:z.string().max(6000).nullable().optional(),
});
export const weightSchema=z.object({ technical:percent,behavioral:percent,cv:percent,soft:percent });
const phases=z.object({cv_deep_dive:z.boolean(),behavioral:z.boolean(),technical:z.boolean(),presentation:z.boolean(),candidate_questions:z.boolean()});
const ai=z.object({
  instructions:z.string().max(2000),toneInstructions:z.string().max(300),interviewerName:z.string().max(20).nullable(),
  voiceName,strictness:z.enum(["lenient","balanced","strict"]),adversarialIntensity:z.enum(["low","medium","high"]),allowFollowUps:z.boolean(),
});
const competencies=z.object({
  selection:z.enum(["auto","manual"]),
  items:z.array(z.object({key:z.enum(COMPETENCY_KEYS),sub_label:z.string().trim().max(80).nullable(),weight:z.number().int().min(1).max(3)})).max(4),
});
const cv=z.object({required:z.boolean(),useGithub:z.boolean()});
const evaluation=z.object({weights:weightSchema,nonverbalPolicy:z.enum(["scored","coaching_only","off"]),passThreshold:percent});
const candidate=z.object({feedbackVisibility:z.enum(["none","summary","full"]),requireEmailMatch:z.boolean(),inviteExpiryDays:z.number().int().min(1).max(30)});
const integrity=z.object({requireHeadphones:z.boolean()});
const mode=z.enum(["scripted","hybrid","auto"]);
const lengthMinutes=z.union([z.literal(15),z.literal(20),z.literal(30),z.literal(45)]);
const presentation=z.object({custom:presentationSchema.nullable()});
const complete=z.object({mode,lengthMinutes,phases,competencies,ai,cv,evaluation,candidate,integrity,presentation})
  .check((ctx)=>{
    const {competencies:selection}=ctx.value;
    if (selection.selection==="manual" && (selection.items.length===0 || new Set(selection.items.map((item)=>item.key)).size!==selection.items.length))
      ctx.issues.push({ code:"custom",message:"Choose one to four distinct competencies.",input:selection });
    if (selection.items.some((item)=>item.key==="domain_other" && !item.sub_label))
      ctx.issues.push({ code:"custom",message:"Name the role-specific competency.",input:selection });
  });
export const partialOpening=z.object({ mode,lengthMinutes,phases:phases.partial(),competencies:competencies.partial(),ai:ai.partial(),cv:cv.partial(),
  evaluation:evaluation.partial().extend({weights:weightSchema.partial().optional()}),candidate:candidate.partial(),integrity:integrity.partial(),presentation:presentation.partial(),
}).partial();
export function mergeOpening(original:OpeningConfig, change:z.infer<typeof partialOpening>):OpeningConfig {
  return complete.parse({
    ...original,...change,
    phases:{...original.phases,...change.phases}, competencies:{...original.competencies,...change.competencies},
    ai:{...original.ai,...change.ai}, cv:{...original.cv,...change.cv},
    evaluation:{...original.evaluation,...change.evaluation,weights:{...original.evaluation.weights,...change.evaluation?.weights}},
    candidate:{...original.candidate,...change.candidate}, integrity:{...original.integrity,...change.integrity},presentation:{...original.presentation,...change.presentation},
  });
}
export const questionInput=z.object({
  id:z.uuid().optional(),phase:z.enum(QUESTION_PHASES),text:words(300),competencyKey:z.enum(COMPETENCY_KEYS).nullable().optional(),
  subLabel:words(80).nullable().optional(),difficulty:level.nullable().optional(),mustAsk:z.boolean(),maxFollowUps:z.number().int().min(0).max(2),
  idealPoints:z.array(words(160)).min(3).max(6),redFlags:z.array(words(160)).max(4),expectedMinutes:z.number().min(1).max(5),
  origin:z.enum(["manual","imported","ai_generated"]),
}).check((ctx)=>{
  const q=ctx.value;
  if (q.phase !== "technical" && (q.competencyKey || q.difficulty))
    ctx.issues.push({code:"custom",message:"Competency and difficulty apply only to technical questions.",input:q});
  if (q.competencyKey==="domain_other" && !q.subLabel)
    ctx.issues.push({code:"custom",message:"Name the role-specific competency for this question.",input:q});
});
