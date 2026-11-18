import { Shell } from "@/components/shell/shell";
import { openSession } from "@/components/interview/session-page";
import { Processing } from "@/components/interview/processing";
import { InterviewReport } from "@/components/report/report-view";
export default async function Page({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const data = await openSession(id,"done");
  return <Shell company={data.config.company}>{data.session.status === "completed" ? <InterviewReport id={id} company={data.session.company} /> : <Processing data={data} embedded />}</Shell>;
}
