"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchProducts } from "@/lib/repository";
import type { Product } from "@/lib/types";
import { cx, formatMoney } from "@/lib/utils";

interface Props {
  onPick: (product: Product) => void;
}

export default function ProductSearch({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const found = await searchProducts(term, 10);
      if (cancelled) return;
      setResults(found);
      setHighlight(0);
    };
    // Small debounce keeps typing smooth on low-end Android tablets.
    const timer = window.setTimeout(run, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const pick = (product: Product) => {
    onPick(product);
    setTerm("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const product = results[highlight];
      if (product) pick(product);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-card focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20">
        <Search size={18} className="text-ink-700/40" />
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Type the first 3 letters of the product…"
          className="w-full bg-transparent text-base outline-none placeholder:text-ink-700/35"
          aria-label="Search products"
          autoComplete="off"
        />
        <kbd className="hidden whitespace-nowrap rounded-md border border-black/10 px-1.5 py-0.5 text-[10px] text-ink-700/45 sm:block">
          Enter to add
        </kbd>
      </div>

      {open && (
        <div className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-black/5 bg-white p-1.5 shadow-card">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-700/55">
              {term ? `No product matches “${term}”.` : "Start typing to find a product."}
            </p>
          ) : (
            results.map((product, index) => {
              const out = product.stockQty <= 0;
              return (
                <button
                  key={product.id}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(product)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    index === highlight ? "bg-brand-50" : "hover:bg-black/[0.03]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
                    <span className="block truncate text-xs text-ink-700/55">
                      {[product.sku, product.category].filter(Boolean).join(" · ") || "No SKU"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabular block text-sm font-bold text-ink-900">
                      {formatMoney(product.price)}
                    </span>
                    <span
                      className={cx(
                        "tabular block text-xs",
                        out
                          ? "text-brand-700"
                          : product.stockQty <= product.lowStockThreshold
                            ? "text-brand-600"
                            : "text-ink-700/50",
                      )}
                    >
                      {out ? "Out of stock" : `${product.stockQty} in stock`}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
