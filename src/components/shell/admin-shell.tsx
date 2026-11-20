"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Cpu, LogOut, ShieldCheck } from "lucide-react";
import { LogoMark } from "./brand";
import { signOut } from "./app-nav";

const sections = [{ href: "/admin", label: "AI providers", icon: Cpu }];

// The admin panel has its own frame: a sidebar with the admin sections and a
// way back to the site. It is reached at /admin, not from the profile menu.
export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin" className="admin-brand">
          <LogoMark size={28} />
          <span>
            SkillMirror
            <small>
              <ShieldCheck size={13} aria-hidden="true" />
              Admin panel
            </small>
          </span>
        </Link>
        <nav className="admin-nav" aria-label="Admin">
          {sections.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="admin-foot">
          <small title={email}>{email}</small>
          <Link href="/dashboard" className="admin-back">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to SkillMirror
          </Link>
          <button
            type="button"
            className="admin-back"
            onClick={() => void signOut()}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
