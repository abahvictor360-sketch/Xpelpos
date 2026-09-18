"use client";

import { getDb, getSetting, setSetting } from "./db";
import { deleteRemoteProduct } from "./sync";
import type { CartLine, PaymentMethod, Product, Sale, SaleItem, StockMovement } from "./types";
import { buildReceiptNo, newId, round2 } from "./utils";

const DEVICE_KEY = "device_id";

export async function getDeviceId(): Promise<string> {
  let id = await getSetting(DEVICE_KEY);
  if (!id) {
    id = newId();
    await setSetting(DEVICE_KEY, id);
  }
  return id;
}

export interface ProductInput {
  name: string;
  sku?: string;
  category?: string;
  brand?: string;
  price: number;
  costPrice?: number;
  stockQty: number;
  lowStockThreshold?: number;
  barcode?: string;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const now = new Date().toISOString();
  const product: Product = {
    id: newId(),
    sku: (input.sku ?? "").trim(),
    name: input.name.trim(),
    category: (input.category ?? "").trim(),
    brand: (input.brand ?? "").trim(),
    price: round2(input.price),
    costPrice: round2(input.costPrice ?? 0),
    stockQty: Math.trunc(input.stockQty),
    lowStockThreshold: Math.trunc(input.lowStockThreshold ?? 5),
    barcode: (input.barcode ?? "").trim(),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncState: "pending",
  };

  await getDb().transaction("rw", getDb().products, getDb().stockMovements, async () => {
    await getDb().products.add(product);
    if (product.stockQty !== 0) {
      await getDb().stockMovements.add({
        id: newId(),
        productId: product.id,
        changeQty: product.stockQty,
        reason: "initial",
        referenceId: null,
        note: "Opening stock",
        createdAt: now,
        syncState: "pending",
      });
    }
  });

  return product;
}

export async function updateProduct(id: string, patch: Partial<ProductInput> & { isActive?: boolean }): Promise<void> {
  const existing = await getDb().products.get(id);
  if (!existing) return;

  const next: Product = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.sku !== undefined ? { sku: patch.sku.trim() } : {}),
    ...(patch.category !== undefined ? { category: patch.category.trim() } : {}),
    ...(patch.brand !== undefined ? { brand: patch.brand.trim() } : {}),
    ...(patch.price !== undefined ? { price: round2(patch.price) } : {}),
    ...(patch.costPrice !== undefined ? { costPrice: round2(patch.costPrice) } : {}),
    ...(patch.lowStockThreshold !== undefined
      ? { lowStockThreshold: Math.trunc(patch.lowStockThreshold) }
      : {}),
    ...(patch.barcode !== undefined ? { barcode: patch.barcode.trim() } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  };

  await getDb().transaction("rw", getDb().products, getDb().stockMovements, async () => {
    if (patch.stockQty !== undefined && Math.trunc(patch.stockQty) !== existing.stockQty) {
      const target = Math.trunc(patch.stockQty);
      const delta = target - existing.stockQty;
      next.stockQty = target;
      await getDb().stockMovements.add({
        id: newId(),
        productId: id,
        changeQty: delta,
        reason: "adjustment",
        referenceId: null,
        note: "Manual stock update",
        createdAt: next.updatedAt,
        syncState: "pending",
      });
    }
    await getDb().products.put(next);
  });
}

/** Restock adds to the existing quantity instead of replacing it. */
export async function restockProduct(id: string, quantity: number, note = "Restock"): Promise<void> {
  const existing = await getDb().products.get(id);
  if (!existing || quantity === 0) return;
  const now = new Date().toISOString();

  await getDb().transaction("rw", getDb().products, getDb().stockMovements, async () => {
    await getDb().products.put({
      ...existing,
      stockQty: existing.stockQty + Math.trunc(quantity),
      updatedAt: now,
      syncState: "pending",
    });
    await getDb().stockMovements.add({
      id: newId(),
      productId: id,
      changeQty: Math.trunc(quantity),
      reason: "restock",
      referenceId: null,
      note,
      createdAt: now,
      syncState: "pending",
    });
  });
}

/** Soft delete: hides the product but keeps it on past receipts, and syncs as a tombstone. */
export async function archiveProduct(id: string): Promise<void> {
  const existing = await getDb().products.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  await getDb().products.put({
    ...existing,
    isActive: false,
    deletedAt: now,
    updatedAt: now,
    syncState: "pending",
  });
}

export async function restoreProduct(id: string): Promise<void> {
  const existing = await getDb().products.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  await getDb().products.put({
    ...existing,
    isActive: true,
    deletedAt: null,
    updatedAt: now,
    syncState: "pending",
  });
}

export async function productSaleCount(id: string): Promise<number> {
  return getDb().saleItems.where("productId").equals(id).count();
}

/**
 * Wipes a product locally and, when the cloud is reachable, remotely too.
 * Refuses products that appear on a receipt — deleting those would corrupt
 * past sales, so those are archived instead.
 */
export async function deleteProductPermanently(
  id: string,
): Promise<{ deleted: boolean; reason?: string }> {
  const dbi = getDb();
  const existing = await dbi.products.get(id);
  if (!existing) return { deleted: false, reason: "Product not found." };

  if ((await productSaleCount(id)) > 0) {
    await archiveProduct(id);
    return { deleted: false, reason: "This product appears on past sales, so it was archived instead." };
  }

  const remote = await deleteRemoteProduct(id);
  if (!remote.ok) {
    await archiveProduct(id);
    return { deleted: false, reason: remote.reason };
  }

  await dbi.transaction("rw", dbi.products, dbi.stockMovements, async () => {
    await dbi.stockMovements.where("productId").equals(id).delete();
    await dbi.products.delete(id);
  });
  return { deleted: true };
}

/** Type-ahead search: matches name, SKU, category, brand or barcode. */
export async function searchProducts(term: string, limit = 12): Promise<Product[]> {
  const query = term.trim().toLowerCase();
  const all = await getDb().products.filter((p) => p.isActive && !p.deletedAt).toArray();
  if (!query) {
    return all.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  }

  const scored = all
    .map((product) => {
      const name = product.name.toLowerCase();
      const sku = product.sku.toLowerCase();
      const haystack = [name, sku, product.category.toLowerCase(), product.brand.toLowerCase(), product.barcode.toLowerCase()];
      let score = -1;
      if (name.startsWith(query)) score = 100;
      else if (sku.startsWith(query) || product.barcode.toLowerCase() === query) score = 90;
      else if (name.split(/\s+/).some((word) => word.startsWith(query))) score = 80;
      else if (haystack.some((field) => field.includes(query))) score = 50;
      return { product, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));

  return scored.slice(0, limit).map((entry) => entry.product);
}

export interface CheckoutInput {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  discount?: number;
  vatRate?: number;
  amountPaid?: number;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  cashierName?: string;
  cashierId?: string | null;
}

export interface CheckoutResult {
  sale: Sale;
  items: SaleItem[];
}

export function cartTotals(lines: CartLine[], discount = 0, vatRate = 0) {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * (vatRate / 100));
  const total = round2(taxable + tax);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  return { subtotal, tax, total, itemCount };
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  if (input.lines.length === 0) throw new Error("Cart is empty");

  const deviceId = await getDeviceId();
  const now = new Date();
  const nowIso = now.toISOString();
  const discount = round2(input.discount ?? 0);
  const { subtotal, tax, total } = cartTotals(input.lines, discount, input.vatRate ?? 0);
  const amountPaid = round2(input.amountPaid ?? total);

  const sale: Sale = {
    id: newId(),
    receiptNo: buildReceiptNo(deviceId, now),
    soldAt: nowIso,
    subtotal,
    discount,
    tax,
    total,
    paymentMethod: input.paymentMethod,
    amountPaid,
    changeDue: round2(Math.max(0, amountPaid - total)),
    customerName: (input.customerName ?? "").trim(),
    customerPhone: (input.customerPhone ?? "").trim(),
    note: (input.note ?? "").trim(),
    cashierId: input.cashierId ?? null,
    cashierName: (input.cashierName ?? "Counter").trim(),
    deviceId,
    status: "completed",
    createdAt: nowIso,
    updatedAt: nowIso,
    syncState: "pending",
  };

  const items: SaleItem[] = input.lines.map((line) => ({
    id: newId(),
    saleId: sale.id,
    productId: line.productId,
    name: line.name,
    sku: line.sku,
    unitPrice: round2(line.unitPrice),
    costPrice: round2(line.costPrice),
    quantity: line.quantity,
    lineTotal: round2(line.unitPrice * line.quantity),
    createdAt: nowIso,
    syncState: "pending",
  }));

  const dbi = getDb();
  await dbi.transaction(
    "rw",
    dbi.sales,
    dbi.saleItems,
    dbi.products,
    dbi.stockMovements,
    async () => {
      await dbi.sales.add(sale);
      await dbi.saleItems.bulkAdd(items);

      for (const line of input.lines) {
        const product = await dbi.products.get(line.productId);
        if (!product) continue;
        // Re-check against the stored level, not the quantity the cart was built with.
        if (product.stockQty < line.quantity) {
          throw new Error(`Only ${product.stockQty} of ${product.name} left in stock.`);
        }
        await dbi.products.put({
          ...product,
          stockQty: product.stockQty - line.quantity,
          updatedAt: nowIso,
          syncState: "pending",
        });
        await dbi.stockMovements.add({
          id: newId(),
          productId: line.productId,
          changeQty: -line.quantity,
          reason: "sale",
          referenceId: sale.id,
          note: sale.receiptNo,
          createdAt: nowIso,
          syncState: "pending",
        });
      }
    },
  );

  return { sale, items };
}

export async function listSalesBetween(from: Date, to: Date): Promise<Sale[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const sales = await getDb()
    .sales.filter((sale) => sale.soldAt >= fromIso && sale.soldAt <= toIso)
    .toArray();
  return sales.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export async function itemsForSales(saleIds: string[]): Promise<SaleItem[]> {
  if (saleIds.length === 0) return [];
  const ids = new Set(saleIds);
  return getDb().saleItems.filter((item) => ids.has(item.saleId)).toArray();
}

export async function voidSale(saleId: string): Promise<void> {
  const dbi = getDb();
  const sale = await dbi.sales.get(saleId);
  if (!sale || sale.status !== "completed") return;
  const now = new Date().toISOString();
  const items = await dbi.saleItems.where("saleId").equals(saleId).toArray();

  await dbi.transaction("rw", dbi.sales, dbi.products, dbi.stockMovements, async () => {
    await dbi.sales.put({ ...sale, status: "void", updatedAt: now, syncState: "pending" });
    for (const item of items) {
      if (!item.productId) continue;
      const product = await dbi.products.get(item.productId);
      if (!product) continue;
      await dbi.products.put({
        ...product,
        stockQty: product.stockQty + item.quantity,
        updatedAt: now,
        syncState: "pending",
      });
      await dbi.stockMovements.add({
        id: newId(),
        productId: item.productId,
        changeQty: item.quantity,
        reason: "refund",
        referenceId: sale.id,
        note: `Void ${sale.receiptNo}`,
        createdAt: now,
        syncState: "pending",
      });
    }
  });
}

export async function pendingSyncCount(): Promise<number> {
  const dbi = getDb();
  const [products, sales, items, movements] = await Promise.all([
    dbi.products.where("syncState").equals("pending").count(),
    dbi.sales.where("syncState").equals("pending").count(),
    dbi.saleItems.where("syncState").equals("pending").count(),
    dbi.stockMovements.where("syncState").equals("pending").count(),
  ]);
  return products + sales + items + movements;
}

export type { Product, Sale, SaleItem, StockMovement };
