"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { Building2, LogOut, Menu, Plus, Settings, X } from "lucide-react";
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
type Item = { href: string; label: string; match: boolean };

// One list of destinations, shown in the top bar and in the mobile drawer.
function useItems(org: CompanyBrand | null): Item[] {
  const pathname = usePathname() ?? "";
  const items: Item[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      match:
        pathname === "/dashboard" ||
        (pathname.startsWith("/interview") && pathname !== "/interview/new"),
    },
    {
      href: "/progress",
      label: "Progress",
      match: pathname.startsWith("/progress"),
    },
  ];
  if (org)
    items.push(
      {
        href: "/hiring",
        label: "Openings",
        match:
          pathname.startsWith("/hiring") &&
          !pathname.startsWith("/hiring/organization"),
      },
      {
        href: "/hiring/organization",
        label: "Organization",
        match: pathname.startsWith("/hiring/organization"),
      },
    );
  items.push({
    href: "/settings",
    label: "Settings",
    match: pathname.startsWith("/settings"),
  });
  return items;
}
export function AppNav({
  name,
  email,
  org,
  company,
}: {
  name: string;
  email: string;
  org: CompanyBrand | null;
  company?: CompanyBrand | null;
}) {
  const items = useItems(org);
  const pathname = usePathname() ?? "";
  // Hidden only on the new interview page, where it would point to itself.
  const showCta = pathname !== "/interview/new";
  const links = items.map(({ href, label, match }) => (
    <Link key={href} href={href} aria-current={match ? "page" : undefined}>
      {label}
    </Link>
  ));
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Brand company={company} />
        <div className="navpill">
          <nav className="navpill-links" aria-label="Main">
            {links}
          </nav>
          {showCta && (
            <Link href="/interview/new" className="navpill-cta">
              <Plus size={15} aria-hidden="true" />
              <span className="topnav-cta-text">New interview</span>
            </Link>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="navpill-avatar"
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
                    <strong>{name || "Your account"}</strong>
                    <p className="muted small">{email}</p>
                  </div>
                </div>
                <div className="menu-separator" />
                <DropdownMenu.Item className="menu-item" asChild>
                  <Link href="/settings">
                    <Settings size={16} aria-hidden="true" />
                    Account settings
                  </Link>
                </DropdownMenu.Item>
                {org && (
                  <DropdownMenu.Item className="menu-item" asChild>
                    <Link href="/hiring/organization">
                      {org.logoUrl ? (
                        <Image
                          src={org.logoUrl}
                          alt=""
                          width={16}
                          height={16}
                          unoptimized
                        />
                      ) : (
                        <Building2 size={16} aria-hidden="true" />
                      )}
                      {org.name}
                    </Link>
                  </DropdownMenu.Item>
                )}
                <div className="menu-separator" />
                <DropdownMenu.Item
                  className="menu-item"
                  onSelect={() => void signOut()}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Dialog.Root>
            <Dialog.Trigger
              className="navpill-menu"
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
                <Link href="/interview/new" className="button">
                  <Plus size={18} aria-hidden="true" />
                  New interview
                </Link>
                <nav className="drawer-links" aria-label="Mobile navigation">
                  {links}
                </nav>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void signOut()}
                >
                  <LogOut size={17} aria-hidden="true" />
                  Sign out
                </button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
