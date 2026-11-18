"use client";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { errorMessage,requestJSON } from "@/lib/utils/client";
import { readable } from "@/lib/config/taxonomy";
import type { MyInvite } from "@/types/hiring";
export function CompanyInvites(){
  const query=useQuery({queryKey:["my-invitations"],queryFn:()=>requestJSON<{items:MyInvite[]}>("/api/my/invitations")});
  if(query.isError)return <section className="card stack"><h2>Company interviews</h2><p role="alert" className="danger">{errorMessage(query.error)}</p><button className="button" onClick={()=>void query.refetch()}>Retry</button></section>;
  const items=query.data?.items??[];
  if(!items.length)return null;
  return <section className="stack"><h2>Company interviews</h2><div className="grid-3">{items.map((item)=>{
    const link=item.next&&item.sessionId?(item.next==="cv"?"/interview/new?session="+item.sessionId:"/interview/"+item.sessionId+"/"+item.next):null;
    const inactive=["expired","revoked"].includes(item.status);
    return <article className={"card stack "+(inactive?"muted":"")} key={item.invitationId}><div className="cluster">{item.logoUrl&&<Image src={item.logoUrl} width={32} height={32} unoptimized alt=""/>}<strong>{item.company}</strong></div>
      <h3>{item.roleTitle}</h3><div className="cluster"><span className="badge">{readable(item.status)}</span><small>Expires {new Date(item.expiresAt).toLocaleDateString()}</small></div>
      {link&&<div><Link className="button secondary" href={link}>{item.next==="done"?"View feedback":"Continue"}</Link></div>}
    </article>;
  })}</div></section>;
}
