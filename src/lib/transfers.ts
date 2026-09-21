"use client";

import { getDb, getSetting } from "./db";
import { logActivity } from "./activity";
import { newId } from "./utils";
import type { Product, Transfer, TransferDirection } from "./types";

export interface TransferInput {
  productId: string;
  direction: TransferDirection;
  quantity: number;
  /** Who the stock came from or went to, usually the warehouse. */
  party?: string;
  note?: string;
  staffName?: string;
}

/** Transfer references read as XT-IN-260921-03, in the order they were recorded. */
async function buildReference(direction: TransferDirection, now: Date): Promise<string> {
  const stamp = [
    now.getFullYear().toString().slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const takenToday = await getDb()
    .transfers.where("createdAt")
    .aboveOrEqual(dayStart)
    .filter((row) => row.direction === direction)
    .count();

  return `XT-${direction.toUpperCase()}-${stamp}-${String(takenToday + 1).padStart(2, "0")}`;
}

/**
 * Moves stock between the warehouse and this till and writes the inventory
 * through in one go: "in" adds to the shelf, "out" takes off it. Recorded as a
 * stock movement too, so the product's history explains where the change came
 * from.
 */
export async function recordTransfer(input: TransferInput): Promise<Transfer> {
  const quantity = Math.trunc(Math.abs(input.quantity));
  if (quantity <= 0) throw new Error("Enter how many units are moving");

  const dbi = getDb();
  const product = await dbi.products.get(input.productId);
  if (!product) throw new Error("That product is no longer in the inventory");

  const delta = input.direction === "in" ? quantity : -quantity;
  const stockAfter = product.stockQty + delta;
  if (stockAfter < 0) {
    throw new Error(
      `Only ${product.stockQty} in stock, so ${quantity} cannot be transferred out`,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const staffName =
    input.staffName?.trim() || (await getSetting("cashier_name", "Counter")) || "Counter";

  const transfer: Transfer = {
    id: newId(),
    reference: await buildReference(input.direction, now),
    direction: input.direction,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantity,
    stockBefore: product.stockQty,
    stockAfter,
    party: (input.party ?? "Warehouse").trim() || "Warehouse",
    note: (input.note ?? "").trim(),
    staffName,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: "pending",
  };

  await dbi.transaction("rw", dbi.products, dbi.stockMovements, dbi.transfers, async () => {
    await dbi.products.put({
      ...product,
      stockQty: stockAfter,
      updatedAt: nowIso,
      syncState: "pending",
    });

    await dbi.stockMovements.add({
      id: newId(),
      productId: product.id,
      changeQty: delta,
      reason: input.direction === "in" ? "transfer-in" : "transfer-out",
      referenceId: transfer.id,
      note: `${transfer.reference} · ${transfer.party}`,
      createdAt: nowIso,
      syncState: "pending",
    });

    await dbi.transfers.add(transfer);
  });

  await logActivity({
    kind: input.direction === "in" ? "transfer-in" : "transfer-out",
    message:
      input.direction === "in"
        ? `Received ${quantity} × ${product.name}`
        : `Sent out ${quantity} × ${product.name}`,
    detail: `${transfer.reference} · ${transfer.party} · stock ${transfer.stockBefore} → ${transfer.stockAfter}`,
    referenceId: transfer.id,
    staffName,
  });

  return transfer;
}

export interface TransferFilter {
  direction?: TransferDirection | "all";
  from?: Date;
  to?: Date;
  productId?: string;
  term?: string;
}

/** The transfer report: newest first, narrowed by whatever the user picked. */
export async function listTransfers(filter: TransferFilter = {}): Promise<Transfer[]> {
  const { direction = "all", from, to, productId, term } = filter;

  let rows = (await getDb().transfers.orderBy("createdAt").reverse().toArray()).filter(
    (row) => !row.deletedAt,
  );

  if (direction !== "all") rows = rows.filter((row) => row.direction === direction);
  if (productId) rows = rows.filter((row) => row.productId === productId);
  if (from) {
    const fromIso = from.toISOString();
    rows = rows.filter((row) => row.createdAt >= fromIso);
  }
  if (to) {
    const toIso = to.toISOString();
    rows = rows.filter((row) => row.createdAt <= toIso);
  }
  if (term?.trim()) {
    const needle = term.trim().toLowerCase();
    rows = rows.filter((row) =>
      [row.productName, row.sku, row.reference, row.party, row.note, row.staffName]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  return rows;
}

export interface TransferSummary {
  unitsIn: number;
  unitsOut: number;
  net: number;
  countIn: number;
  countOut: number;
  valueIn: number;
  valueOut: number;
}

/** Totals for the report header, valued at each product's current cost price. */
export function summariseTransfers(rows: Transfer[], products: Product[]): TransferSummary {
  const costById = new Map(products.map((product) => [product.id, product.costPrice]));

  return rows.reduce<TransferSummary>(
    (summary, row) => {
      const value = (costById.get(row.productId) ?? 0) * row.quantity;
      if (row.direction === "in") {
        summary.unitsIn += row.quantity;
        summary.countIn += 1;
        summary.valueIn += value;
      } else {
        summary.unitsOut += row.quantity;
        summary.countOut += 1;
        summary.valueOut += value;
      }
      summary.net = summary.unitsIn - summary.unitsOut;
      return summary;
    },
    { unitsIn: 0, unitsOut: 0, net: 0, countIn: 0, countOut: 0, valueIn: 0, valueOut: 0 },
  );
}
