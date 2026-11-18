import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const fixture = (name: string) => join(__dirname, "tests", "fixtures", name);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${fixture("candidate.y4m")}`,
        `--use-file-for-fake-audio-capture=${fixture("answer.wav")}`,
      ],
    },
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    env: {
      NEXT_PUBLIC_AI_MODE: "mock",
      NEXT_PUBLIC_APP_URL: "http://localhost:3001",
      SKILL_MIRROR_MOCK_DIR: ".skill-mirror/e2e",
    },
    url: "http://localhost:3001",
    timeout: 90_000,
  },
});
