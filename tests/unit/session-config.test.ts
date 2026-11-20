import { describe, expect, it } from "vitest";
import {
  buildSessionConfig,
  defaultOpeningConfig,
  toPublicConfig,
  validateOpening,
} from "@/lib/config/sessionConfig";
import type { OpeningConfig, OpeningQuestion } from "@/types/interview";
import { mockQuestion } from "@/lib/ai/mock/fixtures";

const company = { name: "Northstar", logoUrl: null };
const opening = () => structuredClone(defaultOpeningConfig);
export function question(
  id: string,
  overrides: Partial<OpeningQuestion> = {},
): OpeningQuestion {
  return {
    ...mockQuestion("How would you handle a duplicate request?"),
    id,
    orderIdx: 0,
    ...overrides,
  };
}
describe("session configuration", () => {
  it.each([
    [2, [20000, 35000, 50000, 15000], 1, 1, 2, 0, null],
    [10, [90000, 120000, 240000, 120000, 30000], 1, 2, 3, 60000, null],
    [
      20,
      [120000, 270000, 480000, 210000, 90000, 30000],
      2,
      3,
      4,
      120000,
      70000,
    ],
  ] as const)(
    "matches the %i minute practice template",
    (
      length,
      budgets,
      behavioralCount,
      techCount,
      techMaxItems,
      talkMs,
      interruptAtMs,
    ) => {
      const config = buildSessionConfig("practice", {
        lengthMinutes: length,
        voiceName: "Charon",
      });
      expect(config).toMatchObject({
        kind: "practice",
        mode: "auto",
        lengthMinutes: length,
        hardCapMs: length * 60000,
        behavioralCount,
        techCount,
        techMaxItems,
        cvQuestionCount: 0,
        presentation: {
          prepMs: length === 2 ? 0 : 30000,
          talkMs,
          interruptAtMs,
          custom: null,
        },
        maxStrategistCalls: 60,
        feedbackVisibility: "full",
        cvRequired: true,
        requireHeadphones: false,
        ai: {
          voiceName: "Charon",
          strictness: "balanced",
          adversarialIntensity: "medium",
        },
        evaluation: {
          weights: { technical: 55, behavioral: 15, cv: 0, soft: 30 },
          nonverbalPolicy: "scored",
          passThreshold: null,
        },
      });
      expect(
        config.phaseOrder.map((phase) => config.phaseBudgetsMs[phase]),
      ).toEqual([...budgets]);
      expect(config.phaseOrder.includes("candidate_questions")).toBe(
        length === 20,
      );
      expect(config.maxAnswerMs).toMatchObject(
        length === 2
          ? {
              calibration: 20000,
              cv_deep_dive: 35000,
              behavioral: 35000,
              technical: 40000,
              presentation_followup: 25000,
              candidate_questions: 20000,
            }
          : {
              calibration: 90000,
              cv_deep_dive: 180000,
              behavioral: 180000,
              technical: 180000,
              presentation_followup: 120000,
              candidate_questions: 90000,
            },
      );
    },
  );
  it("budgets 2 minute quick-test company openings across phase toggles", () => {
    for (const toggles of [
      {},
      { technical: false },
      { behavioral: false, cv_deep_dive: false },
      { presentation: false, candidate_questions: false },
    ]) {
      const config = opening();
      config.lengthMinutes = 2;
      Object.assign(config.phases, toggles);
      const built = buildSessionConfig("company", {
        config,
        company,
        questions: [],
      });
      expect(
        Object.values(built.phaseBudgetsMs).reduce((a, b) => a + b, 0),
      ).toBe(110000);
      expect(built.techCount).toBe(config.phases.technical ? 1 : 0);
      expect(built.maxAnswerMs.technical).toBe(40000);
      expect(built.phaseOrder.at(-1)).toBe("close");
    }
    const check = opening();
    check.lengthMinutes = 2;
    const validation = validateOpening(check, []);
    expect(validation.warnings.map((issue) => issue.code)).toContain("W3");
    expect(validation.budgets.presentation).toBeUndefined();
  });
  it.each([15, 20, 30, 45] as const)(
    "budgets company time at %i minutes across phase combinations",
    (lengthMinutes) => {
      for (const toggles of [
        {},
        { technical: false },
        { behavioral: false, cv_deep_dive: false },
        { presentation: false, candidate_questions: false },
      ]) {
        const config = opening();
        config.lengthMinutes = lengthMinutes;
        Object.assign(config.phases, toggles);
        const built = buildSessionConfig("company", {
          config,
          company,
          questions: [],
        });
        expect(
          Object.values(built.phaseBudgetsMs).reduce((a, b) => a + b, 0),
        ).toBe(lengthMinutes * 60000 - 30000);
        expect(
          built.phaseBudgetsMs.candidate_questions ?? 0,
        ).toBeLessThanOrEqual(120000);
        expect(built.maxStrategistCalls).toBe(
          lengthMinutes <= 20 ? 60 : lengthMinutes === 30 ? 90 : 130,
        );
        expect(built.techCount).toBe(
          !config.phases.technical
            ? 0
            : lengthMinutes <= 20
              ? 2
              : lengthMinutes === 30
                ? 3
                : 4,
        );
        expect(built.phaseOrder.at(-1)).toBe("close");
      }
    },
  );
  it("caps candidate questions and assigns excess to technical or the largest enabled phase", () => {
    const config = opening();
    config.lengthMinutes = 45;
    config.phases.cv_deep_dive = false;
    config.phases.presentation = false;
    const build = () =>
      buildSessionConfig("preview", { config, questions: [], company });
    expect(build().phaseBudgetsMs.candidate_questions).toBe(120000);
    config.phases.technical = false;
    expect(build().phaseBudgetsMs.behavioral).toBe(2400000);
  });
  it("disables empty scripted phases and counts distinct technical competencies", () => {
    const config = opening();
    config.mode = "scripted";
    const built = buildSessionConfig("company", {
      config,
      company,
      questions: [
        question("1"),
        question("2"),
        question("3", { competencyKey: "dsa" }),
      ],
    });
    expect(built.phaseOrder).not.toContain("behavioral");
    expect(built.phaseOrder).not.toContain("cv_deep_dive");
    expect(built.techCount).toBe(2);
    expect(built.techMaxItems).toBe(0);
  });
  it("exposes an allowlisted public snapshot", () => {
    const config = opening();
    config.ai.instructions = "private";
    config.ai.toneInstructions = "private";
    config.presentation.custom = {
      title: "Private",
      scenario: "Private",
      audience: "",
      goal: "",
      interrupt_challenge: "",
      pushback_angles: ["a", "b", "c"],
    };
    const snapshot = toPublicConfig(
      buildSessionConfig("company", {
        config,
        company,
        questions: [question("1")],
      }),
      "Alex",
    );
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        "kind",
        "lengthMinutes",
        "hardCapMs",
        "phaseOrder",
        "phaseBudgetsMs",
        "maxAnswerMs",
        "presentation",
        "company",
        "feedbackVisibility",
        "collectDelivery",
        "requireHeadphones",
        "voiceName",
        "interviewerName",
      ].sort(),
    );
    expect(JSON.stringify(snapshot)).not.toMatch(
      /private|weights|customQuestions/i,
    );
  });
});
describe("opening validation", () => {
  it.each([
    [
      "E1",
      (c: OpeningConfig) => {
        c.mode = "scripted";
      },
      [],
    ],
    [
      "E2",
      (c: OpeningConfig) => {
        c.evaluation.weights.cv = 0;
      },
      [],
    ],
    [
      "E3",
      (c: OpeningConfig) => {
        c.cv.required = false;
      },
      [],
    ],
    [
      "E4",
      (c: OpeningConfig) => {
        c.phases.cv_deep_dive =
          c.phases.behavioral =
          c.phases.technical =
            false;
      },
      [],
    ],
    [
      "W1",
      () => {},
      Array.from({ length: 8 }, (_, i) =>
        question(String(i), { expectedMinutes: 5 }),
      ),
    ],
    [
      "W2",
      () => {},
      Array.from({ length: 8 }, (_, i) =>
        question(String(i), { expectedMinutes: 5 }),
      ),
    ],
    [
      "W3",
      (c: OpeningConfig) => {
        c.lengthMinutes = 10 as OpeningConfig["lengthMinutes"];
      },
      [],
    ],
    ["W4", () => {}, [question("1", { competencyKey: null })]],
  ] as const)("detects %s", (code, update, questions) => {
    const config = opening();
    update(config);
    const result = validateOpening(config, [...questions]);
    expect(
      [...result.errors, ...result.warnings].map((issue) => issue.code),
    ).toContain(code);
    if (code === "W3") expect(result.budgets.presentation).toBeUndefined();
  });
});
