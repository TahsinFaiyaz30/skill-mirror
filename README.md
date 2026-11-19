# SkillMirror

SkillMirror runs adaptive practice and company interviews in desktop Chrome or Edge. The same interview engine powers both workflows.

## Local mock mode

1. Install Node.js 24 and run `npm ci`.
2. Set `NEXT_PUBLIC_AI_MODE=mock` in `.env.local`.
3. Run `npm run dev` and open http://localhost:3000.
4. Sign up and choose Practice or Hiring. The local mock store uses `.skill-mirror/`. Mock mode also works with a configured Supabase project.

The browser tests use mock AI and the camera and microphone files in `tests/fixtures/`. Practice passes through the full setup wizard. Hiring uses the mock calibration option. The tests exercise media recording, signed playback, and report generation without provider calls.

## Supabase and provider setup

1. Copy `.env.example` to `.env.local`. Fill in the Supabase URL, anon key, service-role key, and transaction-pooler database URL (port 6543). The recommended Supabase region is Mumbai (`ap-south-1`).
2. Apply `supabase/migrations` in order with the Supabase CLI or your migration tooling. Use pinned migration files when provisioning an existing environment.
3. In Supabase Auth, enable email confirmation and secure password changes. Set the minimum password length to 8. Set the site URL and allow `/auth/callback` and `/auth/confirm` on the local and deployment origins. Install the two email templates in `supabase/email-templates`. Enable Google using a Google OAuth client registered to the Supabase callback URL.
4. Set `GEMINI_API_KEY`, `GROQ_API_KEY`, `CERT_SIGNING_SECRET` (32+ random bytes), and `CRON_SECRET`. Verify access to the model IDs in `.env.example`. Set `NEXT_PUBLIC_AI_MODE=pipeline` when Live is unavailable.
5. For Vercel, configure the same variables and set `NEXT_PUBLIC_APP_URL` to the deployment URL. Configure Resend and a verified sender if you want invitation delivery by email. Recruiters can always copy invitation links.

Voice selection plays the bundled Google AI Studio samples for [Kore](https://www.gstatic.com/aistudio/voices/samples/Kore.wav) and [Charon](https://www.gstatic.com/aistudio/voices/samples/Charon.wav). To regenerate interviewer-specific samples, run `npm run audio:previews` with a configured Gemini key.

Unpaid AI deployments are for fictional CVs, synthetic audio/video and non-confidential instructions. The app requires confirmation before parsing a CV or starting an unpaid interview. Set `NEXT_PUBLIC_AI_DATA_TIER=paid` for real applicant interviews only after configuring providers that permit this use and hosting that permits commercial use. Billing is configured directly with the providers. [Gemini API terms](https://aistudio.google.com/docs/terms#unpaid-services) · [Vercel terms](https://vercel.com/legal/terms)

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`. The Playwright suite starts its own local mock server.

The golden report fixture includes the expected JSON and a scoring workbook under `tests/fixtures/session-01/`. The database tests apply the same SQL migrations to embedded PostgreSQL and exercise authenticated row-level access.
