import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { z } from "zod";
import { requireOpening } from "@/lib/auth/guards";
import { ROLE_FAMILIES, COMPETENCY_KEYS, QUESTION_PHASES, TAXONOMY } from "@/lib/config/taxonomy";
import { publicEnv } from "@/lib/config/env";
import { attachment,geminiJSON } from "@/lib/ai/gemini";
import { importSchema,generateSchema,enrichSchema,generatedQuestion } from "@/lib/ai/schemas";
import { p9 } from "@/lib/ai/prompts/p9_import";
import { p10 } from "@/lib/ai/prompts/p10_questions";
import { mockLadder,mockQuestion } from "@/lib/ai/mock/fixtures";
import { questionsFor } from "@/lib/hiring/openingData";
import { readObject,uploadURL } from "@/lib/supabase/storage";
import type { OpeningQuestionInput } from "@/types/interview";
import { body,fail,json,route,type Params } from "@/lib/utils/http";

const limit=2*1024*1024;
const keys=COMPETENCY_KEYS.join(", ");
const safeText=z.string().trim().min(1).max(20000);
const ext=/\.(pdf|docx|txt|md)$/i;
const documentPrefix=(orgId:string,id:string)=>"org/"+orgId+"/"+id+"/docs/";
const apiQuestion=(value:z.infer<typeof generatedQuestion>,origin:OpeningQuestionInput["origin"]):OpeningQuestionInput=>({
  text:value.text,phase:value.phase,competencyKey:value.phase==="technical"?value.competency_key:null,
  subLabel:value.competency_key==="domain_other"?"Role expertise":null,
  difficulty:value.phase==="technical"?value.difficulty:null,idealPoints:value.ideal_points,redFlags:value.red_flags,
  expectedMinutes:value.expected_minutes,origin,mustAsk:true,maxFollowUps:1,
});
const phaseGuess=(text:string)=>/your (cv|project|previous role|resume)|personally contribute/i.test(text)?"cv_deep_dive":/tell me about a time|describe a time|conflict|leadership/i.test(text)?"behavioral":"technical";
function mockExtract(text:string) {
  const items=text.match(/[^?\r\n]+\?/g) ?? text.split("\n").filter((line)=>/^\s*(?:\d+[.)]|[-*])\s+/.test(line));
  const normalize=(line:string)=>line.replace(/^\s*(?:\d+[.)]|[-*#])\s*/,"").trim();
  return [...new Set(items.map(normalize).filter(Boolean))].slice(0,40).map((line)=>({
    ...mockQuestion(line,phaseGuess(line)),origin:"imported" as const,answerFound:false,
  }));
}
async function editable(params:Params<"id">) {
  const result=await requireOpening((await params.params).id);
  if(result.opening.locked)fail("LOCKED","This opening is locked. Duplicate it to edit the interview.");
  return result;
}
export const questionUpload=route(async(request,context:Params<"id">)=>{
  const {opening,org}=await editable(context);
  const {fileName}=await body(request,z.object({kind:z.literal("question_doc"),fileName:z.string().max(255).regex(ext),sizeBytes:z.number().int().positive().max(limit)}));
  return json(await uploadURL("artifacts",documentPrefix(org.id,opening.id)+randomUUID()+"."+fileName.split(".").at(-1)!.toLowerCase()));
});
export const importQuestions=route(async(request,context:Params<"id">)=>{
  const {opening,org}=await editable(context);
  const input=await body(request,z.union([z.object({text:safeText}).strict(),z.object({uploadPath:z.string().max(250)}).strict()]));
  let text="text" in input?input.text:"";
  let inline:ReturnType<typeof attachment>|undefined;
  if("uploadPath" in input) {
    const prefix=documentPrefix(org.id,opening.id);
    if(!input.uploadPath.startsWith(prefix) || !/^[0-9a-f-]{36}\.(pdf|docx|txt|md)$/.test(input.uploadPath.slice(prefix.length))) fail("BAD_REQUEST","Select a document uploaded for this opening.");
    const bytes=await readObject("artifacts",input.uploadPath);
    if(!bytes)fail("UPLOAD_MISSING","Upload a document first.");
    if(bytes.length>limit)fail("BAD_REQUEST","The document must be no larger than 2 MB.");
    const suffix=input.uploadPath.split(".").at(-1);
    if(suffix==="pdf"){
      if(bytes.subarray(0,5).toString()!=="%PDF-")fail("BAD_REQUEST","Upload a valid PDF.");
      inline=attachment("document","application/pdf",bytes);
      text="See attached PDF.";
    } else if(suffix==="docx"){
      try { text=(await mammoth.extractRawText({buffer:bytes})).value; }
      catch{ fail("BAD_REQUEST","We couldn't read this Word document."); }
    } else text=bytes.toString("utf8");
  }
  text=text.slice(0,20000);
  if(publicEnv.aiMode==="mock")return json({questions:mockExtract(inline?"How would you handle a timeout during a critical operation?":text)});
  try {
    const result=await geminiJSON(p9({seniority:opening.seniority,roleTitle:opening.roleTitle,taxonomyKeys:keys,documentTextOrSeeAttachment:text}),importSchema,{temperature:.1,inline});
    return json({questions:result.questions.map((value)=>({...apiQuestion(value,"imported"),answerFound:value.answer_found}))});
  } catch{fail("AI_UNAVAILABLE","We couldn't detect questions in that document. Try again.");}
});
export const generateQuestions=route(async(request,context:Params<"id">)=>{
  const {opening,org,database}=await editable(context);
  const input=await body(request,z.object({count:z.number().int().min(1).max(10),phase:z.enum(QUESTION_PHASES),competencyKey:z.enum(COMPETENCY_KEYS).optional(),
    difficulty:z.number().int().min(1).max(5).optional(),topic:z.string().max(300).optional()}));
  const defaultKey=COMPETENCY_KEYS.find((key)=>(TAXONOMY[key] as readonly string[]).includes(opening.roleFamily ?? ROLE_FAMILIES[0]))??"domain_other";
  if(publicEnv.aiMode==="mock"){
    const key=input.competencyKey??defaultKey;
    const questions=Object.values(mockLadder(key)).flat();
    return json({questions:questions.slice(0,input.count).map((q)=>({...mockQuestion(input.topic ? q.text.replace(/\?$/," using "+input.topic+"?") : q.text,input.phase),
      competencyKey:input.phase==="technical"?key:null,subLabel:key==="domain_other"?"Role expertise":null,difficulty:input.phase==="technical"?input.difficulty??3:null,origin:"ai_generated"}))});
  }
  const questions=await questionsFor(database,opening.id);
  try {
    const result=await geminiJSON(p10({ ...input,company:org.name,seniority:opening.seniority,roleTitle:opening.roleTitle,
      competencyDisplayName:input.competencyKey?TAXONOMY[input.competencyKey][0]:"",
      aiInstructionsOrNone:opening.config.ai.instructions||"None",jobDescription:opening.jobDescription??"",
      existingQuestionTextsOrNone:questions.map((item)=>item.text).join("\n")||"None",taxonomyKeys:keys,
    }),generateSchema,{temperature:.5});
    return json({questions:result.questions.map((q)=>apiQuestion(q,"ai_generated"))});
  } catch{fail("AI_UNAVAILABLE","We couldn't generate questions. Try again.");}
});
export const enrichQuestion=route(async(request,context:Params<"id">)=>{
  const {opening,org}=await editable(context);
  const {text}=await body(request,z.object({text:z.string().trim().min(1).max(300)}));
  if(publicEnv.aiMode==="mock")return json({question:mockQuestion(text,phaseGuess(text))});
  try {
    const result=await geminiJSON(p10({company:org.name,seniority:opening.seniority,roleTitle:opening.roleTitle,taxonomyKeys:keys,questionText:text},"enrich"),enrichSchema,{temperature:.5});
    return json({question:apiQuestion(result.question,"manual")});
  } catch{fail("AI_UNAVAILABLE","We couldn't enrich this question. Try again.");}
});
