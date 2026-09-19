"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProductPerformance, SeriesPoint } from "@/lib/analytics";
import type { PaymentMethod } from "@/lib/types";
import { cx, formatMoney, formatNumber } from "@/lib/utils";

/** Validated categorical palette (light surface) — cash / transfer / card. */
export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cash: "#cf6d1e",
  transfer: "#1273c6",
  card: "#8a9500",
};

const AXIS = { fontSize: 11, fill: "#1f1e1999" } as const;

/** Dark pill tooltip, as in the reference dashboards. */
function TooltipCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl bg-ink-900 px-3 py-2 shadow-pop">
      <p className="text-[11px] font-semibold text-white/60">{title}</p>
      {rows.map(([label, value]) => (
        <p key={label} className="tabular text-xs text-white">
          <span className="text-white/60">{label}:</span> <span className="font-semibold">{value}</span>
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: SeriesPoint[] }) {
  const peak = Math.max(...data.map((point) => point.revenue), 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="#1f1e190d" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
        />
        <Tooltip
          cursor={{ fill: "#1f1e1908" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipCard
                title={String(label)}
                rows={[
                  ["Revenue", formatMoney(Number(payload[0].value ?? 0))],
                  ["Sales", formatNumber(Number(payload[0].payload?.transactions ?? 0))],
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="revenue" radius={[8, 8, 8, 8]} maxBarSize={26}>
          {data.map((point) => (
            <Cell
              key={point.label}
              // The best day of the period reads solid; the rest sit back a shade.
              fill={peak > 0 && point.revenue === peak ? "#cf6d1e" : "#f0c9a6"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentSplit({
  data,
}: {
  data: Array<{ method: PaymentMethod; total: number; count: number }>;
}) {
  const total = data.reduce((sum, entry) => sum + entry.total, 0);
  const hasData = total > 0;

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={hasData ? data : [{ method: "cash", total: 1, count: 0 }]}
              dataKey="total"
              nameKey="method"
              innerRadius={56}
              outerRadius={88}
              paddingAngle={3}
              cornerRadius={8}
              stroke="#ffffff"
              strokeWidth={3}
            >
              {(hasData ? data : [{ method: "cash" as PaymentMethod }]).map((entry) => (
                <Cell
                  key={entry.method}
                  fill={hasData ? PAYMENT_COLORS[entry.method] : "#e6e5e0"}
                />
              ))}
            </Pie>
            {hasData && (
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={String(payload[0].name).replace(/^\w/, (c) => c.toUpperCase())}
                      rows={[
                        ["Amount", formatMoney(Number(payload[0].value ?? 0))],
                        ["Sales", formatNumber(Number(payload[0].payload?.count ?? 0))],
                      ]}
                    />
                  ) : null
                }
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-ink-700/50">Collected</span>
          <span className="tabular text-lg font-bold text-ink-900">{formatMoney(total)}</span>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {data.map((entry) => (
          <li key={entry.method} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: PAYMENT_COLORS[entry.method] }}
            />
            <span className="capitalize text-ink-700/80">{entry.method}</span>
            <span className="tabular ml-auto font-semibold text-ink-900">{formatMoney(entry.total)}</span>
            <span
              className={cx(
                "chip w-12 justify-center px-1.5 py-0.5 text-[11px] font-semibold",
                entry.total > 0 ? "bg-olive-100 text-olive-900" : "bg-black/5 text-ink-700/50",
              )}
            >
              {total ? Math.round((entry.total / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopProductsChart({ data }: { data: ProductPerformance[] }) {
  const rows = data.slice(0, 7).map((item) => ({
    name: item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name,
    revenue: item.revenue,
    quantity: item.quantity,
  }));

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-700/50">No sales in this period yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 38)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={150} />
        <Tooltip
          cursor={{ fill: "#1f1e190a" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipCard
                title={String(label)}
                rows={[
                  ["Revenue", formatMoney(Number(payload[0].value ?? 0))],
                  ["Units sold", formatNumber(Number(payload[0].payload?.quantity ?? 0))],
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="revenue" fill="#cf6d1e" radius={[8, 8, 8, 8]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
