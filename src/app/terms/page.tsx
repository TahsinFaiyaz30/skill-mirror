import Link from "next/link";
import { Building2, Clock, Lock, Sparkles } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { GuideCard, IconList } from "@/components/common/guides";
export default function Page() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
        </div>
      </header>
      <main className="container page">
        <div className="with-aside">
          <article className="card prose stack">
            <h1>Terms of use</h1>
            <p>
              SkillMirror uses your account information, CV, answers, camera and
              microphone to run interviews and produce feedback. Practice
              feedback is an AI coaching signal. Hiring decisions rest with the
              company.
            </p>
            <p>
              For an invited interview, the company receives your recording,
              transcript, evaluation and a summary of your CV. Before recording
              starts, you review the consent terms and choose whether to
              continue.
            </p>
            <p>
              Free-tier AI providers may use submitted inputs to improve their
              products. Recordings and replay landmarks are automatically
              deleted after 30 days by default. Interview insights remain
              available after recordings expire.
            </p>
            <p>
              You can delete individual practice sessions or delete your account
              and all associated interview data in Settings.
            </p>
          </article>
          <aside aria-label="At a glance">
            <GuideCard title="At a glance">
              <IconList
                items={[
                  [Lock, "Practice feedback is an AI coaching signal"],
                  [Building2, "Hiring decisions rest with the company"],
                  [
                    Sparkles,
                    "Free-tier AI providers may use submitted inputs to improve their products",
                  ],
                  [Clock, "Recordings are deleted after 30 days by default"],
                ]}
              />
              <Link href="/privacy">Read the privacy policy</Link>
            </GuideCard>
          </aside>
        </div>
      </main>
    </>
  );
}
