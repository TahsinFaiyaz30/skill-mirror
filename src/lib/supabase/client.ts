"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/env";
export function browserSupabase() {
  const { supabaseUrl, supabaseAnonKey } = publicEnv;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase is unconfigured.");
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
