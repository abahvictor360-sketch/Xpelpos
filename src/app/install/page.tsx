"use client";

import { useEffect, useState } from "react";
import { Check, Laptop, Share, Smartphone, WifiOff } from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { cx } from "@/lib/utils";

type Platform = "windows" | "android" | "ios" | "mac" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  return "other";
}

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true,
    );
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="card p-5">
        <h2 className="text-lg font-bold text-ink-900">Put Xpel POS on this device</h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Xpel POS installs straight from the browser — there is no setup file to download and no app store
          account needed. Once installed it gets its own icon, opens in its own window, and keeps selling when the
          internet is down.
        </p>

        <div className="mt-4">
          {installed ? (
            <p className="chip bg-olive-100 text-olive-900">
              <Check size={14} /> Already installed on this device
            </p>
          ) : (
            <InstallButton variant="block" />
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Guide
          title="Windows PC"
          icon={<Laptop size={16} />}
          active={platform === "windows" || platform === "mac"}
          steps={[
            "Open this page in Microsoft Edge or Google Chrome.",
            "Click Install app above — or the install icon at the right of the address bar.",
            "Confirm Install. Xpel POS is added to the Start menu; right-click it there to pin it to the taskbar.",
          ]}
          note="Firefox cannot install web apps — use Edge or Chrome on the shop PC."
        />

        <Guide
          title="Android phone or tablet"
          icon={<Smartphone size={16} />}
          active={platform === "android"}
          steps={[
            "Open this page in Google Chrome.",
            "Tap Install app above — or the ⋮ menu, then Add to Home screen.",
            "Tap Install. The Xpel icon appears on the home screen like any other app.",
          ]}
        />

        <Guide
          title="iPhone or iPad"
          icon={<Share size={16} />}
          active={platform === "ios"}
          steps={[
            "Open this page in Safari.",
            "Tap the Share button, then Add to Home Screen.",
            "Tap Add.",
          ]}
          note="iOS has no install button — the Share sheet is the only route."
        />

        <section className="card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <WifiOff size={16} /> After installing
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-700/70">
            <li>· Sales are written to the device first, so the till works with no network.</li>
            <li>· Sign in once under Settings → Cloud sync so this device can upload to the shared database.</li>
            <li>· Anything sold offline uploads by itself when the connection returns.</li>
            <li>· Updates arrive automatically — no reinstalling.</li>
          </ul>
        </section>
      </div>

      <section className="card p-4">
        <h3 className="text-sm font-bold text-ink-900">Looking for a .exe or an APK?</h3>
        <p className="mt-1 text-sm text-ink-700/70">
          There isn&apos;t one. Xpel POS is a web app, so the browser does the installing — that is what keeps every
          till on the same version without anyone running an installer. If you specifically need a signed Windows
          installer or a Play Store build, the same code can be wrapped with Tauri (Windows) or a Trusted Web
          Activity (Android).
        </p>
      </section>
    </div>
  );
}

function Guide({
  title,
  icon,
  steps,
  note,
  active,
}: {
  title: string;
  icon: React.ReactNode;
  steps: string[];
  note?: string;
  active?: boolean;
}) {
  return (
    <section className={cx("card p-4", active && "ring-2 ring-brand-400/40")}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        {icon}
        {title}
        {active && <span className="chip bg-brand-50 text-brand-700">This device</span>}
      </h3>
      <ol className="mt-2 space-y-1.5 text-sm text-ink-700/70">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="font-bold text-ink-900">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-2 text-xs text-ink-700/55">{note}</p>}
    </section>
  );
}
