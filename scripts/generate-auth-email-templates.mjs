import { readFile, writeFile } from "node:fs/promises";
import { renderEmail } from "../src/lib/email/layout.ts";

const managedLink = "{{ .ConfirmationURL }}";
const appLink = (type) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next={{ .RedirectTo }}`;
const ignoreRequest = "If you didn’t request this, you can ignore this email.";
const securityNote =
  "If you made this change, no action is needed. Otherwise, open SkillMirror directly to review your account security.";

const templates = [
  {
    file: "confirm-signup",
    category: "Account setup",
    title: "Confirm your email",
    preheader: "Verify your email to finish setting up SkillMirror.",
    message:
      "Thanks for signing up for SkillMirror. Confirm your email address to finish creating your account.",
    action: { label: "Confirm email", url: appLink("signup") },
    note: "If you didn’t sign up for SkillMirror, you can ignore this email.",
  },
  {
    file: "reset-password",
    category: "Account recovery",
    title: "Reset your password",
    preheader: "Use this link to choose a new SkillMirror password.",
    message:
      "We received a password reset request for your SkillMirror account. Open the link below to choose a new password.",
    action: { label: "Reset password", url: appLink("recovery") },
    note: ignoreRequest,
  },
  {
    file: "invite-user",
    category: "Account invitation",
    title: "Join SkillMirror",
    preheader: "Accept your invitation to create a SkillMirror account.",
    message:
      "You’ve been invited to create a SkillMirror account. Accept the invitation to finish setting up your access.",
    action: { label: "Accept invitation", url: managedLink },
    note: "If you weren’t expecting an account invitation, you can ignore this email.",
  },
  {
    file: "magic-link",
    category: "Account access",
    title: "Your sign-in link",
    preheader: "Open your one-time SkillMirror sign-in link.",
    message:
      "Use the link below to sign in to your SkillMirror account. You can use it once before it expires.",
    action: { label: "Sign in to SkillMirror", url: managedLink },
    note: ignoreRequest,
  },
  {
    file: "change-email",
    category: "Account security",
    title: "Confirm your new email address",
    preheader: "Review and confirm your SkillMirror email change.",
    message:
      "Confirm the request to use a new email address for your SkillMirror account.",
    details: [{ label: "New email", value: "{{ .NewEmail }}" }],
    action: { label: "Confirm email change", url: managedLink },
    note: ignoreRequest,
  },
  {
    file: "reauthentication",
    category: "Account security",
    title: "Your verification code",
    preheader: "Enter your code in SkillMirror to verify your identity.",
    message:
      "Enter this code in the SkillMirror window that asked you to verify your identity.",
    code: "{{ .Token }}",
    note: "Keep this code private. If you didn’t request it, you can ignore this email.",
  },
  {
    file: "password-changed",
    title: "Your password was changed",
    message: "The password for your SkillMirror account was updated.",
  },
  {
    file: "email-changed",
    title: "Your email address was changed",
    message: "Your SkillMirror account now uses a different email address.",
    details: [
      { label: "Previous email", value: "{{ .OldEmail }}" },
      { label: "New email", value: "{{ .Email }}" },
    ],
  },
  {
    file: "phone-changed",
    title: "Your phone number was changed",
    message: "The phone number linked to your SkillMirror account was updated.",
    details: [
      { label: "Previous number", value: "{{ .OldPhone }}" },
      { label: "New number", value: "{{ .Phone }}" },
    ],
  },
  {
    file: "identity-linked",
    title: "A sign-in method was linked",
    message: "A sign-in provider was connected to your SkillMirror account.",
    details: [{ label: "Provider", value: "{{ .Provider }}" }],
  },
  {
    file: "identity-unlinked",
    title: "A sign-in method was removed",
    message:
      "A sign-in provider was disconnected from your SkillMirror account.",
    details: [{ label: "Provider", value: "{{ .Provider }}" }],
  },
  {
    file: "mfa-factor-enrolled",
    title: "A verification method was added",
    message:
      "Your SkillMirror account has a new method for two-step verification.",
    details: [{ label: "Method", value: "{{ .FactorType }}" }],
  },
  {
    file: "mfa-factor-unenrolled",
    title: "A verification method was removed",
    message:
      "A two-step verification method was removed from your SkillMirror account.",
    details: [{ label: "Method", value: "{{ .FactorType }}" }],
  },
];

const check = process.argv.includes("--check");
const directory = new URL("../supabase/email-templates/", import.meta.url);
const stale = await Promise.all(
  templates.map(async ({ file, ...email }) => {
    const html = renderEmail({
      category: "Account security",
      preheader: email.message,
      note: securityNote,
      ...email,
    });
    const target = new URL(file + ".html", directory);
    if (!check) {
      await writeFile(target, html, "utf8");
      return null;
    }
    const current = await readFile(target, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    });
    return current.replace(/\r\n/g, "\n") === html ? null : file;
  }),
);

const outdated = stale.filter(Boolean);
if (outdated.length) {
  console.error("Regenerate these Supabase templates:", outdated.join(", "));
  process.exitCode = 1;
} else {
  console.log(
    `${check ? "Verified" : "Generated"} ${templates.length} Supabase email templates.`,
  );
}
