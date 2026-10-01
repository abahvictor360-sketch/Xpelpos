"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Tag,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { seedOnFirstRun, syncCatalogueOnUpdate } from "@/lib/seed";
import { pruneActivities } from "@/lib/activity";
import SyncBadge from "./SyncBadge";
import StockAlerts from "./StockAlerts";
import InstallButton from "./InstallButton";
import Toaster from "./Toaster";
import SidebarStatus from "./SidebarStatus";

const NAV = [
  {
    section: "Till",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, caption: "Today at a glance" },
      { href: "/sell", label: "New Sale", icon: ShoppingCart, caption: "Ring up a customer" },
      { href: "/shifts", label: "Shifts & Cash-up", icon: ClipboardList, caption: "Open and close the till" },
    ],
  },
  {
    section: "Catalogue",
    items: [
      { href: "/inventory", label: "Inventory", icon: Boxes, caption: "Products and stock levels" },
      { href: "/barcodes", label: "Barcodes", icon: ScanBarcode, caption: "Scan, assign and print product barcodes" },
      { href: "/promotions", label: "Promotions", icon: Tag, caption: "Coupons and promo codes" },
      { href: "/customers", label: "Customers", icon: Users, caption: "Who shops with you" },
      { href: "/invoices", label: "Invoices", icon: FileText, caption: "Bill customers to pay by transfer" },
    ],
  },
  {
    section: "Warehouse",
    items: [
      {
        href: "/transfers",
        label: "Transfer In & Out",
        icon: Warehouse,
        caption: "Stock received from or returned to the warehouse",
      },
    ],
  },
  {
    section: "Insights",
    items: [
      { href: "/sales", label: "Sales & Reports", icon: Receipt, caption: "History and exports" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, caption: "Trends and best sellers" },
      { href: "/activity", label: "Activity Log", icon: History, caption: "Everything that happened on this till" },
    ],
  },
  {
    section: "Setup",
    items: [
      { href: "/install", label: "Install App", icon: Download, caption: "Put Xpel POS on a device" },
      { href: "/settings", label: "Settings", icon: Settings, caption: "Store details and sync" },
    ],
  },
];

// The desktop build is already installed, so the PWA install route and its
// header button have nothing to offer there.
const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

const MENU = IS_DESKTOP
  ? NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== "/install"),
    })).filter((group) => group.items.length > 0)
  : NAV;

const FLAT = MENU.flatMap((group) => group.items);

/** Remembers whether the desktop sidebar is folded down to icons. */
const COLLAPSED_KEY = "xpel-sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop only: the phone/tablet drawer is already out of the way when shut.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Storage can be unavailable; the sidebar simply starts expanded.
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {
        // Not remembered this time; the toggle still works.
      }
      return !value;
    });

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    // A fresh install opens with the shop's catalogue already in place; a till
    // stocked by an older version catches up on what changed since.
    void seedOnFirstRun().then(() => syncCatalogueOnUpdate());
    void pruneActivities();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (IS_DESKTOP) {
      // The desktop app is served from disk by its own local server, so the
      // worker buys no offline ability it does not already have. What it does
      // buy is a cached app shell from the previous version: after an update
      // that shell asks for chunk files the new build no longer has, and the
      // page dies before it can save anything. Clear it out and stay clear.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((one) => one.unregister())))
        .then(() => (typeof caches !== "undefined" ? caches.keys() : []))
        .then((keys) => Promise.all([...keys].map((key) => caches.delete(key))))
        .catch(() => undefined);
      return;
    }

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

  const current = FLAT.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));

  // The download page and the admin's approval link stand alone, without the till around them.
  if (pathname.startsWith("/download") || pathname.startsWith("/approve")) return <>{children}</>;

  return (
    <div className="min-h-screen p-0 lg:flex lg:gap-5 lg:p-5">
      {menuOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={cx(
          "print-hide fixed inset-y-0 left-0 z-40 flex w-[272px] max-w-[85vw] flex-col bg-white p-4 transition-[transform,width]",
          "lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:rounded-4xl lg:border lg:border-black/[0.04] lg:shadow-card",
          collapsed && "lg:w-[84px] lg:px-3",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cx("mb-2 flex items-center gap-3 px-2 pt-1", collapsed && "lg:justify-center lg:px-0")}>
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-black/5 bg-white">
            <Image src="/logo.png" alt="Xpel Beauty NG" width={34} height={34} priority />
          </span>
          <span className={cx(collapsed && "lg:hidden")}>
            <span className="block text-sm font-extrabold tracking-tight text-ink-900">Xpel POS</span>
            <span className="block text-[11px] text-ink-700/50">Xpel Beauty NG</span>
          </span>
          <button
            className="ml-auto rounded-xl p-1.5 text-ink-700/50 hover:bg-black/5 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="-mr-1 flex-1 overflow-y-auto pr-1">
          {MENU.map((group) => (
            <div key={group.section}>
              <p className={cx("nav-section", collapsed && "lg:hidden")}>{group.section}</p>
              {collapsed && <div className="hidden lg:my-2 lg:block lg:border-t lg:border-black/5" />}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      aria-label={label}
                      className={cx(
                        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                        collapsed && "lg:justify-center lg:px-0",
                        active
                          ? "bg-brand-500 text-white shadow-brand"
                          : "text-ink-700/70 hover:bg-black/[0.035] hover:text-ink-900",
                      )}
                    >
                      <Icon size={18} className={cx("shrink-0", active ? "text-white" : "text-ink-700/45")} />
                      <span className={cx("truncate", collapsed && "lg:sr-only")}>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cx(collapsed && "lg:hidden")}>
          <SidebarStatus />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print-hide sticky top-0 z-20 flex items-center gap-3 bg-[var(--page)]/85 px-4 py-3 backdrop-blur lg:static lg:bg-transparent lg:px-1 lg:pb-4 lg:pt-1 lg:backdrop-blur-none">
          <button
            className="icon-btn shrink-0 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <button
            className="icon-btn hidden shrink-0 lg:grid"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-ink-900 lg:text-2xl">
              {current?.label ?? "Xpel POS"}
            </h1>
            <p className="hidden truncate text-sm text-ink-700/55 sm:block">
              {current?.caption ?? "Point of sale"}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!IS_DESKTOP && <InstallButton />}
            <SyncBadge />
            <Link href="/sell" className="btn-primary hidden sm:inline-flex">
              <ShoppingCart size={16} /> New sale
            </Link>
            <StockAlerts />
          </div>
        </header>

        <main className="flex-1 px-4 pb-6 lg:px-1">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}
