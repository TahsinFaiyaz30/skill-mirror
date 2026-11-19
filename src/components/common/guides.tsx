import type { ReactNode } from "react";
import {
  AudioLines,
  Camera,
  Check,
  Clock,
  Gauge,
  Headphones,
  Monitor,
  CirclePlay,
  Target,
  type LucideIcon,
} from "lucide-react";
import { PRACTICE_TEMPLATES } from "@/lib/config/constants";
import { PHASE_LABELS } from "@/lib/config/taxonomy";

// Side panels that fill the quieter parts of app pages with what is true
// about SkillMirror: requirements, the real interview plan, report contents.
const duration = (seconds: number) =>
  Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

export function GuideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card stack-sm guide-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function IconList({
  items,
  wide = false,
}: {
  items: readonly (readonly [LucideIcon, string])[];
  wide?: boolean;
}) {
  return (
    <ul className={"guide-list" + (wide ? " wide" : "")}>
      {items.map(([Icon, text]) => (
        <li key={text}>
          <Icon size={17} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReadyChecklist() {
  return (
    <GuideCard title="Before you start">
      <IconList
        items={[
          [
            Monitor,
            "Desktop Chrome or Edge, in a window at least 1024 px wide",
          ],
          [Camera, "A working camera and microphone"],
          [Headphones, "Headphones or a quiet room"],
          [Clock, "10 or 20 minutes without interruptions"],
        ]}
      />
    </GuideCard>
  );
}

export function PhasePlan({ minutes = 20 }: { minutes?: 10 | 20 }) {
  const phases = Object.entries(PRACTICE_TEMPLATES[minutes].budgets);
  const longest = Math.max(...phases.map(([, ms]) => ms));
  return (
    <GuideCard title={"How a " + minutes + " minute interview runs"}>
      <ol className="plan-list">
        {phases.map(([phase, ms]) => (
          <li key={phase}>
            <span>{PHASE_LABELS[phase as keyof typeof PHASE_LABELS]}</span>
            <span className="mono">{duration(ms / 1000)}</span>
            <i style={{ width: (ms / longest) * 100 + "%" }} />
          </li>
        ))}
      </ol>
      <small>
        {minutes === 20
          ? "The 10 minute interview is shorter and skips Your questions."
          : "The 20 minute interview adds time for Your questions."}
      </small>
    </GuideCard>
  );
}

export function ReportIncludes({ wide = false }: { wide?: boolean }) {
  return (
    <GuideCard title="Your report includes">
      <IconList
        wide={wide}
        items={[
          [Gauge, "An overall score and your technical ceiling, L1 to L5"],
          [AudioLines, "Voice and body language insights"],
          [CirclePlay, "Key moments you can replay as video clips"],
          [Target, "A specific drill for each thing to work on"],
        ]}
      />
    </GuideCard>
  );
}

export function FlowSteps({
  title,
  steps,
  current,
}: {
  title: string;
  steps: readonly (readonly [string, string])[];
  current: number;
}) {
  return (
    <GuideCard title={title}>
      <ol className="flow-list">
        {steps.map(([name, text], index) => (
          <li
            key={name}
            data-state={
              index < current ? "done" : index === current ? "now" : undefined
            }
          >
            <span className="flow-dot" aria-hidden="true">
              {index < current ? <Check size={13} /> : index + 1}
            </span>
            <span className="stack-sm" style={{ gap: 2 }}>
              <strong>{name}</strong>
              <small>{text}</small>
            </span>
          </li>
        ))}
      </ol>
    </GuideCard>
  );
}
