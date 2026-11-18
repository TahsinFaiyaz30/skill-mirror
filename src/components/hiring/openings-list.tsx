"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness,LockKeyhole } from "lucide-react";
import type { OpeningListRow } from "@/types/hiring";
import { readable } from "@/lib/config/taxonomy";
import { errorMessage,requestJSON,send,showError } from "@/lib/utils/client";
import { DuplicateButton } from "./opening-wizard";
export function OpeningsList(){
  const query=useQuery({queryKey:["openings"],queryFn:()=>requestJSON<{items:OpeningListRow[]}>("/api/openings")});
  const items=query.data?.items??[];
  const stats=[["Active openings",items.filter((row)=>row.status==="active").length],["Candidates invited",items.reduce((n,row)=>n+row.counts.invited,0)],
    ["Interviews completed",items.reduce((n,row)=>n+row.counts.completed,0)],["Recommended to advance",items.reduce((n,row)=>n+row.counts.advance,0)]];
  return <div className="stack"><div className="cluster between"><div className="stack-sm"><p className="muted">SkillMirror for Teams</p><h1>Openings</h1></div><Link href="/hiring/openings/new" className="button">New opening</Link></div>
    <div className="grid-4">{stats.map(([label,n])=><div key={label} className="card stack-sm"><small>{label}</small><strong className="mono text-2xl">{n}</strong></div>)}</div>
    {query.isPending?<p role="status">Loading openings…</p>:query.isError?<div className="card stack"><p role="alert" className="danger">{errorMessage(query.error)}</p><button className="button" onClick={()=>void query.refetch()}>Retry</button></div>:!items.length?
    <div className="card stack center"><BriefcaseBusiness className="mx-auto" size={32}/><h2>Create your first AI interview.</h2><div><Link href="/hiring/openings/new" className="button">New opening</Link></div></div>:
    <div className="card scroll"><table><thead><tr>{["Opening","Status","Invited","Completed","Recommended","Updated","Actions"].map((label)=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{items.map((item)=><tr key={item.id}><td><div className="cluster"><Link href={"/hiring/openings/"+item.id}>{item.title}</Link>{item.locked&&<LockKeyhole size={16} aria-label="Locked"/>}</div></td><td><span className={"badge "+(item.status==="active"?"accent":"")}>{readable(item.status)}</span></td>
        <td className="mono">{item.counts.invited}</td><td className="mono">{item.counts.completed}</td><td className="mono">{item.counts.advance}</td><td>{new Date(item.updatedAt).toLocaleDateString()}</td>
        <td><div className="cluster"><Link className="button ghost" href={"/hiring/openings/"+item.id}>Open</Link><DuplicateButton id={item.id}/>{item.status==="active"&&<button className="button ghost" onClick={()=>{
          if(confirm("Close this opening and expire pending invitations?"))void send("/api/openings/"+item.id+"/close","POST").then(()=>query.refetch(),showError);
        }}>Close</button>}</div></td></tr>)}</tbody>
    </table></div>}
  </div>;
}
