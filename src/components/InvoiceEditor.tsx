"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, Minus, Plus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import ProductSearch from "./ProductSearch";
import CustomerPicker from "./CustomerPicker";
import { toast } from "./Toaster";
import { getDb } from "@/lib/db";
import {
  DEFAULT_PAYMENT_ACCOUNTS,
  accountKey,
  describeAccount,
  invoiceTotals,
  loadDefaultAccount,
  loadPaymentAccounts,
  saveInvoice,
} from "@/lib/invoices";
import { useStoreProfile } from "@/lib/store-profile";
import type { Customer, Invoice, InvoiceLine, PaymentAccount, Product } from "@/lib/types";
import { cartonPrice, cartonSize } from "@/lib/units";
import { addDays, cx, formatMoney, round2, toDateInput } from "@/lib/utils";

interface Props {
  invoice?: Invoice | null;
  /** The admin PIN entered to open an existing invoice for editing. */
  adminPin?: string;
  onClose: () => void;
  onSaved: (invoice: Invoice) => void;
}

/** Raise a new invoice, or change one that has not been paid or cancelled. */
export default function InvoiceEditor({ invoice, adminPin = "", onClose, onSaved }: Props) {
  const store = useStoreProfile();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState(invoice?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(invoice?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState(invoice?.customerEmail ?? "");
  const [customerAddress, setCustomerAddress] = useState(invoice?.customerAddress ?? "");
  const [items, setItems] = useState<InvoiceLine[]>(invoice?.items ?? []);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [discount, setDiscount] = useState(String(invoice?.discount || ""));
  const [vatRate, setVatRate] = useState<number | null>(
    invoice ? (invoice.subtotal - invoice.discount > 0 ? round2((invoice.tax / (invoice.subtotal - invoice.discount)) * 100) : 0) : null,
  );
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? toDateInput(addDays(new Date(), 7)));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [account, setAccount] = useState<PaymentAccount>(
    invoice
      ? { bankName: invoice.bankName, accountNumber: invoice.accountNumber, accountName: invoice.accountName }
      : DEFAULT_PAYMENT_ACCOUNTS[0],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPaymentAccounts().then((list) => {
      // An invoice keeps the account it was raised with, even if the admin has since removed it.
      const kept = invoice && !list.some((a) => accountKey(a) === accountKey(invoice)) ? [invoice] : [];
      setAccounts([...list, ...kept.map(({ bankName, accountNumber, accountName }) => ({ bankName, accountNumber, accountName }))]);
    });
    if (!invoice) void loadDefaultAccount().then(setAccount);
    if (invoice?.customerId) void getDb().customers.get(invoice.customerId).then((found) => found && setCustomer(found));
    const ids = (invoice?.items ?? []).map((line) => line.productId).filter(Boolean) as string[];
    if (ids.length) {
      void getDb()
        .products.bulkGet(ids)
        .then((rows) =>
          setProducts(Object.fromEntries(rows.filter(Boolean).map((p) => [p!.id, p!]))),
        );
    }
  }, [invoice]);

  const rate = vatRate ?? store.vatRate;
  const totals = useMemo(() => invoiceTotals(items, Number(discount) || 0, rate), [items, discount, rate]);

  const pickCustomer = (picked: Customer | null) => {
    setCustomer(picked);
    if (picked) {
      setCustomerName(picked.name);
      setCustomerPhone(picked.phone);
      if (picked.email) setCustomerEmail(picked.email);
    }
  };

  const addProduct = (product: Product) => {
    setProducts((current) => ({ ...current, [product.id]: product }));
    setItems((current) => {
      const index = current.findIndex((line) => line.productId === product.id && line.unit === "pcs");
      if (index >= 0) {
        return current.map((line, i) =>
          i === index ? { ...line, quantity: line.quantity + 1, lineTotal: round2(line.unitPrice * (line.quantity + 1)) } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          category: product.category,
          barcode: product.barcode,
          unitPrice: product.price,
          quantity: 1,
          unit: "pcs",
          packSize: 1,
          lineTotal: product.price,
        },
      ];
    });
  };

  const updateLine = (index: number, patch: Partial<InvoiceLine>) =>
    setItems((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        return { ...next, lineTotal: round2(next.unitPrice * next.quantity) };
      }),
    );

  const switchUnit = (index: number, unit: "pcs" | "carton") => {
    const line = items[index];
    const product = line.productId ? products[line.productId] : undefined;
    if (unit === "carton") {
      const size = product ? cartonSize(product) : 0;
      if (!size) {
        toast(`Set how many pieces are in a carton of ${line.name} on the Inventory page first.`, "error");
        return;
      }
      updateLine(index, { unit, packSize: size, unitPrice: cartonPrice(product!) });
    } else {
      updateLine(index, { unit, packSize: 1, unitPrice: product?.price ?? round2(line.unitPrice / Math.max(1, line.packSize)) });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveInvoice({
        id: invoice?.id,
        customerId: customer?.id ?? invoice?.customerId ?? null,
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        items,
        discount: Number(discount) || 0,
        vatRate: rate,
        notes,
        dueDate,
        ...account,
      }, adminPin);
      onSaved(saved);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the invoice.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={invoice ? `Edit invoice ${invoice.invoiceNo} (admin)` : "New invoice"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary flex-1">
            {invoice ? "Save changes" : "Raise invoice"} · {formatMoney(totals.total)}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <CustomerPicker
            selected={customer}
            onSelect={(picked) => {
              pickCustomer(picked);
              if (!picked) {
                setCustomerName("");
                setCustomerPhone("");
                setCustomerEmail("");
              }
            }}
            label="Bill to — choose a saved customer"
            placeholder="Search customers by name or phone"
            browse
          />
          <p className="mt-1 text-xs text-ink-700/50">Or fill in the details below; a new customer is saved for next time.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" placeholder="Name on the invoice" aria-label="Customer name" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" placeholder="Phone (for WhatsApp)" inputMode="tel" aria-label="Customer phone" />
            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="input" placeholder="Email" type="email" aria-label="Customer email" />
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="input" placeholder="Address (optional)" aria-label="Customer address" />
          </div>
        </section>

        <section>
          <h3 className="label">Items</h3>
          <ProductSearch onPick={addProduct} />
          {items.length === 0 ? (
            <p className="mt-2 rounded-2xl bg-black/[0.03] px-3 py-4 text-center text-sm text-ink-700/55">
              Search or scan products to add them.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/[0.06]">
              {items.map((line, index) => {
                const product = line.productId ? products[line.productId] : undefined;
                const hasCartons = product ? cartonSize(product) > 0 : line.unit === "carton";
                return (
                  <li key={`${line.productId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{line.name}</p>
                      <p className="truncate text-[11px] text-ink-700/50">
                        {[line.sku, line.brand, line.category].filter(Boolean).join(" · ")}
                        {line.unit === "carton" ? ` · carton of ${line.packSize} pcs` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-xl border border-black/10">
                          <button type="button" aria-label="Less" className="p-1.5" onClick={() => line.quantity > 1 && updateLine(index, { quantity: line.quantity - 1 })}>
                            <Minus size={14} />
                          </button>
                          <input
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
                            className="w-12 bg-transparent text-center text-sm tabular outline-none"
                            inputMode="numeric"
                            aria-label={`Quantity of ${line.name}`}
                          />
                          <button type="button" aria-label="More" className="p-1.5" onClick={() => updateLine(index, { quantity: line.quantity + 1 })}>
                            <Plus size={14} />
                          </button>
                        </div>
                        {hasCartons && (
                          <div className="flex rounded-xl bg-black/[0.04] p-0.5 text-xs font-semibold">
                            {(["pcs", "carton"] as const).map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => switchUnit(index, unit)}
                                className={cx("rounded-lg px-2 py-1", line.unit === unit ? "bg-white shadow-sm" : "text-ink-700/60")}
                              >
                                {unit === "pcs" ? "Pcs" : `Carton${line.unit === "carton" ? ` (${line.packSize})` : ""}`}
                              </button>
                            ))}
                          </div>
                        )}
                        <label className="flex items-center gap-1 text-xs text-ink-700/60">
                          @
                          <input
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-24 rounded-lg border border-black/10 px-2 py-1 text-sm tabular text-ink-900"
                            inputMode="decimal"
                            aria-label={`Price of ${line.name}`}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="text-sm font-bold tabular">{formatMoney(line.lineTotal)}</span>
                      <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setItems((c) => c.filter((_, i) => i !== index))} className="rounded-lg p-1 text-ink-700/50 hover:bg-black/5">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="label">Discount (₦)</span>
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} className="input tabular" inputMode="decimal" placeholder="0" />
            </label>
            <label className="block">
              <span className="label">VAT (%)</span>
              <input value={rate} onChange={(e) => setVatRate(Number(e.target.value) || 0)} className="input tabular" inputMode="decimal" />
            </label>
            <label className="block">
              <span className="label">Due date</span>
              <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" type="date" />
            </label>
          </div>
          <dl className="mt-3 space-y-1 rounded-2xl bg-black/[0.03] p-3 text-sm tabular">
            <div className="flex justify-between"><dt className="text-ink-700/60">Subtotal</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-700/60">Discount</dt><dd>- {formatMoney(totals.discount)}</dd></div>}
            {totals.tax > 0 && <div className="flex justify-between"><dt className="text-ink-700/60">VAT</dt><dd>{formatMoney(totals.tax)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
          </dl>
        </section>

        <section>
          <h3 className="label">Customer pays into</h3>
          <label className="flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-black/[0.02] px-3 py-1">
            <Landmark size={16} className="shrink-0 text-brand-600" />
            <select
              className="w-full bg-transparent py-2 text-sm font-semibold text-ink-900 outline-none"
              value={accountKey(account)}
              onChange={(e) => {
                const found = accounts.find((a) => accountKey(a) === e.target.value);
                if (found) setAccount(found);
              }}
              aria-label="Payment account"
            >
              {(accounts.length ? accounts : [account]).map((a) => (
                <option key={accountKey(a)} value={accountKey(a)}>
                  {describeAccount(a)}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-xs text-ink-700/50">Only the admin can add account numbers, in Settings → Invoices.</p>
        </section>

        <label className="block">
          <span className="label">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[70px]" placeholder="Terms, delivery details… (optional)" />
        </label>
      </div>
    </Modal>
  );
}
