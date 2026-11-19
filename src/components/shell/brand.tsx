import { useId } from "react";
import Link from "next/link";
import Image from "next/image";

// Rising skill levels standing on a mirror, reflected below it:
// SkillMirror levels you up by reflecting every answer back as feedback.
const levels = [5, 8.5, 12, 16];
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = "lm" + useId().replace(/[^\w-]/g, "");
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b4fbd8" />
          <stop offset="1" stopColor="#1fc775" />
        </linearGradient>
        <linearGradient id={id + "r"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2fe08a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2fe08a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#0b1912" />
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="10.25"
        fill="none"
        stroke="#2fe08a"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      {levels.map((height, index) => (
        <g key={height}>
          <rect
            x={8.25 + index * 6.5}
            y={24.5 - height}
            width="4"
            height={height}
            rx="1.6"
            fill={"url(#" + id + "b)"}
            opacity={0.55 + index * 0.15}
          />
          <rect
            x={8.25 + index * 6.5}
            y="27.5"
            width="4"
            height={height * 0.6}
            rx="1.6"
            fill={"url(#" + id + "r)"}
          />
        </g>
      ))}
      <path
        d="M7 26h26"
        stroke="#b4fbd8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({
  company,
}: {
  company?: { name: string; logoUrl: string | null } | null;
}) {
  return (
    <div className="brand-line">
      <Link href="/" className="brand" aria-label="SkillMirror home">
        <LogoMark />
        <span>
          Skill<span className="brand-accent">Mirror</span>
        </span>
      </Link>
      {company && (
        <span className="company-brand">
          {company.logoUrl && (
            <Image
              unoptimized
              width={32}
              height={32}
              src={company.logoUrl}
              alt=""
            />
          )}
          {company.name}
        </span>
      )}
    </div>
  );
}
