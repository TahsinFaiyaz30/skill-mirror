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

## Camera fixture

The built-in image generation tool produced the fictional webcam frame for `tests/fixtures/candidate.y4m` with this prompt.

> Create a photorealistic, synthetic webcam test frame, landscape 4:3 composition. One fictional adult seated upright, looking directly into the centered camera, neutral expression, open eyes, bare face without glasses, simple dark blue crew-neck shirt. Show both shoulders completely and the top half of the torso to the chest. Keep the top of the head 12 percent below the top edge, the chin slightly below the vertical midpoint, and the shoulders fully visible well inside the left and right edges. Flat even soft light, plain light warm gray wall. Straight head and level shoulders, full face visible. Natural unstyled security-camera realism, no lettering or interface. This will be used only as a test frame for webcam framing and gaze calibration.

## Local verification

- On 19 November 2026, lint, typecheck, the production build, 90 Vitest tests, and both mock Playwright flows passed. The browser tests checked Light and Dark baselines, a recorded clip, candidate feedback visibility, and recruiter comparisons.
- Lighthouse accessibility scored 100 for the landing page, 100 for the dashboard, and 97 for the practice report in both themes on the production build. Short timeline bars are flagged as small targets. The timeline seek control and the question list also open clips.
- The production build issued a mock practice certificate and verified its signature through the public endpoint. Excel treated an exported candidate name beginning with `=` as text.

## External acceptance

- No configured Gemini, Groq, Supabase, or Resend credentials were present. The Live and pipeline provider calls, cloud Auth email and Google OAuth, project quotas and latency, and production deployment remain unverified. The tone-check WAV is included. The Kore and Charon provider WAVs require the configured TTS generation script.
- The MediaPipe sign-check overlay and synthetic geometry tests are in place. A physical sign check, real-camera calibration, 20-minute connection and segment timing, and Wi-Fi interruption acceptance remain to be measured. The thresholds are those in the spec.
