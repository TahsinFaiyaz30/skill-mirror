# SkillMirror

SkillMirror runs adaptive practice and company interviews in desktop Chrome or Edge. The same interview engine powers both workflows.

## Local mock mode

1. Install Node.js 24 and run `npm ci`.
2. Set `NEXT_PUBLIC_AI_MODE=mock` in `.env.local`.
3. Run `npm run dev` and open http://localhost:3000.
4. Sign up and choose Practice or Hiring. The local mock store uses `.skill-mirror/`. Mock mode also works with a configured Supabase project.

## Supabase and provider setup

1. Copy `.env.example` to `.env.local`. Fill in the Supabase URL, anon key, service-role key, and transaction-pooler database URL (port 6543). The recommended Supabase region is Mumbai (`ap-south-1`).
2. Apply `supabase/migrations` in order with the Supabase CLI or your migration tooling. Use pinned migration files when provisioning an existing environment.
3. In Supabase Auth, enable email confirmation and secure password changes. Set the minimum password length to 8. Set the site URL and allow `/auth/callback` and `/auth/confirm` on the local and deployment origins. Install the two email templates in `supabase/email-templates`. Enable Google using a Google OAuth client registered to the Supabase callback URL.
4. Set `GEMINI_API_KEY`, `GROQ_API_KEY`, `CERT_SIGNING_SECRET` (32+ random bytes), and `CRON_SECRET`. Verify access to the model IDs in `.env.example`. Set `NEXT_PUBLIC_AI_MODE=pipeline` when Live is unavailable.
5. For Vercel, configure the same variables and set `NEXT_PUBLIC_APP_URL` to the deployment URL. Configure Resend and a verified sender if you want invitation delivery by email. Recruiters can always copy invitation links.

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`. The Playwright suite starts its own local mock server.
