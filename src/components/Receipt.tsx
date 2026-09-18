"use client";

import { Printer, X } from "lucide-react";
import type { Sale, SaleItem } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/utils";

interface Props {
  sale: Sale;
  items: SaleItem[];
  onClose: () => void;
}

export default function Receipt({ sale, items, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-card print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between print:hidden">
          <p className="text-sm font-semibold text-olive-700">Sale completed</p>
          <button onClick={onClose} aria-label="Close receipt" className="rounded-lg p-1 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        <div id="xpel-receipt" className="mt-3 text-center">
          <p className="text-base font-extrabold tracking-wide text-ink-900">XPEL BEAUTY NG</p>
          <p className="text-xs text-ink-700/60">Sales receipt</p>
          <p className="mt-1 text-[11px] text-ink-700/60">
            {sale.receiptNo} · {formatDateTime(sale.soldAt)}
          </p>

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
            <Row label="Total" value={formatMoney(sale.total)} strong />
            <Row label={`Paid (${sale.paymentMethod})`} value={formatMoney(sale.amountPaid)} />
            {sale.changeDue > 0 && <Row label="Change" value={formatMoney(sale.changeDue)} />}
          </dl>

          <p className="mt-4 text-[11px] text-ink-700/60">Thank you for shopping with Xpel Beauty NG 💛</p>
        </div>

        <div className="mt-5 flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="btn-ghost flex-1">
            <Printer size={16} /> Print
          </button>
          <button onClick={onClose} className="btn-primary flex-1">
            New sale
          </button>
        </div>
      </div>
    </div>
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
