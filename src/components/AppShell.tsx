"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  X,
} from "lucide-react";
import { cx } from "@/lib/utils";
import SyncBadge from "./SyncBadge";
import InstallButton from "./InstallButton";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sell", label: "New Sale", icon: ShoppingCart },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/sales", label: "Sales & Reports", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      // A new service worker took over — reload once so the UI matches the cache.
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () =>
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => registration.update().catch(() => undefined))
        .catch(() => undefined);

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f4f4f1]">
      {menuOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink-800 p-4 text-white transition-transform lg:static lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center gap-3 px-2 pt-2">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white">
            <Image src="/logo.png" alt="Xpel Beauty NG" width={36} height={36} priority />
          </span>
          <span>
            <span className="block text-sm font-bold tracking-wide">XPEL POS</span>
            <span className="block text-[11px] text-white/50">Xpel Beauty NG</span>
          </span>
          <button
            className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-brand-500 text-white shadow" : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-white/60">
          Sales are saved on this device first, then synced to the cloud when you are online.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-[#f4f4f1]/85 px-4 py-3 backdrop-blur lg:px-8">
          <button
            className="rounded-lg border border-black/10 bg-white p-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-lg font-bold text-ink-900">
            {NAV.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.label ??
              "Xpel POS"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <InstallButton />
            <SyncBadge />
            <Link href="/sell" className="btn-primary hidden sm:inline-flex">
              <ShoppingCart size={16} /> New sale
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
