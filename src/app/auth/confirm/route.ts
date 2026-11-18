import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { authPath, safeNext } from "@/lib/auth/navigation";
import { publicEnv } from "@/lib/config/env";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const token_hash = search.get("token_hash"),
    type = search.get("type");
  if (
    token_hash &&
    (type === "signup" || type === "recovery") &&
    publicEnv.supabaseUrl
  ) {
    const { error } = await (
      await serverSupabase()
    ).auth.verifyOtp({ token_hash, type });
    if (!error) {
      const raw = search.get("next");
      let next = safeNext(raw),
        intent = search.get("intent");
      if (raw)
        try {
          const redirect = new URL(raw, publicEnv.appUrl);
          if (
            redirect.origin === new URL(publicEnv.appUrl).origin &&
            [
              "/auth/confirm",
              "/auth/continue",
              "/reset-password",
              "/",
            ].includes(redirect.pathname)
          ) {
            next = safeNext(redirect.searchParams.get("next"));
            intent ??= redirect.searchParams.get("intent");
          }
        } catch {
          /* Ignore invalid continuation values. */
        }
      return NextResponse.redirect(
        new URL(
          authPath(
            type === "recovery" ? "/reset-password" : "/auth/continue",
            next,
            intent,
          ),
          request.url,
        ),
      );
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=link_invalid", request.url),
  );
}
