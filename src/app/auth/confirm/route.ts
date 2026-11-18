import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { authPath, safeNext } from "@/lib/auth/navigation";
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const token_hash = search.get("token_hash");
  const type = search.get("type");
  if (token_hash && (type === "signup" || type === "recovery")) {
    const { error } = await (await serverSupabase()).auth.verifyOtp({ token_hash, type });
    const absoluteNext = search.get("next");
    let next = safeNext(absoluteNext);
    if (!next && absoluteNext) try {
      const target = new URL(absoluteNext);
      if (target.origin === request.nextUrl.origin) next = safeNext(target.searchParams.get("next") ?? target.pathname);
    } catch { /* Invalid redirect value. */ }
    if (!error) return NextResponse.redirect(new URL(authPath(type === "recovery" ? "/reset-password" : "/auth/continue", next === "/auth/continue" ? null : next, search.get("intent")), request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}
