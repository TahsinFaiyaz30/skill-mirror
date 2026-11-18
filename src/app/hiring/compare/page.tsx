import { Shell } from "@/components/shell/shell";
import { CompareGrid } from "@/components/hiring/compare";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  return (
    <Shell>
      <CompareGrid ids={(await searchParams).ids ?? ""} />
    </Shell>
  );
}
