import { describe, expect, it } from "vitest";
import {
  buildSessionConfig,
  defaultOpeningConfig,
} from "@/lib/config/sessionConfig";
import {
  mockBlueprint,
  mockLadder,
  mockQuestion,
} from "@/lib/ai/mock/fixtures";
import {
  applyStaircase,
  newCompetency,
  stepStaircase,
} from "@/lib/strategist/staircase";
import { expectedPerformance, updateTheta } from "@/lib/strategist/elo";
import { buildQueues, companyItem, pickLadder } from "@/lib/strategist/queues";
import {
  calibrationQuestion,
  compose,
  neutralAck,
  phaseListSpoken,
} from "@/lib/strategist/compose";
import {
  phaseLimits,
  reserveFor,
  selectNext,
  startInterview,
  transition,
} from "@/lib/strategist/engine";
import { basicItem, type InterviewContext } from "@/lib/strategist/state";
import {
  buildScores,
  mockP4,
  outcomeFor,
  strongFollowUp,
} from "@/lib/strategist/scoring";
import type {
  InterviewConfig,
  OpeningQuestion,
  StrategistInput,
} from "@/types/interview";

const q = (
  id: string,
  options: Partial<OpeningQuestion> = {},
): OpeningQuestion => ({
  ...mockQuestion("Company question " + id + "?"),
  id,
  orderIdx: Number(id),
  ...options,
});
const practice = () =>
  buildSessionConfig("practice", { lengthMinutes: 10, voiceName: "Kore" });
function company(
  mode: "auto" | "hybrid" | "scripted",
  questions: OpeningQuestion[],
  kind: "company" | "preview" = "company",
) {
  return buildSessionConfig(kind, {
    config: { ...structuredClone(defaultOpeningConfig), mode },
    questions,
    company: { name: "Northstar", logoUrl: null },
  });
}
function makeContext(config: InterviewConfig = practice()): InterviewContext {
  const initial = mockBlueprint(config, "software_engineering");
  return {
    config,
    firstName: "Jamie",
    company: "Northstar",
    roleTitle: "Backend Engineer",
    plan: {
      ...initial,
      expected_level: 3,
      technical: initial.technical.map((c) => ({
        ...c,
        start_level: 3,
        ladder: mockLadder(c.key),
      })),
    },
  };
}

it("keeps the prep cue intact with a maximum-length company scenario", () => {
  const context = makeContext();
  context.config.presentation.custom = {
    ...context.plan.presentation!,
    title: "Custom design review",
    scenario: "Explain the design to the delivery team. "
      .repeat(20)
      .slice(0, 600),
  };
  const item = basicItem("presentation", "presentation");
  const directive = compose(context, item, {
    seq: 5,
    turnIdx: 3,
    status: "time_cap",
  });
  expect(directive.sayText).toHaveLength(700);
  expect(directive.sayText).toMatch(
    /You have thirty seconds to prepare\. I'll tell you when to begin\.$/,
  );
  expect(
    compose(context, item, { seq: 6, turnIdx: 3, mode: "presentation_begin" })
      .questionText,
  ).toBe("Custom design review");
});
function request(
  state: ReturnType<typeof startInterview>,
  overrides: Partial<StrategistInput> = {},
): StrategistInput {
  return {
    event: "answer_end",
    directiveSeq: state.lastDirective.seq,
    turnIdx: state.turnIdx,
    answerStatus: "complete",
    transcript: "A calm answer about the question.",
    elapsedMs: 33000,
    timings: {
      askStartMs: 1000,
      askEndMs: 3000,
      answerStartMs: 4000,
      answerEndMs: 33000,
    },
    metrics: null,
    ...overrides,
  };
}
const score = mockP4(
  "A well developed answer with supporting evidence ".repeat(20),
);
const strong = { ...score, source: "mock" as const, mockTotal: 4 };

describe("staircase and Elo", () => {
  it("brackets a pass at L3 and failure at L4", () => {
    const passed = applyStaircase(newCompetency(3), 3, "pass");
    expect(passed.level).toBe(4);
    expect(applyStaircase(passed, 4, "fail")).toMatchObject({
      ceiling: 3,
      bracketed: true,
      done: true,
    });
  });
  it("ends at the ladder boundaries", () => {
    expect(applyStaircase(newCompetency(1), 1, "fail")).toMatchObject({
      ceiling: 0,
      bracketed: true,
    });
    expect(applyStaircase(newCompetency(5), 5, "pass")).toMatchObject({
      ceiling: 5,
      bracketed: true,
    });
  });
  it("uses the highest pass when the cap is reached", () => {
    const c = stepStaircase(
      { ...newCompetency(3), items: 2 },
      { level: 3, outcome: "pass" },
      3,
    );
    expect(c).toMatchObject({
      items: 3,
      ceiling: 3,
      bracketed: false,
      done: true,
    });
  });
  it("waits for a weak follow-up and keeps strong probes from moving levels", () => {
    const first = stepStaircase(
      newCompetency(3),
      { level: 3, outcome: "partial", pendingWeak: true },
      3,
    );
    expect(first).toMatchObject({ items: 1, level: 3, passed: [] });
    const resolved = stepStaircase(
      first,
      { level: 3, outcome: "pass", followUp: "weak" },
      3,
    );
    expect(resolved).toMatchObject({ items: 1, level: 4, passed: [3] });
    expect(
      stepStaircase(
        resolved,
        { level: 3, outcome: "fail", followUp: "strong" },
        3,
      ),
    ).toEqual(resolved);
  });
  it("uses the Elo expectation and clamps the estimate", () => {
    expect(expectedPerformance(3, 3)).toBe(0.5);
    expect(updateTheta(1.5, 2, 4)).toBeCloseTo(2.0433429593, 9);
    expect(updateTheta(0, 1, 0)).toBe(0);
    expect(updateTheta(5, 5, 4)).toBe(5);
  });
});

describe("selection, queues and company items", () => {
  it("orders each mode and injects optional technical questions into the ladder", () => {
    const questions = [
      q("1", { phase: "behavioral", mustAsk: false }),
      q("2", { phase: "behavioral" }),
      q("3", { mustAsk: false, competencyKey: "dsa", difficulty: 3 }),
      q("4"),
      q("5", { mustAsk: false, competencyKey: null }),
    ];
    const a = makeContext(company("auto", questions)),
      h = makeContext(company("hybrid", questions)),
      s = makeContext(company("scripted", questions));
    expect(
      buildQueues(a.config, a.plan).behavioral?.map((entry) => entry.ref),
    ).toEqual(["b1", "b2", "b3"]);
    expect(
      buildQueues(h.config, h.plan).behavioral?.map((entry) => entry.ref),
    ).toEqual(["2", "1", "b1", "b2", "b3"]);
    expect(
      buildQueues(h.config, h.plan).technical?.map((entry) => entry.ref),
    ).toEqual(["4", "5"]);
    expect(
      buildQueues(s.config, s.plan).behavioral?.map((entry) => entry.ref),
    ).toEqual(["1", "2"]);
    expect(
      pickLadder(h.plan.technical[0], newCompetency(3), h.config)?.questionId,
    ).toBe("3");
  });
  it("searches adjacent levels in the correct order", () => {
    const ctx = makeContext(),
      spec = ctx.plan.technical[0];
    const used = spec.ladder[3].map((item) => item.id);
    expect(
      pickLadder(
        spec,
        { ...newCompetency(3), usedQuestionIds: used },
        ctx.config,
      )?.level,
    ).toBe(4);
  });
  it("respects reserve, budget and the follow-up grace window", () => {
    const ctx = makeContext(),
      state = startInterview(ctx);
    state.phase = "technical";
    state.phaseIndex = 2;
    state.phaseStartedMs = 120000;
    expect(reserveFor(ctx.config, 2)).toBe(150000);
    expect(phaseLimits(state, ctx.config, 360000)).toMatchObject({
      underBudget: false,
      allowFollowUp: true,
    });
    expect(phaseLimits(state, ctx.config, 405000).allowFollowUp).toBe(false);
    expect(phaseLimits(state, ctx.config, 400000).underBudget).toBe(false);
    selectNext(state, ctx, 400000);
    expect(
      Object.values(state.technical.comps).every((c) => c.notAssessed),
    ).toBe(true);
  });
  it("asks must-ask questions over budget without follow-ups and marks forced misses", () => {
    const ctx = makeContext(
      company("hybrid", [
        q("1", { phase: "behavioral" }),
        q("2", { phase: "behavioral" }),
      ]),
    );
    const s = startInterview(ctx);
    s.phase = "behavioral";
    s.phaseIndex = ctx.config.phaseOrder.indexOf("behavioral");
    s.phaseStartedMs = 0;
    const at = (ctx.config.phaseBudgetsMs.behavioral ?? 0) + 45000;
    const item = selectNext(s, ctx, at);
    expect(item).toMatchObject({
      openingQuestionId: "1",
      maxFollowUps: 0,
      mustAsk: true,
    });
    const result = transition(
      s,
      ctx,
      request(s, {
        event: "force_close",
        elapsedMs: ctx.config.hardCapMs - 30000,
      }),
      strong,
    );
    expect(result.state.lastDirective.mode).toBe("close");
    expect(result.state.coverage["2"].status).toBe("unasked");
  });
  it("updates company Elo without moving the staircase", () => {
    const ctx = makeContext(
      company("hybrid", [
        q("1", { competencyKey: "dsa", difficulty: 3, maxFollowUps: 0 }),
      ]),
    );
    const state = startInterview(ctx);
    state.phase = "technical";
    state.phaseIndex = 3;
    state.current = companyItem(ctx.config.customQuestions[0], ctx.config);
    state.queues.technical![0].done = true;
    state.coverage["1"] = { status: "asked", turnIdx: 0 };
    const result = transition(state, ctx, request(state), strong);
    expect(result.state.technical.comps.dsa).toMatchObject({
      theta: updateTheta(2.5, 3, 4),
      items: 0,
      passed: [],
      failed: [],
    });
  });
  it("returns the cached directive without an evaluation for stale requests", () => {
    const ctx = makeContext(),
      initial = startInterview(ctx);
    const progress = transition(initial, ctx, request(initial), strong);
    const duplicate = transition(progress.state, ctx, request(initial), strong);
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.state).toBe(progress.state);
    expect(duplicate.scores).toBeUndefined();
  });
});

describe("scoring and wording", () => {
  it.each([
    ["lenient", 2.5, 1.5],
    ["balanced", 2.75, 1.75],
    ["strict", 3, 2],
  ] as const)("applies %s thresholds", (strictness, pass, fail) => {
    expect(outcomeFor("technical", pass, strictness)).toBe("pass");
    expect(outcomeFor("technical", fail, strictness)).toBe("partial");
    expect(outcomeFor("technical", fail - 0.01, strictness)).toBe("fail");
  });
  it("gates strong follow-ups by intensity, depth and provenance", () => {
    const ctx = makeContext(),
      ai = pickLadder(ctx.plan.technical[0], newCompetency(3), ctx.config)!;
    const scores = buildScores(
      "technical",
      { ...score.output, rubric: { ...score.output.rubric, depth: 2 } },
      "mock",
      "balanced",
    );
    expect(strongFollowUp(ai, scores, "low")).toBe(false);
    expect(strongFollowUp(ai, scores, "medium")).toBe(true);
    expect(strongFollowUp(ai, scores, "medium", true)).toBe(false);
    const custom = companyItem(
      q("1", { maxFollowUps: 2 }),
      company("hybrid", []),
    );
    expect(custom.maxFollowUps).toBe(2);
    expect(strongFollowUp(custom, scores, "medium")).toBe(false);
    expect(strongFollowUp(custom, scores, "high")).toBe(true);
    const config = company("scripted", []);
    config.ai.allowFollowUps = false;
    expect(companyItem(q("2"), config).maxFollowUps).toBe(0);
  });
  it("composes spoken phases, neutral acknowledgements, and full directive templates", () => {
    expect(neutralAck("Exactly right!", 1)).toBe("Okay.");
    expect(neutralAck("One two three four five six seven eight nine", 2)).toBe(
      "Thanks.",
    );
    expect(
      phaseListSpoken([
        "intro_calibration",
        "behavioral",
        "technical",
        "close",
      ]),
    ).toBe(
      "a few questions about your experience and some technical questions",
    );
    const p = makeContext(),
      c = makeContext(company("hybrid", [q("1", { phase: "cv_deep_dive" })]));
    const intro = basicItem(
      "calibration",
      "intro_calibration",
      calibrationQuestion,
    );
    expect(compose(p, intro, { seq: 1, turnIdx: 0 }).sayText).toContain(
      "the Backend Engineer role at Northstar",
    );
    expect(compose(c, intro, { seq: 1, turnIdx: 0 }).sayText).toContain(
      "I'm Alex from Northstar",
    );
    const opts = { seq: 2, turnIdx: 1, previous: intro, ack: "Thanks." };
    expect(
      compose(c, companyItem(c.config.customQuestions[0], c.config), opts)
        .sayText,
    ).toBe(
      "Thanks. I'd like to start with your background. Company question 1?",
    );
    expect(
      compose(p, basicItem("behavioral", "behavioral", "What changed?"), opts)
        .sayText,
    ).toContain("Let's talk about");
    expect(
      compose(p, basicItem("technical", "technical", "Why?"), {
        ...opts,
        status: "no_response",
      }).sayText,
    ).toMatch(/^No problem/);
    expect(
      compose(p, basicItem("presentation", "presentation"), opts).presentation
        ?.prepMs,
    ).toBe(30000);
    expect(
      compose(p, basicItem("presentation", "presentation"), {
        ...opts,
        mode: "presentation_begin",
      }).sayText,
    ).toContain("Please begin");
    expect(
      compose(p, basicItem("presentation", "presentation"), {
        ...opts,
        mode: "presentation_interrupt",
        wording: "What changed?",
      }).sayText,
    ).toContain("Sorry to jump in.");
    expect(
      compose(
        p,
        basicItem("presentation_followup", "presentation", "What changed?"),
        opts,
      ).cardLabel,
    ).toBe("Presentation · Follow-up");
    expect(
      compose(p, basicItem("candidate_questions", "candidate_questions"), opts)
        .sayText,
    ).toContain("Do you have any questions");
    const close = basicItem("close", "close");
    expect(compose(p, close, opts).sayText).toContain(
      "Your detailed feedback report",
    );
    expect(compose(c, close, opts).sayText).toContain(
      "You'll see your feedback",
    );
    c.config.feedbackVisibility = "none";
    expect(compose(c, close, { ...opts, status: "skipped" }).sayText).toContain(
      "The team at Northstar will review",
    );
  });
});
