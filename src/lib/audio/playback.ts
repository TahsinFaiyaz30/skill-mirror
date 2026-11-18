import { LIVE_AUDIO_OUT_RATE } from "@/lib/config/constants";
export class PlaybackBus {
  readonly context = new AudioContext({ sampleRate: LIVE_AUDIO_OUT_RATE });
  readonly analyser = this.context.createAnalyser();
  readonly bus = this.context.createGain();
  private active = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  gate = true;
  onEmpty = () => {};
  constructor() {
    this.analyser.fftSize = 256;
    this.bus.connect(this.analyser);
    this.bus.connect(this.context.destination);
  }
  get playing() {
    return this.active.size > 0;
  }
  get rms() {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return Math.min(
      1,
      Math.sqrt(data.reduce((n, p) => n + p * p, 0) / data.length) * 4,
    );
  }
  play(frame: Int16Array) {
    if (!this.gate || !frame.length) return;
    const audio = this.context.createBuffer(
      1,
      frame.length,
      LIVE_AUDIO_OUT_RATE,
    );
    audio.copyToChannel(
      Float32Array.from(frame, (sample) => sample / 32768),
      0,
    );
    this.playBuffer(audio);
  }
  private playBuffer(buffer: AudioBuffer) {
    if (!this.gate) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.bus);
    const starts = Math.max(this.context.currentTime + 0.02, this.nextStart);
    this.nextStart = starts + buffer.duration;
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      if (!this.active.size) this.onEmpty();
    };
    source.start(starts);
  }
  async playWav(bytes: ArrayBuffer) {
    this.playBuffer(await this.context.decodeAudioData(bytes));
  }
  clear() {
    for (const source of this.active) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.active.clear();
    this.nextStart = 0;
  }
  stop() {
    this.clear();
    if (this.context.state !== "closed") void this.context.close();
  }
}
