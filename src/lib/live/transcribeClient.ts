import {
  GoogleGenAI,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { send } from "@/lib/utils/client";
import { encodePCM } from "./directives";
import { CONNECT_TIMEOUT_MS } from "./liveClient";

export type LiveTranscribeEvent =
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; error: unknown }
  | { type: "closed"; intentional: boolean };

type TranscribeServerContent = NonNullable<LiveServerMessage["serverContent"]> & {
  interimInputTranscription?: { text?: string };
};

export class LiveTranscribeClient {
  private socket: Session | null = null;
  private intentional = false;

  constructor(private readonly emit: (event: LiveTranscribeEvent) => void) {}

  async connect(sessionId: string) {
    this.intentional = false;
    const { token, model } = await send<{ token: string; model: string }>(
      "/api/live/transcribe-token",
      "POST",
      { sessionId },
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
      abort(new Error("Live transcription did not finish connecting."));
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
            const content = message.serverContent as
              | TranscribeServerContent
              | undefined;
            if (content?.interimInputTranscription?.text) {
              this.emit({
                type: "interim",
                text: content.interimInputTranscription.text,
              });
            }
            if (content?.inputTranscription?.text) {
              this.emit({
                type: "final",
                text: content.inputTranscription.text,
              });
            }
          },
          onerror: (error) => {
            abort(error);
            if (!this.intentional && !timedOut) {
              this.emit({ type: "error", error });
            }
          },
          onclose: () => {
            abort(new Error("Live transcription connection closed."));
            if (!timedOut) {
              this.emit({ type: "closed", intentional: this.intentional });
            }
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

  sendAudio(frame: Int16Array) {
    this.socket?.sendRealtimeInput({
      audio: { data: encodePCM(frame), mimeType: "audio/pcm;rate=16000" },
    });
  }

  sendAudioStreamEnd() {
    this.socket?.sendRealtimeInput({ audioStreamEnd: true });
  }

  close() {
    this.intentional = true;
    this.socket?.close();
    this.socket = null;
  }
}
