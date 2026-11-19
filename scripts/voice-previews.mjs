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
    httpOptions: { apiVersion: "v1beta" },
  });
  const model = process.env.MODEL_TTS || "gemini-3.8-flash-lite-tts";
  const style =
    "Speak as a calm, professional interviewer at a natural pace.";
  const previewText =
    "Hi, I’ll be interviewing you today. Take your time with each answer.";
  const previews = await Promise.all(
    ["Kore", "Charon"].map(async (voice) => {
      const reply = await client.interactions.create({
        stream: false,
        model,
        store: false,
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice }] },
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text: previewText,
                annotations: [{ type: "speech_metadata", style }],
              },
            ],
          },
        ],
      });
      const encoded =
        reply.output_audio?.data ??
        reply.steps
          ?.slice()
          .reverse()
          .find((step) => step.type === "model_output")
          ?.content?.find((part) => part.type === "audio")?.data ??
        "";
      const audio = Buffer.from(encoded, "base64");
      if (
        audio.length < 44 ||
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
