import type { SessionRow, TurnRow } from "@/lib/db/schema";
import {
  buildSessionConfig,
  defaultOpeningConfig,
} from "@/lib/config/sessionConfig";
import { mockBlueprint, mockLadder } from "@/lib/ai/mock/fixtures";
import { buildScores, mockP4 } from "@/lib/strategist/scoring";
import { defaultCalibration } from "@/lib/vision/features";
import type {
  Baseline,
  ItemKind,
  MetricSecond,
  NonverbalPolicy,
  SessionEvent,
} from "@/types/interview";
import type { FinalVoice, PitchFrame, WordTrack } from "@/types/report";
export function goldenFixture(policy: NonverbalPolicy) {
  const config = buildSessionConfig("company", {
    config: {
      ...structuredClone(defaultOpeningConfig),
      evaluation: {
        ...defaultOpeningConfig.evaluation,
        nonverbalPolicy: policy,
      },
    },
    questions: [],
    company: { name: "Northstar", logoUrl: null },
  });
  const blueprint = mockBlueprint(config, "software_engineering");
  const session: SessionRow = {
    id: "golden",
    userId: "candidate",
    kind: "company",
    orgId: "org",
    openingId: "opening",
    invitationId: "invite",
    cvId: null,
    company: "Northstar",
    roleTitle: "Backend Engineer",
    roleFamily: "software_engineering",
    seniority: "mid",
    jobDescription: null,
    lengthMinutes: 20,
    voiceName: "Kore",
    aiMode: "mock",
    status: "ended",
    config,
    plan: {
      ...blueprint,
      expected_level: 3,
      technical: [
        {
          ...blueprint.technical[0],
          key: "dsa",
          start_level: 2,
          ladder: mockLadder("dsa"),
        },
      ],
    },
    strategistState: null,
    calibration: defaultCalibration,
    baseline: null,
    t0EpochMs: 0,
    startedAt: new Date(0),
    lastActiveAt: null,
    endedAt: new Date(120000),
    durationMs: 120000,
    endReason: "completed",
    media: {},
    consent: null,
    error: null,
    createdAt: new Date(0),
  };
  const baseline: Baseline = {
    source: "measured",
    window: { startMs: 7000, endMs: 30000 },
    fields: {
      eyeContact: 0.8,
      blinkPerMin: 0,
      smile: 0.15,
      browTension: 0.15,
      lipPress: 0.1,
      expressiveness: 0.05,
      fidgetFrac: 0,
      gestureFrac: 0.35,
      selfTouchPerMin: 0,
      neckRatio: 0.7,
      swayStd: 0.01,
      rmsDb: -25,
      pitchMedianSt: 0,
      pitchRangeSt: 7,
      wpm: 145,
      fillerPerMin: 0,
      hedgePerMin: 0,
    },
  };
  const timeline: MetricSecond[] = Array.from({ length: 120 }, (_, t) => ({
    t,
    fv: 1,
    mf: 0,
    ec: 0.8,
    gy: 0,
    gp: 0,
    hy: 0,
    hp: 0,
    hr: 0,
    bl: 0,
    nd: 0,
    sm: 0.15,
    bt: 0.15,
    lp: 0.1,
    jo: 0.15,
    xv: Array(10).fill(0.05),
    pv: 1,
    nr: 0.7,
    sl: 0,
    lr: 1,
    st: 0,
    sw: 0.01,
    ac: 0,
    hv: 1,
    gs: 0.35,
    fg: 0,
    tc: 0,
    rms: -25,
    vad: 1,
    f0: t % 2 ? 4 : -3,
    vf: 1,
    s: t % 30 >= 2 ? "L" : "A",
    ti: Math.floor(t / 30),
  }));
  const pitch: PitchFrame[] = timeline.map((item) => ({
    tMs: item.t * 1000,
    st: item.f0,
    rmsDb: -25,
  }));
  const words: WordTrack = {
    words: [
      { w: "system", s: 62000, e: 62500 },
      { w: "throughput", s: 62600, e: 62800 },
      { w: "latency", s: 62900, e: 63300 },
    ],
    segments: [],
  };
  const events: SessionEvent[] = [
    {
      id: "one",
      category: "integrity",
      type: "tab_hidden",
      startMs: 31000,
      endMs: 32000,
      severity: 0.03,
      turnIdx: 1,
      data: {},
      snapshotPath: null,
    },
    {
      id: "two",
      category: "positive",
      type: "warm_smile",
      startMs: 93000,
      endMs: 94000,
      severity: 0.3,
      turnIdx: 3,
      data: {},
      snapshotPath: null,
    },
  ];
  const voice: FinalVoice = {
    wordCount: 58,
    speakingMs: 24000,
    wpm: 145,
    responseLatencyMs: 1000,
    longPauses: { count: 0, totalMs: 0 },
    hardFillers: 0,
    softFillers: 0,
    fillerPerMin: 0,
    hedges: 0,
    hedgePerMin: 0,
    iRatio: null,
    pitchMedianSt: 0,
    pitchRangeSt: 7,
    uptalkRate: null,
    rmsMedianDb: -25,
  };
  const kinds: ItemKind[] = [
    "calibration",
    "behavioral",
    "technical",
    "presentation",
  ];
  const turns: TurnRow[] = kinds.map((itemKind, idx) => {
    const total = itemKind === "technical" ? 4 : 3;
    const model = mockP4("example ".repeat(total === 4 ? 130 : 80));
    const scores = buildScores(itemKind, model.output, "mock", "balanced", {
      mockTotal: total,
      interrupt: true,
    });
    const start = idx * 30000;
    return {
      id: "turn-" + idx,
      sessionId: session.id,
      idx,
      phase:
        itemKind === "calibration"
          ? "intro_calibration"
          : (itemKind as "behavioral" | "technical" | "presentation"),
      itemKind,
      questionSource: idx === 0 ? "system" : "ai_plan",
      openingQuestionId: null,
      competencyKey: itemKind === "technical" ? "dsa" : null,
      questionId: null,
      isFollowUp: false,
      difficulty: itemKind === "technical" ? 2 : null,
      questionText: "Explain your decision.",
      sayText: "Explain your decision.",
      askStartMs: start,
      askEndMs: start + 2000,
      answerStartMs: start + 2000,
      answerEndMs: start + 30000,
      answerStatus: "complete",
      answerTranscriptLive: "A synthetic answer.",
      answerTranscriptFinal: "A synthetic answer.",
      scores,
      scoreTotal: total,
      strategistOutput: null,
      liveMetrics: null,
      finalMetrics: {
        voice,
        vision: { selfTouchCount: 0, lowVolumeMs: 0 },
        stress: 0.25,
        composure: 75,
      },
      tone: null,
      createdAt: new Date(0),
    };
  });
  return { session, turns, baseline, timeline, pitch, events, words };
}
