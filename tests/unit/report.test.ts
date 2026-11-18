import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/report/buildReport";
import {
  calculateIntegrity,
  levelFor,
  overallScore,
  practiceVerdict,
  recommendation,
  stressForTurn,
  technicalResults,
} from "@/lib/report/scoring";
import { filterForCandidate } from "@/lib/report/filterForCandidate";
import {
  canonicalJSON,
  signCertificate,
  verifyCertificate,
} from "@/lib/cert/sign";
import { goldenFixture } from "../fixtures/session-01/fixture";
import expected from "../fixtures/session-01/expected-scores.json";
import type { SessionEvent } from "@/types/interview";
const build = (mode: "scored" | "coaching_only" | "off") => {
  const { session, turns, baseline, timeline, pitch, events, words } =
    goldenFixture(mode);
  return buildReport(
    session,
    turns,
    baseline,
    timeline,
    pitch,
    events,
    words,
    [],
  ).report;
};

describe("report scoring", () => {
  it.each(["scored", "coaching_only"] as const)(
    "matches the independent scoring workbook for %s",
    (policy) => {
      const report = build(policy),
        target = expected[policy];
      expect(report.headline.overallScore).toBe(target.overallScore);
      expect(report.components).toMatchObject({
        technical: target.technical,
        behavioral: target.behavioral,
        cv: null,
        soft: target.soft,
      });
      expect(report.softSkills.maturityScore).toBe(target.maturityScore);
      expect(
        Object.fromEntries(
          report.softSkills.dimensions.map((item) => [item.key, item.score]),
        ),
      ).toEqual(expected.dimensions);
      expect(report.headline.recommendation).toBe("Consider");
    },
  );
  it("drops delivery dimensions in off mode without losing content scoring or integrity", () => {
    const report = build("off");
    expect(report.softSkills).toMatchObject({
      dimensions: [],
      maturityScore: null,
    });
    expect(report.components.soft).toBe(78);
    expect(report.composure).toBeNull();
    expect(report.stats).toEqual({ vision: [], voice: [] });
    expect(report.timeline.buckets).toEqual([]);
    expect(report.timeline.events.map((event) => event.type)).toEqual([
      "tab_hidden",
    ]);
  });
  it("renormalizes stress over available signals", () => {
    const { baseline } = goldenFixture("scored");
    expect(
      stressForTurn(
        { voice: null, vision: { eyeContactPct: 0.55 } },
        baseline.fields,
        "technical",
        10000,
      ),
    ).toBeCloseTo(0.5);
    expect(
      stressForTurn(
        { voice: null, vision: { eyeContactPct: 0.55 } },
        baseline.fields,
        "technical",
        9999,
      ),
    ).toBeNull();
    expect(
      stressForTurn(
        { voice: null, vision: null },
        baseline.fields,
        "technical",
        10000,
      ),
    ).toBeNull();
  });
  it("renormalizes overall weights when a component is missing", () => {
    expect(
      overallScore(
        { technical: 80, behavioral: null, cv: null, soft: 50 },
        { technical: 55, behavioral: 15, cv: 0, soft: 30 },
      ),
    ).toEqual({
      score: 69,
      effectiveWeights: { technical: 65, behavioral: 0, cv: 0, soft: 35 },
    });
  });
  it("keeps company questions without a competency in their own technical score", () => {
    const { session, turns } = goldenFixture("coaching_only");
    const company = {
      ...turns[2],
      idx: 4,
      questionSource: "company" as const,
      competencyKey: null,
      scoreTotal: 2,
    };
    expect(
      technicalResults(session, [...turns, company]).companyQuestionsScore,
    ).toBe(50);
  });
  it.each([
    [0, 1],
    [39, 1],
    [40, 2],
    [54, 2],
    [55, 3],
    [69, 3],
    [70, 4],
    [84, 4],
    [85, 5],
    [100, 5],
  ])("puts %i in level %i", (score, level) => {
    expect(levelFor(score).level).toBe(level);
  });
  it.each([
    [true, 100, 1, 100, 100, "Integrity review needed"],
    [false, null, 0, null, 70, "Hire signal"],
    [false, null, 0, null, 55, "Borderline"],
    [false, null, 0, null, 54, "Not yet ready"],
    [false, 90, 1, 70, 70, "Strong hire signal"],
    [false, 70, 0.85, 55, 65, "Hire signal"],
    [false, 50, 0.65, 44, 60, "Borderline"],
    [false, 30, 0.64, 70, 70, "Not yet ready"],
  ] as const)(
    "selects the practice verdict",
    (review, tech, ratio, soft, maturity, verdict) => {
      expect(practiceVerdict(review, tech, ratio, soft, maturity)).toBe(
        verdict,
      );
    },
  );
  it.each([
    [false, 70, "Recommend advance"],
    [false, 55, "Consider"],
    [false, 54, "Not recommended"],
    [true, 100, "Integrity review needed"],
  ] as const)("selects the company recommendation", (review, score, label) => {
    expect(recommendation(review, score, 70)).toBe(label);
  });
  it("applies every integrity trigger and distinguishes minor flags", () => {
    const item = (
      type: string,
      endMs: number,
      category: SessionEvent["category"] = "integrity",
    ): SessionEvent => ({
      id: crypto.randomUUID(),
      category,
      type,
      startMs: 0,
      endMs,
      severity: 0.4,
      turnIdx: 0,
      data: {},
      snapshotPath: null,
    });
    expect(calculateIntegrity([]).badge).toBe("clean");
    expect(calculateIntegrity([item("tab_hidden", 5)]).badge).toBe("minor");
    for (const triggers of [
      [item("multiple_faces", 10000)],
      [item("tab_hidden", 30000)],
      Array.from({ length: 3 }, () => item("tab_hidden", 10)),
      Array.from({ length: 3 }, () => item("reading_pattern", 10)),
      [
        item("phone_use", 10, "live_vision"),
        item("second_person", 10, "live_vision"),
      ],
    ])
      expect(calculateIntegrity(triggers).badge).toBe("review");
  });
});
describe("candidate report filtering and certificates", () => {
  it("returns exactly summary fields or strips recruiter-only details", () => {
    const report = build("scored");
    expect(filterForCandidate(report, "none")).toBeNull();
    expect(filterForCandidate(report, "summary")).toEqual({
      summary: { strengths: [], growthAreas: [] },
      practicePlan: [],
    });
    const full = filterForCandidate(report, "full");
    expect(full).not.toHaveProperty("companyView");
    expect(full).toHaveProperty("integrity", { badge: "minor" });
    expect(full).not.toHaveProperty("turns.1.scores.note");
    expect(full).toHaveProperty("headline.overallScore", 57);
  });
  it("signs canonical JSON, accepts key order changes and rejects tampering", () => {
    const first = { a: [2, { q: "ok", b: 0 }], z: { c: 1, b: true } },
      second = { z: { b: true, c: 1 }, a: [2, { b: 0, q: "ok" }] };
    expect(canonicalJSON(first)).toBe(canonicalJSON(second));
    const key = "19".repeat(32),
      signed = signCertificate(first, key);
    expect(verifyCertificate(second, signed, key)).toBe(true);
    expect(verifyCertificate({ ...first, a: [1] }, signed, key)).toBe(false);
  });
});
