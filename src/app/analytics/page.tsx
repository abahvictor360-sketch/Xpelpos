"use client";

import { useMemo, useState } from "react";
import { Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { PaymentSplit, RevenueChart, TopProductsChart } from "@/components/Charts";
import StatCard from "@/components/StatCard";
import { useReport } from "@/lib/useReport";
import { addDays, cx, endOfDay, formatMoney, formatNumber, startOfDay } from "@/lib/utils";

const PERIODS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]["key"]>("30");

  const { from, to, prevFrom, prevTo } = useMemo(() => {
    const span = Number(days);
    const now = new Date();
    return {
      from: startOfDay(addDays(now, -(span - 1))),
      to: endOfDay(now),
      prevFrom: startOfDay(addDays(now, -(span * 2 - 1))),
      prevTo: endOfDay(addDays(now, -span)),
    };
  }, [days]);

  const report = useReport(from, to);
  const previous = useReport(prevFrom, prevTo);

  const revenue = report?.summary.revenue ?? 0;
  const prevRevenue = previous?.summary.revenue ?? 0;
  const delta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const paymentData = report
    ? (["cash", "transfer", "card"] as const).map((method) => ({
        method,
        total: report.summary.byPayment[method].total,
        count: report.summary.byPayment[method].count,
      }))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((period) => (
          <button
            key={period.key}
            onClick={() => setDays(period.key)}
            className={cx(
              "rounded-2xl px-3.5 py-2 text-sm font-medium transition",
              days === period.key
                ? "bg-brand-500 text-white shadow-brand"
                : "border border-black/10 bg-white text-ink-700/70 hover:bg-black/[0.03]",
            )}
          >
            Last {period.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(revenue)}
          featured
          icon={<Wallet size={18} />}
          trend={delta === null ? undefined : { value: `${Math.abs(delta).toFixed(1)}%`, positive: delta >= 0 }}
          hint="vs previous period"
        />
        <StatCard
          label="Gross profit"
          value={formatMoney(report?.summary.grossProfit ?? 0)}
          icon={<TrendingUp size={18} />}
          hint="selling price minus cost"
        />
        <StatCard
          label="Transactions"
          value={formatNumber(report?.summary.transactions ?? 0)}
          icon={<Receipt size={18} />}
          hint={`${formatNumber(report?.summary.itemsSold ?? 0)} items sold`}
        />
        <StatCard
          label="Average basket"
          value={formatMoney(report?.summary.averageBasket ?? 0)}
          icon={<ShoppingBag size={18} />}
          hint={`${formatMoney(report?.summary.discountGiven ?? 0)} discounted`}
        />
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink-900">Revenue trend</h2>
        <p className="mb-2 text-xs text-ink-700/55">Daily takings across the selected period</p>
        <RevenueChart data={report?.series ?? []} />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-4">
          <h2 className="text-sm font-bold text-ink-900">Best selling products</h2>
          <p className="mb-2 text-xs text-ink-700/55">Ranked by revenue</p>
          <TopProductsChart data={report?.topProducts ?? []} />
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-sm font-bold text-ink-900">Payment methods</h2>
          <PaymentSplit data={paymentData} />
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-bold text-ink-900">Product performance</h2>
        </div>
        {!report?.topProducts.length ? (
          <p className="px-4 py-12 text-center text-sm text-ink-700/55">No sales in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 text-right font-medium">Units sold</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {report.topProducts.map((product) => (
                  <tr key={`${product.name}-${product.sku}`} className="hover:bg-black/[0.015]">
                    <td className="px-4 py-3 font-medium text-ink-900">{product.name}</td>
                    <td className="px-4 py-3 text-ink-700/60">{product.sku || "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatNumber(product.quantity)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(product.revenue)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-olive-800">{formatMoney(product.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
