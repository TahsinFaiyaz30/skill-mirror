import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authenticatedHome, getOrg, getProfile } from "@/lib/auth/guards";
import { localMock, publicEnv } from "@/lib/config/env";
import { mockUser } from "@/lib/auth/mock";
import { authPath } from "@/lib/auth/navigation";

function cameFromHiring(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const parsed = new URL(referer);
    return (
      parsed.origin === request.nextUrl.origin &&
      parsed.pathname.startsWith("/hiring")
    );
  } catch {
    return false;
  }
}

export async function guardRequest(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;
  const landing = pathname === "/";
  const authScreen = pathname === "/login" || pathname === "/signup";
  const api = pathname.startsWith("/api/");
  const protectedPage =
    /^\/(onboarding|dashboard|progress|settings|interview|hiring|admin)(\/|$)/.test(
      pathname,
    );
  if (!landing && !authScreen && !protectedPage && !api) return response;
  let userId: string | undefined;
  if (localMock) userId = (await mockUser())?.id;
  else if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
    const client = createServerClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) {
            for (const { name, value } of values)
              request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of values)
              response.cookies.set(name, value, options);
          },
        },
      },
    );
    userId = (await client.auth.getUser()).data.user?.id;
  }
  const redirect = (path: string) => {
    const redirection = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll())
      redirection.cookies.set(cookie);
    if (landing) {
      redirection.headers.set(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate",
      );
      redirection.headers.set("Vary", "Cookie");
    }
    return redirection;
  };
  if (landing) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, no-cache, must-revalidate",
    );
    response.headers.set("Vary", "Cookie");
    if (userId) {
      let target = "/dashboard";
      try {
        target = await authenticatedHome(userId, cameFromHiring(request));
      } catch {
        target = "/dashboard";
      }
      return redirect(target);
    }
    return response;
  }
  if (authScreen && userId)
    return redirect(
      authPath(
        "/auth/continue",
        request.nextUrl.searchParams.get("next"),
        request.nextUrl.searchParams.get("intent"),
      ),
    );
  if (!protectedPage) return response;
  if (!userId) return redirect(authPath("/login", pathname + search));
  if (pathname.startsWith("/hiring") && !(await getOrg(userId)))
    return redirect("/dashboard");
  if (pathname !== "/onboarding" && !(await getProfile(userId))?.onboardedAt)
    return redirect(authPath("/onboarding", pathname + search));
  return response;
}
