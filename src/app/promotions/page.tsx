"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Percent, Plus, Power, Tag, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { deleteCoupon, saveCoupon, setCouponActive } from "@/lib/repository";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import type { Coupon, DiscountType } from "@/lib/types";
import { cx, formatDate, formatMoney, formatNumber } from "@/lib/utils";

const EMPTY = {
  code: "",
  description: "",
  discountType: "percent" as DiscountType,
  discountValue: "",
  minSpend: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
};

function statusOf(coupon: Coupon): { label: string; tone: "live" | "off" | "used" | "expired" | "scheduled" } {
  if (!coupon.isActive) return { label: "Switched off", tone: "off" };
  const now = Date.now();
  if (coupon.startsAt && now < new Date(coupon.startsAt).getTime())
    return { label: "Scheduled", tone: "scheduled" };
  if (coupon.endsAt && now > new Date(coupon.endsAt).getTime()) return { label: "Expired", tone: "expired" };
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit)
    return { label: "Fully redeemed", tone: "used" };
  return { label: "Live", tone: "live" };
}

export default function PromotionsPage() {
  const coupons = useLiveQuery(
    () => db.coupons.filter((c) => !c.deletedAt).toArray(),
    [],
    [] as Coupon[],
  );
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);

  const list = useMemo(
    () => [...(coupons ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [coupons],
  );
  const live = list.filter((coupon) => statusOf(coupon).tone === "live").length;
  const redemptions = list.reduce((total, coupon) => total + coupon.usedCount, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Promo codes" value={formatNumber(list.length)} />
        <Tile label="Live right now" value={formatNumber(live)} />
        <Tile label="Times redeemed" value={formatNumber(redemptions)} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-black/5 p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <Tag size={15} /> Coupons &amp; promo codes
          </h2>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New code
          </button>
        </div>

        {list.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-medium text-ink-900">No promo codes yet</p>
            <p className="mt-1 text-sm text-ink-700/55">
              Create one and the cashier can apply it at checkout — “DEC10” for 10% off, say.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Discount</th>
                  <th className="px-4 py-2.5 font-medium">Conditions</th>
                  <th className="px-4 py-2.5 font-medium">Runs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Used</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {list.map((coupon) => {
                  const status = statusOf(coupon);
                  return (
                    <tr key={coupon.id} className="hover:bg-black/[0.015]">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setEditing(coupon);
                            setShowForm(true);
                          }}
                          className="font-bold tracking-wide text-ink-900 hover:text-brand-700"
                        >
                          {coupon.code}
                        </button>
                        {coupon.description && (
                          <span className="block text-xs text-ink-700/55">{coupon.description}</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 font-medium">
                        {coupon.discountType === "percent"
                          ? `${coupon.discountValue}%`
                          : formatMoney(coupon.discountValue)}
                        {coupon.discountType === "percent" && coupon.maxDiscount > 0 && (
                          <span className="block text-xs text-ink-700/50">
                            max {formatMoney(coupon.maxDiscount)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700/70">
                        {coupon.minSpend > 0 ? `Min spend ${formatMoney(coupon.minSpend)}` : "No minimum"}
                      </td>
                      <td className="px-4 py-3 text-ink-700/70">
                        {coupon.startsAt || coupon.endsAt
                          ? `${coupon.startsAt ? formatDate(coupon.startsAt) : "any time"} → ${
                              coupon.endsAt ? formatDate(coupon.endsAt) : "no end"
                            }`
                          : "Always"}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {coupon.usedCount}
                        {coupon.usageLimit > 0 && (
                          <span className="text-ink-700/50"> / {coupon.usageLimit}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cx(
                            "chip",
                            status.tone === "live"
                              ? "bg-olive-100 text-olive-900"
                              : status.tone === "scheduled"
                                ? "bg-[#e8f1fb] text-[#0d5aa0]"
                                : "bg-black/5 text-ink-700/70",
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={async () => {
                              await setCouponActive(coupon.id, !coupon.isActive);
                              toast(
                                `${coupon.code} ${coupon.isActive ? "switched off" : "switched on"}.`,
                                "success",
                              );
                            }}
                            title={coupon.isActive ? "Switch off" : "Switch on"}
                            aria-label={`${coupon.isActive ? "Switch off" : "Switch on"} ${coupon.code}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-black/5"
                          >
                            <Power size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              await deleteCoupon(coupon.id);
                              toast(`${coupon.code} deleted.`, "success");
                            }}
                            title="Delete"
                            aria-label={`Delete ${coupon.code}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 hover:bg-brand-50 hover:text-brand-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <CouponForm
          coupon={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
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

function CouponForm({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const [form, setForm] = useState(
    coupon
      ? {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: String(coupon.discountValue),
          minSpend: coupon.minSpend ? String(coupon.minSpend) : "",
          maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : "",
          startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
          endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : "",
          usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
        }
      : EMPTY,
  );
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await saveCoupon(
        {
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue) || 0,
          minSpend: Number(form.minSpend) || 0,
          maxDiscount: Number(form.maxDiscount) || 0,
          startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
          endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
          usageLimit: Number(form.usageLimit) || 0,
        },
        coupon?.id,
      );
      toast(`${form.code.toUpperCase()} saved.`, "success");
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save that code.");
    }
  };

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal title={coupon ? `Edit ${coupon.code}` : "New promo code"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Code</span>
            <input
              value={form.code}
              onChange={set("code")}
              className="input uppercase"
              placeholder="XMAS10"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <input
              value={form.description}
              onChange={set("description")}
              className="input"
              placeholder="Christmas promo"
            />
          </label>
        </div>

        <div>
          <span className="label">Discount type</span>
          <div className="grid grid-cols-2 gap-2">
            {(["percent", "fixed"] as DiscountType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((current) => ({ ...current, discountType: type }))}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                  form.discountType === type
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-black/10 bg-white text-ink-700/70 hover:bg-black/[0.03]",
                )}
              >
                {type === "percent" ? <Percent size={15} /> : <Tag size={15} />}
                {type === "percent" ? "Percentage off" : "Fixed amount off"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{form.discountType === "percent" ? "Percent off" : "Amount off"}</span>
            <input
              value={form.discountValue}
              onChange={set("discountValue")}
              className="input tabular"
              inputMode="decimal"
              placeholder={form.discountType === "percent" ? "10" : "1000"}
            />
          </label>
          <label className={cx("block", form.discountType !== "percent" && "opacity-50")}>
            <span className="label">Max discount (optional)</span>
            <input
              value={form.maxDiscount}
              onChange={set("maxDiscount")}
              disabled={form.discountType !== "percent"}
              className="input tabular"
              inputMode="decimal"
              placeholder="5000"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Minimum spend</span>
            <input
              value={form.minSpend}
              onChange={set("minSpend")}
              className="input tabular"
              inputMode="decimal"
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="label">Usage limit</span>
            <input
              value={form.usageLimit}
              onChange={set("usageLimit")}
              className="input tabular"
              inputMode="numeric"
              placeholder="Unlimited"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Starts</span>
            <input type="date" value={form.startsAt} onChange={set("startsAt")} className="input" />
          </label>
          <label className="block">
            <span className="label">Ends</span>
            <input type="date" value={form.endsAt} onChange={set("endsAt")} className="input" />
          </label>
        </div>

        {error && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1">
            {coupon ? "Save changes" : "Create code"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
