import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { geminiJSON, speakGemini, transcribeGemini } from "@/lib/ai/gemini";
import { groqJSON, whisper } from "@/lib/ai/groq";
import {
  getPoolSnapshot,
  parseKeyList,
  providerKeys,
  resetProviderPool,
  tryProviderModels,
} from "@/lib/ai/pool";

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

describe("Multi-key AI provider pool and model-outer failover", () => {
  beforeEach(() => {
    resetProviderPool();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEYS", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GROQ_API_KEYS", "");
    vi.stubEnv("MODEL_FLASH", "");
    vi.stubEnv("MODEL_FLASH_FALLBACKS", "");
    vi.stubEnv("MODEL_TTS", "");
    vi.stubEnv("MODEL_TTS_FALLBACKS", "");
    vi.stubEnv("MODEL_TRANSCRIBE", "");
    vi.stubEnv("GROQ_STRATEGIST_MODEL", "");
    vi.stubEnv("GROQ_STRATEGIST_FALLBACKS", "");
    vi.stubEnv("GROQ_WHISPER_MODEL", "");
    vi.stubEnv("GROQ_WHISPER_FALLBACKS", "");
  });

  afterEach(() => {
    resetProviderPool();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses unlimited comma-separated, plural, and numbered API keys without exposing raw secrets", () => {
    expect(parseKeyList(" \"k1\" , 'k2';k3\nk4 ")).toEqual([
      "k1",
      "k2",
      "k3",
      "k4",
    ]);

    const fakeEnv = {
      GEMINI_API_KEY: "gem-alpha-1111, gem-beta-2222",
      GEMINI_API_KEYS: "gem-beta-2222, gem-gamma-3333",
      GEMINI_API_KEY_10: "gem-ten-1010",
      GEMINI_API_KEY_2: "gem-two-0002",
      GEMINI_API_KEY_1: "gem-one-0001",
      GROQ_API_KEY: "gsk-first-aaaa, gsk-second-bbbb",
      GROQ_API_KEY_3: "gsk-three-cccc",
    } as unknown as NodeJS.ProcessEnv;

    const geminiSlots = providerKeys("gemini", fakeEnv);
    expect(geminiSlots.map((s) => [s.index, s.key, s.source])).toEqual([
      [1, "gem-alpha-1111", "GEMINI_API_KEY"],
      [2, "gem-beta-2222", "GEMINI_API_KEY"],
      [3, "gem-gamma-3333", "GEMINI_API_KEYS"],
      [4, "gem-one-0001", "GEMINI_API_KEY_1"],
      [5, "gem-two-0002", "GEMINI_API_KEY_2"],
      [6, "gem-ten-1010", "GEMINI_API_KEY_10"],
    ]);

    const groqSlots = providerKeys("groq", fakeEnv);
    expect(groqSlots.map((s) => s.key)).toEqual([
      "gsk-first-aaaa",
      "gsk-second-bbbb",
      "gsk-three-cccc",
    ]);

    const snapshot = getPoolSnapshot(fakeEnv);
    expect(snapshot.gemini.keyCount).toBe(6);
    expect(snapshot.groq.keyCount).toBe(3);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("gem-alpha");
    expect(serialized).not.toContain("gsk-first");
    expect(snapshot.gemini.keys[0].masked).toBe("…1111");
  });

  it("rotates across all Gemini keys on best model first before stepping down model ladder and skips cooled pairs", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-gem-key-1111, secret-gem-key-2222");
    vi.stubEnv("MODEL_FLASH", "gemini-4-hydrogen");

    const attempts: Array<{ model: string; key: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const key = req.headers.get("x-goog-api-key");
        const body = JSON.parse(await req.clone().text()) as { model: string };
        attempts.push({ model: body.model, key });

        if (body.model === "gemini-4-hydrogen") {
          return new Response(
            JSON.stringify({
              error: {
                message: "Rate limit exceeded (limit: 20 requests per day)",
                code: 429,
              },
            }),
            { status: 429, headers: { "content-type": "application/json" } },
          );
        }
        if (
          body.model === "gemini-3.8-flash" &&
          key === "secret-gem-key-1111"
        ) {
          return new Response(
            JSON.stringify({ error: { message: "High demand", code: 503 } }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "int-pool-ok",
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: '{"ok":true}' }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const schema = z.object({ ok: z.boolean() });
    const first = await geminiJSON({ system: "sys", user: "usr" }, schema);
    expect(first).toEqual({ ok: true });
    expect(attempts).toEqual([
      { model: "gemini-4-hydrogen", key: "secret-gem-key-1111" },
      { model: "gemini-4-hydrogen", key: "secret-gem-key-2222" },
      { model: "gemini-3.8-flash", key: "secret-gem-key-1111" },
      { model: "gemini-3.8-flash", key: "secret-gem-key-2222" },
    ]);

    const snapshot = getPoolSnapshot();
    expect(snapshot.gemini.cooldowns).toHaveLength(3);
    expect(JSON.stringify(snapshot)).not.toContain("secret-gem-key");

    // Second call skips cooled pairs and jumps directly to healthy (gemini-3.8-flash, key 2)
    attempts.length = 0;
    const second = await geminiJSON({ system: "sys", user: "usr2" }, schema);
    expect(second).toEqual({ ok: true });
    expect(attempts).toEqual([
      { model: "gemini-3.8-flash", key: "secret-gem-key-2222" },
    ]);
  });

  it("leaves time for the next model after every key on a stalled primary times out", async () => {
    vi.stubEnv(
      "GEMINI_API_KEY",
      Array.from({ length: 9 }, (_, index) => "slow-key-" + index).join(","),
    );
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const attempts: Array<[string, number]> = [];
    try {
      const result = await tryProviderModels(
        [
          { provider: "gemini", model: "primary" },
          { provider: "gemini", model: "backup" },
        ],
        30_000,
        async ({ model }, slot, _signal, timeout) => {
          attempts.push([model, slot.index]);
          if (model === "backup") {
            expect(timeout).toBeGreaterThan(1_000);
            return "ready";
          }
          now += timeout;
          throw new DOMException("Request stalled", "TimeoutError");
        },
      );
      expect(result).toBe("ready");
      expect(attempts).toEqual([
        ...Array.from({ length: 9 }, (_, index) => ["primary", index + 1]),
        ["backup", 1],
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("rotates speakGemini and transcribeGemini (plain text, no JSON response_format) across keys and models", async () => {
    vi.stubEnv("GEMINI_API_KEY", "tts-key-1, tts-key-2");
    vi.stubEnv("MODEL_TTS", "gemini-3.8-flash-tts");
    const wav = fakeWavBuffer();
    const ttsCalls: Array<{ model: string; key: string | null }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const key = req.headers.get("x-goog-api-key");
        const body = JSON.parse(await req.clone().text()) as Record<
          string,
          unknown
        >;
        ttsCalls.push({ model: String(body.model), key });

        if (body.model === "gemini-3.8-flash-tts" && key === "tts-key-1") {
          return new Response(
            JSON.stringify({ error: { message: "Rate limit", code: 429 } }),
            { status: 429, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "tts-ok",
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

    const outWav = await speakGemini("Welcome.", "Kore");
    expect(outWav.equals(wav)).toBe(true);
    expect(ttsCalls).toEqual([
      { model: "gemini-3.8-flash-tts", key: "tts-key-1" },
      { model: "gemini-3.8-flash-tts", key: "tts-key-2" },
    ]);

    resetProviderPool();
    const sttBodies: Array<{
      model: unknown;
      hasResponseFormat: boolean;
      key: string | null;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const key = req.headers.get("x-goog-api-key");
        const body = JSON.parse(await req.clone().text()) as Record<
          string,
          unknown
        >;
        sttBodies.push({
          model: body.model,
          hasResponseFormat: "response_format" in body,
          key,
        });
        return new Response(
          JSON.stringify({
            id: "stt-ok",
            status: "completed",
            output_text: "  Built a queue worker.  ",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const transcript = await transcribeGemini(new Uint8Array([1, 2, 3, 4]));
    expect(transcript).toEqual({ text: "Built a queue worker." });
    expect(sttBodies).toEqual([
      {
        model: "gemini-3.5-transcribe",
        hasResponseFormat: false,
        key: "tts-key-1",
      },
    ]);
  });

  it("rotates groqJSON and whisper across multiple Groq keys and models", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-test-1111, gsk-test-2222");
    const calls: Array<{ url: string; model?: string; key?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (req.url.startsWith("data:")) {
          return new Response("");
        }
        const auth = req.headers.get("authorization") ?? "";
        const key = auth.replace(/^Bearer\s+/i, "");
        if (req.url.includes("/chat/completions")) {
          const body = JSON.parse(await req.clone().text()) as {
            model: string;
          };
          calls.push({ url: req.url, model: body.model, key });
          if (body.model === "openai/gpt-oss-120b" && key === "gsk-test-1111") {
            return new Response(
              JSON.stringify({ error: { message: "Rate limit" } }),
              { status: 429, headers: { "content-type": "application/json" } },
            );
          }
          if (body.model === "openai/gpt-oss-120b" && key === "gsk-test-2222") {
            return new Response(
              JSON.stringify({ error: { message: "Overloaded" } }),
              { status: 503, headers: { "content-type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              id: "chatcmpl-1",
              object: "chat.completion",
              created: 1,
              model: body.model,
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: { role: "assistant", content: '{"score":4}' },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // Whisper multipart transcription endpoint
        const bodyText = await req.clone().text();
        const modelMatch = /name="model"\r?\n\r?\n([^\r\n]+)/.exec(bodyText);
        const model = modelMatch?.[1];
        calls.push({ url: req.url, model, key });
        if (key === "gsk-test-1111") {
          return new Response(
            JSON.stringify({ error: { message: "Rate limit" } }),
            { status: 429, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ text: "hello from whisper" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const evalOut = await groqJSON(
      { system: "sys", user: "usr" },
      z.object({ score: z.number() }),
      { timeout: 10_000, temperature: 0.2, maxTokens: 100 },
    );
    expect(evalOut).toEqual({ score: 4 });
    expect(calls.map((c) => [c.model, c.key])).toEqual([
      ["openai/gpt-oss-120b", "gsk-test-1111"],
      ["openai/gpt-oss-120b", "gsk-test-2222"],
      ["qwen/qwen3.8-27b", "gsk-test-1111"],
    ]);

    calls.length = 0;
    const whisperOut = await whisper(new Uint8Array([1, 2, 3, 4]), "mic.wav");
    expect(whisperOut.text).toBe("hello from whisper");
    expect(calls.map((c) => [c.model, c.key])).toEqual([
      ["whisper-large-v3-turbo", "gsk-test-1111"],
      ["whisper-large-v3-turbo", "gsk-test-2222"],
    ]);
  });
});
