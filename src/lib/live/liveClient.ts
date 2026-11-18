import {
  GoogleGenAI,
  FunctionResponseScheduling,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { send } from "@/lib/utils/client";
import type { Directive } from "@/types/interview";
import {
  decodePCM,
  directiveText,
  encodePCM,
  type InterviewerClient,
  type LiveListener,
} from "./directives";

export class LiveInterviewerClient implements InterviewerClient {
  private socket: Session | null = null;
  private intentional = false;
  constructor(private readonly emit: LiveListener) {}
  async connect(sessionId: string, resumptionHandle?: string) {
    this.intentional = false;
    const { token, model } = await send<{ token: string; model: string }>(
      "/api/live/token",
      "POST",
      { sessionId, resumptionHandle },
      AbortSignal.timeout(8000),
    );
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: "v1alpha" },
    });
    let ready: () => void, reject: (error: unknown) => void;
    const setup = new Promise<void>((resolve, fail) => {
      ready = resolve;
      reject = fail;
    });
    void setup.catch(() => {});
    const timer = setTimeout(
      () => reject(new Error("The interviewer did not finish connecting.")),
      8000,
    );
    try {
      this.socket = await ai.live.connect({
        model,
        config: {},
        callbacks: {
          onopen: () => {},
          onmessage: (message) => {
            if (message.setupComplete) ready();
            this.message(message);
          },
          onerror: (error) => {
            reject(error);
            this.emit({ type: "error", error });
          },
          onclose: () => {
            reject(new Error("The interviewer connection closed."));
            this.emit({ type: "closed", intentional: this.intentional });
          },
        },
      });
      await setup;
    } catch (error) {
      this.close();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  private message(msg: LiveServerMessage) {
    const content = msg.serverContent;
    if (content?.interrupted) this.emit({ type: "interrupted" });
    for (const part of content?.modelTurn?.parts ?? []) {
      if (
        part.inlineData?.mimeType?.startsWith("audio/") &&
        part.inlineData.data
      )
        this.emit({
          type: "audioChunk",
          audio: decodePCM(part.inlineData.data),
        });
    }
    if (content?.outputTranscription?.text)
      this.emit({
        type: "outputTranscript",
        text: content.outputTranscription.text,
      });
    if (content?.inputTranscription?.text)
      this.emit({
        type: "inputTranscript",
        text: content.inputTranscription.text,
      });
    if (content?.turnComplete) this.emit({ type: "modelTurnComplete" });
    for (const call of msg.toolCall?.functionCalls ?? [])
      if (call.id && call.name)
        this.emit({
          type: "toolCall",
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        });
    const resumption = msg.sessionResumptionUpdate;
    if (resumption?.resumable && resumption.newHandle)
      this.emit({ type: "resumptionHandle", handle: resumption.newHandle });
    if (msg.goAway)
      this.emit({
        type: "goAway",
        timeLeftMs: Math.round(parseFloat(msg.goAway.timeLeft ?? "0") * 1000),
      });
  }
  deliverDirective(directive: Directive, pendingToolCallId: string | null) {
    if (pendingToolCallId) {
      this.socket?.sendToolResponse({
        functionResponses: [
          {
            id: pendingToolCallId,
            name: "next_step",
            response: {
              directive_seq: directive.seq,
              mode: directive.mode,
              say: directive.sayText,
            },
            scheduling: FunctionResponseScheduling.WHEN_IDLE,
          },
        ],
      });
    } else
      this.socket?.sendClientContent({
        turns: [{ role: "user", parts: [{ text: directiveText(directive) }] }],
        turnComplete: true,
      });
  }
  respond(id: string, name: string, response: Record<string, unknown>) {
    this.socket?.sendToolResponse({
      functionResponses: [
        { id, name, response, scheduling: FunctionResponseScheduling.SILENT },
      ],
    });
  }
  sendAudio(frame: Int16Array) {
    this.socket?.sendRealtimeInput({
      audio: { data: encodePCM(frame), mimeType: "audio/pcm;rate=16000" },
    });
  }
  sendFrame(data: string) {
    this.socket?.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
  }
  sendText(text: string) {
    this.socket?.sendRealtimeInput({ text });
  }
  close() {
    this.intentional = true;
    this.socket?.close();
    this.socket = null;
  }
}
