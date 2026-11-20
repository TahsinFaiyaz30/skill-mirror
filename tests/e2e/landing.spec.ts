import { expect, test } from "@playwright/test";
import { randomEmail, signup } from "./flow";

test("landing page hides top section anchor links and renders the hero", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Practice job interviews with an AI interviewer/,
    }),
  ).toBeVisible();

  const nav = page.locator("header.nav");
  for (const removed of [
    "What it does",
    "How it works",
    "Your report",
    "Who it's for",
    "FAQ",
  ]) {
    await expect(nav.getByRole("link", { name: removed })).toHaveCount(0);
  }
  await expect(nav.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sign up" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("logged-in users are always redirected from / to their active dashboard", async ({
  browser,
}) => {
  const practice = await browser.newPage();
  try {
    await signup(practice, randomEmail("lp-practice"), "Practice User");
    await expect(
      practice.getByRole("heading", { name: "How will you use SkillMirror?" }),
    ).toBeVisible();
    await practice.goto("/");
    await expect(practice).toHaveURL(/\/onboarding/);

    await practice.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(practice).toHaveURL(/\/dashboard/);

    await practice.goto("/");
    await expect(practice).toHaveURL(/\/dashboard$/);
    await expect(
      practice.getByRole("heading", {
        level: 1,
        name: /Practice job interviews with an AI interviewer/,
      }),
    ).toHaveCount(0);
  } finally {
    await practice.close();
  }

  const hiring = await browser.newPage();
  try {
    await signup(hiring, randomEmail("lp-hiring"), "Hiring User");
    await hiring.getByRole("radio", { name: /Hire with AI interviews/ }).check();
    await hiring.getByRole("button", { name: "Continue", exact: true }).click();
    await hiring.getByLabel("Organization name").fill("Landing Redirect Org");
    await hiring.getByRole("button", { name: "Create organization" }).click();
    await expect(hiring).toHaveURL(/\/hiring/);

    await hiring.goto("/");
    await expect(hiring).toHaveURL(/\/hiring$/);
    await expect(
      hiring.getByRole("heading", {
        level: 1,
        name: /Practice job interviews with an AI interviewer/,
      }),
    ).toHaveCount(0);
  } finally {
    await hiring.close();
  }
});
