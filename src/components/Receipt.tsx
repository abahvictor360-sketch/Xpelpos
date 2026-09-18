"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import type { Sale, SaleItem } from "@/lib/types";
import { useStoreProfile } from "@/lib/store-profile";
import { formatDateTime, formatMoney } from "@/lib/utils";

interface Props {
  sale: Sale;
  items: SaleItem[];
  onClose: () => void;
  title?: string;
  actionLabel?: string;
}

export default function Receipt({ sale, items, onClose, title = "Sale completed", actionLabel = "New sale" }: Props) {
  const store = useStoreProfile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // The print stylesheet needs to know a receipt is on screen, so only it prints.
  useEffect(() => {
    document.body.classList.add("printing-receipt");
    return () => document.body.classList.remove("printing-receipt");
  }, []);

  if (!mounted) return null;

  // Portalled to <body> so the print stylesheet can hide everything except this.
  return createPortal(
    <div className="print-receipt-root fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="print-receipt-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-card">
        <div className="print-hide flex items-start justify-between">
          <p className="text-sm font-semibold text-olive-700">{title}</p>
          <button onClick={onClose} aria-label="Close receipt" className="rounded-lg p-1 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        <div id="xpel-receipt" className="mt-3 text-center">
          <p className="text-base font-extrabold uppercase tracking-wide text-ink-900">{store.name}</p>
          {store.address && <p className="text-[11px] text-ink-700/60">{store.address}</p>}
          {store.phone && <p className="text-[11px] text-ink-700/60">Tel: {store.phone}</p>}
          <p className="mt-1 text-xs text-ink-700/60">Sales receipt</p>
          <p className="text-[11px] text-ink-700/60">
            {sale.receiptNo} · {formatDateTime(sale.soldAt)}
          </p>
          <p className="text-[11px] text-ink-700/60">Served by {sale.cashierName || "Counter"}</p>

          <div className="my-3 border-t border-dashed border-black/15" />

          <table className="w-full text-left text-xs">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-1">
                    {item.name}
                    <span className="block text-[11px] text-ink-700/55">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </span>
                  </td>
                  <td className="tabular py-1 text-right font-medium">{formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-3 border-t border-dashed border-black/15" />

          <dl className="space-y-1 text-xs">
            <Row label="Subtotal" value={formatMoney(sale.subtotal)} />
            {sale.discount > 0 && <Row label="Discount" value={`- ${formatMoney(sale.discount)}`} />}
            {sale.tax > 0 && <Row label="VAT" value={formatMoney(sale.tax)} />}
            <Row label="Total" value={formatMoney(sale.total)} strong />
            <Row label={`Paid (${sale.paymentMethod})`} value={formatMoney(sale.amountPaid)} />
            {sale.changeDue > 0 && <Row label="Change" value={formatMoney(sale.changeDue)} />}
          </dl>

          {sale.status !== "completed" && (
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-700">
              {sale.status === "void" ? "Voided" : "Refunded"}
            </p>
          )}
          <p className="mt-4 text-[11px] text-ink-700/60">{store.receiptFooter}</p>
        </div>

        <div className="print-hide mt-5 flex gap-2">
          <button onClick={() => window.print()} className="btn-ghost flex-1">
            <Printer size={16} /> Print
          </button>
          <button onClick={onClose} className="btn-primary flex-1">
            {actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-sm font-bold text-ink-900" : "text-ink-700/75"}`}>
      <dt className="capitalize">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
