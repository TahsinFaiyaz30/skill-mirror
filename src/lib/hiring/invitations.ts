import { randomBytes } from "node:crypto";
import { createTransport } from "nodemailer";
import { publicEnv, serverEnv } from "@/lib/config/env";
import { renderEmail } from "@/lib/email/layout";
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

type CandidateInvite = {
  email: string;
  company: string;
  roleTitle: string;
  lengthMinutes: number;
  expiresAt: Date;
  link: string;
};

const expiryFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function candidateInviteMessage(input: CandidateInvite) {
  const { company, roleTitle, lengthMinutes, expiresAt, link } = input;
  const totalSeconds = Math.round(lengthMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const length = `${minutes} minutes${seconds ? ` ${seconds} seconds` : ""}`;
  const expiry = expiryFormat.format(expiresAt);
  const message = `The hiring team at ${company} has invited you to complete an AI interview. Open your invitation to review the details and sign in when you’re ready.`;
  const note =
    "Use desktop Chrome or Edge with a camera and microphone for the interview.";
  const details = [
    { label: "Role", value: roleTitle },
    { label: "Interview length", value: length },
    { label: "Link expires", value: expiry },
  ];

  return {
    subject: `${company} invited you to interview for ${roleTitle}`.replace(
      /[\r\n]+/g,
      " ",
    ),
    text: [
      "You’re invited to interview",
      message,
      ...details.map(({ label, value }) => `${label}: ${value}`),
      "View interview invitation\n" + link,
      note,
    ].join("\n\n"),
    html: renderEmail({
      category: "Interview invitation",
      title: "You’re invited to interview",
      preheader: `${roleTitle} at ${company}. Review your invitation and interview details.`,
      message,
      details,
      action: { label: "View interview invitation", url: link, showUrl: true },
      note,
    }),
  };
}

export async function sendInviteEmail(input: CandidateInvite) {
  const env = serverEnv();
  const user = env.GMAIL_USER?.trim();
  const pass = env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass || publicEnv.aiMode === "mock") return false;
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
      ...candidateInviteMessage(input),
    });
    return result.accepted.length > 0;
  } catch {
    return false;
  }
}
