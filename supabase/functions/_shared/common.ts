// Shared helpers for the Xpel POS edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Where the admin's approve / reject page lives. */
export const DEFAULT_APP_URL = "https://xpel-pos.vercel.app";

export async function getConfig(admin: SupabaseClient, key: string): Promise<string> {
  const { data } = await admin.from("pos_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

export async function setConfig(admin: SupabaseClient, key: string, value: string): Promise<void> {
  const { error } = await admin
    .from("pos_config")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function naira(value: unknown): string {
  return `NGN ${Number(value ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function emailReady(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY"));
}

export interface MailAttachment {
  filename: string;
  /** Base64 file content. */
  content: string;
}

/** Sends one email through Resend. */
export async function sendMail(options: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("Email is not set up yet: add the RESEND_API_KEY secret in Supabase.");
  const from = Deno.env.get("MAIL_FROM") || "Xpel Beauty <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`The email service refused the message (${response.status}): ${detail.slice(0, 300)}`);
  }
}

/** A plain branded email body. */
export function emailLayout(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ef;font-family:Arial,Helvetica,sans-serif;color:#1f1e19">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#cf6d1e;font-weight:700">Xpel Beauty</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${inner}
</div>
<p style="font-size:11px;color:#8a877f;text-align:center;margin-top:16px">Xpel Beauty NG · 08107574456 · www.xpelbeauty.com</p>
</div></body></html>`;
}
