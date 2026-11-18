import { describe, expect, it } from "vitest";
import { mockBlueprint, mockLadder } from "@/lib/ai/mock/fixtures";
import { completeLadder, normalizeBlueprint } from "@/lib/ai/plan";
import { buildSessionConfig } from "@/lib/config/sessionConfig";

describe("interview plan recovery", () => {
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
