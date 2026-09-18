"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Falls back to the Xpel Beauty project so a fresh deployment syncs out of the box.
// These are publishable client keys — every table is protected by row-level security
// and requires a signed-in user.
const DEFAULT_URL = "https://pigiyachdxvcnttspomt.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_U_c_cbU4LghEegJu9dcUhg_yqKwMpRa";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "xpel-pos-auth",
      },
    });
  }
  return client;
}
