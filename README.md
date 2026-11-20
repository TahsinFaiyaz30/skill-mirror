# SkillMirror

**SkillMirror** is a multimodal AI technical interviewing, delivery analytics, and structured hiring platform built with Next.js 16, Supabase, Drizzle ORM, MediaPipe, Google Gemini, and Groq.

It runs **two workflows on one unified interview engine** inside desktop Chrome or Edge:
- **Practice Mode** — Select a target company/role/seniority (2, 10, or 20 minutes, including a 2-minute quick test option), upload your CV, run a timed adaptive AI voice & video interview, and receive a private, evidence-backed coaching report with replayable video clips, skeleton overlays, and a shareable verification certificate.
- **Company Hiring Mode** — Create an organization workspace, design interview openings (automatic, hybrid, or scripted; 2, 15, 20, 30, or 45 minutes), import/generate/enrich question rubrics from PDF/DOCX/text, invite candidates via unique links or bulk CSV, preview interviews before publishing, compare candidates side by side, and export CSVs.

---

## Key Capabilities

**Judge mode** is available on the practice CV step and in a company opening’s **Settings → Preview interview** dialog. It uses the same interview and report pages with lower AI reasoning settings and a 3-minute-30-second time limit. Practice supplies a sample CV. Company previews use the opening’s questions. The 3-minute-30-second duration is also available in both standard interview pickers.

### 1. Adaptive Interview Engine
- **CV & Job Parsing:** Extracts structured skills, experience, projects, and education from uploaded PDF CVs (1–10 pages, up to 5 MB) with optional GitHub repository enrichment.
- **Dynamic Question Ladders (`L1`–`L5`):** Tailors technical competency ladders, behavioral prompts, CV deep-dives, and 20-minute presentation challenges with explicit ideal points, look-fors, and red flags.
- **Real-Time Conversational Control:** Hybrid strategist engine evaluates every answer (`advance`, `follow_up`, `clarify`, `step_up`, `step_down`, `interrupt`, `wrap_up`) using non-blocking function calling (`next_step` and `flag_observation`) during live voice sessions.

### 2. Multimodal Delivery & Voice Analytics
- **On-Device Vision (`@mediapipe/tasks-vision`):** Measures eye contact against calibrated gaze baseline, posture alignment/slouching, head nods, smiling, brow/lip tension, fidgeting, self-touch, arm-crossing, gesturing, multi-face presence, and screen/note-reading sweeps at up to 20 FPS locally in WebGL2 (with automatic CPU tier fallback).
- **Audio & Voice Metrics (`AudioWorklet` + `pitchy` + `@ricky0123/vad-web`):** Tracks speaking pace (WPM), response latency, speech ratio, long pauses, filler bursts, hedge phrases, pitch variety (semitones), and uptalk rate relative to the candidate's intro baseline.
- **Setup Calibration Wizard:** Verifies browser capabilities, camera/microphone permissions, framing & lighting, posture baseline, gaze target calibration, adaptive room noise floor + speech check, echo/headphone routing, and explicit recording/retention consent.

### 3. Evidence-Backed Reports & Verification
- **Clip Replay with Skeleton Overlay:** Plays synced signed WebM video segments anchored to specific question turns and timestamped key moments (`body_language`, `voice`, `content`, `positive`), with optional landmark skeleton overlay (`LMK1` binary logs).
- **Post-Interview Pipeline:** Runs Groq Whisper word-level alignment + Gemini qualitative analysis (`evaluate` + narrative coaching drills), persists structured scorecards, and mints HMAC-signed public certificates (`/verify/[slug]`).

### 4. Unlimited Multi-Key AI Failover Pool (Gemini + Groq)
Backend AI helpers (`src/lib/ai/pool.ts`, `src/lib/ai/gemini.ts`, `src/lib/ai/groq.ts`, `src/lib/api/live.ts`) rotate seamlessly across **any number of configured API keys** (minimum 1, zero ceiling) using **model-outer × key-inner** priority:

1. Tries the **best configured model across all configured API keys** for that provider (`(model[0], key[0..N-1])`).
2. When a `(key, model)` hits rate limits (`429`), high demand (`503`), server errors (`500`/`502`/`504`), missing model access (`404`), bad credentials (`401`/`403` across multiple keys), or timeout, it places only that `(key, model)` pair in a smart cooldown and advances to the next key/model automatically.
3. Only after every key is exhausted on the top model does it step down the model ladder:
   - **Gemini Reasoning / CV / Plan / Report (`MODEL_FLASH`):** `gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3-flash-preview` → `gemini-3.5-flash-lite`
   - **Gemini Live Voice Interviewer (`MODEL_LIVE`):** `gemini-3.8-live-extended-thinking` (with configurable `MODEL_LIVE_THINKING_LEVEL` and `interactionStatus` lifecycle tracking + automatic fallback to `gemini-3.8-live`)
   - **Gemini Live Streaming Transcription (`MODEL_TRANSCRIBE_LIVE`):** `gemini-3.5-transcribe-live` (`POST /api/live/transcribe-token`)
   - **Gemini Interviewer TTS (`MODEL_TTS`):** `gemini-3.8-flash-tts` → `gemini-3.8-flash-lite-tts`
   - **Groq Strategist (`GROQ_STRATEGIST_MODEL`):** `openai/gpt-oss-120b` → `qwen/qwen3.8-27b` → `openai/gpt-oss-20b`
   - **Groq Whisper STT + Gemini STT Fallback (`GROQ_WHISPER_MODEL`):** `whisper-large-v3-turbo` → `whisper-large-v3` → Gemini (`gemini-3.5-transcribe` → Flash ladder)
   - **Interview preparation** tries each ranked Gemini and Groq text model with its eligible keys, preferring Gemini at each rank. If both providers are unavailable within the preparation deadline, the interview continues with role-based questions.
4. **Protected Admin Diagnostics (`/admin`):** Email-allowlisted admin dashboard (`ADMIN_EMAILS`) displaying loaded key slot counts, masked key suffixes (never raw secrets), model failover ladders, live cooldown timers (with one-click cooldown reset), and quota/retention settings.
5. **Light, Dark & System Themes (`next-themes`):** Instant `Light`, `Dark`, or `System` switching directly from the top navigation bar, mobile drawer, auth header (`ThemeToggle`), or **Settings → Appearance** (`ThemeSelector`), while keeping a deep-navy surface on the landing page and live interview room.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| **Styling & UI** | CSS design system (coral-accent light + deep-navy dark mode via `next-themes`, glass-pill top navigation bar & mobile drawer), Tailwind CSS v4, Radix UI, Framer Motion, Recharts, Lucide Icons, Sonner |
| **Auth & Database** | Supabase Auth (Email + Google OAuth), PostgreSQL + Row-Level Security (`0000`–`0007` migrations), Drizzle ORM, Supabase Storage (`cvs`, `recordings`, `artifacts`, `org-assets`) |
| **Live & Offline AI** | `@google/genai` (Interactions API v1beta, Live API v1alpha ephemeral tokens, Extended Thinking, Live Transcribe, TTS), `groq-sdk` (GPT-OSS / Qwen JSON mode + Whisper timestamps) |
| **Client Media & Vision** | `@mediapipe/tasks-vision`, `@ricky0123/vad-web`, Web Audio `AudioWorklet`, `pitchy`, `MediaRecorder`, `pdf-lib`, `mammoth` |
| **Testing** | Vitest (`pglite` RLS + unit/API regression tests), Playwright E2E, ESLint v9, TypeScript |

---

## Getting Started

### Prerequisites
- **Node.js 24.x** (`engines.node: "24.x"`)
- Desktop Chrome or Edge 120+ (for live webcam/mic capture and `AudioWorklet`)

### Option A: Fast Local Mock Mode (No External APIs Required)
Run the full UI, setup wizard, simulated interview, recording playback, hiring workflows, and reports offline against `.skill-mirror/`:

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Create `.env.local` (minimal mock config):
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_AI_MODE=mock
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) and sign up. Both Practice and Hiring flows work locally without Supabase, Gemini, or Groq keys.

---

### Option B: Full Live Setup (Supabase + Gemini + Groq)

1. **Install dependencies:**
   ```bash
   npm ci
   ```
2. **Copy `.env.example` to `.env.local`** and populate your credentials:
   ```bash
   cp .env.example .env.local
   ```
3. **Provision Supabase & Storage:**
   - Create a Supabase project (recommended region closest to users, e.g. `ap-south-1` or `ap-southeast-1`).
   - Apply all migrations in `supabase/migrations/` (`0000_lean_rhodey.sql` through `0006_protect_interview_evidence.sql`) via Supabase CLI or Drizzle (`npx drizzle-kit migrate` using your pooler `DATABASE_URL`).
   - In Supabase Auth:
     - Enable **Email** sign-up/confirmation and configure SMTP / custom templates from `supabase/email-templates/`.
     - Optionally enable **Google OAuth** and register the Supabase callback URL on your Google OAuth Client.
     - Add both local and production Redirect URLs (`/auth/callback` and `/auth/confirm`, e.g. `http://localhost:3000/**` and your Vercel deployment URL `https://your-app.vercel.app/**`).
4. **Add Unlimited AI Provider Keys (Comma-Separated or Numbered):**
   In `.env.local` or Vercel Environment Variables, supply one or more keys with **no upper limit**:
   ```env
   # Comma-separated (recommended — add as many keys as needed)
   GEMINI_API_KEY=AIza...key1,AIza...key2,AIza...key3
   GROQ_API_KEY=gsk_...key1,gsk_...key2

   # Optional extra keys also merged automatically in order:
   # GEMINI_API_KEYS=AIza...key4,AIza...key5
   # GEMINI_API_KEY_1=AIza...key6
   # GROQ_API_KEYS=gsk_...key3
   # GROQ_API_KEY_1=gsk_...key4
   ```
5. **Run locally:**
   ```bash
   npm run dev
   ```
   Or build and run production mode:
   ```bash
   npm run build
   npm run start
   ```

---

## Environment Variables Reference

| Variable | Default / Example | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public base URL used for redirects and verification links |
| `NEXT_PUBLIC_AI_MODE` | `live` \| `pipeline` \| `mock` | `live` uses Gemini Live WebSocket; `pipeline` uses chunked Whisper + TTS; `mock` runs offline |
| `NEXT_PUBLIC_AI_DATA_TIER` | `unpaid` \| `paid` | Enables unpaid-tier synthetic material confirmations when set to `unpaid` |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service-role key (server-only) |
| `DATABASE_URL` | — | PostgreSQL connection string for Drizzle / migrations |
| `GEMINI_API_KEY` | — | Single key or comma-separated list of Gemini API keys (unlimited) |
| `GEMINI_API_KEYS` / `GEMINI_API_KEY_1..N` | — | Optional additional Gemini keys automatically appended to the pool |
| `GROQ_API_KEY` | — | Single key or comma-separated list of Groq API keys (unlimited) |
| `GROQ_API_KEYS` / `GROQ_API_KEY_1..N` | — | Optional additional Groq keys automatically appended to the pool |
| `MODEL_FLASH` | `gemini-4-hydrogen` | Primary Gemini reasoning model for CV parsing, planning, evaluation, and reports |
| `MODEL_FLASH_FALLBACKS` | `gemini-3.8-flash,gemini-3.7-flash,gemini-3-flash-preview,gemini-3.5-flash-lite` | Comma-separated fallback ladder for `geminiJSON` |
| `MODEL_LIVE` | `gemini-3.8-live-extended-thinking` | Primary real-time multimodal voice model |
| `MODEL_LIVE_FALLBACKS` | `gemini-3.8-live` | Fallback Live model when extended thinking is unavailable |
| `MODEL_LIVE_THINKING_LEVEL` | `low` \| `medium` \| `high` | Thinking depth passed to `gemini-3.8-live-extended-thinking` |
| `MODEL_TRANSCRIBE` | `gemini-3.5-transcribe` | Batch Gemini speech-to-text fallback model |
| `MODEL_TRANSCRIBE_LIVE` | `gemini-3.5-transcribe-live` | Real-time WebSocket transcription model |
| `MODEL_TTS` | `gemini-3.8-flash-tts` | Primary Gemini TTS voice synthesis model |
| `MODEL_TTS_FALLBACKS` | `gemini-3.8-flash-lite-tts` | Fallback Gemini TTS model |
| `GROQ_STRATEGIST_MODEL` | `openai/gpt-oss-120b` | Primary live turn strategist model |
| `GROQ_STRATEGIST_FALLBACKS` | `qwen/qwen3.8-27b,openai/gpt-oss-20b` | Fallback strategist ladder |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Primary Whisper transcription model |
| `GROQ_WHISPER_FALLBACKS` | `whisper-large-v3` | Fallback Whisper model |
| `MAX_INTERVIEWS_PER_DAY` | `50` | Daily completed/planned practice session cap per user |
| `MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG` | `200` | Daily invitation acceptance cap per organization |
| `RECORDING_RETENTION_DAYS` | `30` | Days before scheduled recording cleanup |
| `ADMIN_EMAILS` | — | Comma-separated allowlist of emails allowed to view `/admin` and `/api/admin/providers` |
| `CERT_SIGNING_SECRET` | `32+ bytes hex` | HMAC secret for signing certificate shares |
| `CRON_SECRET` | `32+ bytes hex` | Bearer secret protecting `/api/cron/retention` |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Optional Resend credentials for automated candidate invite emails |
| `FEATURE_GITHUB` / `GITHUB_TOKEN` | `false` | Optional GitHub repository enrichment for CV projects |

---

## Scripts & Testing

```bash
npm run dev            # Start Next.js development server (Turbopack)
npm run build          # Production build
npm run start          # Serve production build
npm run lint           # ESLint with --max-warnings 0
npm run typecheck      # Next route typegen + TypeScript check
npm test               # Vitest unit, provider pool, API regression & pglite RLS suites
npm run test:e2e       # Playwright end-to-end suite (runs in local mock mode on port 3001)
npm run audio:previews # Regenerate Kore / Charon voice preview WAV files using Gemini TTS
```

---

## Deployment Notes (Vercel)

- Set all server and public variables (including `NEXT_PUBLIC_APP_URL` matching your production domain) in Vercel Project Settings → Environment Variables.
- Retention cleanup runs daily at `03:00 UTC` via [vercel.json](vercel.json) (`/api/cron/retention`, authenticated with `CRON_SECRET`).
- **Unpaid vs. Paid AI Data Tier:** Deployments with `NEXT_PUBLIC_AI_DATA_TIER=unpaid` require users to confirm fictional/synthetic inputs before CV parsing and interviews. For production commercial candidate interviews, upgrade your Gemini/Groq/Supabase/Vercel plans and set `NEXT_PUBLIC_AI_DATA_TIER=paid`.

---

## Project Structure

```text
src/
├── app/                   # Next.js App Router pages & REST/streaming route handlers
│   ├── (marketing)/       # Landing page
│   ├── admin/             # Protected AI provider pool & quota diagnostics (/admin)
│   ├── api/               # REST routes (sessions, live tokens, cv, hiring, org, cron, admin)
│   ├── dashboard/         # Candidate practice hub
│   ├── hiring/            # Company openings, wizard, candidates, comparison & org settings
│   ├── i/[token]/         # Candidate invitation landing page
│   ├── interview/[id]/    # prepare, setup, live, processing, report, done views
│   └── verify/[slug]/     # Public certificate verification page
├── components/            # Feature UI components (common, hiring, interview, report, setup, shell)
├── lib/
│   ├── ai/                # Multi-key failover pool, Gemini & Groq clients, prompts, schemas
│   ├── api/               # Server route logic (live tokens, session lifecycle, cv, hiring, reports)
│   ├── auth/              # Supabase SSR middleware guards & admin allowlist
│   ├── config/            # Validated env config, constants & competency taxonomy
│   ├── db/                # Drizzle schema & database client
│   ├── live/              # WebSocket LiveInterviewerClient, LiveTranscribeClient, TurnEngine
│   ├── recording/         # WebM segment & audio recorders, snapshot ring, uploaders
│   ├── report/            # Offline alignment, voice metrics & evaluation pipeline
│   ├── strategist/        # Adaptive state machine, difficulty ladders & rubric validation
│   └── vision/            # MediaPipe telemetry, baseline calibration & binary LMK1 logging
├── stores/                # Zustand live interview store
supabase/
├── email-templates/       # Auth signup & password-reset HTML email templates
└── migrations/            # Ordered PostgreSQL + RLS migrations (0000–0006)
tests/
├── e2e/                   # Playwright browser workflows
├── fixtures/              # Synthetic video/audio, sample CV & golden scoring fixtures
└── unit/                  # Vitest unit, failover pool, Gemini Live & pglite RLS suites
```
