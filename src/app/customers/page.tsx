"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, Search, Trash2, User } from "lucide-react";
import { db } from "@/lib/db";
import { deleteCustomer, saveCustomer } from "@/lib/repository";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import type { Customer, Sale } from "@/lib/types";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export default function CustomersPage() {
  const customers = useLiveQuery(
    () => db.customers.filter((c) => !c.deletedAt).toArray(),
    [],
    [] as Customer[],
  );
  const sales = useLiveQuery(() => db.sales.toArray(), [], [] as Sale[]);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const spend = new Map<string, { total: number; visits: number; last: string }>();
    for (const sale of sales ?? []) {
      if (!sale.customerId || sale.status !== "completed") continue;
      const current = spend.get(sale.customerId) ?? { total: 0, visits: 0, last: "" };
      current.total += sale.total;
      current.visits += 1;
      if (sale.soldAt > current.last) current.last = sale.soldAt;
      spend.set(sale.customerId, current);
    }

    const query = term.trim().toLowerCase();
    return (customers ?? [])
      .filter((customer) =>
        !query ? true : [customer.name, customer.phone, customer.email].join(" ").toLowerCase().includes(query),
      )
      .map((customer) => ({ customer, ...(spend.get(customer.id) ?? { total: 0, visits: 0, last: "" }) }))
      .sort((a, b) => b.total - a.total || a.customer.name.localeCompare(b.customer.name));
  }, [customers, sales, term]);

  const totalSpend = rows.reduce((sum, row) => sum + row.total, 0);
  const repeat = rows.filter((row) => row.visits > 1).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Customers" value={formatNumber(rows.length)} />
        <Tile label="Repeat customers" value={formatNumber(repeat)} />
        <Tile label="Tracked spend" value={formatMoney(totalSpend)} />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black/10 px-3 py-2">
            <Search size={16} className="text-ink-700/40" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by name, phone or email…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Add customer
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            {term.trim() ? (
              <>
                <p className="text-sm font-medium text-ink-900">
                  No customer matches &ldquo;{term.trim()}&rdquo;
                </p>
                <p className="mt-1 text-sm text-ink-700/55">
                  Add them now and the name is filled in for you.
                </p>
                <button
                  onClick={() => {
                    setEditing(null);
                    setShowForm(true);
                  }}
                  className="btn-primary mt-4"
                >
                  <Plus size={16} /> Add &ldquo;{term.trim()}&rdquo;
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-ink-900">No customers yet</p>
                <p className="mt-1 text-sm text-ink-700/55">
                  Pick or add a customer at checkout and they are saved here automatically.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 text-right font-medium">Visits</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total spend</th>
                  <th className="px-4 py-2.5 font-medium">Last purchase</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map(({ customer, total, visits, last }) => (
                  <tr key={customer.id} className="hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewing(customer)}
                        className="font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {customer.name}
                      </button>
                      <span className="block text-xs text-ink-700/50">
                        {customer.code}
                        {customer.email ? ` · ${customer.email}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-700/70">{customer.phone || "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{visits}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(total)}</td>
                    <td className="px-4 py-3 text-ink-700/70">{last ? formatDateTime(last) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(customer);
                            setShowForm(true);
                          }}
                          aria-label={`Edit ${customer.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-black/5"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            await deleteCustomer(customer.id);
                            toast(`${customer.name} removed.`, "success");
                          }}
                          aria-label={`Remove ${customer.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <CustomerForm
          customer={editing}
          presetName={editing ? undefined : term.trim()}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {viewing && (
        <CustomerHistory
          customer={viewing}
          sales={(sales ?? []).filter((sale) => sale.customerId === viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">{label}</p>
      <p className="tabular mt-1 text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function CustomerForm({
  customer,
  presetName,
  onClose,
}: {
  customer: Customer | null;
  presetName?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? presetName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    note: customer?.note ?? "",
  });
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("A name is required.");
      return;
    }
    await saveCustomer(form, customer?.id);
    toast(`${form.name} saved.`, "success");
    onClose();
  };

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal title={customer ? `Edit ${customer.name}` : "Add customer"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input value={form.name} onChange={set("name")} className="input" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Phone</span>
            <input value={form.phone} onChange={set("phone")} className="input" inputMode="tel" />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input value={form.email} onChange={set("email")} className="input" type="email" />
          </label>
        </div>
        <label className="block">
          <span className="label">Note</span>
          <input value={form.note} onChange={set("note")} className="input" placeholder="Skin type, preferences…" />
        </label>
        {error && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerHistory({
  customer,
  sales,
  onClose,
}: {
  customer: Customer;
  sales: Sale[];
  onClose: () => void;
}) {
  const completed = sales.filter((sale) => sale.status === "completed");
  const total = completed.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <Modal title={customer.name} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="chip bg-black/5 text-ink-800">
          <User size={14} /> {customer.phone || "No phone"}
        </span>
        <span className="chip bg-olive-100 text-olive-900">{completed.length} purchases</span>
        <span className="chip bg-brand-50 text-brand-700">{formatMoney(total)} spent</span>
      </div>
      {customer.note && <p className="mb-3 text-sm text-ink-700/70">{customer.note}</p>}

      {completed.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-700/55">No purchases recorded yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-auto">
          {[...completed]
            .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
            .map((sale) => (
              <li key={sale.id} className="flex items-center gap-3 rounded-xl bg-black/[0.02] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{sale.receiptNo}</span>
                  <span className="block text-xs text-ink-700/55">
                    {formatDateTime(sale.soldAt)} · {sale.paymentMethod}
                  </span>
                </span>
                <span className="tabular text-sm font-bold text-ink-900">{formatMoney(sale.total)}</span>
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}
