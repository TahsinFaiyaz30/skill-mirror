import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendInviteEmail } from "@/lib/hiring/invitations";

const mailer = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("nodemailer", () => ({ createTransport: mailer.createTransport }));
vi.mock("@/lib/config/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/config/env")>();
  return {
    ...original,
    publicEnv: { ...original.publicEnv, aiMode: "live" },
  };
});

const invite = {
  email: "candidate@example.test",
  company: "Example & Co.",
  roleTitle: "Software Engineer",
  lengthMinutes: 3.5,
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
  link: "https://skillmirror.example.test/i/sample?a=1&b=2",
};

describe("Gmail candidate invitations", () => {
  beforeEach(() => {
    vi.stubEnv("GMAIL_USER", "sender@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    mailer.createTransport.mockReset().mockReturnValue(mailer);
    mailer.sendMail.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses Gmail over TLS and sends the existing invitation link", async () => {
    mailer.sendMail.mockResolvedValue({ accepted: [invite.email] });
    await expect(sendInviteEmail(invite)).resolves.toBe(true);
    expect(mailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "sender@gmail.com", pass: "abcdefghijklmnop" },
      }),
    );
    const message = mailer.sendMail.mock.calls[0][0];
    expect(message).toMatchObject({
      from: { name: "SkillMirror", address: "sender@gmail.com" },
      to: invite.email,
    });
    expect(message.text).toContain(invite.link);
    expect(message.text).toContain("3 minutes 30 seconds");
    expect(message.html).toContain("Example &amp; Co.");
    expect(message.html).toContain("View interview invitation");
    expect(message.html).toContain(
      `href="${invite.link.replace("&", "&amp;")}"`,
    );
    expect(message.html).toContain("3 minutes 30 seconds");
  });

  it("keeps the invite available when Gmail is missing or rejects delivery", async () => {
    vi.stubEnv("GMAIL_APP_PASSWORD", "");
    await expect(sendInviteEmail(invite)).resolves.toBe(false);
    expect(mailer.createTransport).not.toHaveBeenCalled();

    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    mailer.sendMail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    await expect(sendInviteEmail(invite)).resolves.toBe(false);
    mailer.sendMail.mockResolvedValueOnce({ accepted: [] });
    await expect(sendInviteEmail(invite)).resolves.toBe(false);
  });
});
