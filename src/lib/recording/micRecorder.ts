import { MIC_RECORD } from "@/lib/config/constants";
export class MicRecorder {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private done: Promise<void> | null = null;
  startOffsetMs = 0;
  constructor(stream: MediaStream, clock: () => number) {
    this.recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), MIC_RECORD);
    this.recorder.ondataavailable = ({ data }) => { if (data.size) this.chunks.push(data); };
    this.recorder.onstart = () => { this.startOffsetMs = Math.max(0, clock()); };
  }
  start() {
    this.done = new Promise<void>((done) => {
      this.recorder.onstop = () => done();
      this.recorder.onerror = () => done();
    });
    this.recorder.start(1000);
  }
  blob() { return new Blob(this.chunks, { type: MIC_RECORD.mimeType }); }
  async stop() { if (this.recorder.state !== "inactive") this.recorder.stop(); await this.done; return this.blob(); }
}
