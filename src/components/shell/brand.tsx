import Link from "next/link";
import Image from "next/image";

export function Brand({ company }: { company?: { name: string; logoUrl: string | null } | null }) {
  return <div className="brand-line"><Link href="/" className="brand" aria-label="SkillMirror home"><Image className="light-only" src="/logo-light.svg" alt="" width={28} height={28} /><Image className="dark-only" src="/logo-dark.svg" alt="" width={28} height={28} />SkillMirror</Link>{company && <span className="company-brand">{company.logoUrl && <Image unoptimized width={32} height={32} src={company.logoUrl} alt="" />}{company.name}</span>}</div>;
}
