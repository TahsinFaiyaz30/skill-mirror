import { LiveRoom } from "@/components/interview/live-room";
import { openSession } from "@/components/interview/session-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const { id } = await params;
  const data = await openSession(id, "live");
  return <LiveRoom data={data} debug={(await searchParams).debug === "1"} />;
}
