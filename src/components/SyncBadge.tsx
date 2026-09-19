"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useSyncEngine } from "@/lib/useSyncEngine";
import { toast } from "./Toaster";
import { cx, formatDateTime } from "@/lib/utils";

export default function SyncBadge() {
  const { online, busy, pending, lastSyncAt, sync } = useSyncEngine();

  const handleClick = async () => {
    const report = await sync(true);
    if (report) toast(report.message, report.ok ? "success" : "info");
  };

  const title = [
    online ? "Online" : "Offline — sales are saved on this device",
    pending > 0 ? `${pending} record(s) waiting to upload` : "Everything is uploaded",
    lastSyncAt ? `Last sync ${formatDateTime(lastSyncAt)}` : "Not synced yet",
  ].join(" · ");

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={cx(
        "chip border",
        online ? "border-olive-500/30 bg-olive-100 text-olive-900" : "border-black/10 bg-white text-ink-700/70",
      )}
    >
      {busy ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : online ? (
        <Cloud size={14} />
      ) : (
        <CloudOff size={14} />
      )}
      <span className="hidden sm:inline">{busy ? "Syncing" : online ? "Online" : "Offline"}</span>
      {pending > 0 && (
        <span className="tabular rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{pending}</span>
      )}
    </button>
  );
}
