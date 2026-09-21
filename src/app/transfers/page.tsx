"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownLeft, ArrowUpRight, Boxes, Search, Warehouse } from "lucide-react";
import { db } from "@/lib/db";
import { listTransfers, recordTransfer, summariseTransfers } from "@/lib/transfers";
import type { Product, Transfer, TransferDirection } from "@/lib/types";
import { cx, formatDateTime, formatMoney } from "@/lib/utils";

type RangeKey = "today" | "week" | "month" | "all";

const RANGES: Array<{ id: RangeKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All" },
];

function rangeStart(range: RangeKey): Date | undefined {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "month") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

export default function TransfersPage() {
  const products = useLiveQuery(
    () => db.products.filter((product) => !product.deletedAt).toArray(),
    [],
    [] as Product[],
  );

  const [direction, setDirection] = useState<TransferDirection>("in");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [party, setParty] = useState("Warehouse");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [range, setRange] = useState<RangeKey>("week");
  const [filterDirection, setFilterDirection] = useState<TransferDirection | "all">("all");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Transfer[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const sorted = useMemo(
    () => [...(products ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const selected = sorted.find((product) => product.id === productId);

  useEffect(() => {
    let active = true;
    void listTransfers({
      direction: filterDirection,
      from: rangeStart(range),
      term,
    }).then((result) => {
      if (active) setRows(result);
    });
    return () => {
      active = false;
    };
  }, [filterDirection, range, term, reloadKey]);

  const summary = useMemo(() => summariseTransfers(rows, products ?? []), [rows, products]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!productId) {
      setError("Pick the product being moved");
      return;
    }

    setSaving(true);
    try {
      const transfer = await recordTransfer({
        productId,
        direction,
        quantity: Number(quantity),
        party,
        note,
      });
      setMessage(
        `${transfer.reference}: ${transfer.productName} stock ${transfer.stockBefore} → ${transfer.stockAfter}`,
      );
      setQuantity("");
      setNote("");
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record that transfer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="card h-fit p-4">
        <div className="flex items-center gap-2">
          <Warehouse size={18} className="text-brand-600" />
          <h2 className="text-sm font-bold text-ink-900">Record a transfer</h2>
        </div>
        <p className="mt-1 text-xs text-ink-700/55">
          Stock coming in from the warehouse, or going back out. Inventory updates as soon as you
          save.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("in")}
              className={cx(
                "flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                direction === "in"
                  ? "border-olive-500 bg-olive-100 text-olive-900"
                  : "border-black/10 text-ink-700/60 hover:bg-black/[0.03]",
              )}
            >
              <ArrowDownLeft size={16} /> Transfer in
            </button>
            <button
              type="button"
              onClick={() => setDirection("out")}
              className={cx(
                "flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                direction === "out"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-black/10 text-ink-700/60 hover:bg-black/[0.03]",
              )}
            >
              <ArrowUpRight size={16} /> Transfer out
            </button>
          </div>

          <label className="block">
            <span className="label">Product</span>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="input mt-1"
            >
              <option value="">Choose a product…</option>
              {sorted.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.stockQty} in stock)
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">
              {direction === "in" ? "Units received" : "Units sent out"}
            </span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              placeholder="50"
              className="input mt-1"
            />
          </label>

          {selected && quantity && Number(quantity) > 0 && (
            <p className="rounded-2xl bg-black/[0.03] px-3 py-2 text-xs text-ink-700/70">
              {selected.name}: {selected.stockQty} →{" "}
              <span className="font-bold text-ink-900">
                {direction === "in"
                  ? selected.stockQty + Math.trunc(Number(quantity))
                  : selected.stockQty - Math.trunc(Number(quantity))}
              </span>{" "}
              in stock
            </p>
          )}

          <label className="block">
            <span className="label">{direction === "in" ? "Received from" : "Sent to"}</span>
            <input
              value={party}
              onChange={(event) => setParty(event.target.value)}
              placeholder="Warehouse"
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="label">Note (optional)</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Waybill number, driver, reason…"
              className="input mt-1"
            />
          </label>

          {error && <p className="text-xs font-semibold text-brand-700">{error}</p>}
          {message && <p className="text-xs font-semibold text-olive-700">{message}</p>}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
            {saving ? "Saving…" : direction === "in" ? "Record stock in" : "Record stock out"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            label="Units in"
            value={String(summary.unitsIn)}
            caption={`${summary.countIn} transfer(s) · ${formatMoney(summary.valueIn)}`}
            tone="in"
          />
          <Tile
            label="Units out"
            value={String(summary.unitsOut)}
            caption={`${summary.countOut} transfer(s) · ${formatMoney(summary.valueOut)}`}
            tone="out"
          />
          <Tile
            label="Net movement"
            value={`${summary.net > 0 ? "+" : ""}${summary.net}`}
            caption="Units gained or lost over the period"
          />
        </div>

        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink-900">Transfer report</h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex rounded-2xl border border-black/10 p-0.5">
                {(["all", "in", "out"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setFilterDirection(option)}
                    className={cx(
                      "rounded-xl px-2.5 py-1 text-xs font-semibold capitalize transition",
                      filterDirection === option
                        ? "bg-ink-900 text-white"
                        : "text-ink-700/60 hover:text-ink-900",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex rounded-2xl border border-black/10 p-0.5">
                {RANGES.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setRange(option.id)}
                    className={cx(
                      "rounded-xl px-2.5 py-1 text-xs font-semibold transition",
                      range === option.id
                        ? "bg-ink-900 text-white"
                        : "text-ink-700/60 hover:text-ink-900",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-2xl border border-black/10 px-3 py-2">
            <Search size={16} className="text-ink-700/40" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search product, reference, waybill or staff…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Boxes size={22} className="mx-auto text-ink-700/25" />
              <p className="mt-2 text-sm font-medium text-ink-900">No transfers in this period</p>
              <p className="mt-1 text-sm text-ink-700/55">
                Record one on the left and it shows up here straight away.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-ink-700/45">
                    <th className="py-2 pr-3 font-semibold">Reference</th>
                    <th className="py-2 pr-3 font-semibold">Product</th>
                    <th className="py-2 pr-3 text-right font-semibold">Units</th>
                    <th className="py-2 pr-3 text-right font-semibold">Stock after</th>
                    <th className="py-2 pr-3 font-semibold">Party</th>
                    <th className="py-2 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="py-2.5 pr-3">
                        <span
                          className={cx(
                            "chip",
                            row.direction === "in"
                              ? "bg-olive-100 text-olive-900"
                              : "bg-brand-50 text-brand-700",
                          )}
                        >
                          {row.direction === "in" ? "In" : "Out"}
                        </span>
                        <span className="mt-1 block text-[11px] text-ink-700/50">
                          {row.reference}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-ink-900">{row.productName}</span>
                        <span className="block text-[11px] text-ink-700/50">{row.sku}</span>
                      </td>
                      <td
                        className={cx(
                          "tabular py-2.5 pr-3 text-right font-bold",
                          row.direction === "in" ? "text-olive-700" : "text-brand-700",
                        )}
                      >
                        {row.direction === "in" ? "+" : "-"}
                        {row.quantity}
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right text-ink-700/75">
                        {row.stockAfter}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-700/75">
                        {row.party}
                        {row.note && (
                          <span className="block text-[11px] text-ink-700/50">{row.note}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-[11px] text-ink-700/55">
                        {formatDateTime(row.createdAt)}
                        <span className="block">by {row.staffName}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "in" | "out";
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-700/45">{label}</p>
      <p
        className={cx(
          "tabular mt-1 text-2xl font-extrabold",
          tone === "in" ? "text-olive-700" : tone === "out" ? "text-brand-700" : "text-ink-900",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-ink-700/55">{caption}</p>
    </div>
  );
}
