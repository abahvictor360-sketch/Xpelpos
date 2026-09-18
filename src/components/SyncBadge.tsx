"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { pendingSyncCount } from "@/lib/repository";
import { syncNow } from "@/lib/sync";
import { cx } from "@/lib/utils";

export default function SyncBadge() {
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const pending = useLiveQuery(() => pendingSyncCount(), [tick], 0) ?? 0;

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Background sync attempt every 2 minutes while the app is open and online.
  useEffect(() => {
    const run = async () => {
      if (!navigator.onLine) return;
      setBusy(true);
      await syncNow();
      setBusy(false);
      setTick((value) => value + 1);
    };
    const timer = window.setInterval(run, 120_000);
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const handleSync = async () => {
    setBusy(true);
    await syncNow();
    setBusy(false);
    setTick((value) => value + 1);
  };

  return (
    <button
      onClick={handleSync}
      disabled={busy}
      title={online ? "Sync with the cloud now" : "Offline — sales are stored on this device"}
      className={cx(
        "chip border",
        online
          ? "border-olive-500/30 bg-olive-100 text-olive-900"
          : "border-black/10 bg-white text-ink-700/70",
      )}
    >
      {busy ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : online ? (
        <Cloud size={14} />
      ) : (
        <CloudOff size={14} />
      )}
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
      {pending > 0 && (
        <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{pending}</span>
      )}
    </button>
  );
}
