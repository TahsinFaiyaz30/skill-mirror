"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  Building2,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { Brand } from "./brand";
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
  const pathname = usePathname() ?? "";
  const current = (match: boolean) => (match ? ("page" as const) : undefined);
  const active = {
    dashboard: current(
      pathname === "/dashboard" || pathname.startsWith("/interview"),
    ),
    progress: current(pathname.startsWith("/progress")),
    openings: current(
      pathname.startsWith("/hiring") &&
        !pathname.startsWith("/hiring/organization"),
    ),
    organization: current(pathname.startsWith("/hiring/organization")),
    settings: current(pathname.startsWith("/settings")),
    admin: current(pathname.startsWith("/admin")),
  };
  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="nav-left">
          <Brand company={company} />
          <nav className="nav-links desktop-only" aria-label="Main">
            <span className="nav-section">Practice</span>
            <Link href="/dashboard" aria-current={active.dashboard}>
              Dashboard
            </Link>
            <Link href="/progress" aria-current={active.progress}>
              Progress
            </Link>
            {org && (
              <>
                <span className="nav-divider" aria-hidden="true" />
                <span className="nav-section company-brand">
                  {org.logoUrl && (
                    <Image
                      src={org.logoUrl}
                      alt=""
                      width={20}
                      height={20}
                      unoptimized
                    />
                  )}
                  Hiring · {org.name}
                </span>
                <Link href="/hiring" aria-current={active.openings}>
                  Openings
                </Link>
                <Link
                  href="/hiring/organization"
                  aria-current={active.organization}
                >
                  Organization
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="cluster" style={{ gap: 6 }}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="button ghost icon"
              aria-label="Account"
            >
              <span className="avatar" aria-hidden="true">
                {initials(name, email)}
              </span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu" align="end" sideOffset={8}>
                <div className="menu-head">
                  <span className="avatar" aria-hidden="true">
                    {initials(name, email)}
                  </span>
                  <div className="min-w-0">
                    <strong>{name}</strong>
                    <p className="muted small">{email}</p>
                  </div>
                </div>
                <div className="menu-separator" />
                <DropdownMenu.Item className="menu-item" asChild>
                  <Link href="/settings">
                    <Settings size={16} aria-hidden="true" />
                    Settings
                  </Link>
                </DropdownMenu.Item>
                {org && (
                  <DropdownMenu.Item className="menu-item" asChild>
                    <Link href="/hiring/organization">
                      <Building2 size={16} aria-hidden="true" />
                      Organization
                    </Link>
                  </DropdownMenu.Item>
                )}
                {isAdmin && (
                  <DropdownMenu.Item className="menu-item" asChild>
                    <Link href="/admin">
                      <ShieldCheck size={16} aria-hidden="true" />
                      AI Admin
                    </Link>
                  </DropdownMenu.Item>
                )}
                <div className="menu-separator" />
                <DropdownMenu.Item
                  className="menu-item"
                  onSelect={() => signOut()}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Dialog.Root>
            <Dialog.Trigger
              className="button ghost icon mobile-only"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content card stack">
                <div className="cluster between">
                  <Dialog.Title>Navigation</Dialog.Title>
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
                <nav
                  className="stack-sm nav-mobile"
                  aria-label="Mobile navigation"
                >
                  <span className="nav-section">Practice</span>
                  <Link href="/dashboard" aria-current={active.dashboard}>
                    Dashboard
                  </Link>
                  <Link href="/progress" aria-current={active.progress}>
                    Progress
                  </Link>
                  {org && (
                    <>
                      <span className="nav-section">Hiring · {org.name}</span>
                      <Link href="/hiring" aria-current={active.openings}>
                        Openings
                      </Link>
                      <Link
                        href="/hiring/organization"
                        aria-current={active.organization}
                      >
                        Organization
                      </Link>
                    </>
                  )}
                  <span className="nav-section">Account</span>
                  <Link href="/settings" aria-current={active.settings}>
                    Settings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" aria-current={active.admin}>
                      AI Admin
                    </Link>
                  )}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
