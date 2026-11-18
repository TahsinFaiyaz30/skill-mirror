import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/config/env";
export async function serverSupabase() {
  const { supabaseUrl, supabaseAnonKey } = publicEnv;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase is unconfigured.");
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try { for (const { name, value, options } of toSet) cookieStore.set(name, value, options); }
        catch { /* Proxy refreshes sessions before Server Components render. */ }
      },
    },
  });
}
