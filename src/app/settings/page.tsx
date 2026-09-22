"use client";

import { useEffect, useState } from "react";
import { Boxes, CheckCircle2, Download, KeyRound, LogOut, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getLastSyncAt, syncNow } from "@/lib/sync";
import { seedDefaultProducts } from "@/lib/seed";
import { pendingSyncCount, resetAllStockToZero } from "@/lib/repository";
import { formatDateTime } from "@/lib/utils";
import InstallButton from "@/components/InstallButton";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";
import { DEFAULT_PROFILE, loadStoreProfile, saveStoreProfile, type StoreProfile } from "@/lib/store-profile";

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
  const [profile, setProfile] = useState<StoreProfile>(DEFAULT_PROFILE);
  const [nextSecret, setNextSecret] = useState("");
  const [repeatSecret, setRepeatSecret] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = async () => {
    setLastSync(await getLastSyncAt());
    setPending(await pendingSyncCount());
  };

  useEffect(() => {
    void getSetting("cashier_name", "Counter").then(setCashier);
    void loadStoreProfile().then(setProfile);
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
    toast("Cashier name saved.", "success");
    window.setTimeout(() => setSaved(false), 2000);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveStoreProfile(profile);
    toast("Store details saved — receipts and reports updated.", "success");
  };

  const setField = (key: keyof StoreProfile) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setProfile((current) => ({
      ...current,
      [key]: key === "vatRate" ? Number(event.target.value) || 0 : event.target.value,
    }));

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

  /** Lets a till change its own sign-in credential without the Supabase dashboard. */
  const changeCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    if (nextSecret.length < 8) {
      toast("Use at least 8 characters.", "error");
      return;
    }
    if (nextSecret !== repeatSecret) {
      toast("The two entries do not match.", "error");
      return;
    }
    setBusy("credential");
    const { error } = await supabase.auth.updateUser({ password: nextSecret });
    setBusy("");
    if (error) {
      toast(error.message, "error");
      return;
    }
    setNextSecret("");
    setRepeatSecret("");
    toast("Sign-in updated for this account.", "success");
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
    const added = await seedDefaultProducts();
    setSyncMessage(added ? `${added} products added.` : "Inventory already has products.");
    setBusy("");
  };

  const resetStock = async () => {
    setConfirmReset(false);
    const touched = await resetAllStockToZero();
    toast(
      touched
        ? `Stock cleared on ${touched} product(s). Build it back up with Transfer In.`
        : "Every product was already at zero.",
      "success",
    );
    void refresh();
  };

  const clearLocal = async () => {
    setConfirmClear(false);
    const dbi = getDb();
    await Promise.all([
      dbi.products.clear(),
      dbi.sales.clear(),
      dbi.saleItems.clear(),
      dbi.stockMovements.clear(),
    ]);
    toast("Local data cleared on this device.", "success");
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

        {session && (
          <form onSubmit={changeCredential} className="mt-4 rounded-2xl bg-black/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-700/55">
              Change sign-in
            </p>
            <p className="mt-1 text-xs text-ink-700/55">
              Replace the temporary one you were given. At least 8 characters.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={nextSecret}
                onChange={(event) => setNextSecret(event.target.value)}
                className="input"
                type="password"
                placeholder="New sign-in"
                autoComplete="new-password"
              />
              <input
                value={repeatSecret}
                onChange={(event) => setRepeatSecret(event.target.value)}
                className="input"
                type="password"
                placeholder="Repeat it"
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={busy === "credential" || !nextSecret} className="btn-ghost mt-2">
              <KeyRound size={16} /> Update sign-in
            </button>
          </form>
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
        <h2 className="text-sm font-bold text-ink-900">Store details</h2>
        <p className="mt-1 text-xs text-ink-700/55">Printed on every receipt and used as the report heading.</p>
        <form onSubmit={saveProfile} className="mt-3 space-y-3">
          <label className="block">
            <span className="label">Business name</span>
            <input value={profile.name} onChange={setField("name")} className="input" placeholder="Xpel Beauty NG" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input value={profile.address} onChange={setField("address")} className="input" placeholder="Shop address" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Phone</span>
              <input value={profile.phone} onChange={setField("phone")} className="input" placeholder="0800 000 0000" />
            </label>
            <label className="block">
              <span className="label">VAT rate (%)</span>
              <input
                value={profile.vatRate}
                onChange={setField("vatRate")}
                className="input tabular"
                inputMode="decimal"
                placeholder="0"
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Receipt footer</span>
            <input
              value={profile.receiptFooter}
              onChange={setField("receiptFooter")}
              className="input"
              placeholder="Thank you for shopping with us"
            />
          </label>
          <button type="submit" className="btn-dark">
            Save store details
          </button>
        </form>
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
        <div className="mt-3">
          <InstallButton variant="block" />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink-900">Data</h2>
        <p className="mt-1 text-xs text-ink-700/55">
          Everything is stored on this device first. Syncing copies it to the cloud database.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={loadSamples} disabled={busy === "seed"} className="btn-ghost">
            <Download size={16} /> Load default catalogue
          </button>
          <button onClick={() => setConfirmReset(true)} className="btn-ghost">
            <Boxes size={16} /> Reset all stock to zero
          </button>
          <button onClick={() => setConfirmClear(true)} className="btn-ghost text-brand-700">
            <Trash2 size={16} /> Clear local data
          </button>
        </div>
      </section>

      {confirmReset && (
        <Modal
          title="Reset all stock to zero?"
          onClose={() => setConfirmReset(false)}
          size="sm"
          footer={
            <>
              <button onClick={() => setConfirmReset(false)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button onClick={() => void resetStock()} className="btn-primary flex-1">
                Reset stock
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700/75">
            Every product drops to <strong className="text-ink-900">0 in stock</strong>, so the shelf
            can be rebuilt from what the warehouse actually sends through{" "}
            <strong className="text-ink-900">Transfer In</strong>.
          </p>
          <p className="mt-2 text-sm text-ink-700/75">
            Products, prices, sales and customers are untouched, and each change is recorded as a
            stock movement so the history still adds up.
          </p>
        </Modal>
      )}

      {confirmClear && (
        <Modal
          title="Clear local data?"
          onClose={() => setConfirmClear(false)}
          size="sm"
          footer={
            <>
              <button onClick={() => setConfirmClear(false)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={() => void clearLocal()}
                className="btn flex-1 bg-brand-600 text-white hover:bg-brand-700"
              >
                Clear everything
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700/75">
            Every product, sale and stock movement stored on <strong className="text-ink-900">this device</strong> is
            deleted. {pending > 0 ? `${pending} record(s) have not been uploaded yet and will be lost.` : "Synced records stay safe in the cloud and download again on the next sync."}
          </p>
        </Modal>
      )}
    </div>
  );
}
