# Decisions

- The local mock configuration uses embedded Postgres, local signed storage, and local auth when no Supabase credentials are configured. With Supabase configured, mock mode only replaces the AI providers. Mock sign-ups on the local backend confirm immediately, since development has no email sender.
- Next.js recognizes `proxy.ts` for the current Node.js request-guard convention. `src/lib/auth/middleware.ts` contains the shared guard implementation.
- Vercel invokes cron routes with GET. The retention handler accepts both Vercel's GET and the specified POST with the same bearer check.
- No provider quotas or paid services were inferred. Project-specific Gemini/Groq limits, email delivery, and physical camera calibration require the configured services and equipment.

## Implementation choices

- The Playwright tests loop a generated webcam frame and a synthetic microphone signal through Chrome's file-backed capture devices. Practice exercises the framing, posture, gaze, microphone, and tone steps. Hiring uses the mock calibration option. The mock backend confirms sign-ups immediately and skips invitation email. Fixtures use synthetic names, addresses, and CVs.
- Playback visibility applies to direct Supabase storage reads as well as the playback API. Candidates with summary or none feedback can upload their recordings with signed URLs. Recruiters obtain authorized playback links through their report.
- The scripted ability estimate starts at the expected level minus one, clamped to the starting range, with the same initial Elo offset as the adaptive path. This lets company questions update theta without creating an AI ladder.
- A draft with no available scored-phase weight uses the soft component as the fallback weight. The opening validator still reports incompatible phase selections and invalid input totals.
- Unavailable delivery signals use a neutral 50 in dimension formulas that require an input. The specified neutral tone value remains 60. Stress renormalizes over measured inputs. Benchmark outcomes are in the hand-calculated fixture, which recalculated to 57 and 58 in Excel.
- The public invitation metadata includes the headphone requirement for the invitation page. Interview limits remain in the session config snapshot.
- The browser keeps a separate microphone-only Web Audio destination so a replacement mic can resume the recording without changing the track already owned by the recorder.
- The candidate question phase starts its 90-second cap as soon as the interviewer finishes the handoff. If the provider returns zero usable ladder questions after two attempts, the interview uses local competency questions. When any generated questions are usable, empty slots are filled from nearby levels.
- Mock question import uses a sample question for PDFs. Pasted text, plain-text files, and DOCX files use their supplied text. Live and pipeline mode pass the PDF content to the configured importer.
- `@google/genai` (v3.6.0) uses `v1beta` for Interactions API calls (required by Google's hosted API for `document`/`audio` inline inputs and `gemini-3.8-flash-lite-tts`), while `v1alpha` is restricted to ephemeral Live auth tokens (`authTokens.create` and browser `live.connect`).
- `gemini-3.8-flash` Interactions API calls (`P1`, `P2`, `P3`, `P4` fallback, `P7`, `P8`, `P9`, `P10`) omit deprecated sampling parameters (`temperature`, `top_p`, `top_k`) from `generation_config` and pass `response_format` at the top level with a sanitized JSON Schema (`$schema` and `maxItems > 10` omitted for constrained decoding, while full Zod validation remains enforced on parsed output). Groq calls retain their specified `temperature` settings.
- `gemini-3.8-flash-lite-tts` calls (`speakGemini` and `scripts/voice-previews.mjs`) keep `input` text strictly verbatim inside `user_input` content blocks, supply the delivery style via `speech_metadata` annotations, request `response_format: { type: "audio", mime_type: "audio/wav" }`, and verify the `RIFF`/`WAVE` header.
- `gemini-3.8-live` ephemeral tokens lock the full session config (`Modality.AUDIO`, `speechConfig`, `systemInstruction` via `P5`, input/output transcription, `MEDIA_RESOLUTION_LOW`, low-sensitivity VAD, echo-safe `NO_INTERRUPTION` when applicable, sliding-window context compression, session resumption, and `NON_BLOCKING` `next_step` / `flag_observation` tools) while omitting `thinkingConfig`, `proactiveAudio`, and `enableAffectiveDialog`. The Live client races `live.connect` against a 12 s handshake timeout, handles `toolCallCancellation` and `audioStreamEnd`, and the turn engine ignores pre-audio `modelTurnComplete` frames before a directive's speech is relayed.
- A `GoAway` still starts a background reconnect. If the socket switches during unfinished interviewer speech, the new socket replays that directive and preserves presentation timing. The watchdog also recovers speech that starts and then stalls without a completion event.
- Account deletion checks ownership under lock and commits application data deletion before Storage cleanup. When a sole owner deletes the organization, existing candidates keep their report and recording snapshots with the organization and opening links cleared. Candidates who have yet to start cannot start against the removed opening. The deletion request and retention cron can resume pending Storage and Auth cleanup after a failure. Storage cleanup precedes Auth deletion because Supabase may reject deleting an account that still owns Storage objects.
- Strategist evaluation runs outside the database transaction. The saved directive sequence determines which concurrent result can advance the interview. A report status response tells the browser when the existing processing lease can be reclaimed.
- Short reports use available scored answers to supplement key moments and can generate a narrative with fewer than five clips. Whisper alignment falls back to the live transcript for each turn that has no aligned words.
- Microphone setup records the noise floor once and waits for 480 ms of continuous signal above the existing level threshold. Reconnecting a microphone or camera requests the same constraints as setup.

## Camera fixture

The built-in image generation tool produced the fictional webcam frame for `tests/fixtures/candidate.y4m` with this prompt.

> Create a photorealistic, synthetic webcam test frame, landscape 4:3 composition. One fictional adult seated upright, looking directly into the centered camera, neutral expression, open eyes, bare face without glasses, simple dark blue crew-neck shirt. Show both shoulders completely and the top half of the torso to the chest. Keep the top of the head 12 percent below the top edge, the chin slightly below the vertical midpoint, and the shoulders fully visible well inside the left and right edges. Flat even soft light, plain light warm gray wall. Straight head and level shoulders, full face visible. Natural unstyled security-camera realism, no lettering or interface. This will be used only as a test frame for webcam framing and gaze calibration.

## Local verification

- After the audit fixes, lint, typecheck, the production build, all 126 Vitest tests, and both mock Playwright flows passed. Playwright checked timeline keyboard focus and verified at least 4.5:1 contrast on both destructive confirmation buttons in Light and Dark mode.
- On 19 November 2026, lint, typecheck, the production build, 98 Vitest tests (90 existing + 8 Gemini/Live contract tests), and both mock Playwright flows passed. The browser tests checked Light and Dark baselines, a recorded clip, candidate feedback visibility, and recruiter comparisons.
- Lighthouse accessibility scored 100 for the landing page, 100 for the dashboard, and 97 for the practice report in both themes before the audit fixes. Short timeline bars were flagged as small targets. The timeline now provides an explicit play button after seeking.
- The production build issued a mock practice certificate and verified its signature through the public endpoint. Excel treated an exported candidate name beginning with `=` as text.

## External acceptance

- No configured Gemini, Groq, Supabase, or Resend credentials were present. The Live and pipeline provider calls, cloud Auth email and Google OAuth, project quotas and latency, and production deployment remain unverified. The tone-check WAV and Google AI Studio’s published Kore and Charon preview clips are included. The preview generator can replace the clips with the interview greeting when a Gemini TTS key is configured.
- The MediaPipe sign-check overlay and synthetic geometry tests are in place. A physical sign check, real-camera calibration, 20-minute connection and segment timing, and Wi-Fi interruption acceptance remain to be measured. The thresholds are those in the spec.
