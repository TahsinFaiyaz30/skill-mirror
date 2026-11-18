import { expect, test } from "@playwright/test";
import {
  answerAll,
  prepareAndStart,
  randomEmail,
  signup,
  uploadCv,
} from "./flow";

test("a hiring team imports must-ask questions, reviews two interviews and exports decisions", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  const recruited = [randomEmail("applicant-a"), randomEmail("applicant-b")];
  const names = ["=Morgan Candidate", "Lee Candidate"];
  const questions = [
    "How would you investigate a sudden rise in failed requests?",
    "What tradeoff would you make when adding a cache to a payment service?",
    "Describe a time you took ownership of a difficult decision?",
  ];
  await signup(page, randomEmail("recruiter"), "Recruiter Taylor");
  await page.getByRole("radio", { name: /Hire with AI interviews/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Organization name").fill("Northstar Hiring");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByRole("link", { name: "New opening" }).first().click();
  await page.getByLabel("Opening title").fill("Backend Engineer – Payments");
  await page.getByLabel("Role title").fill("Backend Engineer");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page
    .getByRole("heading", { name: "Interview design", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Presentation", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("button", { name: "Import from document" }).click();
  await page.getByLabel("Paste questions or notes").fill(questions.join("\n"));
  await page.getByRole("button", { name: "Detect questions" }).click();
  await page.getByRole("button", { name: "Add selected" }).click();
  await expect(
    page.getByRole("textbox", { name: "Question", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "AI behavior", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Adversarial intensity").selectOption("high");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Evaluation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Review & publish", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview interview" }).click();
  await page.getByRole("button", { name: "Start preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Your interview", exact: true }),
  ).toBeVisible();
  const all = await (await page.request.get("/api/openings")).json();
  const opening = all.items.find(
    (item: { title: string }) => item.title === "Backend Engineer – Payments",
  );
  expect(opening?.locked).toBe(false);
  const openingUrl = "/hiring/openings/" + opening.id;
  await page.goto(openingUrl);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Invite", exact: true }).click();
  await page
    .getByLabel("Candidate emails")
    .fill(recruited.map((email, i) => email + ", " + names[i]).join("\n"));
  await page.getByRole("button", { name: "Send invites" }).click();
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toHaveCount(2);
  const links = await page
    .locator('a[href*="/i/"]')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  const token = new URL(links[0]).pathname.split("/").at(-1)!;
  const orgMember = await page.request.post("/api/invite/" + token + "/accept");
  expect(orgMember.status()).toBe(400);
  expect(await orgMember.text()).toContain("Use Preview instead");

  const wrong = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await signup(wrong, randomEmail("wrong"), "Wrong Account", "/i/" + token);
    await wrong.getByRole("button", { name: "Start", exact: true }).click();
    await expect(wrong.getByText(/Log in with that email/)).toBeVisible();
    expect(
      (await wrong.request.get("/api/openings/" + opening.id)).status(),
    ).toBe(404);
  } finally {
    await wrong.close();
  }

  for (const [index, link] of links.entries()) {
    const candidate = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      permissions: ["camera", "microphone"],
    });
    try {
      await candidate.goto(link);
      const invitePath = new URL(link).pathname;
      await expect(
        candidate.getByText(/Invitation for a\*\*\*@example\.test/),
      ).toBeVisible();
      await candidate
        .getByRole("link", { name: "Sign up to continue" })
        .click();
      await signup(candidate, recruited[index], names[index], invitePath);
      await candidate
        .getByRole("button", { name: "Start", exact: true })
        .click();
      await uploadCv(candidate);
      await expect(
        candidate.getByRole("heading", { name: "Your interview", exact: true }),
      ).toBeVisible();
      const id = candidate.url().split("/").at(-2)!;
      await prepareAndStart(candidate);
      await expect(
        candidate.getByRole("heading", { name: /Tell me about yourself/ }),
      ).toBeVisible();
      const asked: string[] = [];
      await answerAll(candidate, (question) => asked.push(question));
      expect(asked).toEqual(expect.arrayContaining(questions));
      await expect(
        candidate.getByRole("heading", { name: "Thank you!" }),
      ).toBeVisible({ timeout: 60000 });
      await expect(
        candidate.getByRole("heading", { name: "Your top strengths" }),
      ).toBeVisible();
      await expect(
        candidate.getByRole("heading", { name: "Your interview report" }),
      ).toHaveCount(0);
      const report = await (
        await candidate.request.get("/api/sessions/" + id + "/report")
      ).json();
      expect(report.data).toEqual({
        summary: expect.any(Object),
        practicePlan: expect.any(Array),
      });
      expect(report.overallScore).toBeNull();
      expect(
        (
          await candidate.request.get("/api/hiring/sessions/" + id + "/report")
        ).status(),
      ).toBe(404);
      expect(
        (
          await candidate.request.get("/api/sessions/" + id + "/playback")
        ).status(),
      ).toBe(403);
    } finally {
      await candidate.close();
    }
  }
  await page.goto(openingUrl);
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: names[0] }).click();
  await expect(
    page.getByRole("heading", { name: "Question coverage" }),
  ).toBeVisible();
  const coverage = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Question coverage" }) });
  for (const question of questions)
    await expect(
      coverage.getByRole("row").filter({ hasText: question }),
    ).toContainText("Asked");
  await expect(
    page.getByText("⚡ AI follow-up", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delivery insights (not scored)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Advance", exact: true }).click();
  await page.getByLabel("Notes").fill("Strong ownership and a clear tradeoff.");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Backend Engineer – Payments" }).click();
  await page
    .getByRole("checkbox", { name: "Compare " + names[0], exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Compare " + names[1], exact: true })
    .check();
  await page.getByRole("link", { name: "Compare (2)" }).click();
  await expect(
    page.getByRole("heading", { name: "Compare candidates" }),
  ).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toHaveCount(2);
  const download = await page.request.get(
    "/api/openings/" + opening.id + "/export.csv",
  );
  expect(download.headers()["content-type"]).toMatch(/^text\/csv/);
  const bytes = await download.body();
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(bytes.toString("utf8")).toContain("'=Morgan Candidate");
  expect(bytes.toString("utf8")).toContain("advance");
});
