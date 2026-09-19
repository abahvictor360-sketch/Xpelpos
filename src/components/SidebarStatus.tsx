"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleDot, PlayCircle } from "lucide-react";
import { db, getSetting } from "@/lib/db";
import { shiftTotals } from "@/lib/repository";
import type { Shift } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

/** The dark card at the foot of the sidebar: live till status rather than an advert. */
export default function SidebarStatus() {
  const shift = useLiveQuery(
    () => db.shifts.where("status").equals("open").first(),
    [],
    undefined as Shift | undefined,
  );
  const [takings, setTakings] = useState(0);
  const [cashier, setCashier] = useState("Counter");

  useEffect(() => {
    void getSetting("cashier_name", "Counter").then((value) => setCashier(value || "Counter"));
  }, []);

  useEffect(() => {
    if (!shift) {
      setTakings(0);
      return;
    }
    let active = true;
    const load = () =>
      void shiftTotals(shift).then((totals) => {
        if (active) setTakings(totals.cashTotal + totals.transferTotal + totals.cardTotal);
      });
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [shift]);

  return (
    <div className="mt-3 rounded-3xl bg-ink-900 p-4 text-white">
      {shift ? (
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-olive-300">
            <CircleDot size={12} /> Shift open
          </p>
          <p className="tabular mt-1.5 text-lg font-bold">{formatMoney(takings)}</p>
          <p className="text-[11px] text-white/50">
            taken by {shift.cashierName || cashier} this shift
          </p>
          <Link
            href="/shifts"
            className="mt-3 block rounded-2xl bg-white/10 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Cash up
          </Link>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Till closed</p>
          <p className="mt-1.5 text-sm font-semibold">Open a shift to start counting</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">
            Sales still work without one — a shift just lets you cash up at closing.
          </p>
          <Link
            href="/shifts"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
          >
            <PlayCircle size={14} /> Open shift
          </Link>
        </>
      )}
    </div>
  );
}
