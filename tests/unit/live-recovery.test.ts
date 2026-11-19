import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSessionConfig, toPublicConfig } from "@/lib/config/sessionConfig";
import type { InterviewerClient, LiveEvent } from "@/lib/live/directives";
import { TurnEngine } from "@/lib/live/turnEngine";
import { PipelineInterviewerClient } from "@/lib/live/pipelineClient";
import type { PlaybackBus } from "@/lib/audio/playback";
import type { Directive } from "@/types/interview";

const client = () =>
  ({
    connect: vi.fn(async () => {}),
    deliverDirective: vi.fn(),
    close: vi.fn(),
    sendAudio: vi.fn(),
    sendFrame: vi.fn(),
    sendText: vi.fn(),
  }) satisfies InterviewerClient;

function createRoom() {
  const config = toPublicConfig(
    buildSessionConfig("practice", { lengthMinutes: 10, voiceName: "Kore" }),
  );
  const engine = new TurnEngine(
    {
      session: {
        id: "test-session",
        kind: "practice",
        status: "in_progress",
        company: "Northstar",
        roleTitle: "Engineer",
        seniority: "mid",
        lengthMinutes: 10,
        voiceName: "Kore",
        aiMode: "live",
        cvId: null,
        calibration: null,
        startedAt: null,
        endedAt: null,
        durationMs: null,
        endReason: null,
      },
      config,
      planSummary: null,
    },
    vi.fn(),
    vi.fn(),
  );
  const room = engine as unknown as {
    client: InterviewerClient;
    playback: {
      gate: boolean;
      playing: boolean;
      clear: () => void;
      rms: number;
    };
    turn: { askEndMs: number | null };
    transcripts: {
      speaker: string;
      text: string;
      startMs: number;
      endMs: number;
    }[];
    reconnect: (background: boolean) => Promise<void>;
    createClient: () => Promise<InterviewerClient>;
    deliver: (directive: Directive) => void;
    handle: (event: LiveEvent) => void;
    tick: () => void;
    track: () => void;
    flushTelemetry: () => Promise<void>;
  };
  const old = client();
  const next = client();
  const clock = vi.spyOn(engine, "clock").mockReturnValue(100);
  room.client = old;
  room.playback = { playing: false, gate: true, clear: vi.fn(), rms: 0 };
  vi.spyOn(room, "createClient").mockResolvedValue(next);
  vi.spyOn(room, "track").mockImplementation(() => {});
  vi.spyOn(room, "flushTelemetry").mockResolvedValue();
  const question: Directive = {
    seq: 4,
    turnIdx: 2,
    phase: "technical",
    phaseIndex: 1,
    mode: "ask",
    sayText: "How would you investigate this?",
    questionText: "Investigate this?",
    cardLabel: "Technical",
    expectAnswer: true,
    maxAnswerMs: 100_000,
    presentation: null,
    endInterview: false,
  };
  return { engine, room, old, next, question, clock };
}

afterEach(() => vi.useRealTimers());

describe("Live connection recovery", () => {
  it("preserves each interviewer reply during candidate-led Q&A", () => {
    const { room, question, clock } = createRoom();
    room.deliver({ ...question, mode: "candidate_questions" });
    for (const [i, text] of [
      "Any questions?",
      "We pair on reviews.",
      "Usually twice a week.",
    ].entries()) {
      clock.mockReturnValue(1000 + i * 2000);
      room.handle({ type: "speechStarted" });
      room.handle({ type: "outputTranscript", text });
      clock.mockReturnValue(1900 + i * 2000);
      room.handle({ type: "modelTurnComplete" });
      room.handle({ type: "modelTurnComplete" });
      room.handle({ type: "inputTranscript", text: "Can you tell me more?" });
    }
    expect(room.transcripts.map((x) => x.text)).toEqual([
      "Any questions?",
      "We pair on reviews.",
      "Usually twice a week.",
    ]);
    expect(room.transcripts.map((x) => x.startMs)).toEqual([1000, 3000, 5000]);
  });
  it("waits for successful fallback audio before opening the answer turn", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1])));
    try {
      const events: LiveEvent[] = [];
      const playWav = vi.fn().mockResolvedValue(undefined);
      const client = new PipelineInterviewerClient(
        (e) => events.push(e),
        "Kore",
        { playWav } as unknown as PlaybackBus,
        () => false,
      );
      const { question } = createRoom();
      client.deliverDirective(question);
      await vi.waitFor(() =>
        expect(events.map((e) => e.type)).toEqual(["speechUnavailable"]),
      );
      expect(playWav).not.toHaveBeenCalled();
      client.deliverDirective(question);
      await vi.waitFor(() =>
        expect(events.map((e) => e.type)).toEqual([
          "speechUnavailable",
          "speechStarted",
          "outputTranscript",
          "modelTurnComplete",
        ]),
      );
      expect(playWav).toHaveBeenCalledOnce();
      client.close();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each([
    { background: true, mode: "ask", destination: "LISTENING" },
    {
      background: false,
      mode: "presentation_interrupt",
      destination: "PRESENTING",
    },
  ] as const)(
    "replays an incomplete $mode turn on the replacement socket",
    async ({ background, mode, destination }) => {
      vi.useFakeTimers();
      const { engine, room, old, next, question } = createRoom();
      room.deliver({ ...question, mode });
      if (!background) room.turn.askEndMs = 85;
      room.handle({ type: "speechStarted" });
      room.handle({ type: "resumptionHandle", handle: "latest-handle" });
      const reconnecting = room.reconnect(background);
      await vi.advanceTimersByTimeAsync(500);
      await reconnecting;
      expect(old.close).toHaveBeenCalledOnce();
      expect(next.connect).toHaveBeenCalledWith(
        "test-session",
        "latest-handle",
      );
      expect(next.deliverDirective).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          mode,
          seq: question.seq,
          sayText: expect.stringContaining(question.sayText),
        }),
        null,
      );
      if (!background) expect(room.turn.askEndMs).toBe(85);
      room.handle({ type: "speechStarted" });
      room.handle({ type: "modelTurnComplete" });
      expect(engine.stage).toBe(destination);
    },
  );

  it("retries speech that started without a completion and advances after the second stall", () => {
    const { engine, old, room, question, clock } = createRoom();
    room.deliver(question);
    clock.mockReturnValue(1000);
    room.handle({ type: "speechStarted" });
    clock.mockReturnValue(6999);
    room.tick();
    expect(old.deliverDirective).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(7000);
    room.tick();
    expect(old.deliverDirective).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(13000);
    room.tick();
    expect(engine.stage).toBe("LISTENING");
    expect(old.deliverDirective).toHaveBeenCalledTimes(2);
  });
});
