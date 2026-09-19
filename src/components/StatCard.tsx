"use client";

import { cx } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: string; positive: boolean };
  /** The filled brand card — one per row, like the reference dashboards. */
  featured?: boolean;
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, hint, trend, featured, icon }: StatCardProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl p-4",
        featured
          ? "bg-brand-500 text-white shadow-brand"
          : "border border-black/[0.04] bg-white shadow-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cx(
            "grid h-10 w-10 place-items-center rounded-2xl",
            featured ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600",
          )}
        >
          {icon}
        </span>
        {trend && (
          <span
            className={cx(
              "chip px-2 py-0.5 text-[11px] font-semibold",
              trend.positive
                ? featured
                  ? "bg-white/20 text-white"
                  : "bg-olive-100 text-olive-900"
                : featured
                  ? "bg-ink-900/25 text-white"
                  : "bg-brand-50 text-brand-700",
            )}
          >
            {trend.positive ? "▲" : "▼"} {trend.value}
          </span>
        )}
      </div>

      <p className={cx("mt-3 text-xs font-medium", featured ? "text-white/75" : "text-ink-700/55")}>
        {label}
      </p>
      <p className={cx("tabular mt-0.5 text-2xl font-extrabold tracking-tight", featured ? "text-white" : "text-ink-900")}>
        {value}
      </p>
      {hint && (
        <p className={cx("mt-1 text-[11px]", featured ? "text-white/65" : "text-ink-700/50")}>{hint}</p>
      )}

      {featured && (
        <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      )}
    </div>
  );
}
