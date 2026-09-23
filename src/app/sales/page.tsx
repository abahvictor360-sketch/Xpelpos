"use client";

import { useMemo, useState } from "react";
import { Ban, Eye, FileSpreadsheet, FileText, FileType2, Loader2 } from "lucide-react";
import { useReport } from "@/lib/useReport";
import { exportDocx, exportExcel, exportPdf } from "@/lib/exporters";
import { voidSale } from "@/lib/repository";
import { db } from "@/lib/db";
import Modal from "@/components/Modal";
import Receipt from "@/components/Receipt";
import { toast } from "@/components/Toaster";
import type { PaymentMethod, Sale, SaleItem } from "@/lib/types";
import {
  addDays,
  cx,
  endOfDay,
  formatDateTime,
  formatMoney,
  formatNumber,
  startOfDay,
  toDateInput,
} from "@/lib/utils";

type RangeKey = "today" | "7d" | "30d" | "month" | "custom";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

function resolveRange(key: RangeKey, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case "month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    default:
      return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }
}

export default function SalesPage() {
  const today = new Date();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState(toDateInput(addDays(today, -7)));
  const [customTo, setCustomTo] = useState(toDateInput(today));
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const [exporting, setExporting] = useState<string>("");
  const [viewing, setViewing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);

  const range = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const report = useReport(range.from, range.to);

  const filtered = useMemo(() => {
    if (!report) return undefined;
    if (method === "all") return report;
    const rows = report.rows.filter((row) => row.paymentMethod === method);
    return { ...report, rows, topProducts: report.productsByPayment[method] };
  }, [report, method]);

  // Units sold per product, most-sold first.
  const productsSold = useMemo(
    () => [...(filtered?.topProducts ?? [])].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue),
    [filtered],
  );
  const unitsSold = productsSold.reduce((sum, product) => sum + product.quantity, 0);
  const productRevenue = productsSold.reduce((sum, product) => sum + product.revenue, 0);

  const runExport = async (kind: "xlsx" | "pdf" | "docx") => {
    if (!filtered) return;
    setExporting(kind);
    try {
      if (kind === "xlsx") await exportExcel(filtered);
      if (kind === "pdf") await exportPdf(filtered);
      if (kind === "docx") await exportDocx(filtered);
    } finally {
      setExporting("");
    }
  };

  const openReceipt = async (receiptNo: string) => {
    const sale = await db.sales.where("receiptNo").equals(receiptNo).first();
    if (!sale) return;
    const items = await db.saleItems.where("saleId").equals(sale.id).toArray();
    setViewing({ sale, items });
  };

  const askVoid = async (receiptNo: string) => {
    const sale = await db.sales.where("receiptNo").equals(receiptNo).first();
    if (sale) setVoiding(sale);
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    await voidSale(voiding.id);
    toast(`${voiding.receiptNo} voided — stock returned.`, "success");
    setVoiding(null);
  };

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((range) => (
              <button
                key={range.key}
                onClick={() => setRangeKey(range.key)}
                className={cx(
                  "rounded-2xl px-3.5 py-2 text-sm font-medium transition",
                  rangeKey === range.key
                    ? "bg-brand-500 text-white shadow-brand"
                    : "border border-black/10 bg-white text-ink-700/70 hover:bg-black/[0.03]",
                )}
              >
                {range.label}
              </button>
            ))}
          </div>

          {rangeKey === "custom" && (
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="label">From</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="label">To</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="input"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="label">Payment</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod | "all")}
              className="input"
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
              <option value="card">Card</option>
            </select>
          </label>

          <div className="ml-auto flex flex-wrap gap-2">
            <ExportButton
              label="Excel"
              icon={<FileSpreadsheet size={16} />}
              busy={exporting === "xlsx"}
              onClick={() => void runExport("xlsx")}
              disabled={!filtered?.rows.length}
            />
            <ExportButton
              label="PDF"
              icon={<FileText size={16} />}
              busy={exporting === "pdf"}
              onClick={() => void runExport("pdf")}
              disabled={!filtered?.rows.length}
            />
            <ExportButton
              label="Word"
              icon={<FileType2 size={16} />}
              busy={exporting === "docx"}
              onClick={() => void runExport("docx")}
              disabled={!filtered?.rows.length}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Revenue" value={formatMoney(report?.summary.revenue ?? 0)} />
        <Summary label="Transactions" value={formatNumber(report?.summary.transactions ?? 0)} />
        <Summary label="Items sold" value={formatNumber(report?.summary.itemsSold ?? 0)} />
        <Summary label="Gross profit" value={formatMoney(report?.summary.grossProfit ?? 0)} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-bold text-ink-900">Products sold</h2>
          <span className="text-xs text-ink-700/55">
            {formatNumber(unitsSold)} units · {productsSold.length} products
          </span>
        </div>

        {!productsSold.length ? (
          <p className="px-4 py-14 text-center text-sm text-ink-700/55">No products sold in this period.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 border-b border-black/5 bg-white text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 text-right font-medium">Units sold</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {productsSold.map((product) => (
                  <tr key={`${product.sku}-${product.name}`} className="hover:bg-black/[0.015]">
                    <td className="px-4 py-3 font-medium text-ink-900">{product.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-700/60">{product.sku || "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {formatNumber(product.quantity)} pcs
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatMoney(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 border-t border-black/10 bg-white text-sm font-bold text-ink-900">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatNumber(unitsSold)} pcs</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatMoney(productRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-bold text-ink-900">Transactions</h2>
          <span className="text-xs text-ink-700/55">{filtered?.rows.length ?? 0} records</span>
        </div>

        {!filtered?.rows.length ? (
          <p className="px-4 py-14 text-center text-sm text-ink-700/55">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Receipt</th>
                  <th className="px-4 py-2.5 font-medium">Date &amp; time</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.rows.map((row) => (
                  <tr key={row.receiptNo} className="hover:bg-black/[0.015]">
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-ink-900">{row.receiptNo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700/70">{formatDateTime(row.soldAt)}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-ink-700/70" title={row.items}>
                      {row.items}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{row.itemCount}</td>
                    <td className="px-4 py-3 capitalize text-ink-700/70">{row.paymentMethod}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(row.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {row.status !== "completed" && (
                          <span className="chip bg-black/5 capitalize text-ink-700/70">{row.status}</span>
                        )}
                        <button
                          onClick={() => void openReceipt(row.receiptNo)}
                          title="View / reprint receipt"
                          aria-label={`View receipt ${row.receiptNo}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-black/5"
                        >
                          <Eye size={16} />
                        </button>
                        {row.status === "completed" && (
                          <button
                            onClick={() => void askVoid(row.receiptNo)}
                            title="Void this sale"
                            aria-label={`Void ${row.receiptNo}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-brand-50 hover:text-brand-700"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <Receipt
          sale={viewing.sale}
          items={viewing.items}
          onClose={() => setViewing(null)}
          title={`Receipt ${viewing.sale.receiptNo}`}
          actionLabel="Done"
        />
      )}

      {voiding && (
        <Modal
          title={`Void ${voiding.receiptNo}?`}
          onClose={() => setVoiding(null)}
          size="sm"
          footer={
            <>
              <button onClick={() => setVoiding(null)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={() => void confirmVoid()}
                className="btn flex-1 bg-brand-600 text-white hover:bg-brand-700"
              >
                Void sale
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700/75">
            The {formatMoney(voiding.total)} sale is marked void and every item on it goes back into stock. Reports stop
            counting it, but the record stays for your audit trail.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">{label}</p>
      <p className="tabular mt-1 text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function ExportButton({
  label,
  icon,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="btn-ghost">
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
