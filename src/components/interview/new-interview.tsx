"use client";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ROLE_FAMILIES, SENIORITIES, readable } from "@/lib/config/taxonomy";
import { errorMessage, requestJSON, send } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type { ParsedCV, SessionPublic, VoiceName } from "@/types/interview";
type CVRow = { cvId: string; fileName: string; headline: string | null; parseStatus: string };
const companies = ["Google","Meta","Microsoft","Amazon","Apple","Netflix","Stripe","Generic startup"];
export const roleOptions = ["Software Engineer","Backend Engineer","Frontend Engineer","Full-Stack Engineer","Mobile Engineer","ML Engineer","Data Scientist","Data Engineer","DevOps/SRE","Product Manager","Product Designer"];
export function VoiceSelect({ voice, setVoice }: { voice: VoiceName; setVoice: (value: VoiceName) => void }) {
  async function preview(value: VoiceName) {
    const path = "/audio/voice-" + value.toLowerCase() + ".wav";
    try { await new Audio(path).play(); }
    catch { const utterance = new SpeechSynthesisUtterance("Hi, I’ll be interviewing you today."); utterance.lang = "en-US"; speechSynthesis.speak(utterance); }
  }
  return <fieldset className="stack-sm"><legend>Interviewer voice</legend><div className="cluster">{(["Kore", "Charon"] as const).map((name) => <div key={name} className="inset cluster">
    <label className="cluster"><input type="radio" name="voiceName" checked={voice === name} onChange={() => setVoice(name)} />{name}</label>
    <button type="button" className="button ghost icon" aria-label={"Preview " + name} onClick={() => void preview(name)}>▶</button>
  </div>)}</div></fieldset>;
}
export function NewInterview({ existing }: { existing?: SessionPublic }) {
  const router = useRouter();
  const companyMode = Boolean(existing);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "parsing" | "saving">("idle");
  const [error, setError] = useState("");
  const [cv, setCv] = useState<{ cvId: string; parsed: ParsedCV } | null>(null);
  const [previous, setPrevious] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [voice, setVoice] = useState<VoiceName>("Kore");
  const cvQuery = useQuery({ queryKey: ["cvs"], queryFn: () => requestJSON<{ items: CVRow[] }>("/api/cv") });
  const available = (cvQuery.data?.items ?? []).filter((item) => item.parseStatus === "parsed");
  async function readCv() {
    setError("");
    try {
      let cvId = previous;
      if (file) {
        if (!/\.pdf$/i.test(file.name) || file.size > 5242880) throw new Error("Select a PDF no larger than 5 MB.");
        setState("uploading");
        const signed = await send<SignedUpload & { cvId: string }>("/api/cv/upload-url", "POST", { fileName: file.name, sizeBytes: file.size });
        await uploadFile("cvs", signed, file, "application/pdf");
        cvId = signed.cvId;
      }
      setState("parsing");
      setCv(await send("/api/cv/" + cvId + "/parse", "POST"));
      setStep(1);
    } catch (error) { setError(errorMessage(error)); }
    finally { setState("idle"); }
  }
  async function confirmCv() {
    if (!cv) return;
    setState("saving");
    try {
      await send("/api/cv/" + cv.cvId, "PATCH", { skillsRemoved: cv.parsed.skills_removed });
      if (existing) {
        const id = existing.session.id;
        await send("/api/sessions/" + id, "PATCH", { cvId: cv.cvId });
        router.push("/interview/" + id + "/prepare");
      } else setStep(2);
    } catch (error) { setError(errorMessage(error)); }
    finally { setState("idle"); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cv) return;
    setState("saving"); setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { sessionId } = await send<{ sessionId: string }>("/api/sessions", "POST", { ...form, lengthMinutes: Number(form.lengthMinutes), cvId: cv.cvId, voiceName: voice, jobDescription: description });
      router.push("/interview/" + sessionId + "/prepare");
    } catch (error) { setError(errorMessage(error)); }
    finally { setState("idle"); }
  }
  function chooseFile(next: File | null) { setFile(next); setPrevious(""); setError(""); }
  return <section className="stack">
    <h1>{existing ? "Interview for " + existing.session.roleTitle + " at " + existing.session.company : "New interview"}</h1>
    <ol className="cluster" aria-label="Interview setup steps">{(companyMode ? ["Upload CV", "Review"] : ["Upload CV", "Review", "Target"]).map((name, index) => <li key={name} className={"badge " + (index === step ? "primary" : "")} aria-current={index === step ? "step" : undefined}>{name}</li>)}</ol>
    {error && <p className="danger" role="alert">{error}</p>}
    {step === 0 && <div className="card stack">
      <div className="inset stack-sm" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0] ?? null); }}>
        <FileUp size={24} /><label className="field">Upload your CV<input type="file" accept="application/pdf,.pdf" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} /></label>
        <small>{file ? file.name : "Drop a PDF here or choose a file. Up to 5 MB and 10 pages."}</small>
      </div>
      {available.length > 0 && <fieldset className="stack-sm"><legend>Or use a previous CV</legend>{available.map((item) => <label className="check inset" key={item.cvId}><input type="radio" checked={item.cvId === previous} onChange={() => { setFile(null); setPrevious(item.cvId); }} /><span>{item.fileName}<br /><small>{item.headline}</small></span></label>)}</fieldset>}
      {state !== "idle" && <div className="stack-sm" aria-live="polite"><progress /><p>{state === "uploading" ? "Uploading your CV…" : "Reading your CV…"}</p></div>}
      <div><button className="button" disabled={state !== "idle" || (!file && !previous)} onClick={() => void readCv()}>{error ? "Retry" : "Read CV"}</button></div>
    </div>}
    {step === 1 && cv && <div className="card stack">
      <div className="stack-sm"><h2>{cv.parsed.full_name}</h2><p>{cv.parsed.headline}</p><p className="cluster"><span className="badge">{readable(cv.parsed.seniority_estimate)}</span>{cv.parsed.total_years_experience} years of experience</p></div>
      <h3>Skills</h3>
      {Object.entries(Object.groupBy(cv.parsed.skills.filter((skill) => !cv.parsed.skills_removed.includes(skill.name)), (skill) => skill.category)).map(([category, skills]) => <div key={category} className="stack-sm"><small>{readable(category)}</small><div className="cluster">{skills?.map((skill) => <span key={skill.name} className="badge" title={skill.evidence}>{skill.name}<button type="button" className="ml-2" aria-label={"Remove " + skill.name} onClick={() => setCv({ ...cv, parsed: { ...cv.parsed, skills_removed: [...cv.parsed.skills_removed, skill.name] } })}>×</button></span>)}</div></div>)}
      <div className="grid-2"><div className="stack-sm"><h3>Experience</h3>{cv.parsed.experience.map((job, index) => <p key={index}>{job.title} · {job.company}</p>)}</div><div className="stack-sm"><h3>Projects</h3>{cv.parsed.projects.map((project, index) => <p key={index}>{project.name} · {project.role}</p>)}</div></div>
      <div className="cluster">{[...cv.parsed.links.github, cv.parsed.links.linkedin, cv.parsed.links.portfolio].filter((url) => /^https?:\/\//i.test(url)).map((url) => <a className="badge" key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>)}</div>
      <div className="cluster"><button className="button secondary" onClick={() => setStep(0)}>Back</button><button className="button" disabled={state !== "idle"} onClick={() => void confirmCv()}>This looks right</button></div>
    </div>}
    {step === 2 && <form className="card stack" onSubmit={create}>
      <h2>Interview target</h2><div className="grid-2">
        <label className="field">Company<input name="company" list="companies" required maxLength={80} /><datalist id="companies">{companies.map((x) => <option key={x} value={x} />)}</datalist></label>
        <label className="field">Role title<input name="roleTitle" list="roles" required maxLength={80} /><datalist id="roles">{roleOptions.map((x) => <option key={x} value={x} />)}</datalist></label>
        <label className="field">Role family<select name="roleFamily">{ROLE_FAMILIES.map((x) => <option key={x} value={x}>{readable(x)}</option>)}</select></label>
        <label className="field">Seniority<select name="seniority" defaultValue={cv?.parsed.seniority_estimate ?? "mid"}>{SENIORITIES.map((x) => <option key={x} value={x}>{readable(x)}</option>)}</select></label>
      </div>
      <label className="field">Job description (optional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={6000} /><small>{description.length} / 6,000</small></label>
      <fieldset className="stack-sm"><legend>Length</legend><div className="cluster"><label className="check inset"><input type="radio" name="lengthMinutes" value="20" defaultChecked />Standard 20 min</label><label className="check inset"><input type="radio" name="lengthMinutes" value="10" />Quick 10 min</label></div></fieldset>
      <VoiceSelect voice={voice} setVoice={setVoice} /><div className="cluster"><button type="button" className="button secondary" onClick={() => setStep(1)}>Back</button><button className="button" disabled={state !== "idle"}>Create interview</button></div>
    </form>}
  </section>;
}
