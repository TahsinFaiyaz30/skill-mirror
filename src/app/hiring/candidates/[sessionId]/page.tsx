import { Shell } from "@/components/shell/shell";
import { CandidateReport } from "@/components/hiring/candidate-report";
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  return (
    <Shell>
      <CandidateReport id={(await params).sessionId} />
    </Shell>
  );
}
