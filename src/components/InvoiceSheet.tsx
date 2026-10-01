"use client";

import { XPEL_LOGO_DATA_URI } from "@/lib/brand-assets";
import { useStoreProfile } from "@/lib/store-profile";
import type { Invoice } from "@/lib/types";
import { describeQuantity } from "@/lib/units";
import { cx, formatDate, formatDateTime, formatMoney } from "@/lib/utils";

interface Props {
  invoice: Invoice;
  className?: string;
}

/** The invoice laid out as an A4 page: the on-screen preview and the printed copy. */
export default function InvoiceSheet({ invoice, className }: Props) {
  const store = useStoreProfile();
  const paid = invoice.status === "paid";
  const balance = invoice.total - (invoice.paidAmount || invoice.total);

  return (
    <div className={cx("invoice-sheet text-[12px] leading-snug", className)}>
      <div className="invoice-sheet-watermark" aria-hidden>
        <img src={XPEL_LOGO_DATA_URI} alt="" />
      </div>

      <div className="relative">
        <header className="flex items-start justify-between gap-4 rounded-2xl bg-brand-500 p-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white">
              <img src={XPEL_LOGO_DATA_URI} alt="Xpel Beauty" className="h-11 w-11 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold uppercase tracking-wide">{store.name}</p>
              <p className="text-[10.5px] opacity-90">{store.address}</p>
              <p className="text-[10.5px] opacity-90">
                {[store.phone && `Tel: ${store.phone}`, store.website].filter(Boolean).join("   ·   ")}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-extrabold tracking-wide">INVOICE</p>
            <p className="text-[11px] font-semibold">{invoice.invoiceNo}</p>
            <p className="text-[10.5px] opacity-90">Issued {formatDate(invoice.issuedAt)}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-700/55">Bill to</p>
            <p className="mt-1 text-sm font-bold text-ink-900">{invoice.customerName || "Customer"}</p>
            {invoice.customerPhone && <p>{invoice.customerPhone}</p>}
            {invoice.customerEmail && <p>{invoice.customerEmail}</p>}
            {invoice.customerAddress && <p className="whitespace-pre-line">{invoice.customerAddress}</p>}
          </div>
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-700/55">Details</p>
            <dl className="mt-1 space-y-0.5">
              {[
                ["Invoice no.", invoice.invoiceNo],
                ["Date issued", formatDate(invoice.issuedAt)],
                ["Due date", invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"],
                ["Prepared by", invoice.createdBy || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-ink-700/60">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {paid && (
              <span className="absolute -top-1 right-0 rotate-[-8deg] rounded-lg border-2 border-olive-800 px-3 py-0.5 text-xl font-black tracking-widest text-olive-800">
                PAID
              </span>
            )}
          </div>
        </section>

        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="bg-ink-900 text-left text-[11px] text-white">
              <th className="w-8 px-2 py-2 text-center">#</th>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Unit price</th>
              <th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${item.productId}-${index}`} className="border-b border-black/[0.06] odd:bg-black/[0.015]">
                <td className="px-2 py-2 text-center text-ink-700/60">{index + 1}</td>
                <td className="px-2 py-2">
                  <p className="font-medium">{item.name}</p>
                  {item.sku && <p className="text-[10px] text-ink-700/50">{item.sku}</p>}
                </td>
                <td className="px-2 py-2 text-right tabular">{describeQuantity(item)}</td>
                <td className="px-2 py-2 text-right tabular">{formatMoney(item.unitPrice)}</td>
                <td className="px-2 py-2 text-right font-semibold tabular">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <dl className="w-64 space-y-1 tabular">
            <div className="flex justify-between">
              <dt className="text-ink-700/60">Subtotal</dt>
              <dd>{formatMoney(invoice.subtotal)}</dd>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-700/60">Discount</dt>
                <dd>- {formatMoney(invoice.discount)}</dd>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-700/60">VAT</dt>
                <dd>{formatMoney(invoice.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between rounded-xl bg-brand-500 px-3 py-2 text-sm font-bold text-white">
              <dt>{paid ? "Total" : "Amount due"}</dt>
              <dd>{formatMoney(invoice.total)}</dd>
            </div>
          </dl>
        </div>

        {paid ? (
          <section className="mt-5 rounded-2xl bg-olive-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-olive-900">Payment received — thank you</p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              <p>Amount received: <b>{formatMoney(invoice.paidAmount || invoice.total)}</b></p>
              <p>Paid into: <b>{invoice.accountName}</b></p>
              <p>Date: {invoice.paidAt ? formatDateTime(invoice.paidAt) : "—"}</p>
              <p>{invoice.bankName} · {invoice.accountNumber}</p>
              {invoice.paymentReference && <p>Reference: {invoice.paymentReference}</p>}
              {balance > 0.005 && <p className="font-semibold">Balance outstanding: {formatMoney(balance)}</p>}
            </div>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl bg-brand-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Pay by bank transfer</p>
            <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-ink-700/60">Bank</dt>
              <dd className="font-bold">{invoice.bankName}</dd>
              <dt className="text-ink-700/60">Account number</dt>
              <dd className="text-base font-extrabold tracking-wider">{invoice.accountNumber}</dd>
              <dt className="text-ink-700/60">Account name</dt>
              <dd className="font-bold">{invoice.accountName}</dd>
            </dl>
            <p className="mt-2 text-right text-[10.5px] text-ink-700/60">
              Use {invoice.invoiceNo} as the transfer narration.
            </p>
          </section>
        )}

        {invoice.notes && (
          <section className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-700/55">Notes</p>
            <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
          </section>
        )}

        <footer className="mt-8 border-t border-black/10 pt-2 text-center text-[10px] text-ink-700/60">
          {[store.name, store.phone, store.website].filter(Boolean).join("   ·   ")}
        </footer>
      </div>
    </div>
  );
}
