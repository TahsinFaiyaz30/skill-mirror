import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ActivityHandling,
  Behavior,
  EndSensitivity,
  MediaResolution,
  Modality,
  StartSensitivity,
  type Tool,
} from "@google/genai";

const liveWebSocketState = vi.hoisted(() => ({
  createdOpts: [] as unknown[],
  urls: [] as string[],
  sentFrames: [] as Record<string, unknown>[],
  callbacks: null as {
    onopen: () => void;
    onmessage: (event: { data: string }) => void;
    onerror: (event: unknown) => void;
    onclose: (event: { code?: number; reason?: string }) => void;
  } | null,
  autoSetupComplete: true,
  hangConnect: false,
  closeCount: 0,
}));

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class WrappedGoogleGenAI extends actual.GoogleGenAI {
    constructor(options: ConstructorParameters<typeof actual.GoogleGenAI>[0]) {
      super(options);
      liveWebSocketState.createdOpts.push(options);
      (this.live as unknown as { webSocketFactory: unknown }).webSocketFactory =
        {
          create(
            url: string,
            _headers: unknown,
            callbacks: NonNullable<typeof liveWebSocketState.callbacks>,
          ) {
            liveWebSocketState.urls.push(url);
            liveWebSocketState.callbacks = callbacks;
            return {
              connect() {
                if (liveWebSocketState.hangConnect) return;
                queueMicrotask(() => {
                  callbacks.onopen();
                });
              },
              send(data: string) {
                liveWebSocketState.sentFrames.push(JSON.parse(data));
                if (
                  liveWebSocketState.sentFrames.length === 1 &&
                  liveWebSocketState.autoSetupComplete
                ) {
                  queueMicrotask(() => {
                    callbacks.onmessage({
                      data: JSON.stringify({ setupComplete: {} }),
                    });
                  });
                }
              },
              close() {
                liveWebSocketState.closeCount += 1;
                if (!liveWebSocketState.hangConnect) {
                  callbacks.onclose({ code: 1000, reason: "" });
                }
              },
            };
          },
        };
    }
  }
  return { ...actual, GoogleGenAI: WrappedGoogleGenAI };
});

import {
  attachment,
  buildTtsInteraction,
  gemini,
  geminiJSON,
  geminiJsonSchema,
  geminiLiveAuth,
  INTERVIEWER_TTS_STYLE,
  speakGemini,
} from "@/lib/ai/gemini";
import { importSchema, parsedCvSchema } from "@/lib/ai/schemas";
import { mockBlueprint, mockLadder } from "@/lib/ai/mock/fixtures";
import { buildLiveConnectConfig } from "@/lib/api/live";
import { buildSessionConfig } from "@/lib/config/sessionConfig";
import type { SessionRow } from "@/lib/db/schema";
import {
  CONNECT_TIMEOUT_MS,
  LiveInterviewerClient,
} from "@/lib/live/liveClient";
import type { LiveEvent } from "@/lib/live/directives";

function fakeWavBuffer() {
  const buf = Buffer.alloc(44 + 8);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(44, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(24000, 24);
  buf.writeUInt32LE(48000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(8, 40);
  return buf;
}

describe("Gemini Interactions API, TTS, and Live API", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    liveWebSocketState.createdOpts = [];
    liveWebSocketState.urls = [];
    liveWebSocketState.sentFrames = [];
    liveWebSocketState.callbacks = null;
    liveWebSocketState.autoSetupComplete = true;
    liveWebSocketState.hangConnect = false;
    liveWebSocketState.closeCount = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  it("uses SDK default API version for Interactions and v1alpha only for Live auth tokens", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => gemini()).toThrow("GEMINI_API_KEY is not configured.");
    expect(() => geminiLiveAuth()).toThrow("GEMINI_API_KEY is not configured.");

    process.env.GEMINI_API_KEY = "test-gemini-key";
    const standard = gemini() as unknown as {
      apiClient: { getApiVersion(): string };
      interactions: {
        getClient(): { _options: { api_version?: string } };
      };
    };
    const liveAuth = geminiLiveAuth() as unknown as {
      apiClient: { getApiVersion(): string };
    };
    expect(standard.apiClient.getApiVersion()).toBe("v1");
    expect(standard.interactions.getClient()._options.api_version).toBe("v1");
    expect(liveAuth.apiClient.getApiVersion()).toBe("v1alpha");
  });

  it("sanitizes JSON Schemas by removing $schema and maxItems > 10 while keeping small bounds", () => {
    const cvJson = geminiJsonSchema(parsedCvSchema);
    expect(cvJson).not.toHaveProperty("$schema");
    const cvProps = cvJson.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(cvProps.skills).not.toHaveProperty("maxItems");
    expect(cvProps.education).toHaveProperty("maxItems", 5);

    const importJson = geminiJsonSchema(importSchema);
    expect(importJson).not.toHaveProperty("$schema");
    const importProps = importJson.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(importProps.questions).not.toHaveProperty("maxItems");
    const itemProps = (
      importProps.questions.items as {
        properties: Record<string, Record<string, unknown>>;
      }
    ).properties;
    expect(itemProps.ideal_points).toMatchObject({ minItems: 3, maxItems: 6 });
    expect(itemProps.red_flags).toMatchObject({ minItems: 1, maxItems: 3 });
  });

  it("calls gemini-3.8-flash Interactions API without deprecated temperature and parses structured JSON", async () => {
    const captured: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const raw = await req.clone().text();
        captured.push({ url: req.url, body: JSON.parse(raw) });
        return new Response(
          JSON.stringify({
            id: "int-1",
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: '{"answer":"hello"}' }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const simpleSchema = z.object({ answer: z.string() });
    const res1 = await geminiJSON(
      { system: "sys", user: "usr" },
      simpleSchema,
      { thinking: "low", maxTokens: 900 },
    );
    expect(res1).toEqual({ answer: "hello" });

    const res2 = await geminiJSON(
      { system: "sys2", user: "usr2" },
      simpleSchema,
      {
        inline: attachment(
          "document",
          "application/pdf",
          Buffer.from("%PDF-1.4"),
        ),
      },
    );
    expect(res2).toEqual({ answer: "hello" });

    expect(captured).toHaveLength(2);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1/interactions",
    );
    expect(captured[0].body).toMatchObject({
      model: "gemini-3.8-flash",
      stream: false,
      store: false,
      system_instruction: "sys",
      input: "usr",
      generation_config: { thinking_level: "low", max_output_tokens: 900 },
      response_format: {
        type: "text",
        mime_type: "application/json",
      },
    });
    expect(captured[0].body.generation_config).not.toHaveProperty(
      "temperature",
    );
    expect(captured[0].body.generation_config).not.toHaveProperty("top_p");
    expect(captured[0].body.generation_config).not.toHaveProperty("top_k");

    // When neither thinking nor maxTokens is passed, omit generation_config entirely.
    expect(captured[1].body).not.toHaveProperty("generation_config");
    expect(captured[1].body.input).toEqual([
      { type: "text", text: "usr2" },
      {
        type: "document",
        mime_type: "application/pdf",
        data: Buffer.from("%PDF-1.4").toString("base64"),
      },
    ]);
  });

  it("retries once with field feedback on Zod error and fails fast on 400 errors", async () => {
    const schema = z.object({ count: z.number().int() });
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        bodies.push(JSON.parse(await req.clone().text()));
        call += 1;
        const text = call === 1 ? '{"count":"bad"}' : '{"count":3}';
        return new Response(
          JSON.stringify({
            id: "int-" + call,
            status: "completed",
            steps: [{ type: "model_output", content: [{ type: "text", text }] }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const parsed = await geminiJSON({ system: "sys", user: "count?" }, schema);
    expect(parsed).toEqual({ count: 3 });
    expect(bodies).toHaveLength(2);
    expect(String(bodies[1].input)).toContain("Invalid fields: count");

    const failFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "Invalid argument", code: 400 },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", failFetch);
    await expect(
      geminiJSON({ system: "sys", user: "count?" }, schema),
    ).rejects.toBeInstanceOf(Error);
    expect(failFetch).toHaveBeenCalledTimes(1);
  });

  it("builds TTS interactions with style inside speech_metadata annotations and validates WAV output", async () => {
    const prompt = "Tell me about a challenging project.";
    const ttsParams = buildTtsInteraction(prompt, "Kore");
    expect(ttsParams).toEqual({
      stream: false,
      model: "gemini-3.8-flash-lite-tts",
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: prompt,
              annotations: [
                {
                  type: "speech_metadata",
                  style: INTERVIEWER_TTS_STYLE,
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: "audio", mime_type: "audio/wav" },
      generation_config: { speech_config: [{ voice: "Kore" }] },
      store: false,
    });
    expect(ttsParams.input[0].content[0].text).toBe(prompt);

    const wav = fakeWavBuffer();
    const capturedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        capturedBodies.push(JSON.parse(await req.clone().text()));
        return new Response(
          JSON.stringify({
            id: "tts-1",
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [
                  {
                    type: "audio",
                    mime_type: "audio/wav",
                    data: wav.toString("base64"),
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const result = await speakGemini(prompt, "Charon");
    expect(result.equals(wav)).toBe(true);
    expect(capturedBodies[0]).toMatchObject({
      model: "gemini-3.8-flash-lite-tts",
      generation_config: { speech_config: [{ voice: "Charon" }] },
      response_format: { type: "audio", mime_type: "audio/wav" },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "tts-bad",
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [
                  {
                    type: "audio",
                    mime_type: "audio/l16",
                    data: Buffer.from("NOT_A_WAV_HEADER_" + "x".repeat(40)).toString(
                      "base64",
                    ),
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(speakGemini(prompt, "Kore")).rejects.toThrow(
      "Speech generation did not return WAV audio.",
    );
  });

  it("builds Gemini 3.8 Live connect config with NON_BLOCKING tools, compression, resumption, and no unsupported fields", () => {
    const config = buildSessionConfig("practice", {
      lengthMinutes: 10,
      voiceName: "Kore",
    });
    config.ai.interviewerName = "Maya";
    config.ai.toneInstructions = "Keep follow-ups crisp.";
    const blueprint = mockBlueprint(config, "software_engineering");
    const plan = {
      ...blueprint,
      expected_level: 3,
      technical: blueprint.technical.map((c) => ({
        ...c,
        ladder: mockLadder(c.key),
      })),
    };
    const session = {
      id: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      kind: "practice",
      orgId: null,
      openingId: null,
      invitationId: null,
      organizationRemoved: false,
      cvId: null,
      company: "Acme",
      roleTitle: "Backend Engineer",
      roleFamily: "software_engineering",
      seniority: "mid",
      jobDescription: null,
      lengthMinutes: 10,
      voiceName: "Charon",
      aiMode: "live",
      status: "ready",
      config,
      plan,
      strategistState: null,
      calibration: {
        gaze: { yaw0: 0, pitch0: 0, h0: 0.5, v0: 0 },
        posture: {
          neckRatio0: 0.4,
          shoulderWidth0: 0.4,
          shoulderMidX0: 0.5,
          shoulderMidY0: 0.7,
        },
        audio: { noiseFloorDb: -55, micPeakDb: -25 },
        headphones: false,
        echoSafe: true,
        device: { userAgent: "Chrome", gpu: "WebGL2", visionTier: "full" },
      },
      baseline: null,
      t0EpochMs: null,
      startedAt: null,
      lastActiveAt: null,
      endedAt: null,
      durationMs: null,
      endReason: null,
      media: {},
      consent: null,
      error: null,
      createdAt: new Date(),
    } satisfies SessionRow;

    const liveCfg = buildLiveConnectConfig(
      session,
      {
        config,
        plan,
        company: "Acme",
        roleTitle: "Backend Engineer",
        firstName: "Jamie",
      },
      "resume-handle-123",
    );

    expect(liveCfg.responseModalities).toEqual([Modality.AUDIO]);
    expect(liveCfg.speechConfig).toEqual({
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
    });
    expect(liveCfg.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_LOW);
    expect(liveCfg.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(liveCfg.sessionResumption).toEqual({ handle: "resume-handle-123" });
    expect(liveCfg.realtimeInputConfig).toEqual({
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 300,
        silenceDurationMs: 2000,
      },
      activityHandling: ActivityHandling.NO_INTERRUPTION,
    });
    const decls =
      (liveCfg.tools?.[0] as Tool | undefined)?.functionDeclarations ?? [];
    expect(decls.map((d) => [d.name, d.behavior])).toEqual([
      ["next_step", Behavior.NON_BLOCKING],
      ["flag_observation", Behavior.NON_BLOCKING],
    ]);
    const instructionText = (
      liveCfg.systemInstruction as { parts: Array<{ text: string }> }
    ).parts[0].text;
    expect(instructionText).toContain("You are Maya,");
    expect(instructionText).toContain("Keep follow-ups crisp.");
    expect(liveCfg).not.toHaveProperty("thinkingConfig");
    expect(liveCfg).not.toHaveProperty("proactivity");
    expect(liveCfg).not.toHaveProperty("enableAffectiveDialog");
  });

  it("connects LiveInterviewerClient via v1alpha constrained WebSocket, handles all events, and times out stalled handshakes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            token: "auth_tokens/ephemeral-abc",
            model: "gemini-3.8-live",
            expiresAtEpochMs: Date.now() + 60_000,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const events: LiveEvent[] = [];
    const client = new LiveInterviewerClient((event) => events.push(event));
    await client.connect(
      "00000000-0000-4000-8000-000000000001",
      "prev-handle",
    );

    expect(liveWebSocketState.createdOpts[0]).toEqual({
      apiKey: "auth_tokens/ephemeral-abc",
      httpOptions: { apiVersion: "v1alpha" },
    });
    expect(liveWebSocketState.urls[0]).toContain(
      "v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens/ephemeral-abc",
    );
    expect(liveWebSocketState.sentFrames[0]).toEqual({
      setup: { model: "models/gemini-3.8-live" },
    });

    client.deliverDirective(
      {
        seq: 1,
        turnIdx: 0,
        phase: "intro_calibration",
        phaseIndex: 0,
        mode: "ask",
        sayText: "Tell me about yourself.",
        questionText: "Tell me about yourself.",
        cardLabel: "Introduction",
        expectAnswer: true,
        maxAnswerMs: 90_000,
        presentation: null,
        endInterview: false,
      },
      null,
    );
    client.deliverDirective(
      {
        seq: 2,
        turnIdx: 1,
        phase: "behavioral",
        phaseIndex: 1,
        mode: "ask",
        sayText: "Next question.",
        questionText: "Next question.",
        cardLabel: "Behavioral",
        expectAnswer: true,
        maxAnswerMs: 180_000,
        presentation: null,
        endInterview: false,
      },
      "call-next-1",
    );
    client.respond("call-flag-1", "flag_observation", { ok: true });
    client.sendAudio(new Int16Array([100, -100]));
    client.sendAudioStreamEnd();
    client.sendFrame("abcd");
    client.sendText("Could you please repeat the question?");

    expect(liveWebSocketState.sentFrames.slice(1)).toEqual([
      {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: "[DIRECTIVE #1 | MODE=ask]\nTell me about yourself.\n[END DIRECTIVE]",
                },
              ],
            },
          ],
          turnComplete: true,
        },
      },
      {
        toolResponse: {
          functionResponses: [
            {
              id: "call-next-1",
              name: "next_step",
              response: {
                directive_seq: 2,
                mode: "ask",
                say: "Next question.",
              },
              scheduling: "WHEN_IDLE",
            },
          ],
        },
      },
      {
        toolResponse: {
          functionResponses: [
            {
              id: "call-flag-1",
              name: "flag_observation",
              response: { ok: true },
              scheduling: "SILENT",
            },
          ],
        },
      },
      {
        realtimeInput: {
          audio: {
            data: Buffer.from(new Int16Array([100, -100]).buffer).toString(
              "base64",
            ),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      },
      { realtimeInput: { audioStreamEnd: true } },
      { realtimeInput: { video: { data: "abcd", mimeType: "image/jpeg" } } },
      { realtimeInput: { text: "Could you please repeat the question?" } },
    ]);

    const pcmBytes = Buffer.from(new Int16Array([42, -42]).buffer).toString(
      "base64",
    );
    liveWebSocketState.callbacks!.onmessage({
      data: JSON.stringify({
        serverContent: {
          interrupted: true,
          inputTranscription: { text: "Hello " },
          modelTurn: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/pcm;rate=24000",
                  data: pcmBytes,
                },
              },
            ],
          },
          outputTranscription: { text: "Hi there." },
          turnComplete: true,
        },
        toolCall: {
          functionCalls: [
            {
              id: "call-2",
              name: "next_step",
              args: { reason: "answer_complete" },
            },
          ],
        },
        toolCallCancellation: { ids: ["call-1"] },
        sessionResumptionUpdate: {
          resumable: true,
          newHandle: "new-handle-999",
        },
        goAway: { timeLeft: "45s" },
      }),
    });

    expect(events).toEqual([
      { type: "interrupted" },
      { type: "inputTranscript", text: "Hello " },
      { type: "audioChunk", audio: new Int16Array([42, -42]) },
      { type: "outputTranscript", text: "Hi there." },
      { type: "modelTurnComplete" },
      {
        type: "toolCall",
        id: "call-2",
        name: "next_step",
        args: { reason: "answer_complete" },
      },
      { type: "toolCallCancelled", ids: ["call-1"] },
      { type: "resumptionHandle", handle: "new-handle-999" },
      { type: "goAway", timeLeftMs: 45000 },
    ]);

    client.close();
    expect(events.at(-1)).toEqual({ type: "closed", intentional: true });

    // Timeout during stalled WebSocket handshake
    vi.useFakeTimers();
    liveWebSocketState.hangConnect = true;
    const timeoutClient = new LiveInterviewerClient(() => {});
    const pending = timeoutClient.connect(
      "00000000-0000-4000-8000-000000000001",
    );
    const rejection = expect(pending).rejects.toThrow(
      "The interviewer did not finish connecting.",
    );
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS + 50);
    await rejection;
  });

  it("uses speech_metadata annotations without v1alpha in scripts/voice-previews.mjs", async () => {
    const script = await readFile(
      resolve(process.cwd(), "scripts/voice-previews.mjs"),
      "utf8",
    );
    expect(script).not.toContain("v1alpha");
    expect(script).toContain('"speech_metadata"');
    expect(script).toContain('"audio/wav"');
    expect(script).toContain("speech_config");
  });
});
