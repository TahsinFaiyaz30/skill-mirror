import { Shell } from "@/components/shell/shell";
import { OpeningWizard } from "@/components/hiring/opening-wizard";
import { serverEnv } from "@/lib/config/env";
export default function Page() {
  return (
    <Shell>
      <OpeningWizard featureGithub={serverEnv().FEATURE_GITHUB} />
    </Shell>
  );
}
