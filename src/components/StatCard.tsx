"use client";

import { cx } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: string; positive: boolean };
  accent?: "brand" | "olive" | "blue" | "neutral";
  icon?: React.ReactNode;
}

const ACCENTS: Record<NonNullable<StatCardProps["accent"]>, string> = {
  brand: "bg-brand-50 text-brand-700",
  olive: "bg-olive-100 text-olive-900",
  blue: "bg-[#e8f1fb] text-[#0d5aa0]",
  neutral: "bg-black/5 text-ink-800",
};

export default function StatCard({ label, value, hint, trend, accent = "neutral", icon }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">{label}</p>
        {icon && <span className={cx("grid h-8 w-8 place-items-center rounded-lg", ACCENTS[accent])}>{icon}</span>}
      </div>
      <p className="tabular mt-2 text-2xl font-bold text-ink-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend && (
          <span
            className={cx(
              "chip px-2 py-0.5",
              trend.positive ? "bg-olive-100 text-olive-900" : "bg-brand-50 text-brand-700",
            )}
          >
            {trend.positive ? "▲" : "▼"} {trend.value}
          </span>
        )}
        {hint && <span className="text-ink-700/55">{hint}</span>}
      </div>
    </div>
  );
}
