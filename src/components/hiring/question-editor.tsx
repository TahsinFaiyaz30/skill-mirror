"use client";
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Dialog } from "radix-ui";
import { GripVertical, Plus, Sparkles, Upload } from "lucide-react";
import { COMPETENCY_KEYS, PHASE_LABELS, QUESTION_PHASES, TAXONOMY, type CompetencyKey } from "@/lib/config/taxonomy";
import { mockQuestion } from "@/lib/ai/mock/fixtures";
import { errorMessage, send, showError } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { OpeningQuestionInput, QuestionPhase } from "@/types/interview";

export type EditableQuestion = OpeningQuestionInput & { editorId:string };
export const editableQuestion=(question:OpeningQuestionInput):EditableQuestion=>({...question,editorId:question.id??crypto.randomUUID()});
export const stripEditor=(questions:EditableQuestion[])=>questions.map(({editorId,...q})=>{void editorId;return q;});
const names={ manual:"✍️ Manual",imported:"📄 Imported",ai_generated:"✨ AI generated" };
export const phaseTitle=(phase:QuestionPhase)=>phase==="cv_deep_dive"?"CV & projects":PHASE_LABELS[phase];

export function QuestionFields({ value, change }: { value:OpeningQuestionInput;change:(item:OpeningQuestionInput)=>void }) {
  const patch=(part:Partial<OpeningQuestionInput>)=>change({...value,...part});
  return <div className="grid-3">
    <label className="field">Phase<select value={value.phase} onChange={(e)=>patch({phase:e.target.value as QuestionPhase,...(e.target.value!=="technical"&&{competencyKey:null,subLabel:null,difficulty:null})})}>{QUESTION_PHASES.map((phase)=><option key={phase} value={phase}>{phaseTitle(phase)}</option>)}</select></label>
    {value.phase==="technical"&&<>
      <label className="field">Competency<select value={value.competencyKey??""} onChange={(e)=>patch({competencyKey:(e.target.value||null) as CompetencyKey|null})}><option value="">Company questions</option>{COMPETENCY_KEYS.map((key)=><option key={key} value={key}>{TAXONOMY[key][0]}</option>)}</select></label>
      <label className="field">Difficulty<select value={value.difficulty??""} onChange={(e)=>patch({difficulty:e.target.value?+e.target.value:null})}><option value="">Unspecified</option>{[1,2,3,4,5].map((level)=><option key={level} value={level}>Level {level}</option>)}</select></label>
      {value.competencyKey==="domain_other"&&<label className="field">Competency name<input value={value.subLabel??""} onChange={(e)=>patch({subLabel:e.target.value})}/></label>}
    </>}
  </div>;
}
function QuestionCard({ item, change, remove, duplicate, enrich }: { item:EditableQuestion;change:(value:EditableQuestion)=>void;remove:()=>void;duplicate:()=>void;enrich:()=>void }) {
  const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:item.editorId});
  return <article className="inset stack" ref={setNodeRef} style={{transform:transform?"translate3d("+transform.x+"px,"+transform.y+"px,0)":undefined,transition,opacity:isDragging?.6:1}}>
    <div className="cluster between"><div className="cluster"><button type="button" className="button ghost icon drag-handle" aria-label="Reorder question" {...attributes} {...listeners}><GripVertical size={17}/></button>
      <span className="badge">{names[item.origin]}</span>{item.difficulty&&<span className="badge mono">L{item.difficulty}</span>}</div>
      <label className="check"><input type="checkbox" checked={item.mustAsk} onChange={(e)=>change({...item,mustAsk:e.target.checked})}/>Must-ask</label></div>
    <label className="field">Question<textarea value={item.text} maxLength={300} onChange={(e)=>change({...item,text:e.target.value})}/></label>
    <QuestionFields value={item} change={(q)=>change({...q,editorId:item.editorId})}/>
    <div className="grid-2"><label className="field">Expected minutes<input type="number" min={1} max={5} step={.5} value={item.expectedMinutes} onChange={(e)=>change({...item,expectedMinutes:+e.target.value})}/></label>
    <label className="field">Follow-up limit<select value={item.maxFollowUps} onChange={(e)=>change({...item,maxFollowUps:+e.target.value})}>{[0,1,2].map((n)=><option key={n}>{n}</option>)}</select></label></div>
    <details><summary>Ideal points and red flags</summary><div className="grid-2">
      <label className="field">Ideal points (3–6, one per line)<textarea defaultValue={item.idealPoints.join("\n")} onBlur={(e)=>change({...item,idealPoints:e.target.value.split("\n").map((t)=>t.trim()).filter(Boolean)})}/></label>
      <label className="field">Red flags (up to 4, one per line)<textarea defaultValue={item.redFlags.join("\n")} onBlur={(e)=>change({...item,redFlags:e.target.value.split("\n").map((t)=>t.trim()).filter(Boolean)})}/></label>
    </div></details>
    <div className="cluster"><button type="button" className="button ghost" onClick={enrich}><Sparkles size={15}/>Enrich with AI</button>
      <button type="button" className="button ghost" onClick={duplicate}>Duplicate</button><button type="button" className="button ghost danger" onClick={remove}>Delete</button></div>
  </article>;
}
function QuestionDialog({ id, mode, close, add }: { id:string;mode:"import"|"generate";close:()=>void;add:(items:OpeningQuestionInput[])=>void }) {
  const [text,setText]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [results,setResults]=useState<OpeningQuestionInput[]|null>(null);
  const [chosen,setChosen]=useState<boolean[]>([]);
  const [phase,setPhase]=useState<QuestionPhase>("technical");
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    setBusy(true);setError("");
    try {
      const base="/api/openings/"+id;
      let body:unknown;
      if(mode==="import"&&file){
        const signed=await send<SignedUpload>(base+"/upload-url","POST",{kind:"question_doc",fileName:file.name,sizeBytes:file.size});
        await uploadFile("artifacts",signed,file,file.type||"application/octet-stream");
        body={uploadPath:signed.path};
      }else if(mode==="import")body={text};
      else body={count:Number(form.get("count")),phase,competencyKey:form.get("key")||undefined,difficulty:Number(form.get("level"))||undefined,topic:form.get("topic")||undefined};
      const {questions}=await send<{questions:OpeningQuestionInput[]}>(base+"/questions/"+mode,"POST",body);
      setResults(questions);setChosen(questions.map(()=>true));
    }catch (error){setError(errorMessage(error));}
    finally{setBusy(false);}
  }
  return <Dialog.Root open onOpenChange={(open)=>{if(!open)close();}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="card dialog-content stack">
    <Dialog.Title className="text-xl font-bold">{mode==="import"?"Import from document":"Generate with AI"}</Dialog.Title>
    <Dialog.Description className="muted">{results?"Review and edit the questions before adding them to the opening.":mode==="import"?"Paste your questions or upload a PDF, DOCX, TXT or MD file.":"Choose the phase and what the questions should cover."}</Dialog.Description>
    {error&&<p role="alert" className="danger">{error}</p>}
    {results?<div className="stack">
      {results.map((question,i)=><article key={i} className="inset stack-sm"><label className="check"><input type="checkbox" checked={chosen[i]} onChange={(e)=>setChosen((current)=>current.map((item,j)=>i===j?e.target.checked:item))}/>{question.text}</label>
        <QuestionFields value={question} change={(value)=>setResults((current)=>current?.map((item,j)=>i===j?value:item)??null)}/></article>)}
      {!results.length&&<p>No interview questions were detected.</p>}
      <div className="cluster"><button className="button secondary" onClick={()=>setResults(null)}>Back</button><button className="button" disabled={!chosen.some(Boolean)} onClick={()=>{add(results.filter((_,i)=>chosen[i]));close();}}>Add selected</button></div>
    </div>:<form className="stack" onSubmit={submit}>
      {mode==="import"?<><label className="field">Paste questions or notes<textarea value={text} maxLength={20000} onChange={(e)=>{setText(e.target.value);setFile(null);}}/></label>
        <label className="field">Upload document<input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e)=>setFile(e.target.files?.[0]??null)}/></label></>:<>
        <label className="field">Phase<select value={phase} onChange={(e)=>setPhase(e.target.value as QuestionPhase)}>{QUESTION_PHASES.map((item)=><option key={item} value={item}>{phaseTitle(item)}</option>)}</select></label>
        {phase==="technical"&&<div className="grid-2"><label className="field">Competency<select name="key"><option value="">Choose automatically</option>{COMPETENCY_KEYS.map((key)=><option key={key} value={key}>{TAXONOMY[key][0]}</option>)}</select></label>
          <label className="field">Difficulty<select name="level"><option value="">Any</option>{[1,2,3,4,5].map((level)=><option key={level}>{level}</option>)}</select></label></div>}
        <label className="field">Question count<input name="count" type="number" min={1} max={10} defaultValue={3} required/></label><label className="field">Topic (optional)<input name="topic" maxLength={300}/></label>
      </>}
      <div className="cluster"><Dialog.Close type="button" className="button secondary">Cancel</Dialog.Close><button className="button" disabled={busy||mode==="import"&&!file&&!text.trim()}>{busy?"Working…":mode==="import"?"Detect questions":"Generate questions"}</button></div>
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function QuestionEditor({ id, questions, change }: { id:string;questions:EditableQuestion[];change:(values:EditableQuestion[])=>void }) {
  const [dialog,setDialog]=useState<"import"|"generate"|null>(null);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const update=(q:EditableQuestion)=>change(questions.map((item)=>item.editorId===q.editorId?q:item));
  const add=(list:OpeningQuestionInput[])=>change([...questions,...list.map(editableQuestion)]);
  function reorder(event:DragEndEvent){
    if(!event.over||event.active.id===event.over.id)return;
    const a=questions.findIndex((q)=>q.editorId===event.active.id),b=questions.findIndex((q)=>q.editorId===event.over?.id);
    if(a<0||b<0||questions[a].phase!==questions[b].phase)return;
    change(arrayMove(questions,a,b));
  }
  async function enrich(item:EditableQuestion){
    try{
      const {question}=await send<{question:OpeningQuestionInput}>("/api/openings/"+id+"/questions/enrich","POST",{text:item.text});
      update({...item,...question,id:item.id,editorId:item.editorId,origin:item.origin,mustAsk:item.mustAsk,maxFollowUps:item.maxFollowUps});
    }catch(error){showError(error);}
  }
  return <div className="stack">
    <div className="cluster"><button type="button" className="button" onClick={()=>add([{...mockQuestion(""),idealPoints:["Describe the approach","Explain a relevant constraint","Justify the decision"],competencyKey:null,difficulty:null}])}><Plus size={16}/>Add question</button>
      <button type="button" className="button secondary" onClick={()=>setDialog("import")}><Upload size={16}/>Import from document</button>
      <button type="button" className="button secondary" onClick={()=>setDialog("generate")}><Sparkles size={16}/>Generate with AI</button></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
      {QUESTION_PHASES.map((phase)=>{
        const items=questions.filter((item)=>item.phase===phase);
        if(!items.length)return null;
        return <section className="stack" key={phase}><h3>{phaseTitle(phase)}</h3><SortableContext items={items.map((q)=>q.editorId)} strategy={verticalListSortingStrategy}>
          {items.map((q)=><QuestionCard key={q.editorId} item={q} change={update} remove={()=>change(questions.filter((item)=>item.editorId!==q.editorId))}
            duplicate={()=>add([{...q,id:undefined,text:q.text.slice(0,300)}])} enrich={()=>void enrich(q)}/>)}
        </SortableContext></section>;
      })}
    </DndContext>
    {!questions.length&&<p className="muted">Add your first interview question.</p>}
    {dialog&&<QuestionDialog id={id} mode={dialog} close={()=>setDialog(null)} add={add}/>}
  </div>;
}
