import { expect, type Page } from "@playwright/test";

export const password = "SkillMirror2026!";
export const randomEmail = (prefix:string) => prefix + "-" + crypto.randomUUID().slice(0,8) + "@example.test";
export async function signup(page:Page,email:string,name:string,next = "") {
  await page.goto("/signup" + (next ? "?next="+encodeURIComponent(next) : ""));
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email",{ exact:true }).fill(email);
  await page.getByLabel("Password",{ exact:true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{ name:"Create account" }).click();
}
export async function uploadCv(page:Page) {
  await page.getByLabel("Upload your CV").setInputFiles("tests/fixtures/sample-cv.pdf");
  await page.getByRole("button",{ name:"Read CV" }).click();
  await expect(page.getByText("Software engineer building reliable services")).toBeVisible();
  await page.getByRole("button",{ name:"This looks right" }).click();
}
export async function prepareAndStart(page:Page) {
  await page.getByRole("link",{ name:"Continue to setup" }).click();
  await page.getByRole("button",{ name:"Use mock calibration" }).click();
  await expect(page.getByRole("heading",{ name:"Consent and start" })).toBeVisible();
  const boxes = page.getByRole("checkbox");
  for (const checkbox of await boxes.all()) await checkbox.check();
  await page.getByRole("button",{ name:"Start interview" }).click();
  await page.getByRole("button",{ name:"Begin interview" }).click();
}
const strong = ("I designed the service with bounded queues and idempotent requests. We tested a failure scenario then compared latency numbers. I measured the result and changed the approach after evidence suggested a bottleneck. ").repeat(4);
export async function answerAll(page:Page, onTurn?: (question:string,index:number) => void) {
  const answer = page.getByLabel("Simulated answer");
  const button = page.getByRole("button",{ name:/Done answering/ });
  for (let index = 0; index < 50; index++) {
    if (!/\/live(?:\?|$)/.test(page.url())) break;
    await expect.poll(async () => {
      if (!/\/live(?:\?|$)/.test(page.url())) return "ended";
      return await button.isEnabled().catch(() => false) ? "answer" : "waiting";
    },{ timeout:45000, intervals:[50,100,250,500] }).not.toBe("waiting");
    if (!/\/live(?:\?|$)/.test(page.url())) break;
    const question = await page.locator(".room-question h2").textContent().catch(() => "");
    onTurn?.(question ?? "",index);
    await answer.fill(index % 3 === 1 ? "I would first check the constraints." : strong);
    await button.click();
    await expect.poll(async () => !/\/live(?:\?|$)/.test(page.url()) || await page.locator(".room-debug small").textContent().then((text) => !text?.includes("LISTENING") || !text.includes("Seq "+(index+1)),() => true),{ timeout:5000 }).toBeTruthy();
    await page.waitForTimeout(140);
  }
}
