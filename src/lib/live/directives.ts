import type { Directive } from "@/types/interview";
export const directiveText = (directive: Directive) =>
  "[DIRECTIVE #" +
  directive.seq +
  " | MODE=" +
  directive.mode +
  "]\n" +
  directive.sayText +
  "\n[END DIRECTIVE]";
export const REPEAT_QUESTION = "Could you please repeat the question?";
export type LiveEvent =
  | { type: "audioChunk"; audio: Int16Array }
  | {
      type: "outputTranscript" | "inputTranscript";
      text: string;
      replace?: boolean;
    }
  | { type: "modelTurnComplete" | "interrupted" | "speechStarted" }
  | {
      type: "toolCall";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: "toolCallCancelled"; ids: string[] }
  | { type: "goAway"; timeLeftMs: number }
  | { type: "resumptionHandle"; handle: string }
  | { type: "closed"; intentional: boolean }
  | { type: "error"; error: unknown };
export type LiveListener = (event: LiveEvent) => void;
export interface InterviewerClient {
  connect(sessionId: string, handle?: string): Promise<void>;
  deliverDirective(
    directive: Directive,
    pendingToolCallId: string | null,
  ): void;
  sendAudio(frame: Int16Array): void;
  sendFrame(jpegBase64: string): void;
  sendText(text: string): void;
  sendAudioStreamEnd?(): void;
  close(): void;
  respond?(id: string, name: string, response: Record<string, unknown>): void;
  transcribe?(): Promise<string>;
}
export function encodePCM(frame: Int16Array) {
  const data = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
  let bytes = "";
  for (let offset = 0; offset < data.length; offset += 8192)
    bytes += String.fromCharCode(...data.subarray(offset, offset + 8192));
  return btoa(bytes);
}
export function decodePCM(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}
