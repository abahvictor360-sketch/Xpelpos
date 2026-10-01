"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FilePlus2, FileText, RefreshCw, Search } from "lucide-react";
import InvoiceEditor from "@/components/InvoiceEditor";
import InvoiceDetail from "@/components/InvoiceDetail";
import { toast } from "@/components/Toaster";
import { getDb } from "@/lib/db";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/invoices";
import { syncNow } from "@/lib/sync";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { cx, formatDate, formatMoney } from "@/lib/utils";

type Filter = "all" | "open" | InvoiceStatus;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Unpaid" },
  { id: "paid", label: "Paid" },
  { id: "cancelled", label: "Cancelled" },
];

export default function InvoicesPage() {
  const invoices = useLiveQuery(
    () => getDb().invoices.orderBy("issuedAt").reverse().filter((invoice) => !invoice.deletedAt).toArray(),
    [],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ invoice: Invoice; pin: string } | "new" | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const open = invoices?.find((invoice) => invoice.id === openId) ?? null;

  // Pick up invoices raised on the other tills.
  useEffect(() => {
    void syncNow();
  }, []);

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (invoices ?? []).filter((invoice) => {
      if (filter === "open" && !["ready", "sent"].includes(invoice.status)) return false;
      if (filter !== "all" && filter !== "open" && invoice.status !== filter) return false;
      if (!needle) return true;
      return [invoice.invoiceNo, invoice.customerName, invoice.customerPhone, invoice.accountName]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [invoices, filter, term]);

  const outstanding = (invoices ?? [])
    .filter((invoice) => invoice.status === "ready" || invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const paidTotal = (invoices ?? [])
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + (invoice.paidAmount || invoice.total), 0);

  const onSaved = (invoice: Invoice) => {
    setEditing(null);
    setOpenId(invoice.id);
    toast(`Invoice ${invoice.invoiceNo} saved.`, "success");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700/60">Raise an invoice, send it, then confirm payment when the money arrives.</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                const report = await syncNow();
                toast(report.message, report.ok ? "info" : "error");
              } catch (error) {
                toast(error instanceof Error ? error.message : String(error), "error");
              } finally {
                setRefreshing(false);
              }
            }}
            className="btn-ghost"
            aria-label="Sync invoices"
          >
            <RefreshCw size={16} className={cx(refreshing && "animate-spin")} />
          </button>
          <button onClick={() => setEditing("new")} className="btn-primary">
            <FilePlus2 size={16} /> New invoice
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">Invoices</p>
          <p className="mt-1 text-2xl font-bold tabular">{invoices?.length ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">Waiting to be paid</p>
          <p className="mt-1 text-2xl font-bold tabular">{formatMoney(outstanding)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">Paid</p>
          <p className="mt-1 text-2xl font-bold tabular text-olive-800">{formatMoney(paidTotal)}</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/40" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="input pl-9"
              placeholder="Search invoice no., customer or account"
              aria-label="Search invoices"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={cx(
                  "chip border",
                  filter === option.id ? "border-ink-800 bg-ink-800 text-white" : "border-black/10 bg-white text-ink-700",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {invoices && shown.length === 0 ? (
          <div className="py-12 text-center">
            <FileText size={28} className="mx-auto text-ink-700/30" />
            <p className="mt-2 text-sm text-ink-700/60">
              {invoices.length === 0 ? "No invoices yet. Raise one with New invoice." : "No invoices match."}
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-700/50">
                  <th className="py-2 pr-3 font-medium">Invoice</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Issued</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 pr-3 font-medium">Pay into</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => setOpenId(invoice.id)}
                    className="cursor-pointer border-t border-black/[0.05] hover:bg-black/[0.02]"
                  >
                    <td className="py-2.5 pr-3 font-semibold">{invoice.invoiceNo}</td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{invoice.customerName}</p>
                      {invoice.customerPhone && <p className="text-xs text-ink-700/50">{invoice.customerPhone}</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-700/70">{formatDate(invoice.issuedAt)}</td>
                    <td className="py-2.5 pr-3 text-ink-700/70">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</td>
                    <td className="max-w-[12rem] truncate py-2.5 pr-3 text-ink-700/70">{invoice.accountName}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular">{formatMoney(invoice.total)}</td>
                    <td className="py-2.5">
                      <span className={cx("chip whitespace-nowrap", STATUS_TONE[invoice.status])}>
                        {STATUS_LABEL[invoice.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && !editing && (
        <InvoiceDetail invoice={open} onClose={() => setOpenId(null)} onEdit={(pin) => setEditing({ invoice: open, pin })} />
      )}
      {editing && (
        <InvoiceEditor
          invoice={editing === "new" ? null : editing.invoice}
          adminPin={editing === "new" ? "" : editing.pin}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
