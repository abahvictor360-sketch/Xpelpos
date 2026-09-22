import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  HardDrive,
  Monitor,
  Receipt,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { DESKTOP_RELEASE } from "@/lib/download-config";

export const metadata: Metadata = {
  title: "Download Xpel POS for Windows",
  description:
    "Install Xpel POS on your Windows PC. Offline-first till, inventory and sales reporting for Xpel Beauty NG.",
};

const FEATURES = [
  {
    icon: WifiOff,
    title: "Works with no internet",
    body: "Every sale, product and shift is stored on the PC itself. Power cuts and dead networks do not stop the till.",
  },
  {
    icon: HardDrive,
    title: "Its own local database",
    body: "Xpel POS installs a local database on the machine. Nothing lives in a browser tab that can be cleared by accident.",
  },
  {
    icon: Receipt,
    title: "Fast checkout",
    body: "Scan or search, apply promo codes, take cash, transfer or card, and print a branded receipt.",
  },
  {
    icon: Boxes,
    title: "Stock that stays honest",
    body: "Stock moves as you sell, with low-stock warnings, bulk product import and full movement history.",
  },
  {
    icon: BarChart3,
    title: "Reports and exports",
    body: "Daily takings, best sellers and profit trends, exportable to PDF, Excel and Word.",
  },
  {
    icon: ShieldCheck,
    title: "Optional cloud sync",
    body: "Connect Supabase and records upload in the background, so several tills share one picture of the shop.",
  },
];

const STEPS = [
  "Download the installer below and open it. Windows may warn that the publisher is unverified: choose More info, then Run anyway.",
  "Pick where to install it, then finish the wizard. An Xpel POS shortcut lands on the desktop and in the Start menu.",
  "Open Xpel POS, go to Settings and enter your shop details. The till is ready to sell straight away, online or offline.",
];

const INCLUDED = [
  "Sell screen with barcode search, held sales and promo codes",
  "Inventory with bulk import, cost prices and low-stock alerts",
  "Shifts and cash-up, so every drawer is accounted for",
  "Customers, receipts and branded PDF, Excel and Word reports",
  "Local database on the PC, with optional background sync",
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[var(--page)] text-ink-900">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-6">
        <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-black/5 bg-white">
          <Image src="/logo.png" alt="Xpel Beauty NG" width={34} height={34} priority />
        </span>
        <span>
          <span className="block text-sm font-extrabold tracking-tight">Xpel POS</span>
          <span className="block text-[11px] text-ink-700/50">Xpel Beauty NG</span>
        </span>
        <Link
          href="/"
          className="ml-auto rounded-2xl px-4 py-2 text-sm font-semibold text-ink-700/70 transition hover:bg-black/[0.04] hover:text-ink-900"
        >
          Open web till
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-4 pt-6 lg:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <Monitor size={14} /> Windows 10 and 11, 64-bit
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight lg:text-5xl">
              Put the whole shop on the counter PC.
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700/70">
              Xpel POS is the till, stock book and sales report for Xpel Beauty NG, installed as a
              proper Windows app. It keeps its own database on the machine, so it sells whether or
              not the network is up.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={DESKTOP_RELEASE.installerUrl}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-brand transition hover:bg-brand-600"
              >
                <Download size={18} />
                Download for Windows
              </a>
              <a
                href={DESKTOP_RELEASE.portableUrl}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold text-ink-900 transition hover:bg-black/[0.03]"
              >
                Portable version, no install
              </a>
            </div>

            <p className="mt-3 text-xs text-ink-700/50">
              Version {DESKTOP_RELEASE.version} &middot; installer {DESKTOP_RELEASE.installerSize}{" "}
              &middot; free for Xpel Beauty NG staff
            </p>
          </div>

          <div className="rounded-4xl border border-black/[0.06] bg-white p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-700/45">
              What you get
            </p>
            <ul className="mt-4 space-y-3">
              {INCLUDED.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink-700/75">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-olive-600" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl bg-[var(--page)] p-4 text-xs leading-relaxed text-ink-700/60">
              Prefer not to install anything? The till also runs in the browser and can be added to a
              phone or tablet from the{" "}
              <Link href="/install" className="font-semibold text-brand-600 underline">
                install page
              </Link>
              .
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-extrabold tracking-tight">Built for a counter, not a demo</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-4xl border border-black/[0.06] bg-white p-5 shadow-card"
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon size={19} />
              </span>
              <h3 className="mt-4 text-sm font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-4xl border border-black/[0.06] bg-white p-7 shadow-card">
          <h2 className="text-2xl font-extrabold tracking-tight">Installing it</h2>
          <ol className="mt-6 space-y-5">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-ink-700/75">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-7 grid gap-4 border-t border-black/[0.06] pt-6 text-sm sm:grid-cols-2">
            <div>
              <p className="font-bold">Where your data lives</p>
              <p className="mt-1.5 leading-relaxed text-ink-700/65">
                Sales, products, customers and shifts are written to a local database on the PC,
                under the Xpel POS folder in your Windows app data. File, then Open data folder in
                the app takes you straight there for backups.
              </p>
            </div>
            <div>
              <p className="font-bold">System requirements</p>
              <p className="mt-1.5 leading-relaxed text-ink-700/65">
                Windows 10 or 11 on 64-bit, about 400 MB of disk space, and 4 GB of RAM. A receipt
                printer and barcode scanner work through the normal Windows drivers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.06] px-5 py-8 text-center text-xs text-ink-700/45">
        Xpel POS &middot; Xpel Beauty NG &middot; version {DESKTOP_RELEASE.version}
      </footer>
    </main>
  );
}
