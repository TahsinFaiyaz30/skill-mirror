import { Shell } from "@/components/shell/shell";
import { OpeningWizard } from "@/components/hiring/opening-wizard";
import { openingPage } from "@/components/hiring/opening-page";
export default async function Page({params}:{params:Promise<{id:string}>}){
  return <Shell><OpeningWizard initial={await openingPage((await params).id)}/></Shell>;
}
