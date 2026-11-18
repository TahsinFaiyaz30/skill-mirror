"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays,Clock3,Headphones } from "lucide-react";
import { authPath } from "@/lib/auth/navigation";
import { PHASE_LABELS,readable } from "@/lib/config/taxonomy";
import { errorMessage,RequestError,send } from "@/lib/utils/client";
import { signOut } from "@/components/shell/app-nav";
import type { PublicInvite } from "@/types/hiring";
export function InviteLanding({ data,token,signedIn }: {data:PublicInvite;token:string;signedIn:boolean}){
  const router=useRouter();
  const [error,setError]=useState("");
  const [wrong,setWrong]=useState(false);
  const [busy,setBusy]=useState(false);
  const path="/i/"+token;
  async function accept(){
    setBusy(true);setError("");setWrong(false);
    try{
      const result=await send<{sessionId:string;next:"cv"|"prepare"}>("/api/invite/"+token+"/accept","POST");
      router.push(result.next==="cv"?"/interview/new?session="+result.sessionId:"/interview/"+result.sessionId+"/prepare");
    }catch (error){setError(errorMessage(error));setWrong(error instanceof RequestError&&error.status===403);setBusy(false);}
  }
  const open=data.status==="pending"||data.status==="accepted";
  return <section className="card stack narrow">
    <div className="stack-sm"><span className="badge primary">Company interview</span><h1>{data.company.name} invited you to an AI interview</h1><h2>{data.roleTitle} · {readable(data.seniority)}</h2></div>
    {open ? <>
      <div className="cluster"><span className="badge"><Clock3 size={15} className="mr-1"/>{data.lengthMinutes} minutes</span><span className="badge"><CalendarDays size={15} className="mr-1"/>Expires {new Date(data.expiresAt).toLocaleDateString()}</span></div>
      <p>{data.phases.filter((phase)=>phase!=="intro_calibration"&&phase!=="close").map((phase)=>phase==="cv_deep_dive"?"CV discussion":PHASE_LABELS[phase]).join(" · ")}</p>
      <div className="inset stack-sm"><h3>What to expect</h3><ul className="list-disc pl-5"><li>Use desktop Chrome or Edge in a quiet room.</li><li>Keep your camera and microphone on for about {data.lengthMinutes} minutes.</li><li className="cluster"><Headphones size={16}/>Headphones {data.requireHeadphones?"required":"recommended"}</li></ul></div>
      <p>Your recording, transcript and AI evaluation will be shared with {data.company.name}.</p>
      {!signedIn&&<small>Invitation for {data.emailHint}</small>}
      {error&&<p className="danger" role="alert">{error}</p>}
      <div className="cluster">{signedIn?<><button className="button" disabled={busy} onClick={()=>void accept()}>Start</button>{wrong&&<button className="button secondary" onClick={()=>void signOut(authPath("/login",path))}>Log in with a different account</button>}</>
        :<><Link className="button" href={authPath("/signup",path)}>Sign up to continue</Link><Link className="button secondary" href={authPath("/login",path)}>Log in</Link></>}</div>
    </>:data.status==="started"||data.status==="completed"?<><p>You&apos;ve already {data.status} this interview.</p><div><Link className="button" href="/dashboard">Go to dashboard</Link></div></>:
      <p>This invitation is no longer valid. Contact {data.company.name} if you think this is a mistake.</p>}
  </section>;
}
