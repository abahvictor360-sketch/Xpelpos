"use client";

import { useCallback, useEffect, useState } from "react";
import { getLastSyncAt, syncNow, type SyncReport } from "./sync";
import { pendingSyncCount } from "./repository";
import { getSupabase } from "./supabase";

const INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export interface SyncEngineState {
  online: boolean;
  busy: boolean;
  pending: number;
  lastSyncAt: string;
  lastMessage: string;
  sync: (manual?: boolean) => Promise<SyncReport | undefined>;
}

/**
 * Drives cloud sync for the whole app. A sync is attempted on launch, whenever
 * the device comes back online, when the window regains focus, and on a timer —
 * with exponential backoff after failures so a signed-out or unreachable
 * backend is not hammered. Everything stays queued locally in the meantime.
 */
export function useSyncEngine(): SyncEngineState {
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [lastMessage, setLastMessage] = useState("");

  const refresh = useCallback(async () => {
    setPending(await pendingSyncCount());
    setLastSyncAt(await getLastSyncAt());
  }, []);

  const sync = useCallback(
    async (manual = false) => {
      if (!manual && typeof navigator !== "undefined" && !navigator.onLine) return undefined;
      setBusy(true);
      const report = await syncNow();
      setBusy(false);
      setLastMessage(report.message);
      await refresh();
      return report;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    setOnline(navigator.onLine);

    let failures = 0;
    let timer = 0;

    const attempt = async () => {
      const report = await sync();
      if (report) failures = report.ok ? 0 : failures + 1;
      schedule();
    };

    const schedule = () => {
      window.clearTimeout(timer);
      // Back off after repeated failures (offline, signed out, server down).
      const delay = Math.min(INTERVAL_MS * 2 ** Math.min(failures, 6), MAX_BACKOFF_MS);
      timer = window.setTimeout(() => void attempt(), delay);
    };

    const onOnline = () => {
      setOnline(true);
      failures = 0;
      void attempt();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void attempt();
    };

    // Signing in is the other moment everything queued becomes uploadable.
    const auth = getSupabase()?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        failures = 0;
        void attempt();
      }
    });

    // Launch attempt — covers "the app was reopened and there is signal now".
    void attempt();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearTimeout(timer);
      auth?.data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [sync, refresh]);

  // Keep the pending counter honest as sales are rung up between syncs.
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { online, busy, pending, lastSyncAt, lastMessage, sync };
}
