import type { Product, SaleUnit } from "./types";
import { round2 } from "./utils";

/** Pieces in one carton of this product, or 0 when no carton size is set. */
export function cartonSize(product: Pick<Product, "unitsPerCarton">): number {
  const size = Math.trunc(product.unitsPerCarton ?? 0);
  return size > 0 ? size : 0;
}

/** What a whole carton sells for: the set carton price, else pieces × unit price. */
export function cartonPrice(product: Pick<Product, "unitsPerCarton" | "cartonPrice" | "price">): number {
  if ((product.cartonPrice ?? 0) > 0) return round2(product.cartonPrice ?? 0);
  return round2(product.price * cartonSize(product));
}

/** Pieces a line moves out of (or back into) stock. */
export function piecesOf(line: { quantity: number; packSize?: number }): number {
  return line.quantity * Math.max(1, Math.trunc(line.packSize ?? 1));
}

export function unitName(unit: SaleUnit | undefined, quantity: number): string {
  if (unit === "carton") return quantity === 1 ? "carton" : "cartons";
  return quantity === 1 ? "pc" : "pcs";
}

/** "3 pcs", or "2 cartons (24 pcs)" — how a quantity reads on receipts and reports. */
export function describeQuantity(line: { quantity: number; unit?: SaleUnit; packSize?: number }): string {
  const base = `${line.quantity} ${unitName(line.unit, line.quantity)}`;
  return line.unit === "carton" ? `${base} (${piecesOf(line)} pcs)` : base;
}
