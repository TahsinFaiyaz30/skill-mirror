"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { localMock } from "@/lib/config/env";
import {
  meetsPasswordRequirements,
  passwordRequirement,
} from "@/lib/auth/password";
import { browserSupabase } from "@/lib/supabase/client";
import { send, showError } from "@/lib/utils/client";
import { signOut } from "@/components/shell/app-nav";
import { ThemeSelector } from "./theme-toggle";
export function Settings({
  id,
  name,
  email,
  provider,
  blocked,
}: {
  id: string;
  name: string;
  email: string;
  provider: string;
  blocked: boolean;
}) {
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = String(
      new FormData(event.currentTarget).get("name"),
    ).trim();
    if (!fullName) return;
    try {
      if (localMock)
        await send("/api/mock/auth", "POST", { action: "profile", fullName });
      else {
        const { error } = await browserSupabase()
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", id);
        if (error) throw error;
      }
      toast.success("Profile saved");
    } catch (error) {
      showError(error);
    }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    const password = String(values.get("password"));
    if (!meetsPasswordRequirements(password)) {
      toast.error(passwordRequirement);
      return;
    }
    if (password !== values.get("confirm")) {
      toast.error("Passwords do not match.");
      return;
    }
    try {
      if (localMock)
        await send("/api/mock/auth", "POST", { action: "password", password });
      else {
        const { error } = await browserSupabase().auth.updateUser({ password });
        if (error) throw error;
      }
      form.reset();
      toast.success("Password updated");
    } catch (error) {
      showError(error);
    }
  }
  async function remove() {
    setDeleting(true);
    try {
      await send("/api/account/delete", "POST");
      await signOut();
    } catch (error) {
      showError(error);
      setDeleting(false);
    }
  }
  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Settings</h1>
        <p className="muted">Manage your profile, password and data.</p>
      </div>
      <div className="settings-body">
        <form
          id="profile"
          className="card stack anchor-target"
          onSubmit={profile}
        >
          <h2>Profile</h2>
          <label className="field">
            Name
            <input name="name" defaultValue={name} maxLength={120} required />
          </label>
          <label className="field">
            Email
            <input value={email} readOnly />
          </label>
          <div>
            <button className="button">Save profile</button>
          </div>
        </form>
        <section id="appearance" className="card stack anchor-target">
          <h2>Appearance</h2>
          <p className="muted">
            Choose light, dark, or match your device setting.
          </p>
          <div>
            <ThemeSelector />
          </div>
        </section>
        {provider === "email" ? (
          <form
            id="security"
            className="card stack anchor-target"
            onSubmit={password}
          >
            <h2>Security</h2>
            <label className="field">
              New password
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <div>
              <button className="button">Change password</button>
            </div>
          </form>
        ) : (
          <section id="security" className="card stack anchor-target">
            <h2>Security</h2>
            <p>Connected Google account · {email}</p>
          </section>
        )}
        <section id="data" className="card stack anchor-target">
          <h2>Data</h2>
          <p>
            Recordings are retained for 30 days by default. Your reports remain
            available until you delete them.
          </p>
          {blocked && (
            <p className="muted">Transfer ownership or remove members first.</p>
          )}
          <div>
            <button
              className="button secondary danger"
              disabled={blocked}
              onClick={() => setOpen(true)}
            >
              Delete all my data
            </button>
          </div>
        </section>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content card stack">
            <Dialog.Title>Delete your account and data?</Dialog.Title>
            <Dialog.Description>
              This permanently deletes your CVs, interviews, reports, and
              account. Type DELETE to confirm.
            </Dialog.Description>
            <label className="field">
              Confirmation
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <div className="cluster">
              <Dialog.Close className="button secondary">Cancel</Dialog.Close>
              <button
                className="button danger"
                disabled={confirm !== "DELETE" || deleting}
                onClick={() => void remove()}
              >
                Delete all my data
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
