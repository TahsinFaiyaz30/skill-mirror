import {
  LIVE_AUDIO_IN_RATE,
  LIVE_AUDIO_CHUNK_MS,
  LONG_PAUSE_MS,
} from "@/lib/config/constants";
import { median, percentile, present, wordsIn } from "@/lib/utils/math";
import type { VoiceSummary } from "@/types/interview";
import type { AudioSecondPart } from "@/lib/vision/aggregator";
import { PitchTrack } from "./pitch";
import { rmsDb, VoiceActivity, type SpeechSegment } from "./vad";
const length = (LIVE_AUDIO_IN_RATE * LIVE_AUDIO_CHUNK_MS) / 1000;

export function pcm16(samples: Float32Array) {
  return Int16Array.from(samples, (value) =>
    Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)),
  );
}
export class AudioEngine {
  readonly pitch = new PitchTrack();
  readonly input = new AudioContext({ sampleRate: LIVE_AUDIO_IN_RATE });
  readonly vad: VoiceActivity;
  private rms: AudioSecondPart[] = [];
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer = new Float32Array(length);
  private offset = 0;
  constructor(
    private options: {
      now: () => number;
      noiseFloor: number;
      echo: () => boolean;
      onFrame: (frame: Int16Array, raw: Float32Array) => void;
      onMetric: (metric: AudioSecondPart) => void;
      onSpeech: (change: { startMs: number } | SpeechSegment) => void;
    },
  ) {
    this.vad = new VoiceActivity(options.noiseFloor, options.onSpeech);
  }
  async start(stream: MediaStream) {
    await this.input.audioWorklet.addModule("/audio/pcm-capture.js");
    this.source = this.input.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.input, "pcm-capture");
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) =>
      this.capture(event.data);
    const silent = this.input.createGain();
    silent.gain.value = 0;
    this.source
      .connect(this.node)
      .connect(silent)
      .connect(this.input.destination);
    await this.input.resume();
  }
  replaceMicrophone(track: MediaStreamTrack) {
    this.vad.finish();
    this.source?.disconnect();
    this.source = this.input.createMediaStreamSource(new MediaStream([track]));
    if (this.node) this.source.connect(this.node);
  }
  private capture(block: Float32Array) {
    for (let i = 0; i < block.length;) {
      const count = Math.min(block.length - i, length - this.offset);
      this.buffer.set(block.subarray(i, i + count), this.offset);
      i += count;
      this.offset += count;
      if (this.offset === length) {
        this.chunk(this.buffer.slice());
        this.offset = 0;
      }
    }
  }
  private chunk(frame: Float32Array) {
    const end = this.options.now();
    if (end < 0) return;
    const echo = this.options.echo();
    const half = frame.length / 2;
    for (let j = 0; j < 2; j++) {
      const tMs = Math.max(0, end - (1 - j) * 20);
      const db = rmsDb(frame.subarray(j * half, (j + 1) * half));
      const speech = this.vad.update(db, tMs, echo);
      const item = { tMs, rmsDb: db, speech };
      this.rms.push(item);
      this.options.onMetric(item);
    }
    for (const item of this.pitch.add(frame, end, this.vad.speaking))
      this.options.onMetric({ ...item, speech: this.vad.speaking });
    this.options.onFrame(echo ? new Int16Array(length) : pcm16(frame), frame);
  }
  summary(
    start: number | null,
    end: number,
    askEnd: number,
    transcript: string,
  ): VoiceSummary {
    const from = start ?? askEnd;
    const spans = this.vad.window(from, end);
    const speechMs = spans.reduce(
      (sum, item) => sum + item.endMs - item.startMs,
      0,
    );
    const pitches = this.pitch.frames
      .filter((f) => f.tMs >= from && f.tMs < end)
      .map((f) => f.st)
      .filter(present);
    const liveWordCount = wordsIn(transcript);
    return {
      answerMs: Math.max(0, end - from),
      speechMs,
      responseLatencyMs: start === null ? null : Math.max(0, start - askEnd),
      longPauseCount: spans.filter(
        (item, index) =>
          index > 0 && item.startMs - spans[index - 1].endMs >= LONG_PAUSE_MS,
      ).length,
      rmsMedianDb: median(
        this.rms
          .filter((f) => f.tMs >= from && f.tMs < end && f.speech)
          .map((f) => f.rmsDb),
      ),
      pitchMedianSt: median(pitches),
      pitchRangeSt: pitches.length
        ? percentile(pitches, 0.9)! - percentile(pitches, 0.1)!
        : null,
      liveWordCount,
      liveWpm: speechMs >= 5000 ? (liveWordCount * 60000) / speechMs : null,
    };
  }
  stop() {
    this.vad.finish();
    this.node?.disconnect();
    this.source?.disconnect();
    if (this.input.state !== "closed") void this.input.close();
  }
}
