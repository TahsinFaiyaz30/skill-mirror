import { Processing } from "@/components/interview/processing";
import { openSession } from "@/components/interview/session-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Processing data={await openSession((await params).id, "processing")} />
  );
}
