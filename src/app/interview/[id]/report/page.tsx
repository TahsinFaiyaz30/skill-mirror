import { Shell } from "@/components/shell/shell";
import { openSession } from "@/components/interview/session-page";
import { InterviewReport } from "@/components/report/report-view";
export default async function Page({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const data = await openSession(id,"report");
  return <Shell company={data.config.company}><InterviewReport id={id} /></Shell>;
}
