"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cx } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const EVENT = "xpel-toast";
let nextId = 1;

/** Fire-and-forget notification — replaces blocking alert() dialogs. */
export function toast(message: string, tone: Tone = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: nextId++, message, tone } }));
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONES: Record<Tone, string> = {
  success: "border-olive-500/30 bg-olive-100 text-olive-900",
  error: "border-brand-500/30 bg-brand-50 text-brand-700",
  info: "border-black/10 bg-white text-ink-800",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Toast>).detail;
      setToasts((current) => [...current, detail]);
      window.setTimeout(
        () => setToasts((current) => current.filter((item) => item.id !== detail.id)),
        4000,
      );
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 print:hidden">
      {toasts.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            role="status"
            className={cx(
              "pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-card",
              TONES[item.tone],
            )}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() => setToasts((current) => current.filter((t) => t.id !== item.id))}
              aria-label="Dismiss"
              className="rounded-md p-0.5 hover:bg-black/5"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
