import type { DocsDocument } from "@/types/docs";

export const DEFAULT_ARCHITECTURE_MERMAID = `flowchart LR
  UI["Candidate & Recruiter UI | Next.js 16 + React 19"] --> API["Next.js Route Handlers | 56+ REST APIs"]
  UI --> CV["On-Device Vision & Audio | MediaPipe 20 FPS + AudioWorklet"]
  UI <--> LIVE["Gemini 3.8 Live | Direct WebSocket + Ephemeral Token"]
  API --> STRAT["Strategist & Failover Pool | Groq LPU + Gemini Flash"]
  API --> PIPE["8-Step Report Pipeline | Whisper + p7 Tone + p8 Coach"]
  API --> DB["Supabase Postgres + RLS | Drizzle ORM + Storage"]
  STRAT --> DB
  PIPE --> DB`;

export const DEFAULT_DATA_FLOW_MERMAID = `flowchart LR
  IN["1. Input | PDF CV, JD, Mic/Cam, Rubric"] --> PROC["2. On-Device Processing | MediaPipe Landmarks + VAD + Pitch"]
  PROC --> AI["3. Dual-Brain AI | Gemini Live Voice + Groq Strategist"]
  AI --> OUT["4. Verified Output | Scorecard, Clips, LMK1 Skeleton, Cert"]
  OUT --> FB["5. Feedback & Hiring | Composure Curve, Drills, Comparison"]`;

export function createDefaultDocsDocument(): DocsDocument {
  return {
    tagline:
      "Adversarial AI interviewing + on-device non-verbal analytics for verified capability gains.",
    heroSubtitle:
      "SkillMirror combines a real-time multimodal voice interviewer with client-side computer vision and acoustic DSP — uniting candidate Practice Mode and structured Company Hiring on one auditable engine.",
    teamName: "Team SkillMirror",
    teamMembers: [
      {
        id: "tahsin-faiyaz",
        name: "Tahsin Faiyaz",
        role: "Product Architect, AI Systems & Full-Stack Lead",
        email: "tahsinfaiyaz30@gmail.com",
        bio: "Architected the adaptive Elo/IRT strategist, Gemini Live Extended Thinking & multi-key failover pool, post-interview analytics pipeline, and production infrastructure.",
        photoPath: null,
        github: "https://github.com/TahsinFaiyaz30",
      },
      {
        id: "md-shahed-khan",
        name: "MD. Shahed Khan",
        role: "Frontend Experience & Design Systems Lead",
        email: "mdshahedkhan17@gmail.com",
        bio: "Led the SkillMirror graphite/cloud-white/yellow design system, landing narrative, streamlined dashboard experience, and responsive Light/Dark UX.",
        photoPath: null,
      },
      {
        id: "abdullah-shahriar",
        name: "Abdullah Shahriar",
        role: "Full-Stack Engineering & QA Contributor",
        email: "abdullahshahriar2140@gmail.com",
        bio: "Contributed to core full-stack integration, workflow validation, and candidate/hiring user journey verification.",
        photoPath: null,
      },
    ],
    pitchItems: [
      {
        key: "problem",
        eyebrow: "01 · Problem",
        title: "Interview feedback arrives too late — and never measures composure under pressure",
        summary:
          "Candidates practice blindly without realistic follow-ups, while hiring teams waste hours on inconsistent screening calls.",
        body: "Most job seekers only discover technical gaps, rambling answers, or nervous delivery habits after a rejection email. Existing mock tools either feel like text chatbots or grade content and body language in isolation. Meanwhile, hiring teams struggle to run standardized, bias-reduced first-round technical and behavioral screens at scale.",
      },
      {
        key: "solution",
        eyebrow: "02 · Solution",
        title: "One multimodal engine for Pressure-Tested Soft Skills & verified technical ceilings",
        summary:
          "An adversarial voice AI raises difficulty in real time while on-device CV & audio track how candidates hold up.",
        body: "SkillMirror reads the candidate's CV and target role, builds a hidden 5-level difficulty ladder, and conducts a timed live voice interview on camera (with no self-view mirror, just like a real panel). On-device MediaPipe (478 face, 33 pose, 21 hand landmarks) and Web Audio DSP quantify gaze, posture, fidgeting, pitch, pace, and filler words relative to each person's own calibration baseline — producing replayable video clips, skeleton overlays, composure curves, and HMAC-signed verification certificates.",
      },
      {
        key: "why_now",
        eyebrow: "03 · Why Now",
        title: "Native low-latency voice LLMs + WebGL2 client vision finally make live multimodal interviewing affordable",
        summary:
          "Gemini Live WebSockets, sub-second Groq LPUs, and in-browser MediaPipe eliminate expensive GPU server relays.",
        body: "Until recently, real-time multimodal interviewing required costly server-side media pipelines and brittle STT -> LLM -> TTS chains with multi-second awkward pauses. Today, browser-to-Gemini Live WebSockets deliver native speech + synchronized captions, Groq LPUs score rubrics in under 1 second, and WebGL2 MediaPipe extracts 20 FPS facial/skeletal telemetry directly on the candidate's laptop at zero inference cost.",
      },
      {
        key: "product_demo",
        eyebrow: "04 · Product Demo",
        title: "End-to-end live Practice & Company Hiring workflows",
        summary:
          "Try a 2-minute quick test or full 10–45 minute adaptive interview with clip replay and recruiter comparison.",
        body: "1. Practice Mode (`/dashboard`): Upload a PDF CV, pick company/role/seniority (2, 10, or 20 min), calibrate camera/mic/gaze, complete an adversarial live voice interview, and review timestamped clips + skeleton overlay + HMAC certificate (`/verify/[slug]`).\n2. Hiring Mode (`/hiring`): Create an org, import or AI-generate structured question rubrics, preview the live interview, invite candidates via unique links or CSV, compare scorecards side-by-side, and export CSVs.\n3. Diagnostics (`/admin`): Inspect multi-key Gemini/Groq failover health and manage `/docs` visibility.",
      },
      {
        key: "market_opportunity",
        eyebrow: "05 · Market Opportunity",
        title: "Serving both B2C career prep and B2B enterprise hiring & university upskilling",
        summary:
          "Bridges the global technical recruiting assessment market and the fast-growing workforce readiness / edtech certification sector.",
        body: "Over 100M+ STEM graduates, early-career engineers, and active job switchers prepare for technical and behavioral interviews every year, while enterprises and staffing teams spend billions on first-round technical screening and campus hiring. SkillMirror's dual-mode architecture lets individual candidates train on the exact same rubric engine that employers and universities use for verified readiness assessments.",
      },
      {
        key: "business_model",
        eyebrow: "06 · Business Model",
        title: "Freemium B2C Practice + seat/volume B2B Hiring SaaS",
        summary:
          "High-margin unit economics enabled by zero-token client-side vision and tiered LLM routing.",
        body: "- **Candidate Practice (B2C):** Free starter tier with capped daily practice sessions; Pro subscription ($15–$29/mo) for unlimited 20-min adversarial panels, longitudinal progress tracking, and verified skill certificates.\n- **Hiring Teams (B2B):** Usage-based or monthly workspace plans ($199–$999/mo) for custom openings, question bank import/enrichment, bulk candidate invites, side-by-side comparison, and CSV/ATS exports.\n- **Universities & Bootcamps (B2B2C):** Cohort licenses for Workforce Ready certification.",
      },
      {
        key: "traction",
        eyebrow: "07 · Traction",
        title: "Production-deployed full-stack platform with live multi-user telemetry",
        summary:
          "All metrics in the Live Analytics section below auto-sync directly from our live PostgreSQL database.",
        body: "SkillMirror is live in production on Vercel + Supabase with both Practice and Company Hiring workflows operational end-to-end, backed by 151+ automated Vitest/PGlite RLS unit tests, 8 ordered PostgreSQL RLS migrations, multi-key Gemini + Groq failover pools, and zero-warning TypeScript/ESLint builds.",
      },
      {
        key: "competition",
        eyebrow: "08 · Competition",
        title: "Why SkillMirror wins against generic chatbots and legacy video screens",
        summary:
          "Competitors separate technical rigor from delivery coaching — or rely on opaque black-box scoring.",
        body: "| Capability | Generic Chatbots | LeetCode / Coding Drills | Legacy Video Screens (HireVue) | **SkillMirror** |\n| :--- | :--- | :--- | :--- | :--- |\n| Adaptive L1–L5 Voice Follow-ups | No | No | Scripted only | **Yes (Elo/IRT + Groq Strategist)** |\n| On-Device CV + Vocal Composure Curve | No | No | Opaque server ML | **Yes (MediaPipe 20 FPS, baseline-calibrated)** |\n| Dual Practice + Company Hiring Engine | Practice only | Practice only | Hiring only | **Unified platform** |\n| Replayable Timestamped Clips + Skeleton | No | No | Raw video only | **Yes (LMK1 overlay + evidence moments)** |\n| Verified Cryptographic Skill Certificate | No | Partial | No | **Yes (HMAC-SHA256 `/verify/[slug]`)** |",
      },
      {
        key: "unique_advantage",
        eyebrow: "09 · Unique Advantage",
        title: "Auditable 'Voice vs. Brain' architecture + zero-token client-side multimodal telemetry",
        summary:
          "Exact measurements come from deterministic browser CV/DSP; LLMs interpret calibrated numbers rather than guessing.",
        body: "1. **Pressure-Tested Soft Skills:** Links rising technical difficulty directly to behavioral composure metrics relative to each candidate's own calibration baseline.\n2. **Zero-Token Vision Analytics:** MediaPipe + Web Audio run locally in-browser, slashing multimodal cloud costs by >90% while preserving privacy.\n3. **Tamper-Resistant Voice Control:** Gemini Live only speaks server-signed `[DIRECTIVE]` envelopes; candidates cannot prompt-inject scores or skip rubrics.\n4. **Unlimited Multi-Key Failover:** Model-outer × key-inner rotation across Gemini and Groq keeps live interviews resilient under hackathon or enterprise load.",
      },
      {
        key: "go_to_market",
        eyebrow: "10 · Go-To-Market",
        title: "Bottom-up viral practice certificates feeding top-down hiring workspaces",
        summary:
          "Verified candidate certificates and university cohorts drive organic acquisition into B2B recruiting teams.",
        body: "1. **Campus & Bootcamp Partnerships (LearnSphere / Workforce Ready):** Deploy Practice Mode to graduating CS/engineering cohorts who share `/verify/[slug]` certificates on LinkedIn and CVs.\n2. **Hiring Viral Loop:** Every company invitation (`/i/[token]`) introduces candidates to SkillMirror's transparent interview experience, converting applicants into Practice users.\n3. **Recruiter Self-Serve:** Zero-friction 2-minute preview mode lets hiring managers import existing PDF/DOCX question docs and test-drive an opening in minutes.",
      },
      {
        key: "vision",
        eyebrow: "11 · Vision",
        title: "Become the universal, fair standard for verified human capability in the AI era",
        summary:
          "Replacing resume keyword gaming with live, evidence-backed proof of technical depth and communication poise.",
        body: "As AI makes resumes and take-home assignments trivially easy to forge, authentic live spoken reasoning and composure under pressure become the highest-signal proof of readiness. SkillMirror aims to power both lifelong skill mastery for learners and transparent, structured, evidence-backed hiring for organizations worldwide.",
      },
    ],
    features: [
      {
        id: "adaptive-voice-interview",
        name: "Adaptive Live Voice & Vision Interview",
        category: "Core Engine",
        description:
          "Real-time Gemini 3.8 Live Extended Thinking voice interviewer with synchronized captions, non-blocking tool calls, and automatic fallback.",
        status: "live",
        liveMetricKey: "sessions",
      },
      {
        id: "elo-irt-strategist",
        name: "Hidden Adversarial Strategist (L1–L5 Staircase)",
        category: "AI Evaluation",
        description:
          "Sub-second Groq LPU rubric scoring (p4) updating Elo/IRT ability estimates and dispatching weak/strong follow-ups under strict phase time budgets.",
        status: "live",
        liveMetricKey: "completedReports",
      },
      {
        id: "on-device-cv-audio",
        name: "On-Device MediaPipe Vision & Acoustic DSP",
        category: "Multimodal Analytics",
        description:
          "20 FPS 478-point Face, 33-point Pose, 21-point Hand tracking plus AudioWorklet pitch, Silero VAD, pace, pauses, and personal baseline calibration.",
        status: "live",
        liveMetricKey: "events",
      },
      {
        id: "cv-parsing-github",
        name: "Native PDF CV Extraction & GitHub Enrichment",
        category: "Context Grounding",
        description:
          "Parses 1–10 page PDF CVs into structured skills, projects, and verifiable claims, with optional live public GitHub README enrichment.",
        status: "live",
        liveMetricKey: "cvs",
      },
      {
        id: "replay-skeleton-certs",
        name: "Video Clip Replay, LMK1 Skeleton & HMAC Certificates",
        category: "Reports & Trust",
        description:
          "Signed WebM playback anchored to timestamped key moments, toggleable landmark skeleton overlay, and cryptographically signed public certificates.",
        status: "live",
        liveMetricKey: "certificates",
      },
      {
        id: "company-hiring-suite",
        name: "Company Hiring Workspaces, Rubrics & Comparison",
        category: "Enterprise Hiring",
        description:
          "Multi-member orgs, PDF/DOCX question bank import & AI enrichment (p9/p10), unique/CSV candidate invites, side-by-side comparison, and CSV export.",
        status: "live",
        liveMetricKey: "openings",
      },
      {
        id: "quick-test-mode",
        name: "2-Minute Quick Test Duration (Practice & Hiring)",
        category: "UX & Demos",
        description:
          "Proportional short-session phase budgets, answer caps, and DB constraints enabling rapid end-to-end live demos and recruiter previews.",
        status: "live",
      },
      {
        id: "multi-key-failover",
        name: "Unlimited Multi-Key AI Failover Pool & /admin Diagnostics",
        category: "Reliability",
        description:
          "Model-outer × key-inner failover across unlimited Gemini and Groq keys with per-pair smart cooldowns and protected /admin health controls.",
        status: "live",
      },
      {
        id: "live-docs-module",
        name: "Live /docs Pitch Deck, Whitepaper & Scheduled Access Control",
        category: "Documentation",
        description:
          "Database-backed YC pitch deck, live telemetry dashboard, Mermaid/SVG diagrams, team showcase, revision history, and ON/OFF/Scheduled publishing.",
        status: "live",
      },
      {
        id: "ats-webhooks",
        name: "ATS Integrations (Greenhouse, Lever, Ashby) & Webhooks",
        category: "Enterprise Hiring",
        description:
          "Two-way candidate invitation triggers and signed scorecard webhook delivery into enterprise applicant tracking systems.",
        status: "upcoming",
      },
      {
        id: "live-coding-whiteboard",
        name: "Synchronized Live Coding & System Design Whiteboard",
        category: "Core Engine",
        description:
          "Optional collaborative code pad and architecture canvas paired directly with the adversarial voice interviewer.",
        status: "planned",
      },
      {
        id: "multilingual-interviews",
        name: "Multilingual Interviews & Regional Accent Calibration",
        category: "Global Expansion",
        description:
          "Support for Bangla, Spanish, French, German, and Japanese interviews with culturally neutral acoustic normalization.",
        status: "planned",
      },
    ],
    roadmap: [
      {
        horizon: "short",
        label: "Short Term",
        timeframe: "0 – 3 Months",
        items: [
          "Launch public Workforce Ready beta with university career centers and bootcamp cohorts.",
          "Add webhook notifications & one-click ATS CSV/JSON sync for Greenhouse and Lever.",
          "Expand role taxonomy beyond Engineering/PM/Data into Sales, Consulting, and Clinical roles.",
          "Ship PDF certificate download + LinkedIn Add-to-Profile one-click badge integration.",
        ],
      },
      {
        horizon: "mid",
        label: "Mid Term",
        timeframe: "3 – 9 Months",
        items: [
          "Introduce synchronized live coding sandbox and collaborative architecture whiteboard inside the voice room.",
          "Launch team-level recruiter calibration analytics and bias/consistency audit reports.",
          "Add optional high-precision acoustic prosody worker (jitter/shimmer) and video highlight reel export.",
          "Upgrade to dedicated paid enterprise AI tiers with SOC 2 Type II readiness and regional data residency.",
        ],
      },
      {
        horizon: "long",
        label: "Long Term",
        timeframe: "9 – 18+ Months",
        items: [
          "Build longitudinal verified capability graphs tracking measurable skill growth across multiple quarters.",
          "Support multilingual interviews with accent-neutral fairness benchmarks across 10+ languages.",
          "Offer embeddable SkillMirror Assessment SDK & API for enterprise LMS and HR platforms.",
        ],
      },
    ],
    changelog: [
      {
        version: "v1.4.0",
        date: "2026-11-20",
        title: "Live /docs Module, Admin CMS & Scheduled Publishing",
        highlights: [
          "Added live database-backed /docs pitch deck, technical whitepaper, and real-time analytics dashboard.",
          "Added protected /admin/docs editor with ON/OFF/Scheduled/Duration access controls, drag-and-drop sections, auto-resized team photos, and revision rollback.",
          "Shipped unified graphite/cloud-white/yellow Light & Dark UI refresh and public /about access fix.",
        ],
      },
      {
        version: "v1.3.0",
        date: "2026-11-20",
        title: "2-Minute Quick Test Interviews & Node 24 Build Hygiene",
        highlights: [
          "Added 2-minute quick test interview duration across both Practice and Company Hiring modes with scaled phase budgets.",
          "Applied PostgreSQL migration 0007 updating interview_sessions_scope_check constraints.",
          "Pinned Node 24.x engine and approved build scripts for clean zero-warning Vercel deployments.",
        ],
      },
      {
        version: "v1.2.0",
        date: "2026-11-19",
        title: "Unlimited Multi-Key AI Failover Pool, Live Extended Thinking & /admin",
        highlights: [
          "Engineered unlimited model-outer × key-inner failover across Gemini and Groq with per-pair smart cooldowns.",
          "Upgraded live interviewer to gemini-3.8-live-extended-thinking with automatic gemini-3.8-live fallback and gemini-3.5-transcribe-live streaming.",
          "Added email-allowlisted /admin provider diagnostics panel and Light/Dark/System theme switching.",
        ],
      },
      {
        version: "v1.1.0",
        date: "2026-11-19",
        title: "Company Hiring Mode, Evidence Hardening & Real Gemini v1beta/v1alpha",
        highlights: [
          "Added full Hiring Mode: organizations, openings, PDF/DOCX question import/enrichment, candidate invitations, reviews, comparison, and CSV export.",
          "Hardened PostgreSQL RLS migrations (0001–0006), interview reload recovery, and retryable account cleanup.",
          "Aligned @google/genai 3.6 Interactions v1beta, TTS, and Live v1alpha clients.",
        ],
      },
      {
        version: "v1.0.0",
        date: "2026-11-18",
        title: "SkillMirror Core Practice Interview & Multimodal Engine",
        highlights: [
          "Launched spec-driven Practice Mode with PDF CV parsing, L1–L5 ladders, live voice interview room, and on-device MediaPipe + AudioWorklet analytics.",
          "Built 8-step resumable report pipeline, synced WebM clip replay with LMK1 skeleton overlay, and HMAC-signed public verification certificates.",
        ],
      },
    ],
    sections: [
      {
        id: "pitch",
        code: "A",
        title: "YC-Style Pitch Deck",
        category: "pitch",
        enabled: true,
        summary:
          "12-part investor and judge pitch covering problem, solution, market, business model, live traction, competition, team, and vision.",
        bodyMarkdown: "",
      },
      {
        id: "overview",
        code: "B",
        title: "Product Overview",
        category: "pitch",
        enabled: true,
        summary:
          "What SkillMirror does, who it serves, and how Practice Mode and Company Hiring share one verified evaluation engine.",
        bodyMarkdown: `### Dual Workflows on One Unified Engine

SkillMirror runs inside desktop Chrome or Edge with zero plugins required:

- **Practice Mode (Candidates & Learners):** Upload a PDF CV, choose a target company, role family, seniority, and length (2, 10, or 20 min), calibrate camera/mic/gaze, complete a live adversarial voice interview, and receive a private evidence-backed report with replayable clips, skeleton overlays, composure curve, practice drills, and an optional HMAC-signed public certificate.
- **Company Hiring Mode (Recruiters & Engineering Managers):** Create a multi-member organization workspace, configure automatic, hybrid, or scripted openings (2, 15, 20, 30, or 45 min), import/generate/enrich question rubrics from PDF/DOCX/text, test-drive via Preview Mode, invite candidates via unique tokens or bulk CSV, compare scorecards side by side, and export CSVs.

### Core Principle: Measurable Composure Under Pressure

Most tools score answers or body language separately. SkillMirror links them: **the adversarial interviewer creates calibrated technical pressure while on-device CV and acoustic DSP measure how poise, gaze, posture, and vocal steadiness respond relative to the candidate's own baseline.**`,
      },
      {
        id: "features",
        code: "C",
        title: "Feature Matrix",
        category: "pitch",
        enabled: true,
        summary:
          "Live-synced inventory of shipped, upcoming, and planned capabilities connected directly to real system metrics.",
        bodyMarkdown: "",
      },
      {
        id: "architecture",
        code: "D",
        title: "Architecture Diagram",
        category: "technical",
        enabled: true,
        summary:
          "Direct browser-to-Gemini Live WebSockets paired with Next.js App Router control APIs, Groq LPU strategist, and Supabase Postgres/Storage.",
        bodyMarkdown: `### Architectural Decisions

- **No Media Proxy Bottleneck:** Live audio and 1 FPS low-resolution video flow directly from the candidate's browser to Google Gemini Live over WebSockets authenticated by short-lived single-use ephemeral tokens minted by \`POST /api/live/token\`.
- **Voice vs. Brain Separation:** Gemini Live (\`p5\`) handles speech, listening, and integrity flags, while our deterministic TypeScript state machine (\`src/lib/strategist/engine.ts\`) and Groq LPU evaluator (\`p4\`) own rubrics, Elo/IRT staircases, phase timers, and PostgreSQL row-locked turn transitions.
- **Zero-Token Client Telemetry:** MediaPipe Face/Pose/Hands and Web Audio \`AudioWorklet\` + \`pitchy\` + Silero VAD run locally in the browser, uploading compact gzipped 1 Hz timelines and binary \`LMK1\` landmark logs.`,
        diagramSource: DEFAULT_ARCHITECTURE_MERMAID,
      },
      {
        id: "data_flow",
        code: "E",
        title: "Data Flow Diagram",
        category: "technical",
        enabled: true,
        summary:
          "End-to-end multimodal pipeline from raw candidate inputs to timestamped evidence clips and actionable drills.",
        bodyMarkdown: `### Stage-by-Stage Flow

1. **Input:** Candidate uploads PDF CV (1–10 pages), selects role/JD (or accepts a company invite), and completes 5-step hardware + gaze/posture/noise-floor calibration.
2. **On-Device Processing:** Browser runs MediaPipe Face (20 FPS), Pose/Hands (10 FPS), and Web Audio DSP while recording segmented WebM clips and mic audio.
3. **Dual-Brain Live AI:** Gemini Live speaks \`[DIRECTIVE]\` prompts and triggers non-blocking \`next_step\` / \`flag_observation\` calls; server strategist (\`p4\` on Groq, Gemini fallback) scores answers in <3.5s and selects the next adaptive question.
4. **Post-Interview Pipeline (8 Lease-Locked Steps):** \`verify_media\` -> \`transcribe\` (Groq Whisper word timestamps) -> \`align\` -> conditional batched \`rescore\` -> single-call audio \`tone\` (\`p7\`) -> deterministic \`score\` -> grounded coaching \`narrate\` (\`p8\`) -> \`finalize\`.
5. **Feedback & Verification:** Candidate and/or hiring team inspect synced clips, skeleton overlay, composure curve, drills, and public HMAC certificate.`,
        diagramSource: DEFAULT_DATA_FLOW_MERMAID,
      },
      {
        id: "stack",
        code: "F",
        title: "Technology Stack",
        category: "technical",
        enabled: true,
        summary:
          "Verified production dependencies across frontend, backend, database, AI/ML, client media, and testing.",
        bodyMarkdown: `| Layer | Technologies | Role in SkillMirror |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS v4, Radix UI, Framer Motion, Recharts, Lucide, Zustand, TanStack Query, \`next-themes\`, \`@dnd-kit\` | Responsive UI, Light/Dark graphite design system, live interview room, clip replay, admin drag-and-drop editors |
| **Client CV & Audio** | \`@mediapipe/tasks-vision\`, \`@ricky0123/vad-web\` (Silero WASM), \`pitchy\`, Web Audio \`AudioWorklet\`, \`MediaRecorder\` | Zero-token in-browser gaze, posture, expression, gesture, pitch, pause, WPM, and WebM segment capture |
| **Backend & ORM** | Next.js Route Handlers (Node.js 24.x), Drizzle ORM, \`postgres\`, Zod v4, \`pdf-lib\`, \`mammoth\`, Resend | 56+ validated REST APIs, transactional state machine, document parsing, email dispatch |
| **Database & Storage** | Supabase (PostgreSQL 16 + RLS, Email & Google OAuth, 4 Storage Buckets), \`@electric-sql/pglite\` | Strict row/column security, signed media URLs, offline mock mode & automated RLS tests |
| **AI & Multimodal** | \`@google/genai\` (Interactions v1beta, Live v1alpha, Extended Thinking, Live Transcribe, TTS), \`groq-sdk\` (GPT-OSS, Qwen 3.8, Whisper v3 Turbo) | Real-time voice/vision interviewing, sub-second rubric scoring, word-level alignment, coaching synthesis |
| **Infra & QA** | Vercel (production hosting + daily cron), Vitest (151+ tests), Playwright E2E, ESLint 9 (\`--max-warnings 0\`) | CI/CD, scheduled retention cleanup, unit/API/RLS/E2E verification |`,
      },
      {
        id: "api",
        code: "G",
        title: "API Documentation",
        category: "technical",
        enabled: true,
        summary:
          "Complete searchable catalog of external provider integrations and all exposed SkillMirror REST endpoints with auth models.",
        bodyMarkdown: "",
      },
      {
        id: "data_layer",
        code: "H",
        title: "Data Layer",
        category: "technical",
        enabled: true,
        summary:
          "Relational PostgreSQL schema, multimodal artifact storage, parsing pipelines, and privacy/retention lifecycle.",
        bodyMarkdown: `### Storage & Relational Model

- **16 PostgreSQL Tables (Migrations \`0000\`–\`0008\`):** \`profiles\`, \`organizations\`, \`org_members\`, \`openings\`, \`opening_questions\`, \`candidate_cvs\`, \`interview_sessions\`, \`invitations\`, \`candidate_reviews\`, \`turns\`, \`transcript_segments\`, \`events\`, \`reports\`, \`competency_results\`, \`soft_skill_results\`, \`certificates\`, \`pending_account_deletions\`, \`docs_config\`, and \`docs_revisions\`.
- **4 Supabase Storage Buckets:**
  - \`cvs\` (private, 50 MB limit): Uploaded candidate PDF resumes.
  - \`recordings\` (private, 50 MB limit): Segmented 2-minute VP8/Opus WebM clips & 32 kbps Opus mic audio.
  - \`artifacts\` (private, 50 MB limit): Gzipped 1 Hz MediaPipe timelines, binary \`LMK1\` landmark logs, pitch tracks, \`words.json\`, event snapshots, and temporary hiring question docs.
  - \`org-assets\` (public, 1 MB limit): Organization logos and auto-resized \`400×400\` team avatars.
- **Privacy & Retention Lifecycle:** Practice sessions are strictly private by default. Daily cron (\`/api/cron/retention\` at \`03:00 UTC\`) purges recordings past \`RECORDING_RETENTION_DAYS\` (30 days), deletes expired question upload docs after 24h, expires stale invitations, and retries any incomplete account deletions.`,
      },
      {
        id: "ai_layer",
        code: "I",
        title: "AI Layer",
        category: "technical",
        enabled: true,
        summary:
          "Live model ladders, 10-module prompt registry, structured relational grounding (why we skipped vector RAG), and deterministic explainability.",
        bodyMarkdown: `### 10-Module Prompt Registry & Grounding Strategy

- **Structured Relational Grounding (No Lossy Vector Chunking):** Per-session artifacts (1–10 page PDF CVs, JDs, and question banks) fit cleanly into lossless structured JSON (\`p1\`, \`p9\`) plus optional live GitHub README retrieval (\`src/lib/hiring/github.ts\`). Prompts receive only competency-filtered CV snippets (≤1.2k chars), matching CV claims, active rubrics, and truncated turn windows — avoiding unnecessary vector DB infrastructure and chunking drift.
- **Personalization & Adaptive Control:** Initial difficulty starts from seniority + claimed CV proficiency; every scored turn updates both an Elo/IRT \`theta\` estimate and a 5-level staircase (\`L1\`–\`L5\`) to bracket the candidate's true ceiling.
- **Explainability & Anti-Hallucination:** Every number, score, composure point, and timestamp is computed deterministically in TypeScript before \`p8\` runs. \`p8\` is strictly constrained to explain pre-computed results and pick only from supplied evidence \`MomentCandidate\` IDs, backed by replayable video clips.`,
      },
      {
        id: "roadmap",
        code: "J",
        title: "Product Roadmap",
        category: "operations",
        enabled: true,
        summary:
          "Short-, mid-, and long-term milestones for scaling SkillMirror across campuses and enterprise hiring teams.",
        bodyMarkdown: "",
      },
      {
        id: "performance",
        code: "K",
        title: "Performance & Scalability",
        category: "operations",
        enabled: true,
        summary:
          "Sub-3.5s live turn latency, client GPU degradation tiers, lease-locked async processing, and multi-key throughput scaling.",
        bodyMarkdown: `### Latency & Throughput Engineering

- **Critical-Path Turn Latency (<3.5s):** Live turn evaluation (\`p4\`) routes first to Groq LPUs with \`reasoning_effort: "low"\`, \`max_completion_tokens: 900\`, and a \`3.5s\` timeout before seamlessly failing over to Gemini Flash (\`thinking: "low"\`).
- **Adaptive Client FPS Degradation:** MediaPipe tracks per-frame inference time and automatically steps down from 20 FPS WebGL2 to lower frequencies or CPU fallback if frame duration exceeds 40–60ms, keeping audio capture glitch-free on budget laptops.
- **Token & Bandwidth Efficiency:** Gemini Live runs \`MEDIA_RESOLUTION_LOW\` (1 FPS \`640×360\` JPEG at quality \`0.6\`) with \`contextWindowCompression: { slidingWindow: {} }\` and \`sessionResumption\`. Post-interview \`rescore\` skips turns unless live scoring failed or Whisper recovered ≥30% more words, and \`p7\` batches all turns into a single audio request.
- **Horizontal Failover Scaling:** Unlimited comma-separated or numbered Gemini and Groq API keys rotate in **model-outer × key-inner** order with smart per-(key, model) cooldowns, avoiding single-key 429 bottlenecks.`,
      },
      {
        id: "security",
        code: "L",
        title: "Security & Compliance",
        category: "operations",
        enabled: true,
        summary:
          "Row-Level Security, column-level Postgres grants, ephemeral Live tokens, prompt-injection delimiters, and HMAC certificate signing.",
        bodyMarkdown: `### Defense-in-Depth Security Controls

- **Authentication & RBAC:** Supabase Auth (Email verification + Google OAuth) with SSR cookie middleware (\`guardRequest\`). Role separation across Candidate (session owner), Recruiter / Owner (\`is_org_member\` PostgreSQL \`SECURITY DEFINER\` function), and Platform Admin (\`ADMIN_EMAILS\` allowlist returning \`404\`/\`403\` to non-admins).
- **Database Isolation:** Row-Level Security enabled on all 19 tables, column-level \`REVOKE/GRANT\` hiding hidden interview plans and strategist state from client queries, and automated PGlite RLS regression tests verifying cross-user isolation.
- **AI Prompt Injection Hardening:** \`render.ts\` recursively strips \`<<<BEGIN\` / \`<<<END\` tokens across 15 untrusted fields before wrapping user/document data in explicit delimiters; \`p5\` strictly distinguishes \`[DIRECTIVE]\` envelopes from candidate speech.
- **Ephemeral Credentials & Signed Verification:** Browser Live clients only ever receive single-use (\`uses: 1\`) ephemeral tokens locked server-side to the session's persona and tools — raw provider API keys never reach the client. Public certificates are signed via HMAC-SHA256 (\`CERT_SIGNING_SECRET\`) and revocable instantly.`,
      },
      {
        id: "analytics",
        code: "M",
        title: "Live System Analytics",
        category: "operations",
        enabled: true,
        summary:
          "Real-time KPIs, session trends, multimodal event distribution, and AI provider pool status synced directly from PostgreSQL.",
        bodyMarkdown: "",
      },
      {
        id: "team",
        code: "N",
        title: "Team & Contributors",
        category: "operations",
        enabled: true,
        summary:
          "The builders behind SkillMirror — synced directly with the Pitch Deck Team showcase and editable from /admin/docs.",
        bodyMarkdown: "",
      },
      {
        id: "changelog",
        code: "O",
        title: "Changelog",
        category: "operations",
        enabled: true,
        summary:
          "Chronological version history tracking product releases, schema migrations, and published documentation revisions.",
        bodyMarkdown: "",
      },
    ],
  };
}
