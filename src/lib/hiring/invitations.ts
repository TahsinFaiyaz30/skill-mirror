import { randomBytes } from "node:crypto";
import { createTransport } from "nodemailer";
import { publicEnv, serverEnv } from "@/lib/config/env";
export const newInviteToken = () => randomBytes(32).toString("base64url");
export const inviteExpires = (days: number, now = Date.now()) =>
  new Date(now + days * 86400000);
export const inviteLink = (token: string) =>
  new URL("/i/" + token, publicEnv.appUrl).href;
export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 ? email[0] + "***" + email.slice(at) : "***";
}
export const emailMatches = (email: string | null, expected: string) =>
  Boolean(
    email && email.trim().toLowerCase() === expected.trim().toLowerCase(),
  );
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function sendInviteEmail(input: {
  email: string;
  company: string;
  roleTitle: string;
  lengthMinutes: number;
  expiresAt: Date;
  link: string;
}) {
  const env = serverEnv();
  const user = env.GMAIL_USER?.trim();
  const pass = env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass || publicEnv.aiMode === "mock") return false;
  const date = input.expiresAt.toISOString().slice(0, 10);
  const subject = (
    input.company +
    " invited you to an AI interview for " +
    input.roleTitle
  ).replace(/[\r\n]/g, " ");
  const text =
    input.company +
    " invited you to interview for " +
    input.roleTitle +
    ". It takes about " +
    input.lengthMinutes +
    " minutes. This link expires " +
    date +
    ".";
  try {
    const mailer = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      dnsTimeout: 5_000,
      connectionTimeout: 8_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
    const result = await mailer.sendMail({
      from: { name: "SkillMirror", address: user },
      to: input.email,
      subject,
      text: text + "\n" + input.link,
      html:
        "<p>" +
        escape(text) +
        '</p><p><a href="' +
        escape(input.link) +
        '">View invitation</a></p>',
    });
    return result.accepted.length > 0;
  } catch {
    return false;
  }
}
