import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { authPath } from "@/lib/auth/navigation";
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const code = search.get("code");
  if (code) {
    const { error } = await (await serverSupabase()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(authPath("/auth/continue", search.get("next"), search.get("intent")), request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}
