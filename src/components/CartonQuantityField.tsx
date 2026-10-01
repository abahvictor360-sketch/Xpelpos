"use client";

import { updateProduct } from "@/lib/repository";
import type { Product, SaleUnit } from "@/lib/types";
import { cartonSize } from "@/lib/units";
import { cx } from "@/lib/utils";

/** A quantity typed in pieces or in cartons, with the carton size it assumes. */
export interface CartonEntry {
  unit: SaleUnit;
  amount: string;
  perCarton: string;
}

export function emptyCartonEntry(product?: Pick<Product, "unitsPerCarton"> | null): CartonEntry {
  const size = product ? cartonSize(product) : 0;
  return { unit: "pcs", amount: "", perCarton: size ? String(size) : "" };
}

/** Pieces the entry stands for; 0 while it is incomplete. */
export function entryPieces(entry: CartonEntry): number {
  const amount = Math.trunc(Number(entry.amount) || 0);
  if (entry.unit === "pcs") return amount;
  const perCarton = Math.trunc(Number(entry.perCarton) || 0);
  return perCarton > 0 ? amount * perCarton : 0;
}

/** "5 cartons × 12 pcs", for notes and history; empty for plain pieces. */
export function entryNote(entry: CartonEntry): string {
  if (entry.unit !== "carton") return "";
  const amount = Math.trunc(Number(entry.amount) || 0);
  return `${amount} carton${amount === 1 ? "" : "s"} × ${Math.trunc(Number(entry.perCarton) || 0)} pcs`;
}

/** Why the entry cannot be used yet, or "" when it is ready. */
export function entryProblem(entry: CartonEntry): string {
  if (!(Math.trunc(Number(entry.amount) || 0) > 0)) {
    return entry.unit === "carton" ? "Enter how many cartons." : "Enter how many pieces.";
  }
  if (entry.unit === "carton" && !(Math.trunc(Number(entry.perCarton) || 0) > 0)) {
    return "Enter how many pieces are in one carton.";
  }
  return "";
}

/** Saves the carton size on the product when this entry used a new or different one. */
export async function rememberCartonSize(product: Product, entry: CartonEntry): Promise<void> {
  if (entry.unit !== "carton") return;
  const size = Math.trunc(Number(entry.perCarton) || 0);
  if (size > 0 && size !== cartonSize(product)) {
    await updateProduct(product.id, { unitsPerCarton: size });
  }
}

export default function CartonQuantityField({
  entry,
  onChange,
  label = "Quantity",
  autoFocus,
}: {
  entry: CartonEntry;
  onChange: (next: CartonEntry) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const pieces = entryPieces(entry);

  return (
    <div className="space-y-3">
      <div>
        <span className="label">{label}</span>
        <div className="flex gap-2">
          <input
            value={entry.amount}
            onChange={(event) => onChange({ ...entry, amount: event.target.value })}
            inputMode="numeric"
            placeholder="0"
            autoFocus={autoFocus}
            aria-label={entry.unit === "carton" ? "Number of cartons" : "Number of pieces"}
            className="input min-w-0 flex-1"
          />
          <div className="flex shrink-0 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-1" role="group" aria-label="Unit">
            {(["pcs", "carton"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => onChange({ ...entry, unit })}
                aria-pressed={entry.unit === unit}
                className={cx(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                  entry.unit === unit ? "bg-white text-brand-700 shadow-sm" : "text-ink-700/60 hover:text-ink-900",
                )}
              >
                {unit === "pcs" ? "Pcs" : "Cartons"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {entry.unit === "carton" && (
        <label className="block">
          <span className="label">Pieces in one carton</span>
          <input
            value={entry.perCarton}
            onChange={(event) => onChange({ ...entry, perCarton: event.target.value })}
            inputMode="numeric"
            placeholder="e.g. 12"
            className="input"
          />
        </label>
      )}

      {entry.unit === "carton" && pieces > 0 && (
        <p className="rounded-xl bg-olive-100 px-3 py-2 text-sm font-medium text-olive-900">
          {entryNote(entry)} = <span className="tabular font-bold">{pieces} pcs</span>
        </p>
      )}
    </div>
  );
}
