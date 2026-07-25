import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client only if both env vars are present, else null.
 * logEvent() handles the null case by falling back to console — this is what
 * lets the app run and demo with zero backend setup.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached = url && key ? createClient(url, key) : null;
  return cached;
}
