"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The project to sync with comes from the environment, with no built-in
// fallback: a build that was never told where to sync keeps selling from the
// local database instead of quietly pushing the shop's takings somewhere
// nobody chose. Next inlines both at build time.
//
// These are publishable client keys — every table is protected by row-level
// security and requires a signed-in user.
/**
 * Trims the value and keeps it only if it really is an http(s) URL.
 *
 * A deployment that sets the host without a scheme, or leaves the quotes on,
 * used to take the whole till down: createClient throws "Invalid supabaseUrl"
 * while the page is rendering, and every screen dies with it. Sync is the one
 * part of this app that is allowed to be missing, so bad configuration turns
 * it off rather than ending the shift.
 */
function readUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!value) return "";

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("scheme");
    return value;
  } catch {
    console.error(
      `[xpel] NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL: ${JSON.stringify(value)}. ` +
        "Cloud sync is off; the till still works offline.",
    );
    return "";
  }
}

const url = readUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim().replace(/^["']|["']$/g, "");

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    try {
      client = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: "xpel-pos-auth",
        },
      });
    } catch (error) {
      console.error(`[xpel] could not start cloud sync: ${String(error)}`);
      return null;
    }
  }
  return client;
}
