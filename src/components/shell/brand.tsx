import Link from "next/link";
import Image from "next/image";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="11" fill="#2fe08a" />
      <path
        d="M11 1.5h18A9.5 9.5 0 0 1 38.5 11v4H1.5v-4A9.5 9.5 0 0 1 11 1.5Z"
        fill="#ffffff"
        opacity="0.12"
      />
      <path
        d="M8 21h5l4-8 5 15 4-8h6"
        stroke="#03140b"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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
        SkillMirror
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
