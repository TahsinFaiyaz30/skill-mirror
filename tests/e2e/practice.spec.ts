import { expect, test } from "@playwright/test";
import {
  answerAll,
  prepareAndStart,
  randomEmail,
  signup,
  uploadCv,
} from "./flow";

async function useTheme(
  page: import("@playwright/test").Page,
  name: "Light" | "Dark",
) {
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(page.locator("html")).toHaveClass(
    new RegExp(name.toLowerCase()),
  );
}
test("practice interview records answers and produces a private report in mock mode", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signup(page, randomEmail("practice"), "Jamie Morgan");
  await expect(
    page.getByRole("heading", { name: "How will you use SkillMirror?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No interviews yet" }),
  ).toBeVisible();
  await useTheme(page, "Light");
  await expect(page.locator("main")).toHaveScreenshot("dashboard-light.png", {
    maxDiffPixelRatio: 0.01,
  });
  await useTheme(page, "Dark");
  await expect(page.locator("main")).toHaveScreenshot("dashboard-dark.png", {
    maxDiffPixelRatio: 0.01,
  });
  await page.getByRole("link", { name: "New interview" }).first().click();
  await uploadCv(page);
  await page.getByLabel("Company", { exact: true }).fill("Northstar Labs");
  await page.getByLabel("Role title", { exact: true }).fill("Backend Engineer");
  await page.getByText("Quick 10 min").click();
  await page.getByRole("button", { name: "Create interview" }).click();
  await expect(
    page.getByRole("heading", { name: "Your interview", exact: true }),
  ).toBeVisible();
  const id = page.url().split("/").at(-2)!;
  const session = await page.request.get("/api/sessions/" + id);
  expect(session.ok()).toBe(true);
  expect(await session.text()).not.toMatch(
    /"plan"|"strategistState"|"customQuestions"|"evaluation"|"toneInstructions"/,
  );
  await prepareAndStart(page, true);
  await expect(
    page.getByRole("heading", { name: /Tell me about yourself/ }),
  ).toBeVisible();
  await useTheme(page, "Light");
  await expect(page.locator(".room-question")).toHaveScreenshot(
    "room-light.png",
    { maxDiffPixelRatio: 0.01 },
  );
  await useTheme(page, "Dark");
  await expect(page.locator(".room-question")).toHaveScreenshot(
    "room-dark.png",
    { maxDiffPixelRatio: 0.01 },
  );
  await answerAll(page);
  await expect(
    page.getByRole("heading", { name: "Your interview report" }),
  ).toBeVisible({ timeout: 60000 });
  const overview = page.locator("#overview"),
    dynamic = [overview.locator(".score-header p.muted")];
  await expect(overview).toHaveScreenshot("report-dark.png", {
    mask: dynamic,
    maxDiffPixelRatio: 0.01,
  });
  await useTheme(page, "Light");
  await expect(overview).toHaveScreenshot("report-light.png", {
    mask: dynamic,
    maxDiffPixelRatio: 0.01,
  });
  await expect(page.getByRole("button", { name: "Play clip" })).toHaveCount(5);
  await page.getByRole("button", { name: "Play clip" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Interview clip" }),
  ).toBeVisible();
  await expect(page.getByLabel("Interview recording")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByLabel("Interview recording")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.05);
  await page.getByRole("button", { name: "Close clip" }).click();
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("link", { name: "View report" })).toBeVisible();
  await page.getByRole("link", { name: "Progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Overall score" }),
  ).toBeVisible();
  if (process.env.SKILL_MIRROR_AUDIT === "1") {
    await page
      .context()
      .storageState({ path: info.outputPath("mock-browser.json") });
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(
        info.outputPath("report-path.txt"),
        "/interview/" + id + "/report",
      ),
    );
  }
  const other = await browser.newPage();
  try {
    await signup(other, randomEmail("other"), "Another Candidate");
    await expect(
      other.getByRole("heading", { name: "How will you use SkillMirror?" }),
    ).toBeVisible();
    const response = await other.request.get("/api/sessions/" + id);
    expect(response.status()).toBe(404);
  } finally {
    await other.close();
  }
  expect(errors).toEqual([]);
});
