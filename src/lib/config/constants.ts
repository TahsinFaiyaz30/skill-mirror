export const MINUTE = 60_000;
export const FORCE_CLOSE_BEFORE_CAP_MS = 30_000;
export const PHASE_GRACE_MS = 45_000;
export const NO_RESPONSE_MS = 25_000;
export const GUARD_SILENCE_MS = 6_000;
export const PIPELINE_END_SILENCE_MS = 2_500;
export const MAX_FOLLOWUPS_PER_ITEM = 1;
export const MAX_CLARIFICATIONS_PER_ITEM = 2;
export const STRATEGIST_TIMEOUT_MS = 3_500;
export const GEMINI_STRATEGIST_TIMEOUT_MS = 4_000;
export const LIVE_AUDIO_IN_RATE = 16_000;
export const LIVE_AUDIO_CHUNK_MS = 40;
export const LIVE_AUDIO_OUT_RATE = 24_000;
export const LIVE_VIDEO_FPS = 1;
export const LIVE_VIDEO_SIZE = { width: 640, height: 360, quality: 0.6 };
export const LIVE_VAD_SILENCE_MS = 2_000;
export const LIVE_VAD_PREFIX_MS = 300;
export const LIVE_TOKEN_TTL_MS = 1_800_000;
export const LIVE_NEW_SESSION_MS = 120_000;
export const LIVE_RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
export const LIVE_RECONNECT_MAX_ATTEMPTS = LIVE_RECONNECT_BACKOFF_MS.length;
export const FACE_FPS_TARGET = 20;
export const POSE_FPS_TARGET = 10;
export const HAND_FPS_TARGET = 10;
export const DEGRADE_AVG_MS = 40;
export const SEVERE_AVG_MS = 60;
export const EYE_CONTACT_YAW_DEG = 15;
export const EYE_CONTACT_PITCH_DEG = 12;
export const EYE_YAW_GAIN_DEG = 60;
export const EYE_PITCH_GAIN_DEG = 30;
export const BLINK_CLOSE = 0.5;
export const BLINK_OPEN = 0.35;
export const GAZE_AVERSION_MIN_MS = 3000;
export const FACE_MISSING_MIN_MS = 2000;
export const MULTI_FACE_MIN_MS = 1000;
export const SELF_TOUCH_DIST_SW = 0.25;
export const SELF_TOUCH_MIN_MS = 700;
export const ARMS_CROSSED_MIN_MS = 2000;
export const SLOUCH_RATIO = 0.85;
export const SLOUCH_MIN_MS = 5000;
export const LEAN_IN_RATIO = 1.15;
export const LEAN_BACK_RATIO = 0.87;
export const SWAY_STD_SW = 0.06;
export const SWAY_MIN_MS = 4000;
export const FIDGET_JERK_THRESHOLD = 0.015;
export const FIDGET_MAX_RANGE_SW = 0.3;
export const FIDGET_MIN_MS = 3000;
export const GESTURE_SPEED_MIN = 0.2;
export const GESTURE_SPEED_MAX = 2;
export const SMILE_THRESHOLD = 0.3;
export const NOD_PITCH_RANGE_DEG = 6;
export const READING_SWEEPS = 3;
export const LANDMARK_LOG_FPS = 10;
export const SNAPSHOT_RING_SECONDS = 12;
export const MAX_SNAPSHOTS = 40;
export const PITCH_WINDOW = 1024;
export const PITCH_HOP = 512;
export const PITCH_CLARITY_MIN = 0.9;
export const PITCH_MIN_HZ = 70;
export const PITCH_MAX_HZ = 400;
export const VOICED_RMS_MIN_DB = -45;
export const VAD_ON_DB_ABOVE_FLOOR = 12;
export const VAD_ON_MS = 120;
export const VAD_HANGOVER_MS = 300;
export const LONG_PAUSE_MS = 3000;
export const FILLER_BURST = { count: 3, ms: 10000 };
export const PACE_FAST_WPM = 190;
export const PACE_SLOW_WPM = 100;
export const LOW_VOLUME_DB_BELOW_BASE = 8;
export const PITCH_SPIKE_ST = 3;
export const UPTALK_ST = 2;
export const SOFT_FILLER_PAUSE_MS = 150;
export const MIC_PASS_PEAK_DB = -35;
export const NOISY_FLOOR_DB = -40;
export const VIDEO_SEGMENT_MS = 120_000;
export const VIDEO_OVERLAP_MS = 300;
export const VIDEO_RECORD_SIZE = {
  width: 854,
  height: 480,
  frameRate: 30,
  mimeType: "video/webm;codecs=vp8,opus",
  videoBitsPerSecond: 450000,
  audioBitsPerSecond: 48000,
};
export const MIC_RECORD = {
  mimeType: "audio/webm;codecs=opus",
  audioBitsPerSecond: 32000,
};
export const PERIODIC_UPLOAD_MS = 60_000;
export const INTERRUPTED_AFTER_MS = 600_000;
export const PARTIAL_MIN_MS = 300_000;
export const MAX_ANSWER_MS = {
  intro: 0,
  calibration: 90000,
  cv_deep_dive: 180000,
  behavioral: 180000,
  technical: 180000,
  presentation: 0,
  presentation_followup: 120000,
  candidate_questions: 90000,
  close: 0,
};
export const PRACTICE_TEMPLATES = {
  10: {
    budgets: {
      intro_calibration: 90000,
      behavioral: 120000,
      technical: 240000,
      presentation: 120000,
      close: 30000,
    },
    behavioralCount: 1,
    techCount: 2,
    techMaxItems: 3,
    talkMs: 60000,
    interruptAtMs: null,
  },
  20: {
    budgets: {
      intro_calibration: 120000,
      behavioral: 270000,
      technical: 480000,
      presentation: 210000,
      candidate_questions: 90000,
      close: 30000,
    },
    behavioralCount: 2,
    techCount: 3,
    techMaxItems: 4,
    talkMs: 120000,
    interruptAtMs: 70000,
  },
} as const;
export const COMPANY_BUDGET = {
  weights: {
    cv_deep_dive: 2,
    behavioral: 3,
    technical: 5,
    presentation: 2.5,
    candidate_questions: 1,
  },
  safetyMs: 30000,
  closingMs: 30000,
  shortIntroMs: 90000,
  longIntroMs: 120000,
  questionsCapMs: 120000,
  presentationMinMs: 120000,
  presentationLongMs: 210000,
  roundMs: 15000,
  behavioralItemMs: 135000,
  cvItemMs: 150000,
  technicalItemMs: 75000,
};
export const PRESENTATION_TIMING = {
  prepMs: 30000,
  shortTalkMs: 60000,
  longTalkMs: 120000,
  interruptAtMs: 70000,
};
export const SCORING = {
  strictness: {
    lenient: { pass: 2.5, fail: 1.5 },
    balanced: { pass: 2.75, fail: 1.75 },
    strict: { pass: 3, fail: 2 },
  },
  practiceWeights: { technical: 55, behavioral: 15, cv: 0, soft: 30 },
  companyWeights: { technical: 45, behavioral: 20, cv: 15, soft: 20 },
  stressWeights: {
    blink: 0.1,
    brow: 0.1,
    lip: 0.1,
    fidget: 0.15,
    touch: 0.1,
    gaze: 0.15,
    pitch: 0.1,
    filler: 0.15,
    latency: 0.05,
  },
  levelMinimums: [0, 40, 55, 70, 85],
  levels: ["Emerging", "Developing", "Proficient", "Advanced", "Exemplary"],
  recommendationMargin: 15,
};
