import { openSession } from "@/components/interview/session-page";
import { Prepare } from "@/components/interview/prepare";
import { Shell } from "@/components/shell/shell";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const state = await openSession((await params).id, "prepare");
  return (
    <Shell company={state.config.company}>
      <Prepare state={state} />
    </Shell>
  );
}
