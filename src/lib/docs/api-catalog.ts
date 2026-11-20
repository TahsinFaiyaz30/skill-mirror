export interface ExternalApiEntry {
  provider: string;
  protocol: string;
  modelsOrServices: string;
  purpose: string;
  auth: string;
}

export interface ExposedApiEndpoint {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  group:
    | "Sessions & Live Engine"
    | "CV & Progress"
    | "Reports & Certificates"
    | "Hiring & Openings"
    | "Organizations & Invitations"
    | "Account & Onboarding"
    | "Admin, Docs & Cron";
  auth:
    | "Public"
    | "Authenticated"
    | "Session Owner"
    | "Org Member"
    | "Org Owner"
    | "Admin Allowlist"
    | "Cron Bearer"
    | "Docs Gate";
  summary: string;
}

export const EXTERNAL_APIS: ExternalApiEntry[] = [
  {
    provider: "Google Gemini Interactions API (v1beta)",
    protocol: "HTTPS REST / JSON Schema",
    modelsOrServices:
      "gemini-4-hydrogen -> 3.8-flash -> 3.7-flash -> 3-flash-preview -> 3.5-flash-lite; 3.8-flash-tts; 3.5-transcribe",
    purpose:
      "PDF CV parsing (p1), blueprint & L1-L5 ladder planning (p2/p3), audio tone classification (p7), coaching narrative (p8), question bank import/generation (p9/p10), TTS & STT fallbacks.",
    auth: "Multi-key pool (GEMINI_API_KEY / GEMINI_API_KEYS / GEMINI_API_KEY_1..N)",
  },
  {
    provider: "Google Gemini Live API (v1alpha)",
    protocol: "Bidirectional WebSocket (ephemeral single-use tokens)",
    modelsOrServices:
      "gemini-3.8-live-extended-thinking -> gemini-3.8-live; gemini-3.5-transcribe-live",
    purpose:
      "Real-time voice + 1 FPS low-res camera interviewer with native audio output, output audio transcription, sliding-window compression, and non-blocking tools (next_step, flag_observation).",
    auth: "Server-minted ephemeral tokens (authTokens.create, uses=1, TTL 30m)",
  },
  {
    provider: "Groq Cloud LPU & Whisper API",
    protocol: "HTTPS REST / Strict JSON Schema & Verbose Audio JSON",
    modelsOrServices:
      "openai/gpt-oss-120b -> qwen/qwen3.8-27b -> openai/gpt-oss-20b; whisper-large-v3-turbo -> whisper-large-v3",
    purpose:
      "Sub-second hidden adversarial strategist scoring (p4), mid-presentation stakeholder interrupt (p6), and word-level post-interview transcript alignment.",
    auth: "Multi-key pool (GROQ_API_KEY / GROQ_API_KEYS / GROQ_API_KEY_1..N)",
  },
  {
    provider: "Supabase (Auth, PostgreSQL + RLS, Storage)",
    protocol: "HTTPS + PostgreSQL Wire Protocol (Drizzle ORM)",
    modelsOrServices:
      "Email & Google OAuth, Postgres 16 with RLS, buckets: cvs, recordings, artifacts, org-assets",
    purpose:
      "Authentication, row-level isolated relational storage, signed media upload/playback URLs, public org logos & team avatars.",
    auth: "SSR cookie sessions + server-only service role for signed storage & admin cleanup",
  },
  {
    provider: "GitHub REST API (Optional)",
    protocol: "HTTPS REST",
    modelsOrServices: "/repos/{owner}/{repo}, /languages, /readme",
    purpose:
      "Enriches up to 3 public CV repositories with language stack & README excerpts for grounded CV deep-dive questions.",
    auth: "Optional GITHUB_TOKEN bearer (public repositories only)",
  },
  {
    provider: "Gmail SMTP (Optional)",
    protocol: "SMTP over TLS",
    modelsOrServices: "Transactional candidate invitation dispatch",
    purpose:
      "Sends candidate invitation links from the configured Gmail account.",
    auth: "Server-side Gmail address and Google App Password",
  },
];

export const EXPOSED_API_ENDPOINTS: ExposedApiEndpoint[] = [
  // Sessions & Live Engine
  {
    method: "GET",
    path: "/api/sessions",
    group: "Sessions & Live Engine",
    auth: "Authenticated",
    summary: "List the signed-in candidate's practice and company interview sessions.",
  },
  {
    method: "POST",
    path: "/api/sessions",
    group: "Sessions & Live Engine",
    auth: "Authenticated",
    summary: "Create a new practice interview session (2, 10, or 20 minutes) with daily quota checks.",
  },
  {
    method: "GET",
    path: "/api/sessions/[id]",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Fetch session metadata, calibration, plan summary, and phase configuration.",
  },
  {
    method: "PATCH",
    path: "/api/sessions/[id]",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Save setup calibration baselines, device checks, and explicit recording/data consent.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/plan",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Generate interview blueprint (p2) and parallel L1-L5 competency ladders (p3).",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/start",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Start or resume a live session, lock company opening edits, and emit Directive #1.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/strategist",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Evaluate candidate turn via Groq/Gemini (p4/p6), update Elo/IRT staircase, and return next directive.",
  },
  {
    method: "POST",
    path: "/api/live/token",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Mint single-use ephemeral Gemini Live token with locked p5 persona, tools, and sliding-window config.",
  },
  {
    method: "POST",
    path: "/api/live/transcribe-token",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Mint single-use ephemeral Gemini Live Transcribe token (gemini-3.5-transcribe-live).",
  },
  {
    method: "POST",
    path: "/api/pipeline/stt",
    group: "Sessions & Live Engine",
    auth: "Authenticated",
    summary: "Fallback chunked speech-to-text via Groq Whisper with Gemini STT failover.",
  },
  {
    method: "POST",
    path: "/api/pipeline/tts",
    group: "Sessions & Live Engine",
    auth: "Authenticated",
    summary: "Fallback interviewer speech synthesis via Gemini TTS (Kore/Charon WAV).",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/upload-url",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Issue signed upload URLs for WebM video segments, mic audio, snapshots, and gzipped telemetry.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/media",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Commit uploaded capture artifacts and video segment indexes onto the session record.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/telemetry",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Batch-ingest client MediaPipe non-verbal events, live vision flags, and heartbeat pings.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/end",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Close a completed interview and enqueue the 8-step post-interview report pipeline.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/partial",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Generate a partial report for interrupted sessions meeting the minimum duration threshold.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/discard",
    group: "Sessions & Live Engine",
    auth: "Session Owner",
    summary: "Discard an abandoned or draft session and clean up unfinalized artifacts.",
  },

  // CV & Progress
  {
    method: "GET",
    path: "/api/cv",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "List uploaded candidate CVs with parse statuses and extracted skill profiles.",
  },
  {
    method: "POST",
    path: "/api/cv/upload-url",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "Issue a signed upload URL for a PDF CV (1-10 pages, <= 5 MB).",
  },
  {
    method: "POST",
    path: "/api/cv/[cvId]/parse",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "Run native Gemini PDF extraction (p1) into structured skills, experience, projects, and links.",
  },
  {
    method: "PATCH",
    path: "/api/cv/[cvId]",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "Toggle removed/excluded skills on a parsed CV prior to interview planning.",
  },
  {
    method: "DELETE",
    path: "/api/cv/[cvId]",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "Delete a stored CV record and remove its private PDF from Supabase Storage.",
  },
  {
    method: "GET",
    path: "/api/progress",
    group: "CV & Progress",
    auth: "Authenticated",
    summary: "Return longitudinal Elo/IRT technical competency curves and soft-skill history across sessions.",
  },

  // Reports & Certificates
  {
    method: "POST",
    path: "/api/sessions/[id]/process",
    group: "Reports & Certificates",
    auth: "Session Owner",
    summary: "Advance the lease-locked 8-step report pipeline (verify, Whisper, align, rescore, p7 tone, score, p8 narrate, finalize).",
  },
  {
    method: "GET",
    path: "/api/sessions/[id]/status",
    group: "Reports & Certificates",
    auth: "Session Owner",
    summary: "Poll real-time report processing step and completion percentage (0-100%).",
  },
  {
    method: "GET",
    path: "/api/sessions/[id]/report",
    group: "Reports & Certificates",
    auth: "Session Owner",
    summary: "Retrieve the structured scorecard, composure curve, key moments, and coaching drills (visibility-filtered for company invites).",
  },
  {
    method: "GET",
    path: "/api/sessions/[id]/playback",
    group: "Reports & Certificates",
    auth: "Session Owner",
    summary: "Mint signed playback URLs for synced WebM clips, snapshots, and LMK1 skeleton overlays.",
  },
  {
    method: "POST",
    path: "/api/sessions/[id]/certificate",
    group: "Reports & Certificates",
    auth: "Session Owner",
    summary: "Issue or revoke an HMAC-SHA256 signed public verification certificate for a practice session.",
  },
  {
    method: "GET",
    path: "/api/verify/[slug]",
    group: "Reports & Certificates",
    auth: "Public",
    summary: "Verify HMAC signature and return public verified capability gains for a certificate slug.",
  },

  // Hiring & Openings
  {
    method: "GET",
    path: "/api/openings",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "List draft, active, and closed hiring interview openings for the organization.",
  },
  {
    method: "POST",
    path: "/api/openings",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Create a new hiring opening (automatic, hybrid, or scripted; 2, 15, 20, 30, or 45 minutes).",
  },
  {
    method: "PATCH",
    path: "/api/openings/[id]",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Edit unlocked opening settings, non-verbal policy, strictness, and candidate visibility.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/questions/import",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Extract & classify structured rubric questions from pasted text or uploaded PDF/DOCX/MD files (p9).",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/questions/generate",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Generate role-calibrated questions with ideal points and red flags via Gemini (p10).",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/questions/enrich",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Rewrite a manual question to be speakable aloud and populate rubric criteria (p10).",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/validate",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Run pre-publish structural, budget, and rubric completeness checks.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/publish",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Publish an opening so invitations can be issued to candidates.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/preview",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Launch an internal recruiter preview interview against the opening configuration.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/close",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Close an opening while preserving existing completed candidate reports and evidence.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/duplicate",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Clone a locked opening and its question bank into an editable draft.",
  },
  {
    method: "GET",
    path: "/api/openings/[id]/candidates",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "List invited and completed candidates with scores, recommendations, and review states.",
  },
  {
    method: "GET",
    path: "/api/openings/[id]/export.csv",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Export anonymized/structured opening candidate scorecards and decisions as CSV.",
  },
  {
    method: "GET",
    path: "/api/hiring/compare",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Side-by-side competency, composure, and soft-skill comparison across selected candidates.",
  },
  {
    method: "GET",
    path: "/api/hiring/sessions/[id]/report",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Fetch full recruiter-view candidate evaluation report and evidence moments.",
  },
  {
    method: "PUT",
    path: "/api/hiring/sessions/[id]/review",
    group: "Hiring & Openings",
    auth: "Org Member",
    summary: "Save recruiter decision (advance, hold, reject), 1-5 rating, and private notes.",
  },

  // Organizations & Invitations
  {
    method: "POST",
    path: "/api/org",
    group: "Organizations & Invitations",
    auth: "Authenticated",
    summary: "Create a company hiring organization and assign the creator as owner.",
  },
  {
    method: "POST",
    path: "/api/org/members",
    group: "Organizations & Invitations",
    auth: "Org Owner",
    summary: "Add or update organization recruiters and ownership roles.",
  },
  {
    method: "POST",
    path: "/api/openings/[id]/invitations",
    group: "Organizations & Invitations",
    auth: "Org Member",
    summary: "Issue single or bulk CSV candidate invitations with unique secure tokens.",
  },
  {
    method: "GET",
    path: "/api/invite/[token]",
    group: "Organizations & Invitations",
    auth: "Public",
    summary: "Inspect public invitation metadata, company branding, and transparency summary.",
  },
  {
    method: "POST",
    path: "/api/invite/[token]/accept",
    group: "Organizations & Invitations",
    auth: "Authenticated",
    summary: "Accept a company invitation, enforce org daily caps, and initialize a company session.",
  },
  {
    method: "POST",
    path: "/api/invitations/[id]/allow-retake",
    group: "Organizations & Invitations",
    auth: "Org Member",
    summary: "Issue a fresh retake invitation while preserving prior session history.",
  },

  // Account & Onboarding
  {
    method: "POST",
    path: "/api/onboarding",
    group: "Account & Onboarding",
    auth: "Authenticated",
    summary: "Complete first-run onboarding intent (practice or hiring) and optional org creation.",
  },
  {
    method: "POST",
    path: "/api/account/delete",
    group: "Account & Onboarding",
    auth: "Authenticated",
    summary: "Execute atomic account deletion, storage cleanup, and retryable pending_account_deletions tracking.",
  },

  // Admin, Docs & Cron
  {
    method: "GET",
    path: "/api/admin/providers",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Inspect masked Gemini/Groq key slot health, fallback ladders, live cooldowns, and quotas.",
  },
  {
    method: "POST",
    path: "/api/admin/providers",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Reset active provider cooldown timers immediately for diagnostics.",
  },
  {
    method: "GET",
    path: "/api/docs",
    group: "Admin, Docs & Cron",
    auth: "Docs Gate",
    summary: "Serve published /docs payload + live telemetry when visible, or HTTP 403 when OFF/outside window.",
  },
  {
    method: "GET",
    path: "/api/admin/docs",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Load full draft/published docs state, access schedule controls, revision history, and live telemetry.",
  },
  {
    method: "PUT",
    path: "/api/admin/docs",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Save draft edits and/or update visibility mode (OFF, ON, Scheduled, Duration) immediately.",
  },
  {
    method: "POST",
    path: "/api/admin/docs/publish",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Publish current draft to live /docs, increment version, and record an immutable revision snapshot.",
  },
  {
    method: "POST",
    path: "/api/admin/docs/team-photo",
    group: "Admin, Docs & Cron",
    auth: "Admin Allowlist",
    summary: "Issue a signed upload URL in public org-assets bucket for auto-resized team avatars.",
  },
  {
    method: "GET",
    path: "/api/cron/retention",
    group: "Admin, Docs & Cron",
    auth: "Cron Bearer",
    summary: "Daily 03:00 UTC job purging expired recordings, temporary docs, stale invitations, and pending deletions.",
  },
];
