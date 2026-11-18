# Decisions

- The local mock configuration uses embedded Postgres, local signed storage, and local auth when no Supabase credentials are configured. With Supabase configured, mock mode only replaces the AI providers. Mock sign-ups on the local backend confirm immediately, since development has no email sender.
- Next.js recognizes `proxy.ts` for the current Node.js request-guard convention. `src/lib/auth/middleware.ts` contains the shared guard implementation.
- Vercel invokes cron routes with GET. The retention handler accepts both Vercel's GET and the specified POST with the same bearer check.
- No provider quotas or paid services were inferred. Project-specific Gemini/Groq limits, email delivery, and physical camera calibration require the configured services and equipment.
