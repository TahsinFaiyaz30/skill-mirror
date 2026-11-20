"use client";

import { useEffect } from "react";
import { localMock, publicEnv } from "@/lib/config/env";
import { browserSupabase } from "@/lib/supabase/client";

// Extra client-side safeguard on top of proxy + server-component redirects:
// prevents bfcache or another tab's sign-in from ever showing the landing page
// to an authenticated user.
export function LandingAuthGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);

    let unsubscribe: (() => void) | undefined;
    if (!localMock && publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
      const client = browserSupabase();
      void client.auth.getSession().then(({ data }) => {
        if (data.session) window.location.replace("/auth/continue");
      });
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (session) window.location.replace("/auth/continue");
      });
      unsubscribe = () => subscription.unsubscribe();
    }

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      unsubscribe?.();
    };
  }, []);

  return null;
}
