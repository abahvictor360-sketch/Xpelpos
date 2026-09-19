"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Banknote, CreditCard, LockKeyhole, PlayCircle, Printer, Smartphone } from "lucide-react";
import { db, getSetting } from "@/lib/db";
import { closeShift, openShift, shiftTotals, type ShiftTotals } from "@/lib/repository";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { useStoreProfile } from "@/lib/store-profile";
import type { Shift } from "@/lib/types";
import { cx, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export default function ShiftsPage() {
  const shifts = useLiveQuery(() => db.shifts.toArray(), [], [] as Shift[]);
  const [cashier, setCashier] = useState("Counter");
  const [float, setFloat] = useState("");
  const [totals, setTotals] = useState<ShiftTotals | null>(null);
  const [closing, setClosing] = useState(false);
  const [zReport, setZReport] = useState<Shift | null>(null);

  const open = useMemo(() => (shifts ?? []).find((shift) => shift.status === "open"), [shifts]);
  const history = useMemo(
    () =>
      (shifts ?? [])
        .filter((shift) => shift.status === "closed")
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    [shifts],
  );

  useEffect(() => {
    void getSetting("cashier_name", "Counter").then((value) => setCashier(value || "Counter"));
  }, []);

  // Live totals for the open shift, refreshed as sales come in.
  const salesCount = (shifts ?? []).length;
  useEffect(() => {
    if (!open) {
      setTotals(null);
      return;
    }
    let active = true;
    const load = () => void shiftTotals(open).then((result) => active && setTotals(result));
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open, salesCount]);

  const start = async () => {
    await openShift(cashier, Number(float) || 0);
    setFloat("");
    toast("Shift opened — sales from now on are counted in this till session.", "success");
  };

  return (
    <div className="space-y-5">
      {open ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="chip bg-olive-100 text-olive-900">Shift open</span>
              <h2 className="mt-2 text-lg font-bold text-ink-900">{open.cashierName}</h2>
              <p className="text-sm text-ink-700/60">
                Opened {formatDateTime(open.openedAt)} · float {formatMoney(open.openingFloat)}
              </p>
            </div>
            <button onClick={() => setClosing(true)} className="btn-dark">
              <LockKeyhole size={16} /> Close &amp; cash up
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Cash taken" value={formatMoney(totals?.cashTotal ?? 0)} icon={<Banknote size={15} />} />
            <Metric label="Transfer" value={formatMoney(totals?.transferTotal ?? 0)} icon={<Smartphone size={15} />} />
            <Metric label="Card" value={formatMoney(totals?.cardTotal ?? 0)} icon={<CreditCard size={15} />} />
            <Metric label="Sales" value={formatNumber(totals?.salesCount ?? 0)} />
          </div>

          <p className="tabular mt-3 rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-ink-700/75">
            Expected in the drawer at close:{" "}
            <strong className="text-ink-900">{formatMoney(totals?.expectedCash ?? open.openingFloat)}</strong>{" "}
            <span className="text-ink-700/55">(opening float + cash sales)</span>
          </p>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="text-lg font-bold text-ink-900">Start a shift</h2>
          <p className="mt-1 text-sm text-ink-700/70">
            Open the till at the start of the day with the cash you are putting in the drawer. Every sale is
            then tied to this shift, so you can cash up and see the variance at closing.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="label">Cashier</span>
              <input value={cashier} onChange={(event) => setCashier(event.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Opening cash float</span>
              <input
                value={float}
                onChange={(event) => setFloat(event.target.value)}
                className="input tabular"
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <button onClick={() => void start()} className="btn-primary">
              <PlayCircle size={16} /> Open shift
            </button>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-bold text-ink-900">Closed shifts</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-700/55">No shifts have been closed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Cashier</th>
                  <th className="px-4 py-2.5 font-medium">Opened</th>
                  <th className="px-4 py-2.5 font-medium">Closed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                  <th className="px-4 py-2.5 text-right font-medium">Expected cash</th>
                  <th className="px-4 py-2.5 text-right font-medium">Counted</th>
                  <th className="px-4 py-2.5 text-right font-medium">Variance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Z-report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {history.map((shift) => (
                  <tr key={shift.id} className="hover:bg-black/[0.015]">
                    <td className="px-4 py-3 font-medium text-ink-900">{shift.cashierName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700/70">{formatDateTime(shift.openedAt)}</td>
                    <td className="px-4 py-3 text-ink-700/70">
                      {shift.closedAt ? formatDateTime(shift.closedAt) : "—"}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{shift.salesCount}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatMoney(shift.expectedCash)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatMoney(shift.countedCash)}</td>
                    <td
                      className={cx(
                        "tabular px-4 py-3 text-right font-semibold",
                        shift.variance === 0
                          ? "text-olive-800"
                          : shift.variance > 0
                            ? "text-[#0d5aa0]"
                            : "text-brand-700",
                      )}
                    >
                      {shift.variance > 0 ? "+" : ""}
                      {formatMoney(shift.variance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setZReport(shift)}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {closing && open && totals && (
        <CloseShiftDialog
          shift={open}
          totals={totals}
          onClose={() => setClosing(false)}
          onClosed={(closed) => {
            setClosing(false);
            setZReport(closed);
          }}
        />
      )}

      {zReport && <ZReport shift={zReport} onClose={() => setZReport(null)} />}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-700/55">
        {icon}
        {label}
      </p>
      <p className="tabular mt-1 text-lg font-bold text-ink-900">{value}</p>
    </div>
  );
}

function CloseShiftDialog({
  shift,
  totals,
  onClose,
  onClosed,
}: {
  shift: Shift;
  totals: ShiftTotals;
  onClose: () => void;
  onClosed: (shift: Shift) => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const variance = (Number(counted) || 0) - totals.expectedCash;

  const submit = async () => {
    const closed = await closeShift(shift.id, Number(counted) || 0, note);
    toast("Shift closed.", "success");
    if (closed) onClosed(closed);
  };

  return (
    <Modal title="Close shift and cash up" onClose={onClose}>
      <dl className="space-y-1.5 text-sm">
        <Row label="Opening float" value={formatMoney(shift.openingFloat)} />
        <Row label="Cash sales" value={formatMoney(totals.cashTotal)} />
        <Row label="Expected in drawer" value={formatMoney(totals.expectedCash)} strong />
        <Row label="Transfer" value={formatMoney(totals.transferTotal)} />
        <Row label="Card" value={formatMoney(totals.cardTotal)} />
      </dl>

      <label className="mt-4 block">
        <span className="label">Cash counted in the drawer</span>
        <input
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          className="input tabular"
          inputMode="decimal"
          placeholder="0"
          autoFocus
        />
      </label>

      {counted !== "" && (
        <p
          className={cx(
            "tabular mt-2 rounded-xl px-3 py-2 text-sm font-semibold",
            variance === 0
              ? "bg-olive-100 text-olive-900"
              : variance > 0
                ? "bg-[#e8f1fb] text-[#0d5aa0]"
                : "bg-brand-50 text-brand-700",
          )}
        >
          {variance === 0
            ? "Drawer balances exactly."
            : variance > 0
              ? `Over by ${formatMoney(variance)}`
              : `Short by ${formatMoney(Math.abs(variance))}`}
        </p>
      )}

      <label className="mt-3 block">
        <span className="label">Note (optional)</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input"
          placeholder="Explain any variance"
        />
      </label>

      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="btn-ghost flex-1">
          Cancel
        </button>
        <button onClick={() => void submit()} disabled={counted === ""} className="btn-primary flex-1">
          Close shift
        </button>
      </div>
    </Modal>
  );
}

function ZReport({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const store = useStoreProfile();

  useEffect(() => {
    document.body.classList.add("printing-receipt");
    return () => document.body.classList.remove("printing-receipt");
  }, []);

  return (
    <div className="print-receipt-root fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="print-receipt-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-card">
        <div className="text-center">
          <p className="text-base font-extrabold uppercase tracking-wide text-ink-900">{store.name}</p>
          <p className="text-xs text-ink-700/60">Z-Report — end of shift</p>
          <p className="mt-1 text-[11px] text-ink-700/60">
            {shift.cashierName} · {formatDateTime(shift.openedAt)} →{" "}
            {shift.closedAt ? formatDateTime(shift.closedAt) : "open"}
          </p>
        </div>

        <div className="my-3 border-t border-dashed border-black/15" />

        <dl className="space-y-1 text-xs">
          <Row label="Sales" value={String(shift.salesCount)} />
          <Row label="Cash" value={formatMoney(shift.cashTotal)} />
          <Row label="Transfer" value={formatMoney(shift.transferTotal)} />
          <Row label="Card" value={formatMoney(shift.cardTotal)} />
          <Row
            label="Total takings"
            value={formatMoney(shift.cashTotal + shift.transferTotal + shift.cardTotal)}
            strong
          />
        </dl>

        <div className="my-3 border-t border-dashed border-black/15" />

        <dl className="space-y-1 text-xs">
          <Row label="Opening float" value={formatMoney(shift.openingFloat)} />
          <Row label="Expected cash" value={formatMoney(shift.expectedCash)} />
          <Row label="Counted cash" value={formatMoney(shift.countedCash)} />
          <Row
            label="Variance"
            value={`${shift.variance > 0 ? "+" : ""}${formatMoney(shift.variance)}`}
            strong
          />
        </dl>

        {shift.note && <p className="mt-3 text-[11px] text-ink-700/60">Note: {shift.note}</p>}

        <div className="print-hide mt-5 flex gap-2">
          <button onClick={() => window.print()} className="btn-ghost flex-1">
            <Printer size={16} /> Print
          </button>
          <button onClick={onClose} className="btn-primary flex-1">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between", strong ? "font-bold text-ink-900" : "text-ink-700/75")}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
