import type { Directive, VoiceName } from "@/types/interview";
import { pcm16 } from "@/lib/audio/engine";
import type { PlaybackBus } from "@/lib/audio/playback";
import { requestJSON } from "@/lib/utils/client";
import type { InterviewerClient, LiveListener } from "./directives";

export function wav(samples: Int16Array, rate = 16000) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, name: string) =>
    [...name].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, samples[i], true);
  return new Blob([bytes], { type: "audio/wav" });
}
export class PipelineInterviewerClient implements InterviewerClient {
  private id = "";
  private current?: Directive;
  private speech: Int16Array[] = [];
  private pending: Int16Array[] = [];
  private vad?: import("@ricky0123/vad-web").MicVAD;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private generation = 0;
  private useEnergy = false;
  constructor(
    private emit: LiveListener,
    private voice: VoiceName,
    private playback: PlaybackBus,
    private energySpeaking: () => boolean,
  ) {}
  async connect(id: string) {
    this.id = id;
    const { MicVAD } = await import("@ricky0123/vad-web");
    const { mediaSession } = await import("./mediaSession");
    try {
      this.vad = await MicVAD.new({
        startOnLoad: true,
        model: "v5",
        redemptionMs: 800,
        baseAssetPath: "/audio/vad/",
        onnxWASMBasePath: "/audio/vad/runtime/",
        getStream: async () => mediaSession.stream!,
        pauseStream: async () => {},
        onSpeechStart: () => {
          this.pending = [];
        },
        onFrameProcessed: (probabilities, frame) => {
          if (this.playback.playing) return;
          if (probabilities.isSpeech >= 0.3) this.pending.push(pcm16(frame));
        },
        onSpeechEnd: (samples) => {
          if (!this.playback.playing) this.speech.push(pcm16(samples));
          this.pending = [];
        },
        onVADMisfire: () => {
          this.pending = [];
        },
      });
    } catch {
      this.useEnergy = true;
    }
  }
  private async speaking(text: string) {
    const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    try {
      const response = await fetch("/api/pipeline/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.id,
          text,
          voiceName: this.voice,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Interview audio is unavailable.");
      const audio = await response.arrayBuffer();
      if (this.closed || generation !== this.generation) return;
      await this.playback.playWav(audio);
    } catch {
      /* The canonical question still appears. */
    }
    if (this.closed || generation !== this.generation) return;
    this.emit({ type: "speechStarted" });
    const words = text.match(/\S+\s*/g) ?? [];
    const reveal = () => {
      if (this.closed || generation !== this.generation) return;
      const word = words.shift();
      if (!word) return;
      this.emit({ type: "outputTranscript", text: word });
      this.timer = setTimeout(reveal, 1000 / 2.6);
    };
    reveal();
    this.emit({ type: "modelTurnComplete" });
  }
  deliverDirective(directive: Directive) {
    this.current = directive;
    if (directive.mode !== "presentation_interrupt") {
      this.speech = [];
      this.pending = [];
    }
    void this.speaking(directive.sayText);
  }
  sendAudio(frame: Int16Array) {
    if (this.useEnergy && this.energySpeaking() && !this.playback.playing)
      this.speech.push(frame);
  }
  sendFrame() {}
  sendText() {
    if (this.current)
      void this.speaking(this.current.questionText ?? this.current.sayText);
  }
  async transcribe() {
    const source = [...this.speech, ...this.pending];
    const total = source.reduce((amount, frame) => amount + frame.length, 0);
    if (!total) return "";
    const samples = new Int16Array(total);
    let at = 0;
    for (const chunk of source) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    const text: string[] = [];
    for (let start = 0; start < samples.length; start += 60 * 16000) {
      const body = new FormData();
      body.set("sessionId", this.id);
      body.set(
        "audio",
        wav(samples.subarray(start, start + 60 * 16000)),
        "answer.wav",
      );
      const result = await requestJSON<{ text: string }>("/api/pipeline/stt", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(15000),
      });
      text.push(result.text);
    }
    return text.join(" ");
  }
  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    void this.vad?.destroy();
  }
}
