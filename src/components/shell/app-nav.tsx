"use client";
import Link from "next/link";
import Image from "next/image";
import { Dialog, DropdownMenu } from "radix-ui";
import { Menu, UserRound, X } from "lucide-react";
import { Brand } from "./brand";
import { ThemeOptions, ThemeToggle } from "./theme-toggle";
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
  const links = (
    <>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/progress">Progress</Link>
      {org && (
        <>
          <Link href="/hiring">Openings</Link>
          <Link href="/hiring/organization">Organization</Link>
        </>
      )}
    </>
  );
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Brand company={company} />
        <nav className="cluster desktop-only" aria-label="Main">
          <small>Practice</small>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/progress">Progress</Link>
          {org && (
            <>
              <small className="company-brand">
                {org.logoUrl && (
                  <Image
                    src={org.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    unoptimized
                  />
                )}
                Hiring · {org.name}
              </small>
              <Link href="/hiring">Openings</Link>
              <Link href="/hiring/organization">Organization</Link>
            </>
          )}
        </nav>
        <div className="cluster">
          <ThemeToggle />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="button ghost icon"
              aria-label="Account"
            >
              <UserRound size={19} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu" align="end" sideOffset={8}>
                <div className="p-2">
                  <strong>{name}</strong>
                  <p className="muted small">{email}</p>
                </div>
                <ThemeOptions />
                <DropdownMenu.Item className="menu-item" asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenu.Item>
                {org && (
                  <DropdownMenu.Item className="menu-item" asChild>
                    <Link href="/hiring/organization">Organization</Link>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="menu-item"
                  onSelect={() => signOut()}
                >
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
                  <Dialog.Close aria-label="Close navigation">
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  SkillMirror pages
                </Dialog.Description>
                <nav className="stack" aria-label="Mobile navigation">
                  {links}
                  <Link href="/settings">Settings</Link>
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
