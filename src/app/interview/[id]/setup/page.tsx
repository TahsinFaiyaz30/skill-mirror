import { openSession } from "@/components/interview/session-page";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Shell } from "@/components/shell/shell";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ debug?: string }> }) {
  const [path, query] = await Promise.all([params, searchParams]);
  const state = await openSession(path.id, "setup");
  return <Shell company={state.config.company}><SetupWizard data={state} debug={query.debug === "1"} /></Shell>;
}
