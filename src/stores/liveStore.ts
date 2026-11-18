import { createStore } from "zustand/vanilla";
import type { Directive } from "@/types/interview";
export type LiveStage =
  | "CONNECTING"
  | "AI_SPEAKING"
  | "LISTENING"
  | "EVALUATING"
  | "PREP"
  | "PRESENTING"
  | "RECONNECTING"
  | "CLOSING"
  | "ENDED";
export type LiveState = {
  stage: LiveStage;
  directive: Directive | null;
  scenario: Directive["presentation"];
  elapsed: number;
  phaseElapsed: number;
  caption: string;
  transcript: string;
  tracking: "green" | "amber" | "red";
  orb: number;
  count: number;
  deviceLost: boolean;
};
export const createLiveStore = () =>
  createStore<LiveState>(() => ({
    stage: "CONNECTING",
    directive: null,
    scenario: null,
    elapsed: 0,
    phaseElapsed: 0,
    caption: "",
    transcript: "",
    tracking: "amber",
    orb: 0,
    count: 0,
    deviceLost: false,
  }));
