import { mkdir, writeFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "Set GEMINI_API_KEY to generate the Kore and Charon previews.\n",
  );
  process.exitCode = 1;
} else {
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });
  const model = process.env.MODEL_TTS || "gemini-3.8-flash-lite-tts";
  const previews = await Promise.all(
    ["Kore", "Charon"].map(async (voice) => {
      const reply = await client.interactions.create({
        model,
        store: false,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
        input:
          "Speak as a calm, professional interviewer at a natural pace.\nHi, I’ll be interviewing you today. Take your time with each answer.",
      });
      const audio = Buffer.from(reply.output_audio?.data ?? "", "base64");
      if (
        audio.toString("ascii", 0, 4) !== "RIFF" ||
        audio.toString("ascii", 8, 12) !== "WAVE"
      )
        throw new Error(
          "The configured TTS model did not return WAV audio for " + voice,
        );
      return { voice, audio };
    }),
  );
  await mkdir("public/audio", { recursive: true });
  await Promise.all(
    previews.map(({ voice, audio }) =>
      writeFile("public/audio/voice-" + voice.toLowerCase() + ".wav", audio),
    ),
  );
}
