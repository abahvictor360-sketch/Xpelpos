"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  History,
  Receipt,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Tag,
  UserPlus,
  XCircle,
} from "lucide-react";
import { listActivities } from "@/lib/activity";
import type { Activity, ActivityKind } from "@/lib/types";
import { cx, formatDateTime, formatMoney } from "@/lib/utils";

type RangeKey = "today" | "week" | "month" | "all";

const RANGES: Array<{ id: RangeKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All" },
];

const FILTERS: Array<{ id: ActivityKind | "all"; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "sale", label: "Sales" },
  { id: "transfer-in", label: "Stock in" },
  { id: "transfer-out", label: "Stock out" },
  { id: "product", label: "Products" },
  { id: "customer", label: "Customers" },
  { id: "shift", label: "Shifts" },
];

const ICONS: Record<ActivityKind, React.ElementType> = {
  sale: Receipt,
  refund: RotateCcw,
  void: XCircle,
  "transfer-in": ArrowDownLeft,
  "transfer-out": ArrowUpRight,
  product: Boxes,
  stock: Boxes,
  customer: UserPlus,
  shift: ClipboardList,
  promotion: Tag,
  system: SettingsIcon,
};

const TONES: Partial<Record<ActivityKind, string>> = {
  sale: "bg-olive-100 text-olive-800",
  "transfer-in": "bg-olive-100 text-olive-800",
  "transfer-out": "bg-brand-50 text-brand-700",
  void: "bg-brand-50 text-brand-700",
  refund: "bg-brand-50 text-brand-700",
};

function rangeStart(range: RangeKey): Date | undefined {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "month") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

/** Groups entries under the day they happened, newest day first. */
function groupByDay(rows: Activity[]): Array<[string, Activity[]]> {
  const groups = new Map<string, Activity[]>();
  for (const row of rows) {
    const day = new Date(row.createdAt).toDateString();
    const bucket = groups.get(day);
    if (bucket) bucket.push(row);
    else groups.set(day, [row]);
  }
  return [...groups.entries()];
}

export default function ActivityPage() {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [range, setRange] = useState<RangeKey>("week");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Activity[]>([]);

  useEffect(() => {
    let active = true;
    void listActivities({ kind, from: rangeStart(range) }).then((result) => {
      if (active) setRows(result);
    });
    return () => {
      active = false;
    };
  }, [kind, range]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.message, row.detail, row.staffName].join(" ").toLowerCase().includes(needle),
    );
  }, [rows, term]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <History size={18} className="text-brand-600" />
          <h2 className="text-sm font-bold text-ink-900">Activity log</h2>
          <p className="text-xs text-ink-700/55">
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </p>
          <div className="ml-auto flex rounded-2xl border border-black/10 p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.id}
                onClick={() => setRange(option.id)}
                className={cx(
                  "rounded-xl px-2.5 py-1 text-xs font-semibold transition",
                  range === option.id
                    ? "bg-ink-900 text-white"
                    : "text-ink-700/60 hover:text-ink-900",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              onClick={() => setKind(option.id)}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                kind === option.id
                  ? "bg-brand-500 text-white"
                  : "bg-black/[0.04] text-ink-700/65 hover:bg-black/[0.07]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-black/10 px-3 py-2">
          <Search size={16} className="text-ink-700/40" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search the log…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card px-4 py-14 text-center">
          <History size={22} className="mx-auto text-ink-700/25" />
          <p className="mt-2 text-sm font-medium text-ink-900">Nothing logged yet</p>
          <p className="mt-1 text-sm text-ink-700/55">
            Sales, stock transfers, product edits and shifts all show up here as they happen.
          </p>
        </div>
      ) : (
        days.map(([day, entries]) => (
          <div key={day} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-700/45">
              {day}
            </p>
            <ul className="mt-3 space-y-3">
              {entries.map((entry) => {
                const Icon = ICONS[entry.kind] ?? History;
                return (
                  <li key={entry.id} className="flex gap-3">
                    <span
                      className={cx(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-2xl",
                        TONES[entry.kind] ?? "bg-black/[0.04] text-ink-700/60",
                      )}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">{entry.message}</p>
                      {entry.detail && (
                        <p className="text-xs text-ink-700/55">{entry.detail}</p>
                      )}
                      <p className="text-[11px] text-ink-700/45">
                        {formatDateTime(entry.createdAt)} · {entry.staffName}
                      </p>
                    </div>
                    {entry.amount !== null && (
                      <span className="tabular shrink-0 text-sm font-bold text-ink-900">
                        {formatMoney(entry.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
