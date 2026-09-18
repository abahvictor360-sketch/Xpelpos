"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, LogOut, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getLastSyncAt, syncNow } from "@/lib/sync";
import { seedSampleProducts } from "@/lib/seed";
import { pendingSyncCount } from "@/lib/repository";
import { formatDateTime } from "@/lib/utils";

export default function SettingsPage() {
  const [cashier, setCashier] = useState("");
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState("");

  const refresh = async () => {
    setLastSync(await getLastSyncAt());
    setPending(await pendingSyncCount());
  };

  useEffect(() => {
    void getSetting("cashier_name", "Counter").then(setCashier);
    void refresh();
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session?.user.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next?.user.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const saveCashier = async () => {
    await setSetting("cashier_name", cashier.trim() || "Counter");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const signIn = async (mode: "in" | "up") => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy("auth");
    setAuthMessage("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setAuthMessage(
      error ? error.message : mode === "up" ? "Account created — check your email if confirmation is on." : "Signed in.",
    );
    setBusy("");
    void refresh();
  };

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
    setAuthMessage("Signed out — sales still save on this device.");
  };

  const runSync = async () => {
    setBusy("sync");
    const report = await syncNow();
    setSyncMessage(report.message);
    setBusy("");
    void refresh();
  };

  const loadSamples = async () => {
    setBusy("seed");
    const added = await seedSampleProducts();
    setSyncMessage(added ? `${added} sample products added.` : "Inventory already has products.");
    setBusy("");
  };

  const clearLocal = async () => {
    if (!confirm("Delete ALL local data on this device? Anything not yet synced will be lost.")) return;
    const dbi = getDb();
    await Promise.all([
      dbi.products.clear(),
      dbi.sales.clear(),
      dbi.saleItems.clear(),
      dbi.stockMovements.clear(),
    ]);
    setSyncMessage("Local data cleared.");
    void refresh();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink-900">Cashier</h2>
        <p className="mt-1 text-xs text-ink-700/55">The name printed on receipts and sales reports.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={cashier}
            onChange={(event) => setCashier(event.target.value)}
            className="input"
            placeholder="Counter"
          />
          <button onClick={saveCashier} className="btn-dark">
            {saved ? <CheckCircle2 size={16} /> : null} Save
          </button>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink-900">Cloud sync</h2>
        <p className="mt-1 text-xs text-ink-700/55">
          {isSupabaseConfigured()
            ? "Sign in so this device can upload sales and download the shared catalogue."
            : "Supabase keys are not configured for this build — the app runs fully offline."}
        </p>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700/65">Signed in as</dt>
            <dd className="font-medium text-ink-900">{session ?? "Not signed in"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/65">Waiting to upload</dt>
            <dd className="tabular font-medium text-ink-900">{pending} record(s)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700/65">Last sync</dt>
            <dd className="font-medium text-ink-900">{lastSync ? formatDateTime(lastSync) : "Never"}</dd>
          </div>
        </dl>

        {!session && isSupabaseConfigured() && (
          <div className="mt-3 space-y-2">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="Email"
              type="email"
              autoComplete="username"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <button onClick={() => void signIn("in")} disabled={busy === "auth"} className="btn-primary flex-1">
                Sign in
              </button>
              <button onClick={() => void signIn("up")} disabled={busy === "auth"} className="btn-ghost flex-1">
                Create account
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={runSync} disabled={busy === "sync"} className="btn-dark">
            <RefreshCw size={16} className={busy === "sync" ? "animate-spin" : undefined} /> Sync now
          </button>
          {session && (
            <button onClick={signOut} className="btn-ghost">
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>

        {(authMessage || syncMessage) && (
          <p className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-ink-700/80">
            {authMessage || syncMessage}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <Smartphone size={15} /> Install on this device
        </h2>
        <ul className="mt-2 space-y-2 text-sm text-ink-700/70">
          <li>
            <strong className="text-ink-900">Windows PC:</strong> open the app in Edge or Chrome, then use the install
            icon in the address bar (or menu → Apps → Install this site as an app).
          </li>
          <li>
            <strong className="text-ink-900">Android:</strong> open in Chrome, tap the ⋮ menu → “Add to Home screen” /
            “Install app”.
          </li>
          <li>Once installed it opens in its own window and keeps working without internet.</li>
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink-900">Data</h2>
        <p className="mt-1 text-xs text-ink-700/55">
          Everything is stored on this device first. Syncing copies it to the cloud database.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={loadSamples} disabled={busy === "seed"} className="btn-ghost">
            <Download size={16} /> Load sample products
          </button>
          <button onClick={clearLocal} className="btn-ghost text-brand-700">
            <Trash2 size={16} /> Clear local data
          </button>
        </div>
      </section>
    </div>
  );
}
