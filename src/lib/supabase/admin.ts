import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/config/env";
export function adminSupabase() {
  const { supabaseUrl } = publicEnv;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) throw new Error("Supabase service credentials are missing.");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
