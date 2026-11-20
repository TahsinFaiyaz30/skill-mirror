"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Monitor,
  Moon,

  Sun,
  UserRound,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { localMock } from "@/lib/config/env";
import { browserSupabase } from "@/lib/supabase/client";
import { send, showError } from "@/lib/utils/client";
import type { CompanyBrand } from "@/types/interview";
// Signing out lands on the public home page.
export async function signOut(next = "/") {
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

// The pages in the centre of the bar and in the mobile drawer. Interviews
// start from the dashboard only, so there is no interview link here.
function useItems(org: CompanyBrand | null): Item[] {
  const pathname = usePathname() ?? "";
  const items: Item[] = [
    {
      href: "/dashboard",
      label: "Interview Studio",
      match: pathname === "/dashboard" || pathname.startsWith("/interview"),
    },
    {
      href: "/progress",
      label: "Progress",
      match: pathname.startsWith("/progress"),
    },
    { href: "/about", label: "About", match: pathname.startsWith("/about") },
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
  return items;
}

const modes = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
] as const;
const noop = () => () => {};

// The account menu: who is signed in, the light/dark mode switch, profile
// settings and sign out.
function ProfileMenu({
  name,
  email,
  org,
}: {
  name: string;
  email: string;
  org: CompanyBrand | null;
}) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const mode = hydrated ? (theme ?? "system") : "system";
  const firstName = name.trim().split(/\s+/)[0] || "Account";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="profile-trigger" aria-label="Profile">
        <span className="avatar" aria-hidden="true">
          {initials(name, email)}
        </span>
        <span className="profile-name">{firstName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu profile-menu"
          align="end"
          sideOffset={10}
        >
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
          <DropdownMenu.Label className="menu-label">Mode</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            className="mode-switch"
            value={mode}
            onValueChange={setTheme}
          >
            {modes.map(([value, Icon, label]) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="mode-option"
                disabled={!hydrated}
                onSelect={(event) => event.preventDefault()}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <div className="menu-separator" />
          <DropdownMenu.Item className="menu-item" asChild>
            <Link href="/settings">
              <UserRound size={16} aria-hidden="true" />
              Profile settings
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
  );
}

export function AppNav({
  name,
  email,
  org,
  company,
  homeHref = "/dashboard",
}: {
  name: string;
  email: string;
  org: CompanyBrand | null;
  company?: CompanyBrand | null;
  homeHref?: string;
}) {
  const pathname = usePathname() ?? "";
  const brandHref = pathname.startsWith("/hiring") && org ? "/hiring" : homeHref;
  const items = useItems(org);
  const links = items.map(({ href, label, match }) => (
    <Link key={href} href={href} aria-current={match ? "page" : undefined}>
      {label}
    </Link>
  ));
  return (
    <header className="topnav">
      <div className="container">
        <div className="topnav-bar">
          <div className="topnav-start">
            <Brand company={company} href={brandHref} />
          </div>
          <nav className="topnav-links" aria-label="Main">
            {links}
          </nav>
          <div className="topnav-end">
            <ProfileMenu name={name} email={email} org={org} />
            <Dialog.Root>
              <Dialog.Trigger
                className="topnav-burger"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="drawer">
                  <div className="cluster between">
                    <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                    <Brand href={brandHref} />
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
                  <nav className="drawer-links" aria-label="Mobile navigation">
                    {links}
                  </nav>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </div>
    </header>
  );
}
