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

export const CONNECT_TIMEOUT_MS = 12_000;

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
    let ready!: () => void;
    let failSetup!: (error: unknown) => void;
    let failRace!: (error: unknown) => void;
    const setup = new Promise<void>((resolve, reject) => {
      ready = resolve;
      failSetup = reject;
    });
    const aborted = new Promise<never>((_, reject) => {
      failRace = reject;
    });
    void setup.catch(() => {});
    void aborted.catch(() => {});
    let timedOut = false;
    let setupSeen = false;
    const abort = (error: unknown) => {
      failSetup(error);
      failRace(error);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      abort(new Error("The interviewer did not finish connecting."));
    }, CONNECT_TIMEOUT_MS);
    try {
      const connectPromise = ai.live.connect({
        model,
        config: {},
        callbacks: {
          onopen: () => {},
          onmessage: (message) => {
            if (message.setupComplete) {
              setupSeen = true;
              ready();
            }
            this.message(message);
          },
          onerror: (error) => {
            abort(error);
            if (!this.intentional && !timedOut)
              this.emit({ type: "error", error });
          },
          onclose: () => {
            abort(new Error("The interviewer connection closed."));
            if (!timedOut)
              this.emit({ type: "closed", intentional: this.intentional });
          },
        },
      });
      void connectPromise.then(
        (lateSocket) => {
          if (timedOut) {
            try {
              lateSocket.close();
            } catch {
              /* Ignore late socket close failures. */
            }
          }
        },
        () => {},
      );
      const socket = await Promise.race([connectPromise, aborted]);
      this.socket = socket;
      if (!setupSeen && !(socket as { setupComplete?: unknown }).setupComplete) {
        await Promise.race([setup, aborted]);
      }
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
    if (content?.inputTranscription?.text)
      this.emit({
        type: "inputTranscript",
        text: content.inputTranscription.text,
      });
    for (const part of content?.modelTurn?.parts ?? []) {
      if (
        part.inlineData?.data &&
        (!part.inlineData.mimeType ||
          part.inlineData.mimeType.startsWith("audio/"))
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
    if (content?.turnComplete) this.emit({ type: "modelTurnComplete" });
    for (const call of msg.toolCall?.functionCalls ?? [])
      if (call.id && call.name)
        this.emit({
          type: "toolCall",
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        });
    if (msg.toolCallCancellation?.ids?.length)
      this.emit({
        type: "toolCallCancelled",
        ids: msg.toolCallCancellation.ids,
      });
    const resumption = msg.sessionResumptionUpdate;
    if (resumption?.resumable && resumption.newHandle)
      this.emit({ type: "resumptionHandle", handle: resumption.newHandle });
    if (msg.goAway) {
      const seconds = parseFloat(msg.goAway.timeLeft ?? "0");
      this.emit({
        type: "goAway",
        timeLeftMs: Number.isFinite(seconds)
          ? Math.max(0, Math.round(seconds * 1000))
          : 0,
      });
    }
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
  sendAudioStreamEnd() {
    this.socket?.sendRealtimeInput({ audioStreamEnd: true });
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
