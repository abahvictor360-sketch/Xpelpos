"use client";

import { useEffect, useState } from "react";
import { Check, Download, Share, X } from "lucide-react";
import { cx } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports installation through a non-standard flag.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Shows an in-app install button. Chrome/Edge (Windows + Android) hand us a
 * `beforeinstallprompt` event we can replay; iOS Safari has no such API, so
 * there we show the Add-to-Home-Screen steps instead.
 */
export default function InstallButton({ variant = "chip" }: { variant?: "chip" | "block" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) {
      setShowHelp(true);
      return;
    }
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  if (installed) {
    if (variant === "chip") return null;
    return (
      <p className="chip bg-olive-100 text-olive-900">
        <Check size={14} /> Installed on this device
      </p>
    );
  }

  // Nothing to offer on a desktop browser that already refused the prompt.
  if (variant === "chip" && !deferred && !isIos) return null;

  return (
    <>
      <button
        onClick={install}
        className={cx(
          variant === "chip"
            ? "chip border border-brand-500/30 bg-brand-50 text-brand-700 hover:bg-brand-100"
            : "btn-primary",
        )}
      >
        <Download size={variant === "chip" ? 14 : 16} />
        <span className={variant === "chip" ? "hidden sm:inline" : undefined}>Install app</span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink-900">Install Xpel POS</h2>
              <button onClick={() => setShowHelp(false)} aria-label="Close" className="rounded-lg p-1 hover:bg-black/5">
                <X size={18} />
              </button>
            </div>
            <ol className="space-y-2 text-sm text-ink-700/75">
              {(isIos
                ? [
                    <>
                      Tap the <Share size={14} className="inline align-text-bottom" /> Share button in the browser
                      toolbar.
                    </>,
                    <>
                      Choose <strong className="text-ink-900">Add to Home Screen</strong>.
                    </>,
                    <>
                      Tap <strong className="text-ink-900">Add</strong> — the till then opens full screen and works
                      offline.
                    </>,
                  ]
                : [
                    <>
                      Open this page in <strong className="text-ink-900">Chrome</strong> or{" "}
                      <strong className="text-ink-900">Edge</strong> (Firefox cannot install web apps).
                    </>,
                    <>
                      Use the install icon at the right of the address bar, or the browser menu →{" "}
                      <strong className="text-ink-900">Install app</strong> / <strong className="text-ink-900">Apps
                      → Install this site as an app</strong>.
                    </>,
                    <>The till then opens in its own window and keeps working offline.</>,
                  ]
              ).map((step, index) => (
                <li key={index} className="flex gap-2">
                  <span className="font-bold text-ink-900">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => setShowHelp(false)} className="btn-primary mt-4 w-full">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
