import type { Directive } from "@/types/interview";
import type { InterviewerClient, LiveListener } from "./directives";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null;
};
export class MockInterviewerClient implements InterviewerClient {
  private current: Directive | null = null;
  private speech: Recognition | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private open = false;
  private simulated = false;
  constructor(private readonly emit: LiveListener) {}
  async connect() {
    this.open = true;
    this.simulated = navigator.webdriver;
    const SpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!SpeechRecognition || this.simulated) return;
    const recognition = new SpeechRecognition();
    this.speech = recognition;
    recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript.trim()).join(" ");
      this.emit({ type: "inputTranscript", text: transcript, replace: true });
    };
    recognition.onerror = () => { recognition.onend = null; };
  }
  private speak(text: string, answers: boolean) {
    if (this.timer) clearTimeout(this.timer);
    try { this.speech?.abort(); } catch { /* Recognition may be idle. */ }
    const done = () => {
      if (!this.open) return;
      this.emit({ type: "modelTurnComplete" });
      if (answers) try { this.speech?.start(); } catch { /* Simulated answers remain available. */ }
    };
    const synthesis = window.speechSynthesis;
    const voice = synthesis?.getVoices().find((voice) => voice.lang === "en-US" && voice.localService);
    if (voice && !this.simulated) {
      const say = new SpeechSynthesisUtterance(text);
      say.lang = "en-US"; say.voice = voice;
      let end = 0;
      say.onstart = () => this.emit({ type: "speechStarted" });
      say.onboundary = (event) => {
        const next = event.charIndex + (event.charLength || (text.slice(event.charIndex).match(/^\S+/)?.[0].length ?? 0));
        if (next > end) { this.emit({ type: "outputTranscript", text: text.slice(end, next) }); end = next; }
      };
      say.onend = () => { if (end < text.length) this.emit({ type: "outputTranscript", text: text.slice(end) }); done(); };
      say.onerror = () => this.captionFallback(text, done);
      synthesis.speak(say);
    } else this.captionFallback(text, done);
  }
  private captionFallback(text: string, done: () => void) {
    this.emit({ type: "speechStarted" });
    if (this.simulated) {
      this.emit({ type: "outputTranscript", text });
      this.timer = setTimeout(done, 50);
      return;
    }
    const words = text.match(/\S+\s*/g) ?? [];
    const step = () => {
      const word = words.shift();
      if (!word || !this.open) { done(); return; }
      this.emit({ type: "outputTranscript", text: word });
      this.timer = setTimeout(step, 385);
    };
    step();
  }
  deliverDirective(directive: Directive) { this.current = directive; this.speak(directive.sayText, directive.expectAnswer); }
  sendAudio() {}
  sendFrame() {}
  sendText() { if (this.current) this.speak(this.current.questionText ?? this.current.sayText, true); }
  close() {
    this.open = false; if (this.timer) clearTimeout(this.timer);
    this.speech?.abort(); window.speechSynthesis?.cancel();
  }
}
