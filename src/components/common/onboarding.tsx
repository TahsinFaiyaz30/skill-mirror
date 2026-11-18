"use client";
import { BriefcaseBusiness, Target } from "lucide-react";
import { useState, type FormEvent } from "react";
import { send, showError } from "@/lib/utils/client";
import { authPath } from "@/lib/auth/navigation";

export function Onboarding({
  initialIntent,
  next,
}: {
  initialIntent?: string;
  next?: string;
}) {
  const [intent, setIntent] = useState(
    initialIntent === "hiring" ? "hiring" : "practice",
  );
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const fields = event && new FormData(event.currentTarget);
    setBusy(true);
    try {
      await send(
        "/api/onboarding",
        "POST",
        intent === "practice"
          ? { intent }
          : {
              intent,
              org: {
                name: fields?.get("organization"),
                website: fields?.get("website") || undefined,
              },
            },
      );
      location.assign(authPath("/auth/continue", next));
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  }
  return (
    <section className="stack narrow">
      <h1>
        {details ? "Set up your organization" : "How will you use SkillMirror?"}
      </h1>
      {details ? (
        <form className="card stack" onSubmit={save}>
          <label className="field">
            Organization name
            <input name="organization" minLength={2} maxLength={80} required />
          </label>
          <label className="field">
            Website (optional)
            <input name="website" type="url" />
          </label>
          <div className="cluster">
            <button
              className="button secondary"
              type="button"
              onClick={() => setDetails(false)}
            >
              Back
            </button>
            <button className="button" disabled={busy}>
              Create organization
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid-2">
            {[
              [
                Target,
                "practice",
                "Practice for interviews",
                "Mock interviews with feedback on answers, body language and voice.",
              ],
              [
                BriefcaseBusiness,
                "hiring",
                "Hire with AI interviews",
                "Set up AI interviews for candidates and review the results.",
              ],
            ].map(([Icon, key, title, text]) => {
              const ChoiceIcon = Icon as typeof Target;
              return (
                <label key={String(key)} className="card stack">
                  <ChoiceIcon aria-hidden="true" />
                  <span className="cluster">
                    <input
                      type="radio"
                      name="intent"
                      value={String(key)}
                      checked={intent === key}
                      onChange={() => setIntent(String(key))}
                    />
                    <strong>{String(title)}</strong>
                  </span>
                  <span className="muted">{String(text)}</span>
                </label>
              );
            })}
          </div>
          <div>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                intent === "hiring" ? setDetails(true) : void save()
              }
            >
              Continue
            </button>
          </div>
        </>
      )}
    </section>
  );
}
