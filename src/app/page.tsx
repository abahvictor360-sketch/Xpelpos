"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Boxes, Receipt, ShoppingBag, Wallet } from "lucide-react";
import StatCard from "@/components/StatCard";
import { PaymentSplit, RevenueChart } from "@/components/Charts";
import { db } from "@/lib/db";
import { useReport } from "@/lib/useReport";
import type { Product } from "@/lib/types";
import { addDays, endOfDay, formatMoney, formatNumber, formatTime, startOfDay } from "@/lib/utils";

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const todayReport = useReport(startOfDay(today), endOfDay(today));
  const weekReport = useReport(startOfDay(addDays(today, -6)), endOfDay(today));
  const yesterdayReport = useReport(startOfDay(addDays(today, -1)), endOfDay(addDays(today, -1)));

  const products = useLiveQuery(
    () => db.products.filter((p: Product) => !p.deletedAt && p.isActive).toArray(),
    [],
    [] as Product[],
  );

  const lowStock = (products ?? [])
    .filter((product) => product.stockQty <= product.lowStockThreshold)
    .sort((a, b) => a.stockQty - b.stockQty)
    .slice(0, 6);

  const recent = todayReport?.rows.slice(0, 6) ?? [];
  const revenueToday = todayReport?.summary.revenue ?? 0;
  const revenueYesterday = yesterdayReport?.summary.revenue ?? 0;
  const delta =
    revenueYesterday > 0 ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100 : null;

  const paymentData = todayReport
    ? (["cash", "transfer", "card"] as const).map((method) => ({
        method,
        total: todayReport.summary.byPayment[method].total,
        count: todayReport.summary.byPayment[method].count,
      }))
    : [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue today"
          value={formatMoney(revenueToday)}
          featured
          icon={<Wallet size={18} />}
          trend={
            delta === null
              ? undefined
              : { value: `${Math.abs(delta).toFixed(1)}%`, positive: delta >= 0 }
          }
          hint="vs yesterday"
        />
        <StatCard
          label="Sales today"
          value={formatNumber(todayReport?.summary.transactions ?? 0)}
          icon={<Receipt size={18} />}
          hint={`${formatNumber(todayReport?.summary.itemsSold ?? 0)} items sold`}
        />
        <StatCard
          label="Average basket"
          value={formatMoney(todayReport?.summary.averageBasket ?? 0)}
          icon={<ShoppingBag size={18} />}
          hint="per transaction"
        />
        <StatCard
          label="Products"
          value={formatNumber(products?.length ?? 0)}
          icon={<Boxes size={18} />}
          hint={`${lowStock.length} need restocking`}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Revenue — last 7 days</h2>
              <p className="text-xs text-ink-700/55">
                {formatMoney(weekReport?.summary.revenue ?? 0)} from{" "}
                {formatNumber(weekReport?.summary.transactions ?? 0)} sales
              </p>
            </div>
            <Link href="/analytics" className="text-xs font-semibold text-brand-700 hover:underline">
              View analytics
            </Link>
          </div>
          <RevenueChart data={weekReport?.series ?? []} />
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-sm font-bold text-ink-900">How customers paid today</h2>
          <PaymentSplit data={paymentData} />
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <h2 className="text-sm font-bold text-ink-900">Today&apos;s transactions</h2>
            <Link href="/sales" className="text-xs font-semibold text-brand-700 hover:underline">
              All sales
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-ink-700/55">No sales recorded yet today.</p>
              <Link href="/sell" className="btn-primary mt-4">
                Start a sale
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Receipt</th>
                    <th className="px-4 py-2.5 font-medium">Items</th>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Payment</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {recent.map((row) => (
                    <tr key={row.receiptNo}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-ink-900">{row.receiptNo}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-ink-700/70" title={row.items}>
                      {row.items}
                    </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-700/70">{formatTime(row.soldAt)}</td>
                      <td className="px-4 py-3 capitalize text-ink-700/70">{row.paymentMethod}</td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {formatMoney(row.total)}
                    </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <AlertTriangle size={15} className="text-brand-600" /> Restock alerts
          </h2>
          {lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-700/55">Every product is well stocked.</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((product) => (
                <li key={product.id} className="flex items-center gap-3 rounded-xl bg-black/[0.02] px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{product.name}</span>
                    <span className="block text-xs text-ink-700/50">{product.category || "Uncategorised"}</span>
                  </span>
                  <span
                    className={`tabular text-sm font-bold ${
                      product.stockQty <= 0 ? "text-brand-700" : "text-brand-600"
                    }`}
                  >
                    {product.stockQty}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/inventory" className="btn-ghost mt-3 w-full">
            Manage inventory
          </Link>
        </section>
      </div>
    </div>
  );
}
