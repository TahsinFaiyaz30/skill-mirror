import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBlueprint, mockLadder } from "@/lib/ai/mock/fixtures";
import {
  completeLadder,
  generatePlan,
  normalizeBlueprint,
} from "@/lib/ai/plan";
import { resetProviderPool } from "@/lib/ai/pool";
import { goldenFixture } from "../fixtures/session-01/fixture";
import { buildSessionConfig } from "@/lib/config/sessionConfig";

describe("interview plan recovery", () => {
  afterEach(() => {
    resetProviderPool();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // Judge mode and every 3 min 30 s interview use the fast path; longer
  // interviews keep full reasoning.
  it.each([
    { lengthMinutes: 3.5 as const, judgeMode: true as const, blueprintLevel: "low", ladderLevel: "low" },
    { lengthMinutes: 3.5 as const, judgeMode: undefined, blueprintLevel: "low", ladderLevel: "low" },
    { lengthMinutes: 20 as const, judgeMode: undefined, blueprintLevel: "high", ladderLevel: "medium" },
  ])("uses the configured Gemini model with the expected reasoning for $lengthMinutes min, judge $judgeMode", async ({
    lengthMinutes,
    judgeMode,
    blueprintLevel,
    ladderLevel,
  }) => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("MODEL_FLASH", "configured-gemini-model");
    const config = {
      ...buildSessionConfig("practice", { lengthMinutes, voiceName: "Kore" }),
      judgeMode,
    };
    const session = {
      ...goldenFixture("off").session,
      kind: "practice" as const,
      aiMode: "live" as const,
      config,
    };
    const blueprint = mockBlueprint(config, session.roleFamily);
    const requests: Array<{ model: string; thinking: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const { model, generation_config, response_format } = await request.json();
      requests.push({ model, thinking: generation_config.thinking_level });
      const result = response_format.schema.properties.persona
        ? blueprint
        : { levels: mockLadder(blueprint.technical[0].key) };
      return Response.json({ status: "completed", output_text: JSON.stringify(result) });
    }));

    const plan = await generatePlan(session, null, "Test Candidate");
    expect(plan.technical).toHaveLength(config.techCount);
    expect(requests).toEqual(
      [blueprintLevel, ...Array(config.techCount).fill(ladderLevel)].map((thinking) => ({
        model: "configured-gemini-model",
        thinking,
      })),
    );
  });

  it("tries the preferred Gemini model on each configured key before accepting a Groq plan", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-primary-key,gemini-secondary-key");
    vi.stubEnv("GEMINI_API_KEYS", "");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("MODEL_FLASH", "preferred-gemini");
    vi.stubEnv("GROQ_STRATEGIST_MODEL", "openai/gpt-oss-120b");
    const config = buildSessionConfig("practice", {
      lengthMinutes: 2,
      voiceName: "Kore",
    });
    const session = {
      ...goldenFixture("off").session,
      kind: "practice" as const,
      aiMode: "live" as const,
      config,
    };
    const blueprint = mockBlueprint(config, session.roleFamily);
    blueprint.persona.interviewer_name = "Jordan";
    const attempts: Array<[string, string | null]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const { model, response_format } = await request.json();
        const geminiKey = request.headers.get("x-goog-api-key");
        attempts.push([model, geminiKey]);
        if (geminiKey) {
          const status = geminiKey === "gemini-primary-key" ? 429 : 400;
          const message =
            status === 429 ? "Quota exceeded" : "API key not valid";
          return Response.json(
            { error: { message, code: status } },
            { status },
          );
        }
        const value = response_format.json_schema.schema.properties.persona
          ? blueprint
          : { levels: mockLadder(blueprint.technical[0].key) };
        return Response.json({
          choices: [{ message: { content: JSON.stringify(value) } }],
        });
      }),
    );

    const plan = await generatePlan(session, null, "Test Candidate");
    expect(plan.persona.interviewer_name).toBe("Jordan");
    expect(plan.technical).toHaveLength(config.techCount);
    expect(attempts.slice(0, 3)).toEqual([
      ["preferred-gemini", "gemini-primary-key"],
      ["preferred-gemini", "gemini-secondary-key"],
      ["openai/gpt-oss-120b", null],
    ]);
  });

  it("prepares role-based questions when both services are unavailable", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { message: "Overloaded" } }, { status: 503 }),
      ),
    );
    const config = buildSessionConfig("practice", {
      lengthMinutes: 20,
      voiceName: "Kore",
    });
    const session = {
      ...goldenFixture("off").session,
      kind: "practice" as const,
      aiMode: "live" as const,
      config,
    };

    const plan = await generatePlan(session, null, "Test Candidate");
    expect(plan.role_summary).toContain(session.roleTitle);
    expect(plan.technical).toHaveLength(config.techCount);
    expect(
      plan.technical.every(({ ladder }) =>
        Object.values(ladder).every((questions) => questions.length === 2),
      ),
    ).toBe(true);
    expect(
      plan.behavioral.every(({ cv_anchor }) => cv_anchor === "Your experience"),
    ).toBe(true);
  });

  it("keeps the provider's wording when a competency key is outside the taxonomy", () => {
    const blueprint = mockBlueprint(
      buildSessionConfig("practice", { lengthMinutes: 10, voiceName: "Kore" }),
      "software_engineering",
    );
    const [competency] = blueprint.technical;
    const normalized = normalizeBlueprint({
      ...blueprint,
      technical: [
        { ...competency, key: "Physics simulation", sub_label: null },
      ],
      cv_claims: [
        {
          competency_key: "Physics simulation",
          claim: "Designed a simulator",
          claimed_level: 3,
        },
      ],
    });
    expect(normalized.technical[0]).toMatchObject({
      key: "domain_other",
      sub_label: "Physics simulation",
    });
    expect(normalized.cv_claims[0].competency_key).toBe("domain_other");
  });

  it("fills missing slots from the closest answered tier and keeps stable question IDs", () => {
    const key = "domain_other";
    const sample = mockLadder(key);
    const ladder = completeLadder(key, {
      "2": sample[2],
      "4": [sample[4][0]],
      "5": sample[5],
    });
    expect(Object.values(ladder).map((questions) => questions.length)).toEqual([
      2, 2, 2, 2, 2,
    ]);
    expect(ladder[1].map((question) => question.text)).toEqual(
      sample[2].map((question) => question.text),
    );
    expect(ladder[4].map((question) => question.text)).toEqual([
      sample[4][0].text,
      sample[5][0].text,
    ]);
    expect(
      new Set(
        Object.values(ladder)
          .flat()
          .map((question) => question.id),
      ).size,
    ).toBe(10);
  });
});
