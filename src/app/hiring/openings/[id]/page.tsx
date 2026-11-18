import { Shell } from "@/components/shell/shell";
import { OpeningDetail } from "@/components/hiring/opening-detail";
import { openingPage } from "@/components/hiring/opening-page";
export default async function Page({params}:{params:Promise<{id:string}>}){
  return <Shell><OpeningDetail data={await openingPage((await params).id)}/></Shell>;
}
