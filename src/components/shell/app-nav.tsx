"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { localMock } from "@/lib/config/env";
import { browserSupabase } from "@/lib/supabase/client";
import { send, showError } from "@/lib/utils/client";
import type { CompanyBrand } from "@/types/interview";
export async function signOut(next = "/login") {
  try {
    if (localMock) await send("/api/mock/auth", "POST", { action: "signout" });
    else {
      const { error } = await browserSupabase().auth.signOut();
      if (error) throw error;
    }
    location.assign(next);
  } catch (error) {
    showError(error);
  }
}
export function initials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? words[0][0] + words[words.length - 1][0]
      : (words[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}
type Item = { href: string; label: string; icon: LucideIcon; match: boolean };
type Group = { label: string; logoUrl?: string | null; items: Item[] };

// One list of destinations, shown as the desktop sidebar and the mobile drawer.
function useGroups(org: CompanyBrand | null, isAdmin = false): Group[] {
  const pathname = usePathname() ?? "";
  const groups: Group[] = [
    {
      label: "Practice",
      items: [
        {
          href: "/dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
          match:
            pathname === "/dashboard" ||
            (pathname.startsWith("/interview") &&
              pathname !== "/interview/new"),
        },
        {
          href: "/progress",
          label: "Progress",
          icon: TrendingUp,
          match: pathname.startsWith("/progress"),
        },
      ],
    },
  ];
  if (org)
    groups.push({
      label: "Hiring · " + org.name,
      logoUrl: org.logoUrl,
      items: [
        {
          href: "/hiring",
          label: "Openings",
          icon: BriefcaseBusiness,
          match:
            pathname.startsWith("/hiring") &&
            !pathname.startsWith("/hiring/organization"),
        },
        {
          href: "/hiring/organization",
          label: "Organization",
          icon: Building2,
          match: pathname.startsWith("/hiring/organization"),
        },
      ],
    });
  groups.push({
    label: "Account",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        match: pathname.startsWith("/settings"),
      },
      ...(isAdmin
        ? [
            {
              href: "/admin",
              label: "AI Admin",
              icon: ShieldCheck,
              match: pathname.startsWith("/admin"),
            },
          ]
        : []),
    ],
  });
  return groups;
}
function NavGroups({ groups }: { groups: Group[] }) {
  return groups.map((group) => (
    <div key={group.label} className="side-group">
      <span className="nav-section">
        {group.logoUrl && (
          <Image
            src={group.logoUrl}
            alt=""
            width={16}
            height={16}
            unoptimized
          />
        )}
        {group.label}
      </span>
      {group.items.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match ? "page" : undefined}>
          <Icon size={18} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  ));
}
function UserCard({ name, email }: { name: string; email: string }) {
  return (
    <div className="side-user">
      <span className="avatar" aria-hidden="true">
        {initials(name, email)}
      </span>
      <span className="side-user-text">
        <strong>{name || "Your account"}</strong>
        <small>{email}</small>
      </span>
      <button
        type="button"
        className="button ghost icon sm"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut()}
      >
        <LogOut size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
export function AppNav({
  name,
  email,
  org,
  company,
  isAdmin = false,
}: {
  name: string;
  email: string;
  org: CompanyBrand | null;
  company?: CompanyBrand | null;
  isAdmin?: boolean;
}) {
  const groups = useGroups(org, isAdmin);
  const creating = (usePathname() ?? "") === "/interview/new";
  return (
    <>
      <aside className="sidebar">
        <Brand company={company} />
        <Link
          href="/interview/new"
          className={"button side-cta" + (creating ? " current" : "")}
          aria-current={creating ? "page" : undefined}
        >
          <Plus size={18} aria-hidden="true" />
          New interview
        </Link>
        <nav className="side-nav" aria-label="Main">
          <NavGroups groups={groups} />
        </nav>
        <div className="side-footer">
          <ThemeToggle variant="row" />
          <UserCard name={name} email={email} />
        </div>
      </aside>
      <header className="topbar">
        <Brand company={company} />
        <div className="cluster">
          <ThemeToggle variant="icon" />
          <Dialog.Root>
            <Dialog.Trigger
              className="button secondary icon"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="drawer">
                <div className="cluster between">
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <Brand />
                  <Dialog.Close
                    className="button ghost icon"
                    aria-label="Close navigation"
                  >
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  SkillMirror pages
                </Dialog.Description>
                <Link href="/interview/new" className="button side-cta">
                  <Plus size={18} aria-hidden="true" />
                  New interview
                </Link>
                <nav className="side-nav" aria-label="Mobile navigation">
                  <NavGroups groups={groups} />
                </nav>
                <div className="side-footer">
                  <ThemeToggle variant="row" />
                  <UserCard name={name} email={email} />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
    </>
  );
}
