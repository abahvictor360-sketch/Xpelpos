"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, CreditCard, Minus, Plus, Smartphone, Trash2, Loader2 } from "lucide-react";
import ProductSearch from "@/components/ProductSearch";
import Receipt from "@/components/Receipt";
import { cartTotals, checkout } from "@/lib/repository";
import { getSetting } from "@/lib/db";
import { useStoreProfile } from "@/lib/store-profile";
import { toast } from "@/components/Toaster";
import { syncNow } from "@/lib/sync";
import type { CartLine, PaymentMethod, Product, Sale, SaleItem } from "@/lib/types";
import { cx, formatMoney } from "@/lib/utils";

const METHODS: Array<{ id: PaymentMethod; label: string; icon: React.ElementType }> = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "transfer", label: "Transfer", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
];

export default function SellPage() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cashierName, setCashierName] = useState("Counter");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const store = useStoreProfile();

  useEffect(() => {
    void getSetting("cashier_name", "Counter").then((value) => setCashierName(value || "Counter"));
  }, []);

  // Till shortcuts: F2 jumps to the search box, F9 closes the sale.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search products"]')?.focus();
      }
      if (event.key === "F9") {
        event.preventDefault();
        void completeSale();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const discountValue = Math.max(0, Number(discount) || 0);
  const totals = useMemo(
    () => cartTotals(lines, discountValue, store.vatRate),
    [lines, discountValue, store.vatRate],
  );
  const paid = amountPaid === "" ? totals.total : Number(amountPaid) || 0;
  const change = Math.max(0, paid - totals.total);

  const addProduct = (product: Product) => {
    setError("");
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQty) {
          setError(`Only ${product.stockQty} of ${product.name} left in stock.`);
          return current;
        }
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      if (product.stockQty <= 0) {
        setError(`${product.name} is out of stock.`);
        return current;
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: product.price,
          costPrice: product.costPrice,
          quantity: 1,
          stockQty: product.stockQty,
        },
      ];
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    setLines((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const capped = Math.min(Math.max(quantity, 0), line.stockQty);
          if (quantity > line.stockQty) setError(`Only ${line.stockQty} of ${line.name} left in stock.`);
          return { ...line, quantity: capped };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const clearCart = () => {
    setLines([]);
    setDiscount("");
    setAmountPaid("");
    setCustomerName("");
    setError("");
  };

  const completeSale = async () => {
    if (lines.length === 0) {
      setError("Add at least one product before checking out.");
      return;
    }
    if (method === "cash" && paid < totals.total) {
      setError("Amount collected is less than the total.");
      return;
    }
    setBusy(true);
    try {
      const result = await checkout({
        lines,
        paymentMethod: method,
        discount: discountValue,
        vatRate: store.vatRate,
        amountPaid: paid,
        customerName,
        cashierName,
      });
      setReceipt(result);
      clearCart();
      toast(`Sale ${result.sale.receiptNo} recorded.`, "success");
      void syncNow();
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : "Could not complete the sale.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <section className="space-y-4">
        <ProductSearch onPick={addProduct} />

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <h2 className="text-sm font-bold text-ink-900">
              Cart <span className="text-ink-700/50">({totals.itemCount} item{totals.itemCount === 1 ? "" : "s"})</span>
            </h2>
            {lines.length > 0 && (
              <button onClick={clearCart} className="text-xs font-medium text-brand-700 hover:underline">
                Clear all
              </button>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-ink-900">No products yet</p>
              <p className="mt-1 text-sm text-ink-700/55">
                Search above by the first letters of the product name, then press Enter.
              </p>
              <Link href="/inventory" className="btn-ghost mt-4">
                Add products to inventory
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-black/5">
              {lines.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{line.name}</p>
                    <p className="tabular text-xs text-ink-700/55">
                      {formatMoney(line.unitPrice)} each · {line.stockQty} in stock
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border border-black/10 p-1">
                    <button
                      onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/5"
                      aria-label={`Reduce ${line.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      value={line.quantity}
                      onChange={(event) => setQuantity(line.productId, Number(event.target.value) || 0)}
                      className="tabular w-10 bg-transparent text-center text-sm font-semibold outline-none"
                      inputMode="numeric"
                      aria-label={`Quantity for ${line.name}`}
                    />
                    <button
                      onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/5"
                      aria-label={`Add one ${line.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <p className="tabular w-24 text-right text-sm font-bold text-ink-900">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </p>

                  <button
                    onClick={() => setQuantity(line.productId, 0)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/40 hover:bg-brand-50 hover:text-brand-700"
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card h-fit p-4 lg:sticky lg:top-20">
        <h2 className="text-sm font-bold text-ink-900">Checkout</h2>

        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between text-ink-700/75">
            <dt>Subtotal</dt>
            <dd className="tabular font-medium">{formatMoney(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-ink-700/75">
            <dt>Discount</dt>
            <dd className="tabular font-medium">- {formatMoney(discountValue)}</dd>
          </div>
          {store.vatRate > 0 && (
            <div className="flex justify-between text-ink-700/75">
              <dt>VAT ({store.vatRate}%)</dt>
              <dd className="tabular font-medium">{formatMoney(totals.tax)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-black/5 pt-2 text-lg font-extrabold text-ink-900">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(totals.total)}</dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="discount">Discount</label>
            <input
              id="discount"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="input tabular"
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="paid">Amount collected</label>
            <input
              id="paid"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
              className="input tabular"
              inputMode="decimal"
              placeholder={String(totals.total)}
            />
          </div>
        </div>

        <div className="mt-4">
          <span className="label">Payment method</span>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition",
                  method === id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-black/10 bg-white text-ink-700/70 hover:bg-black/[0.03]",
                )}
                aria-pressed={method === id}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="customer">Customer (optional)</label>
          <input
            id="customer"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="input"
            placeholder="Walk-in customer"
          />
        </div>

        {method === "cash" && change > 0 && (
          <p className="tabular mt-3 rounded-xl bg-olive-100 px-3 py-2 text-sm font-semibold text-olive-900">
            Change due: {formatMoney(change)}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">{error}</p>
        )}

        <button
          onClick={completeSale}
          disabled={busy || lines.length === 0}
          className="btn-primary mt-4 w-full py-3 text-base"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null}
          Complete sale · {formatMoney(totals.total)}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-700/50">
          Saved on this device instantly, synced to the cloud automatically.
          <span className="mt-0.5 block">Shortcuts: F2 search · F9 complete sale</span>
        </p>
      </section>

      {receipt && <Receipt sale={receipt.sale} items={receipt.items} onClose={() => setReceipt(null)} />}
    </div>
  );
}
