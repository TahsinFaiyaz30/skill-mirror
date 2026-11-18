"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { requestJSON, errorMessage } from "@/lib/utils/client";
import { DIMENSIONS, readable, TAXONOMY, type CompetencyKey } from "@/lib/config/taxonomy";
import { useThemeColors } from "./charts";

type Point = { date:string; score:number; ceiling?:number|null };
type Gain = { first:number|null; latest:number|null; delta:number|null };
type Progress = {
  sessions:{ date:string; overallScore:number; sessionId:string }[]; competencies:Record<string,Point[]>; softSkills:Record<string,Point[]>;
  gains:{ overall:Gain; competencies:Record<string,Gain>; softSkills:Record<string,Gain> };
};
const format = (date:string) => new Date(date).toLocaleDateString(undefined,{ month:"short",day:"numeric" });
export const deltaText = (n:number|null) => n === null ? "—" : (n > 0 ? "+" : "")+n;
function best(values:Record<string,Gain>) {
  return Object.entries(values).filter(([,item]) => item.delta !== null).sort((a,b) => b[1].delta! - a[1].delta!)[0];
}
export function ProgressView() {
  const query = useQuery({ queryKey:["progress"],queryFn:() => requestJSON<Progress>("/api/progress") });
  const colors = useThemeColors();
  const [hidden,setHidden] = useState<string[]>([]);
  if (query.isPending) return <p role="status">Loading progress…</p>;
  if (query.isError) return <div className="card stack"><p role="alert" className="danger">{errorMessage(query.error)}</p><button className="button" onClick={() => void query.refetch()}>Retry</button></div>;
  const data = query.data;
  const technical = best(data.gains.competencies), soft = best(data.gains.softSkills);
  const colorsByDim = [colors.primary,colors.accent,colors["ev-nonverbal"],colors.warning,colors["ev-live-vision"],colors.danger,colors.muted];
  const samples = data.sessions.map((session) => ({
    ...session,...Object.fromEntries(DIMENSIONS.map((dim) => [dim,data.softSkills[dim]?.find((point) => point.date === session.date)?.score ?? null])),
  }));
  return <div className="stack"><h1>Verified capability gains</h1>
    <div className="grid-3">{[
      ["Overall change",data.gains.overall.delta], [technical ? TAXONOMY[technical[0] as CompetencyKey]?.[0] ?? technical[0] : "Best competency gain",technical?.[1].delta ?? null],
      [soft ? readable(soft[0]) : "Best soft-skill gain",soft?.[1].delta ?? null],
    ].map(([label,n]) => <div className="card stack-sm" key={String(label)}><small>{label}</small><strong className="mono text-2xl">{deltaText(n as number|null)}</strong></div>)}</div>
    {samples.length < 2 && <p className="card">Complete two interviews to see your progress.</p>}
    {samples.length > 0 && <>
      <section className="card stack"><h2>Overall score</h2><p className="sr-only">{samples.map((s) => format(s.date)+" "+s.overallScore).join(", ")}</p>
        <div className="chart"><ResponsiveContainer width="100%" height={260}><LineChart data={samples}><CartesianGrid stroke={colors.border} /><XAxis dataKey="date" tickFormatter={format} stroke={colors.muted} /><YAxis domain={[0,100]} stroke={colors.muted} /><Tooltip labelFormatter={(label) => format(String(label))} contentStyle={{background:colors.surface}} /><Line dataKey="overallScore" name="Overall score" stroke={colors.primary} strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      </section>
      <section className="card stack"><h2>Technical ceilings</h2><div className="grid-3">{Object.entries(data.competencies).map(([key,points]) => <div className="inset stack-sm" key={key}><h3>{TAXONOMY[key as CompetencyKey]?.[0] ?? key}</h3><p className="sr-only">{points.map((p) => format(p.date)+" Level "+p.ceiling).join(", ")}</p>
        <div className="chart"><ResponsiveContainer width="100%" height={150}><LineChart data={points}><XAxis dataKey="date" tickFormatter={format} stroke={colors.muted} /><YAxis domain={[0,5]} allowDecimals={false} stroke={colors.muted} /><Line type="stepAfter" dataKey="ceiling" stroke={colors.primary} strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      </div>)}</div></section>
      <section className="card stack"><h2>Soft skills</h2><div className="cluster">{DIMENSIONS.map((dim,i) => <button className="button secondary" key={dim} aria-pressed={!hidden.includes(dim)} onClick={() => setHidden((current) => current.includes(dim) ? current.filter((d) => d !== dim) : [...current,dim])}><span style={{color:colorsByDim[i]}} aria-hidden="true">●</span>{readable(dim)}</button>)}</div>
        <p className="sr-only">{Object.entries(data.softSkills).map(([dim,points]) => readable(dim)+": "+points.map((p) => p.score).join(", ")).join(". ")}</p>
        <div className="chart"><ResponsiveContainer width="100%" height={270}><LineChart data={samples}><CartesianGrid stroke={colors.border} /><XAxis dataKey="date" tickFormatter={format} stroke={colors.muted} /><YAxis domain={[0,100]} stroke={colors.muted} />
          <Tooltip contentStyle={{background:colors.surface}} labelFormatter={(label) => format(String(label))} />{DIMENSIONS.map((dim,i) => <Line key={dim} dataKey={dim} name={readable(dim)} stroke={colorsByDim[i]} hide={hidden.includes(dim)} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div>
      </section>
    </>}
  </div>;
}
