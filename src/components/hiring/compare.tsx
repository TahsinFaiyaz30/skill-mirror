"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { requestJSON,errorMessage } from "@/lib/utils/client";
import { readable } from "@/lib/config/taxonomy";
import { WEIGHT_KEYS } from "@/lib/config/sessionConfig";
import { SoftSkillRadar } from "@/components/report/charts";
import type { Comparison } from "@/types/hiring";
export function CompareGrid({ ids }: {ids:string}) {
  const query=useQuery({queryKey:["compare",ids],queryFn:()=>requestJSON<{items:Comparison[]}>("/api/hiring/compare?ids="+encodeURIComponent(ids)),enabled:Boolean(ids)});
  const items=query.data?.items??[];
  return <div className="stack"><h1>Compare candidates</h1>
    {!ids&&<p>Choose two or three completed candidates from an opening.</p>}
    {ids&&query.isPending&&<p role="status">Loading comparison…</p>}
    {query.isError&&<div className="card stack"><p className="danger" role="alert">{errorMessage(query.error)}</p><Link href="/hiring">Back to openings</Link></div>}
    <div className={items.length===3?"grid-3":"grid-2"}>{items.map((item)=><article className="card stack" key={item.sessionId}>
      <div className="cluster between"><h2>{item.name}</h2><Link href={"/hiring/candidates/"+item.sessionId}>Open report</Link></div>
      <div className="cluster"><span className="badge primary">{item.recommendation}</span><span className="mono text-2xl">{item.weightedScore}</span></div>
      <dl className="stack-sm">{WEIGHT_KEYS.map((key)=><div className="cluster between" key={key}><dt>{key==="cv"?"CV & projects":readable(key)}</dt><dd className="mono">{item.components[key]??"—"}</dd></div>)}</dl>
      <table><thead><tr><th scope="col">Competency</th><th scope="col">Ceiling</th><th scope="col">θ</th></tr></thead><tbody>{item.competencies.map((comp)=><tr key={comp.key}><td>{comp.subLabel??comp.displayName}</td><td>{comp.ceiling??"—"}</td><td>{comp.notAssessed?"—":comp.theta.toFixed(1)}</td></tr>)}</tbody></table>
      <p>Must-ask coverage · <strong>{item.coveragePct}%</strong></p><div className="stack-sm"><h3>Strengths</h3><ul className="list-disc pl-5">{item.strengths.map((s)=><li key={s}>{s}</li>)}</ul>
      <h3>Gaps</h3><ul className="list-disc pl-5">{item.gaps.map((g)=><li key={g}>{g}</li>)}</ul></div><p>Decision · {item.decision?readable(item.decision):"Pending review"}</p>
    </article>)}</div>
    {items.some((item)=>item.softSkills.length>0)&&<section className="card stack"><h2>Delivery comparison</h2><SoftSkillRadar candidates={items.filter((item)=>item.softSkills.length).map((item)=>({name:item.name,dimensions:item.softSkills}))}/></section>}
    {items.length>0&&<small>AI recommendation to support, not replace, human judgement.</small>}
  </div>;
}
