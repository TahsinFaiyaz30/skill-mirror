"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { localMock, publicEnv } from "@/lib/config/env";
import { browserSupabase } from "@/lib/supabase/client";
import { authPath } from "@/lib/auth/navigation";
import { errorMessage, send } from "@/lib/utils/client";
import { AuthLayout } from "./auth-layout";

export type AuthScreen =
  "login" | "signup" | "forgot-password" | "reset-password";
export function AuthForm({
  screen,
  next,
  intent,
  invalid,
}: {
  screen: AuthScreen;
  next?: string;
  intent?: string;
  invalid?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    invalid === "link_invalid" ? "This link is invalid or expired." : "",
  );
  const [complete, setComplete] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const signup = screen === "signup",
    login = screen === "login",
    forgot = screen === "forgot-password";
  const setConfirmCooldown = () => {
    setCooldown(true);
    setTimeout(() => setCooldown(false), 60000);
  };
  const redirect = authPath("/auth/continue", next, intent);
  const emailRedirectTo = new URL(
    authPath("/auth/confirm", next, intent),
    publicEnv.appUrl,
  ).href;
  const titles = {
    signup: "Create your account",
    login: "Log in",
    "forgot-password": "Forgot password?",
    "reset-password": "Reset password",
  };
  const validPassword = /^(?=.*[a-z])(?=.*\d).{8,}$/i.test(password);
  const strength = !validPassword
    ? "weak"
    : password.length >= 12 && /[^a-z0-9]/i.test(password)
      ? "strong"
      : "ok";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      if (
        (signup || screen === "reset-password") &&
        (strength === "weak" || password !== data.get("confirmation"))
      ) {
        throw new Error(
          strength === "weak"
            ? "Use at least 8 characters, including a letter and a number."
            : "Passwords do not match.",
        );
      }
      if (localMock) {
        if (forgot) {
          setComplete(true);
          return;
        }
        await send(
          "/api/mock/auth",
          "POST",
          signup
            ? { action: "signup", email, password, fullName: data.get("name") }
            : login
              ? { action: "login", email, password }
              : { action: "password", password },
        );
        if (screen === "reset-password") toast.success("Password updated");
        location.assign(redirect);
        return;
      }
      const client = browserSupabase();
      if (signup) {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: { full_name: data.get("name"), intent },
          },
        });
        if (error) throw error;
        setComplete(true);
        setConfirmCooldown();
      } else if (login) {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error?.code === "email_not_confirmed") {
          setUnconfirmed(true);
          throw new Error("Please confirm your email first.");
        }
        if (error)
          throw new Error(
            error.code === "invalid_credentials"
              ? "Email or password is incorrect."
              : error.message,
          );
        location.assign(redirect);
      } else if (forgot) {
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: emailRedirectTo,
        });
        setComplete(true);
      } else {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated");
        location.assign(redirect);
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    try {
      const { error } = await browserSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL(
            authPath("/auth/callback", next, intent),
            publicEnv.appUrl,
          ).href,
        },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  async function resend() {
    const { error } = await browserSupabase().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    if (error) setMessage(error.message);
    else {
      setConfirmCooldown();
      toast.success("Confirmation email sent");
    }
  }
  return (
    <AuthLayout>
      {complete ? (
        <div className="stack">
          <h1>{signup ? "Check your email" : "Check your inbox"}</h1>
          <p className="muted">
            {signup
              ? "We sent a confirmation link to " + email + "."
              : "If an account exists, we've sent a reset link."}
          </p>
          {signup && (
            <button
              type="button"
              className="button secondary"
              onClick={resend}
              disabled={cooldown}
            >
              {cooldown ? "Resend email in 60 seconds" : "Resend email"}
            </button>
          )}
          {message && (
            <p role="alert" className="danger">
              {message}
            </p>
          )}
          <Link href={authPath("/login", next, intent)}>Back to log in</Link>
        </div>
      ) : (
        <div className="stack">
          <h1>{titles[screen]}</h1>
          <form onSubmit={submit} className="stack">
            {signup && (
              <label className="field">
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </label>
            )}
            {screen !== "reset-password" && (
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
            )}
            {!forgot && (
              <label className="field">
                {login || signup ? "Password" : "New password"}
                <input
                  type="password"
                  autoComplete={login ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  maxLength={128}
                />
                {signup && password && (
                  <small aria-live="polite">
                    Password strength · {strength}
                  </small>
                )}
              </label>
            )}
            {(signup || screen === "reset-password") && (
              <label className="field">
                Confirm password
                <input
                  type="password"
                  name="confirmation"
                  autoComplete="new-password"
                  required
                  maxLength={128}
                />
              </label>
            )}
            {signup && (
              <label className="check">
                <input type="checkbox" required />
                <span>
                  I agree to the <Link href="/terms">Terms</Link> and{" "}
                  <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>
            )}
            {login && (
              <Link href={authPath("/forgot-password", next, intent)}>
                Forgot password?
              </Link>
            )}
            {message && (
              <p role="alert" className="danger">
                {message}
              </p>
            )}
            {unconfirmed && (
              <button
                type="button"
                className="button secondary"
                onClick={resend}
                disabled={cooldown}
              >
                Resend email
              </button>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Please wait…"
                : signup
                  ? "Create account"
                  : login
                    ? "Log in"
                    : forgot
                      ? "Send reset link"
                      : "Update password"}
            </button>
          </form>
          {(signup || login) && !localMock && (
            <>
              <p className="center muted">or</p>
              <button className="button secondary" onClick={google}>
                Continue with Google
              </button>
            </>
          )}
          {screen !== "reset-password" && (
            <Link
              href={authPath(
                signup || forgot ? "/login" : "/signup",
                next,
                intent,
              )}
            >
              {signup
                ? "Already have an account? Log in"
                : login
                  ? "New to SkillMirror? Sign up"
                  : "Back to log in"}
            </Link>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
