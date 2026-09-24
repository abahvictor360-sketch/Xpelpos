"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Bell, PackageX, Warehouse } from "lucide-react";
import { db } from "@/lib/db";
import { useStoreProfile } from "@/lib/store-profile";
import type { Product } from "@/lib/types";
import { cx } from "@/lib/utils";
import { toast } from "./Toaster";

/**
 * The bell in the header. It watches the shelf and speaks up when a product
 * runs low, because the moment stock matters is while the shop can still do
 * something about it, not at stock-take.
 */
export default function StockAlerts() {
  const profile = useStoreProfile();
  // No fallback value: while Dexie is still reading, this stays undefined.
  // Treating that moment as "nothing is low" is what used to make every low
  // product look newly low a beat later, so the whole shelf toasted on load.
  const products = useLiveQuery<Product[] | undefined>(
    () => db.products.filter((product) => !product.deletedAt && product.isActive).toArray(),
    [],
  );

  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  // Which products have already been announced, so a toast fires on the way
  // down past the level rather than on every re-render.
  const announced = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  const level = profile.lowStockAlert;

  const { out, low } = useMemo(() => {
    const list = [...(products ?? [])].sort((a, b) => a.stockQty - b.stockQty);
    return {
      out: list.filter((product) => product.stockQty <= 0),
      low: list.filter((product) => product.stockQty > 0 && product.stockQty <= level),
    };
  }, [products, level]);

  const count = out.length + low.length;

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  useEffect(() => {
    if (level <= 0) return;
    // Nothing is known yet; wait for the real catalogue before judging.
    if (!products) return;

    const atRisk = [...out, ...low];

    // The first pass with real data only records what is already low, so
    // opening the app is silent however much of the shelf is running out.
    if (!primed.current) {
      primed.current = true;
      atRisk.forEach((product) => announced.current.add(product.id));
      return;
    }

    for (const product of atRisk) {
      if (announced.current.has(product.id)) continue;
      announced.current.add(product.id);
      toast(
        product.stockQty <= 0
          ? `${product.name} is out of stock.`
          : `${product.name} is down to ${product.stockQty} left.`,
        "error",
      );
    }

    // A product restocked above the level can raise the alarm again later.
    for (const id of [...announced.current]) {
      const product = products.find((row) => row.id === id);
      if (!product || product.stockQty > level) announced.current.delete(id);
    }
  }, [out, low, products, level]);

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="icon-btn relative grid"
        aria-label={count > 0 ? `${count} stock alert(s)` : "Stock alerts"}
      >
        <Bell size={17} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <p className="text-sm font-bold text-ink-900">Stock alerts</p>
            <span className="text-[11px] text-ink-700/50">at or below {level}</span>
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink-900">Everything is stocked</p>
              <p className="mt-1 text-xs text-ink-700/55">
                Nothing has fallen to {level} units or fewer.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-black/5 overflow-y-auto">
              {[...out, ...low].map((product) => {
                const isOut = product.stockQty <= 0;
                return (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={cx(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                        isOut ? "bg-brand-50 text-brand-700" : "bg-brand-50/60 text-brand-600",
                      )}
                    >
                      {isOut ? <PackageX size={15} /> : <AlertTriangle size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {product.name}
                      </span>
                      <span className="block text-[11px] text-ink-700/55">
                        {isOut ? "Out of stock" : `${product.stockQty} left`}
                        {product.sku ? ` · ${product.sku}` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2 border-t border-black/5 p-3">
            <Link
              href="/transfers"
              onClick={() => setOpen(false)}
              className="btn-primary flex-1 justify-center text-xs"
            >
              <Warehouse size={14} /> Transfer in
            </Link>
            <Link
              href="/inventory"
              onClick={() => setOpen(false)}
              className="btn-ghost flex-1 justify-center text-xs"
            >
              Inventory
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
