import { z } from "zod";
import { requireSessionAccess } from "@/lib/auth/guards";
import { voiceName } from "@/lib/ai/schemas";
import { whisper } from "@/lib/ai/groq";
import { speakGemini } from "@/lib/ai/gemini";
import { body, fail, json, route } from "@/lib/utils/http";
import { owner } from "./session";
async function pipelineSession(id: string) {
  const { session } = await requireSessionAccess(id, owner);
  if (session.aiMode !== "pipeline" || session.status !== "in_progress")
    fail("CONFLICT", "Pipeline audio is unavailable for this interview.");
  return session;
}
export const stt = route(async (request) => {
  const form = await request
    .formData()
    .catch(() => fail("BAD_REQUEST", "Upload an answer as WAV audio."));
  const id = z.uuid().parse(form.get("sessionId"));
  await pipelineSession(id);
  const file = form.get("audio");
  if (!(file instanceof File) || file.size > 4 * 1024 * 1024 || file.size < 44)
    fail("BAD_REQUEST", "Upload a WAV file of at most 4 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE" ||
    bytes.readUInt16LE(22) !== 1 ||
    bytes.readUInt32LE(24) !== 16000 ||
    bytes.readUInt16LE(34) !== 16 ||
    bytes.length - 44 > 60 * 16000 * 2
  )
    fail("BAD_REQUEST", "Use up to 60 seconds of 16 kHz mono WAV.");
  try {
    return json({ text: (await whisper(bytes, "answer.wav")).text });
  } catch {
    fail("AI_UNAVAILABLE", "We couldn't transcribe that answer.");
  }
});
export const tts = route(async (request) => {
  const {
    sessionId,
    text,
    voiceName: voice,
  } = await body(
    request,
    z.object({
      sessionId: z.uuid(),
      text: z.string().trim().min(1).max(700),
      voiceName,
    }),
  );
  const session = await pipelineSession(sessionId);
  if (voice !== session.voiceName)
    fail("BAD_REQUEST", "Use the interview's selected voice.");
  try {
    return new Response(new Uint8Array(await speakGemini(text, voice)), {
      headers: { "Content-Type": "audio/wav" },
    });
  } catch {
    fail("AI_UNAVAILABLE", "We couldn't generate interviewer audio.");
  }
});
