import * as C from "@/lib/config/constants";
import type { AnswerStatus, Baseline, Directive, EndReason, MetricState, SessionEvent, SessionMedia, SessionPublic, StrategistInput } from "@/types/interview";
import type { LiveStage } from "@/stores/liveStore";
import { createLiveStore } from "@/stores/liveStore";
import { send } from "@/lib/utils/client";
import { AudioEngine } from "@/lib/audio/engine";
import { PlaybackBus } from "@/lib/audio/playback";
import { mixedRecordingStream } from "@/lib/audio/mixer";
import { writePitchTrack } from "@/lib/audio/pitch";
import { VisionAggregator, computeBaseline, summarizeVision } from "@/lib/vision/aggregator";
import { EventDetector, makeEvent, perTurnEvents } from "@/lib/vision/events";
import { preloadVision, VisionEngine } from "@/lib/vision/engine";
import { writeLandmarkLog } from "@/lib/vision/landmarkLog";
import { MicRecorder } from "@/lib/recording/micRecorder";
import { SegmentRecorder } from "@/lib/recording/segmentRecorder";
import { SnapshotRing } from "@/lib/recording/snapshotRing";
import { gzip, patchMedia, uploader } from "@/lib/recording/uploader";
import { mediaSession } from "./mediaSession";
import { REPEAT_QUESTION, type InterviewerClient, type LiveEvent } from "./directives";

type ActiveTurn = {
  directive: Directive; askStartMs: number | null; askEndMs: number | null; answerStartMs: number | null; speechMsAccum: number;
  lastSpeechEndMs: number | null; transcript: string; aiText: string; submitted: boolean; toolId: string | null;
  start: number; complete: boolean; relayed: boolean; retry: number;
};
type PendingEnd = { endReason: EndReason; durationMs: number; baseline: Baseline; media: SessionMedia };
export const pendingEndKey = (id: string) => "skill-mirror:end:" + id;
const stageCode: Partial<Record<LiveStage, MetricState>> = { AI_SPEAKING:"A", LISTENING:"L", EVALUATING:"E", PRESENTING:"P", PREP:"R" };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const observationSeverity: Record<string, number> = { second_person:.9, phone_use:.8, reading_notes:.8, left_frame:.6, confident_gesture:.5, looking_off_screen:.4, nervous_gesture:.4, other:.4 };

export class TurnEngine {
  readonly store = createLiveStore();
  private turn: ActiveTurn | null = null;
  private client: InterviewerClient | null = null;
  private audio: AudioEngine | null = null;
  private playback: PlaybackBus | null = null;
  private vision: VisionEngine | null = null;
  private videoRecorder: SegmentRecorder | null = null;
  private micRecorder: MicRecorder | null = null;
  private mix: Awaited<ReturnType<typeof mixedRecordingStream>> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private perfZero: number | null = null;
  private epochZero = 0;
  private readonly aggregate = new VisionAggregator();
  private readonly detector = new EventDetector((event) => this.addEvent(event));
  private readonly snapshots = new SnapshotRing();
  private readonly pending = new Map<string, SessionEvent>();
  private readonly events = new Map<string, SessionEvent>();
  private readonly snapped = new Set<string>();
  private telemetry: Promise<unknown> | null = null;
  private media: SessionMedia = {};
  private calibrationWindow: { start: number | null; end: number } | null = null;
  private lastJPEG = 0;
  private lastUpload = 0;
  private lastTelemetry = 0;
  private lastTracking = 0;
  private lastFaceSeen = 0;
  private readonly audioRing: Int16Array[] = [];
  private resumeHandle?: string;
  private reconnecting = false;
  private queuedDirective?: Directive;
  private closing = false;
  private hardClose = false;
  private presentation: { start: number | null; interruptStart: number | null; pausedMs: number; sent: boolean } = { start: null, interruptStart: null, pausedMs: 0, sent: false };
  private hidden: number | null = null;
  private blur: number | null = null;
  private hiddenSpan: { start: number; end: number } | null = null;
  private deviceAt: number | null = null;
  private disconnectedTrack: MediaStreamTrack | null = null;

  constructor(private readonly data: SessionPublic, private readonly onFinish: (end: PendingEnd) => void, private readonly onError: (error: unknown) => void) {}
  get stage() { return this.store.getState().stage; }
  private get sid() { return this.data.session.id; }
  private get base() { return "/api/sessions/" + this.sid; }
  private setStage(stage: LiveStage) { this.store.setState({ stage }); }
  readonly clock = () => this.perfZero === null ? -1 : Math.max(0, Math.round(performance.now() - this.perfZero));
  private async createClient() {
    const mode = this.data.session.aiMode;
    let client: InterviewerClient;
    const listener = (event: LiveEvent) => { if (client === this.client) this.handle(event); };
    if (mode === "mock") { const { MockInterviewerClient } = await import("./mockClient"); client = new MockInterviewerClient(listener); }
    else if (mode === "pipeline") {
      const { PipelineInterviewerClient } = await import("./pipelineClient");
      client = new PipelineInterviewerClient(listener, this.data.config.voiceName, this.playback!, () => this.audio?.vad.speaking ?? false);
    } else { const { LiveInterviewerClient } = await import("./liveClient"); client = new LiveInterviewerClient(listener); }
    return client;
  }
  async start() {
    try {
      this.setStage("CONNECTING");
      const playback = this.playback = new PlaybackBus();
      await playback.context.resume();
      const { stream, video } = await mediaSession.open();
      mediaSession.calibration = this.data.session.calibration ?? mediaSession.calibration;
      this.mix = await mixedRecordingStream(stream, playback);
      const calibration = mediaSession.calibration;
      this.audio = new AudioEngine({
        now: this.clock, noiseFloor: calibration.audio.noiseFloorDb, echo: () => calibration.echoSafe && (this.playback?.playing || this.stage === "AI_SPEAKING"),
        onFrame: (frame) => {
          if (this.closing) return;
          if (this.reconnecting && this.stage === "RECONNECTING") {
            this.audioRing.push(frame);
            while (this.audioRing.length > 3000 / C.LIVE_AUDIO_CHUNK_MS) this.audioRing.shift();
          } else this.client?.sendAudio(frame);
        },
        onMetric: (item) => this.aggregate.addAudio(item),
        onSpeech: (speech) => {
          if (!this.turn || this.stage !== "LISTENING" && this.stage !== "PRESENTING") return;
          if ("endMs" in speech) {
            this.turn.speechMsAccum += speech.endMs - speech.startMs; this.turn.lastSpeechEndMs = speech.endMs;
          } else {
            this.turn.answerStartMs ??= speech.startMs;
            if (this.stage === "PRESENTING") this.presentation.start = Math.min(this.presentation.start ?? Infinity, speech.startMs);
          }
        },
      });
      await this.audio.start(stream);
      if (!mediaSession.mockCalibration) {
        try {
          const { models, tier } = await preloadVision();
          this.vision = new VisionEngine(video, models, tier, {
            calibration: () => mediaSession.calibration, clock: this.clock,
            context: () => ({ state: stageCode[this.stage] ?? "X", turnIdx: this.turn?.directive.turnIdx ?? null }),
            onFrame: (frame) => { if (frame.tMs >= 0) { this.aggregate.addFrame(frame); this.detector.update(frame); } },
            onTier: (tier) => { if (this.clock() >= 0) this.addEvent(makeEvent("nonverbal","vision_tier_change",this.clock(),this.clock(),0,this.turn?.directive.turnIdx ?? null,{ tier })); },
          });
          this.vision.start();
        } catch { if (this.data.session.aiMode !== "mock") throw new Error("Vision models could not start. Return to setup and try again."); }
      }
      const client = this.client = await this.createClient();
      await client.connect(this.sid);
      this.videoRecorder = new SegmentRecorder(this.mix.stream, this.clock, ({ index, startMs, endMs, blob }) => {
        if (!blob.size) return;
        uploader.push({ sessionId: this.sid, kind: "video_segment", index, blob, commit: async (path, bytes) => {
          const segment = { index, path, startMs, endMs, bytes, uploaded: true };
          await patchMedia(this.sid, { videoSegments: [segment] });
        } });
      });
      this.micRecorder = new MicRecorder(stream, this.clock);
      this.perfZero = performance.now(); this.epochZero = Date.now();
      this.videoRecorder.start(); this.micRecorder.start();
      const result = await send<{ directive: Directive; t0EpochMs?: number }>(this.base + "/start", "POST", { t0EpochMs: this.epochZero });
      if (result.t0EpochMs) {
        const elapsed = Date.now() - result.t0EpochMs;
        this.epochZero = result.t0EpochMs; this.perfZero -= elapsed;
      }
      playback.onEmpty = () => this.speechComplete();
      this.installListeners();
      for (const track of stream.getTracks()) track.onended = () => {
        if (this.closing) return;
        this.deviceAt = this.clock(); this.disconnectedTrack = track; this.store.setState({ deviceLost: true });
      };
      this.timer = setInterval(this.tick, 80);
      this.deliver(result.directive);
    } catch (error) { this.dispose(); this.onError(error); }
  }
  private deliver(directive: Directive, toolId: string | null = null) {
    const previous = this.turn;
    const interrupt = directive.mode === "presentation_interrupt";
    this.turn = {
      directive, askStartMs: interrupt ? previous?.askStartMs ?? null : null, askEndMs: interrupt ? previous?.askEndMs ?? null : null,
      answerStartMs: interrupt ? previous?.answerStartMs ?? null : null, transcript: interrupt ? previous?.transcript ?? "" : "",
      speechMsAccum: interrupt ? previous?.speechMsAccum ?? 0 : 0, lastSpeechEndMs: interrupt ? previous?.lastSpeechEndMs ?? null : null,
      aiText: "", submitted: false, toolId: null, start: this.clock(), complete: false, relayed: false, retry: 0,
    };
    if (directive.mode === "presentation_prompt") this.presentation = { start: null, interruptStart: null, pausedMs: 0, sent: false };
    this.store.setState({ directive, scenario: directive.presentation ?? this.store.getState().scenario, caption: "", transcript: this.turn.transcript, phaseElapsed: 0 });
    if (this.playback) this.playback.gate = true;
    this.setStage("AI_SPEAKING");
    this.client?.deliverDirective(directive, toolId);
  }
  private handle(event: LiveEvent) {
    const turn = this.turn;
    if (this.closing) return;
    if (event.type === "resumptionHandle") { this.resumeHandle = event.handle; return; }
    if (event.type === "goAway") { void this.reconnect(true); return; }
    if ((event.type === "closed" && !event.intentional || event.type === "error") && this.data.session.aiMode === "live" && this.perfZero !== null) {
      void this.reconnect(false); return;
    }
    if (!turn) return;
    if (event.type === "speechStarted" || event.type === "audioChunk") {
      if (this.playback?.gate === false) return;
      if (this.stage === "AI_SPEAKING" && turn.directive.mode !== "presentation_interrupt") turn.askStartMs ??= this.clock();
      turn.relayed = true;
      if (event.type === "audioChunk") this.playback?.play(event.audio);
    } else if (event.type === "modelTurnComplete") {
      turn.complete = true; this.speechComplete();
    } else if (event.type === "interrupted" && this.stage === "AI_SPEAKING") {
      this.playback?.clear(); turn.relayed = true; turn.complete = true; this.speechComplete();
      if (this.store.getState().stage === "LISTENING") turn.answerStartMs ??= this.clock();
    } else if (event.type === "outputTranscript" && this.playback?.gate !== false) {
      turn.aiText += event.text;
      this.store.setState({ caption: turn.aiText.slice(-140) });
    } else if (event.type === "inputTranscript" && (this.stage === "LISTENING" || this.stage === "PRESENTING")) {
      turn.transcript = (event.replace ? event.text : turn.transcript + event.text).slice(0,12000);
      this.store.setState({ transcript: turn.transcript });
    } else if (event.type === "toolCall") {
      if (event.name === "flag_observation") {
        this.client?.respond?.(event.id, event.name, { ok: true });
        const kind = String(event.args.type ?? "other");
        if (!Object.hasOwn(observationSeverity, kind)) return;
        this.addEvent(makeEvent(kind === "confident_gesture" ? "positive" : "live_vision", kind, this.clock() - 1500, this.clock(), observationSeverity[kind], turn.directive.turnIdx, { description: String(event.args.description ?? "").slice(0,120) }));
      } else if (event.name === "next_step") {
        const reason = event.args.reason;
        if (turn.submitted || this.stage !== "LISTENING" || turn.directive.mode === "candidate_questions" && reason !== "no_more_questions") {
          this.client?.respond?.(event.id, event.name, { ignored: true });
        } else {
          turn.toolId = event.id;
          void this.submit("answer_end", reason === "skip_requested" ? "skipped" : "complete", undefined, true);
        }
      }
    }
  }
  private speechComplete() {
    const turn = this.turn;
    if (this.stage !== "AI_SPEAKING" || !turn || !turn.complete || this.playback?.playing) return;
    const time = this.clock(), mode = turn.directive.mode;
    if (mode !== "presentation_interrupt") { turn.askStartMs ??= time; turn.askEndMs = time; }
    if (mode === "close") {
      this.setStage("CLOSING");
      void sleep(800).then(() => this.finish("completed"));
    } else if (mode === "presentation_prompt") {
      this.setStage("PREP"); if (this.playback) this.playback.gate = false;
    } else if (mode === "presentation_begin" || mode === "presentation_interrupt") {
      if (mode === "presentation_interrupt" && this.presentation.interruptStart !== null) {
        this.presentation.pausedMs += time - this.presentation.interruptStart; this.presentation.interruptStart = null;
      } else this.presentation.start = time + 3000;
      this.setStage("PRESENTING"); if (this.playback) this.playback.gate = false;
    } else this.setStage("LISTENING");
    if (this.hardClose && mode !== "close") void this.submit("force_close","time_cap");
  }
  done(simulated?: string) {
    if (this.stage === "LISTENING") void this.submit("answer_end","complete",simulated);
    if (this.stage === "PRESENTING") void this.submit("presentation_end","complete",simulated);
  }
  repeat() { if (this.stage === "LISTENING") this.client?.sendText(REPEAT_QUESTION); }

  private async submit(event: StrategistInput["event"], status: AnswerStatus, simulated?: string, preferSpeechEnd = false) {
    const turn = this.turn;
    if (!turn || turn.submitted || this.closing) return;
    turn.submitted = true;
    const at = this.clock();
    this.setStage("EVALUATING");
    if (event === "presentation_interrupt") this.presentation.interruptStart = at;
    const finishAnswer = event !== "presentation_prep_done" && event !== "presentation_interrupt";
    let transcript = (simulated?.trim() || turn.transcript).slice(0,12000);
    if (finishAnswer && this.client?.transcribe) {
      try { transcript = (await this.client.transcribe()).slice(0,12000); } catch { /* Use available transcript. */ }
    }
    if (simulated?.trim()) turn.answerStartMs ??= turn.askEndMs ?? at;
    const askEndMs = turn.askEndMs ?? at;
    const answerEndMs = preferSpeechEnd ? Math.max(askEndMs, turn.lastSpeechEndMs ?? at) : at;
    const start = turn.answerStartMs ?? askEndMs;
    const vision = summarizeVision(this.aggregate.seconds(start, answerEndMs), [...this.events.values()], start, answerEndMs);
    const voice = this.audio?.summary(turn.answerStartMs, answerEndMs, askEndMs, transcript) ?? null;
    if (finishAnswer && turn.directive.turnIdx === 0) this.calibrationWindow = { start: turn.answerStartMs, end: answerEndMs };
    if (finishAnswer) {
      const baseline = computeBaseline(this.aggregate.seconds(), [...this.events.values()], mediaSession.calibration, this.calibrationWindow?.start ?? null, this.calibrationWindow?.end ?? null);
      for (const item of perTurnEvents(vision, baseline.fields, start, answerEndMs, turn.directive.turnIdx)) this.addEvent(item);
    }
    const payload: StrategistInput = {
      event, answerStatus: status, directiveSeq: turn.directive.seq, turnIdx: turn.directive.turnIdx, transcript, elapsedMs: at,
      timings: { askStartMs: turn.askStartMs ?? askEndMs, askEndMs, answerStartMs: turn.answerStartMs, answerEndMs }, metrics: { vision, voice },
    };
    for (let attempt = 0; attempt < 5 && !this.closing; attempt++) {
      try {
        const { directive } = await send<{ directive: Directive }>(this.base + "/strategist", "POST", payload, AbortSignal.timeout(8000));
        if (this.closing) return;
        if (this.stage === "RECONNECTING") this.queuedDirective = directive;
        else this.deliver(directive, turn.toolId);
        return;
      } catch {
        if (attempt === 1) this.client?.deliverDirective({ ...turn.directive, sayText: "Sorry, give me just a moment." }, null);
        if (attempt >= 1) await sleep(3000);
      }
    }
    if (!this.closing) await this.finish("connection_lost");
  }
  private tick = () => {
    const time = this.clock(), stage = this.stage, turn = this.turn;
    if (time < 0 || this.closing) return;
    this.store.setState({ elapsed: time, orb: this.playback?.rms ?? 0 });
    const cap = this.data.config.hardCapMs;
    if (time >= cap) { void this.finish("hard_cap"); return; }
    if (this.deviceAt !== null) {
      if (time - this.deviceAt >= 60000) void this.finish("connection_lost");
      return;
    }
    if (!this.hardClose && time >= cap - C.FORCE_CLOSE_BEFORE_CAP_MS) {
      this.hardClose = true;
      if (["LISTENING","PREP","PRESENTING"].includes(stage)) void this.submit("force_close","time_cap");
    }
    if (turn && stage === "AI_SPEAKING" && !turn.relayed && time - turn.start >= 6000) {
      if (!turn.retry) { turn.retry++; turn.start = time; this.client?.deliverDirective(turn.directive, null); }
      else { turn.askStartMs = time; turn.relayed = true; turn.complete = true; this.speechComplete(); }
    }
    if (turn?.askEndMs != null && time - turn.askEndMs > 3000 && !this.playback?.playing && stage !== "AI_SPEAKING" && this.store.getState().caption) this.store.setState({ caption: "" });
    if (turn && stage === "LISTENING") {
      const { askEndMs, answerStartMs, lastSpeechEndMs } = turn;
      const silence = this.data.session.aiMode === "pipeline" ? C.PIPELINE_END_SILENCE_MS : C.GUARD_SILENCE_MS;
      if (answerStartMs !== null && time - answerStartMs >= turn.directive.maxAnswerMs) void this.submit("answer_end","time_cap");
      else if (turn.directive.mode !== "candidate_questions" && !this.audio?.vad.speaking && !this.playback?.playing && turn.speechMsAccum >= 2000 && lastSpeechEndMs !== null && time - lastSpeechEndMs >= silence) void this.submit("answer_end","complete",undefined,true);
      else if (answerStartMs === null && askEndMs !== null && time - askEndMs >= (turn.directive.mode === "candidate_questions" ? turn.directive.maxAnswerMs : C.NO_RESPONSE_MS)) void this.submit("answer_end","no_response");
    }
    if (turn && (stage === "PREP" || stage === "PRESENTING")) {
      const presentation = this.data.config.presentation;
      const phaseElapsed = stage === "PREP" ? time - (turn.askEndMs ?? time) : Math.max(0, time - (this.presentation.start ?? time) - this.presentation.pausedMs);
      this.store.setState({ phaseElapsed });
      if (stage === "PREP" && phaseElapsed >= presentation.prepMs) void this.submit("presentation_prep_done","complete");
      if (stage === "PRESENTING" && phaseElapsed >= presentation.talkMs) void this.submit("presentation_end","time_cap");
      else if (stage === "PRESENTING" && presentation.interruptAtMs !== null && phaseElapsed >= presentation.interruptAtMs && !this.presentation.sent) {
        this.presentation.sent = true;
        this.addEvent(makeEvent("positive","presentation_interrupt",time,time,0,turn.directive.turnIdx));
        void this.submit("presentation_interrupt","interrupted_presentation");
      }
    }
    if (time - this.lastJPEG >= 1000 / C.LIVE_VIDEO_FPS && stage !== "RECONNECTING") { this.lastJPEG = time; this.jpeg(time); }
    if (time - this.lastTelemetry >= 10000) { this.lastTelemetry = time; void this.flushTelemetry(); }
    if (time - this.lastUpload >= C.PERIODIC_UPLOAD_MS) { this.lastUpload = time; void this.archive(false); }
    if (time - this.lastTracking >= 500) { this.lastTracking = time; this.track(time); }
  };

  private track(time: number) {
    if (mediaSession.mockCalibration) { this.store.setState({ tracking: "green" }); return; }
    const face = this.vision?.face?.value;
    if (face?.count === 1) this.lastFaceSeen = time;
    const metrics = summarizeVision(this.aggregate.seconds(Math.max(0,time-2000),time),[],Math.max(0,time-2000),time);
    const red = (face?.count ?? 0) >= 2 || time - this.lastFaceSeen >= 2000;
    const green = face?.count === 1 && (metrics.faceVisiblePct ?? 0) >= .8 && this.vision?.pose?.value.valid
      && !(this.vision.luma !== null && this.vision.luma < 70);
    this.store.setState({ tracking: red ? "red" : green ? "green" : "amber" });
  }
  private canvas: HTMLCanvasElement | null = null;
  private jpeg(time: number) {
    const video = mediaSession.video;
    if (!video?.videoWidth) return;
    const { width,height,quality } = C.LIVE_VIDEO_SIZE;
    const canvas = this.canvas ??= Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d")?.drawImage(video,0,0,width,height);
    const data = canvas.toDataURL("image/jpeg",quality);
    this.client?.sendFrame(data.slice(data.indexOf(",") + 1));
    canvas.toBlob((blob) => { if (blob) this.snapshots.push(time,blob); },"image/jpeg",quality);
  }
  private addEvent(event: SessionEvent) {
    this.events.set(event.id,event);
    this.pending.set(event.id,{ ...event });
    this.store.setState({ count: this.events.size });
    if (this.data.config.kind !== "practice" && event.type === "presentation_interrupt") return;
    if (this.snapped.size >= C.MAX_SNAPSHOTS || this.snapped.has(event.id) || event.severity < .4 && event.category !== "positive" && event.category !== "live_vision") return;
    const blob = this.snapshots.nearest((event.startMs + event.endMs) / 2);
    if (!blob) return;
    this.snapped.add(event.id);
    uploader.push({ sessionId: this.sid, kind: "snapshot", eventId: event.id, blob, commit: async (path) => {
      event.snapshotPath = path; this.pending.set(event.id,{ ...event }); await this.flushTelemetry();
    } });
  }
  private async flushTelemetry(): Promise<void> {
    if (this.telemetry) { await this.telemetry; if (this.pending.size) return this.flushTelemetry(); return; }
    const batch = [...this.pending.values()].slice(0,500);
    for (const item of batch) this.pending.delete(item.id);
    this.telemetry = send(this.base + "/telemetry","POST",{ events: batch }).catch(() => {
      for (const item of batch) if (!this.pending.has(item.id)) this.pending.set(item.id,item);
    }).finally(() => { this.telemetry = null; });
    await this.telemetry;
  }
  private async archive(final: boolean, mic?: Blob) {
    const now = this.clock();
    const put = (kind: "mic_audio" | "timeline" | "landmarks" | "pitch", blob: Blob) => {
      uploader.push({ sessionId: this.sid, kind, blob, commit: async (path, bytes) => {
        const key = kind === "mic_audio" ? "micAudio" : kind;
        const file = kind === "mic_audio" ? { path, bytes, durationMs: now, startOffsetMs: this.micRecorder?.startOffsetMs ?? 0 } : { path, bytes };
        await patchMedia(this.sid, { [key]: file });
      } });
    };
    const raw = mic ?? this.micRecorder?.blob();
    if (raw?.size) put("mic_audio",raw);
    const timeline = { version:1, t0EpochMs:this.epochZero, visionTier:this.vision?.tier ?? mediaSession.calibration.device.visionTier, calibration:mediaSession.calibration, seconds:this.aggregate.seconds() };
    put("timeline",await gzip(new Blob([JSON.stringify(timeline)])));
    if (final) {
      put("landmarks",await gzip(new Blob([writeLandmarkLog(this.vision?.landmarks ?? [])])));
      put("pitch",await gzip(new Blob([writePitchTrack(this.audio?.pitch.frames ?? [])])));
    }
  }
  private handleHidden = () => {
    const time = this.clock();
    if (document.hidden) { this.hidden = time; this.blur = null; }
    else if (this.hidden !== null) {
      this.hiddenSpan = { start: this.hidden, end: time };
      this.addEvent(makeEvent("integrity","tab_hidden",this.hidden,time,Math.min(1,(time-this.hidden)/30000), this.turn?.directive.turnIdx ?? null)); this.hidden = null;
    }
  };
  private handleBlur = () => { if (!document.hidden) this.blur = this.clock(); };
  private handleFocus = () => {
    if (this.blur === null) return;
    const start = this.blur, end = this.clock(); this.blur = null;
    if (this.hidden !== null || this.hiddenSpan && start < this.hiddenSpan.end && end > this.hiddenSpan.start) return;
    this.addEvent(makeEvent("integrity","window_blur",start,end,Math.min(1,(end-start)/30000),this.turn?.directive.turnIdx ?? null));
  };
  private preventLeave = (event: BeforeUnloadEvent) => { if (!this.closing && this.perfZero !== null) { event.preventDefault(); event.returnValue = ""; } };
  private installListeners() {
    document.addEventListener("visibilitychange", this.handleHidden);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
    window.addEventListener("beforeunload",this.preventLeave);
  }
  private async reconnect(background: boolean) {
    if (this.reconnecting || this.closing) return;
    this.reconnecting = true;
    const previous = this.stage;
    const old = this.client;
    if (!background) this.setStage("RECONNECTING");
    if (this.turn) this.turn.toolId = null;
    for (const backoff of C.LIVE_RECONNECT_BACKOFF_MS) {
      if (!background) await sleep(backoff);
      if (this.closing) return;
      try {
        const next = await this.createClient();
        await next.connect(this.sid,this.resumeHandle);
        if (this.closing) { next.close(); return; }
        this.client = next; old?.close(); this.reconnecting = false;
        if (!background) {
          const queued = this.queuedDirective; this.queuedDirective = undefined;
          if (queued) this.deliver(queued);
          else if (previous === "AI_SPEAKING" && this.turn && this.turn.askEndMs === null) {
            this.playback?.clear();
            const current = this.turn.directive;
            this.deliver(this.turn.askStartMs === null ? current : { ...current, sayText: "Sorry, we had a brief connection issue. " + current.sayText });
          } else this.setStage(previous);
          for (const frame of this.audioRing.splice(0)) next.sendAudio(frame);
        }
        return;
      } catch {
        if (background) { background = false; this.setStage("RECONNECTING"); }
      }
    }
    this.reconnecting = false;
    await this.finish("connection_lost");
  }
  async reconnectDevice() {
    if (!this.disconnectedTrack) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: this.disconnectedTrack.kind === "video", audio: this.disconnectedTrack.kind === "audio" });
    const track = stream.getTracks()[0];
    if (!track) throw new Error("No replacement device was found.");
    const current = mediaSession.stream;
    if (!current) { track.stop(); throw new Error("The original media stream is unavailable."); }
    current.removeTrack(this.disconnectedTrack); current.addTrack(track);
    if (mediaSession.video) { mediaSession.video.srcObject = current; await mediaSession.video.play(); }
    this.disconnectedTrack = null; this.deviceAt = null; this.store.setState({ deviceLost: false });
  }
  async finish(reason: EndReason) {
    if (this.closing) return;
    this.closing = true; this.setStage("CLOSING");
    const now = Math.max(0,this.clock());
    if (this.timer) clearInterval(this.timer);
    this.client?.close(); this.vision?.stop(); this.audio?.vad.finish();
    this.detector.finish(now);
    if (this.hidden !== null) this.addEvent(makeEvent("integrity","tab_hidden",this.hidden,now,Math.min(1,(now-this.hidden)/30000),this.turn?.directive.turnIdx ?? null));
    if (this.blur !== null) this.handleFocus();
    const baseline = computeBaseline(this.aggregate.seconds(),[...this.events.values()],mediaSession.calibration,this.calibrationWindow?.start ?? null,this.calibrationWindow?.end ?? null);
    try {
      const [, mic] = await Promise.all([this.videoRecorder?.stop(), this.micRecorder?.stop()]);
      await this.archive(true,mic);
      await this.flushTelemetry();
    } catch (error) { this.onError(error); }
    this.media.snapshotsCount = this.snapped.size;
    this.setStage("ENDED");
    this.dispose(true);
    this.onFinish({ endReason: reason, durationMs: now, baseline, media: this.media });
  }
  dispose(stopMedia = false) {
    if (this.timer) clearInterval(this.timer);
    this.client?.close(); this.audio?.stop(); this.vision?.stop(); this.playback?.stop(); this.mix?.close();
    document.removeEventListener("visibilitychange",this.handleHidden); window.removeEventListener("blur",this.handleBlur);
    window.removeEventListener("focus",this.handleFocus); window.removeEventListener("beforeunload",this.preventLeave);
    if (stopMedia) mediaSession.close();
  }
}
