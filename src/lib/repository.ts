"use client";

import { getDb, getSetting, setSetting } from "./db";
import { deleteRemoteProduct } from "./sync";
import { logActivity } from "./activity";
import type {
  Activity,
  ActivityKind,
  CartLine,
  Coupon,
  Customer,
  HeldSale,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  Shift,
  StockMovement,
  Transfer,
  TransferDirection,
} from "./types";
import { buildReceiptNo, customerCodeFor, formatDate, newId, round2 } from "./utils";

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

  // A SKU identifies one product; a second row under the same code is the
  // duplicate that makes a catalogue unusable, so refuse it up front.
  const sku = (input.sku ?? "").trim();
  if (sku) {
    const clash = await getDb()
      .products.filter((p) => !p.deletedAt && p.sku.trim().toUpperCase() === sku.toUpperCase())
      .first();
    if (clash) {
      throw new Error(`${clash.name} already uses the code ${clash.sku}. Edit that product instead.`);
    }
  }

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

/**
 * Takes every product down to zero stock, so the shelf can be rebuilt from
 * Transfer In rather than from numbers nobody counted. Each product gets a
 * stock movement for the amount removed, so the history still explains where
 * the units went.
 */
export async function resetAllStockToZero(): Promise<number> {
  const dbi = getDb();
  const products = await dbi.products.filter((product) => !product.deletedAt).toArray();
  const carrying = products.filter((product) => product.stockQty !== 0);
  if (carrying.length === 0) return 0;

  const now = new Date().toISOString();

  await dbi.transaction("rw", dbi.products, dbi.stockMovements, async () => {
    for (const product of carrying) {
      await dbi.products.put({ ...product, stockQty: 0, updatedAt: now, syncState: "pending" });
      await dbi.stockMovements.add({
        id: newId(),
        productId: product.id,
        changeQty: -product.stockQty,
        reason: "adjustment",
        referenceId: null,
        note: "Stock reset to zero",
        createdAt: now,
        syncState: "pending",
      });
    }
  });

  await logActivity({
    kind: "stock",
    message: `Reset stock to zero on ${carrying.length} product(s)`,
    detail: `${carrying.reduce((sum, product) => sum + product.stockQty, 0)} unit(s) cleared, ready to rebuild from transfers`,
  });

  return carrying.length;
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
  couponCode?: string;
  customerId?: string | null;
  shiftId?: string | null;
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

/** How many sales this till has already rung up today, so the next one follows on. */
async function nextReceiptSequence(now: Date): Promise<number> {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const taken = await getDb().sales.where("soldAt").aboveOrEqual(dayStart).count();
  return taken + 1;
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
    receiptNo: buildReceiptNo(deviceId, await nextReceiptSequence(now), now),
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
    couponCode: (input.couponCode ?? "").trim().toUpperCase(),
    customerId: input.customerId ?? null,
    shiftId: input.shiftId ?? null,
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
    dbi.coupons,
    async () => {
      await dbi.sales.add(sale);
      await dbi.saleItems.bulkAdd(items);

      if (sale.couponCode) {
        const coupon = await dbi.coupons.where("code").equals(sale.couponCode).first();
        if (coupon) {
          await dbi.coupons.put({
            ...coupon,
            usedCount: coupon.usedCount + 1,
            updatedAt: nowIso,
            syncState: "pending",
          });
        }
      }

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

  await logActivity({
    kind: "sale",
    message: `Sale ${sale.receiptNo}`,
    detail: [
      `${items.reduce((sum, item) => sum + item.quantity, 0)} item(s)`,
      sale.paymentMethod,
      sale.customerName || "Walk-in",
    ].join(" · "),
    amount: sale.total,
    referenceId: sale.id,
    staffName: sale.cashierName,
  });

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

  await logActivity({
    kind: "void",
    message: `Voided sale ${sale.receiptNo}`,
    detail: "Stock returned to the shelf",
    amount: sale.total,
    referenceId: sale.id,
  });
}

export async function pendingSyncCount(): Promise<number> {
  const dbi = getDb();
  const counts = await Promise.all([
    dbi.products.where("syncState").equals("pending").count(),
    dbi.sales.where("syncState").equals("pending").count(),
    dbi.saleItems.where("syncState").equals("pending").count(),
    dbi.stockMovements.where("syncState").equals("pending").count(),
    dbi.coupons.where("syncState").equals("pending").count(),
    dbi.customers.where("syncState").equals("pending").count(),
    dbi.shifts.where("syncState").equals("pending").count(),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export type { Product, Sale, SaleItem, StockMovement };

/* ------------------------------------------------------------------ */
/* Coupons and promo codes                                            */
/* ------------------------------------------------------------------ */

export interface CouponInput {
  code: string;
  description?: string;
  discountType: Coupon["discountType"];
  discountValue: number;
  minSpend?: number;
  maxDiscount?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number;
}

export async function saveCoupon(input: CouponInput, id?: string): Promise<Coupon> {
  const dbi = getDb();
  const now = new Date().toISOString();
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("A promo code is required.");
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(code)) {
    throw new Error("Use 2–24 letters, numbers or dashes for the code.");
  }
  if (!(input.discountValue > 0)) {
    throw new Error("The discount must be greater than zero.");
  }
  if (input.discountType === "percent" && input.discountValue > 100) {
    throw new Error("A percentage discount cannot be more than 100%.");
  }

  const clash = await dbi.coupons.where("code").equals(code).first();
  if (clash && clash.id !== id) throw new Error(`The code ${code} is already in use.`);

  const existing = id ? await dbi.coupons.get(id) : undefined;
  const coupon: Coupon = {
    id: existing?.id ?? newId(),
    code,
    description: (input.description ?? "").trim(),
    discountType: input.discountType,
    discountValue: round2(input.discountValue),
    minSpend: round2(input.minSpend ?? 0),
    maxDiscount: round2(input.maxDiscount ?? 0),
    startsAt: input.startsAt || null,
    endsAt: input.endsAt || null,
    usageLimit: Math.max(0, Math.trunc(input.usageLimit ?? 0)),
    usedCount: existing?.usedCount ?? 0,
    isActive: existing?.isActive ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    syncState: "pending",
  };

  await dbi.coupons.put(coupon);
  return coupon;
}

export async function setCouponActive(id: string, isActive: boolean): Promise<void> {
  const coupon = await getDb().coupons.get(id);
  if (!coupon) return;
  await getDb().coupons.put({
    ...coupon,
    isActive,
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  });
}

export async function deleteCoupon(id: string): Promise<void> {
  const coupon = await getDb().coupons.get(id);
  if (!coupon) return;
  const now = new Date().toISOString();
  await getDb().coupons.put({
    ...coupon,
    isActive: false,
    deletedAt: now,
    updatedAt: now,
    syncState: "pending",
  });
}

export interface CouponCheck {
  ok: boolean;
  coupon?: Coupon;
  discount: number;
  reason?: string;
}

/** Validates a code against the current basket and returns the money it takes off. */
export async function applyCoupon(code: string, subtotal: number): Promise<CouponCheck> {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return { ok: false, discount: 0, reason: "Enter a promo code." };

  const coupon = await getDb().coupons.where("code").equals(wanted).first();
  if (!coupon || coupon.deletedAt) return { ok: false, discount: 0, reason: `${wanted} is not a known code.` };
  if (!coupon.isActive) return { ok: false, discount: 0, reason: `${wanted} is switched off.` };

  const now = Date.now();
  if (coupon.startsAt && now < new Date(coupon.startsAt).getTime()) {
    return { ok: false, discount: 0, reason: `${wanted} does not start until ${formatDate(coupon.startsAt)}.` };
  }
  if (coupon.endsAt && now > new Date(coupon.endsAt).getTime()) {
    return { ok: false, discount: 0, reason: `${wanted} expired on ${formatDate(coupon.endsAt)}.` };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, discount: 0, reason: `${wanted} has been fully redeemed.` };
  }
  if (coupon.minSpend > 0 && subtotal < coupon.minSpend) {
    return {
      ok: false,
      discount: 0,
      reason: `${wanted} needs a basket of at least ${coupon.minSpend.toLocaleString()}.`,
    };
  }

  let discount =
    coupon.discountType === "percent" ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.discountType === "percent" && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  discount = round2(Math.min(discount, subtotal));

  return { ok: true, coupon, discount };
}

/* ------------------------------------------------------------------ */
/* Customers                                                          */
/* ------------------------------------------------------------------ */

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
}

export async function saveCustomer(input: CustomerInput, id?: string): Promise<Customer> {
  const dbi = getDb();
  const now = new Date().toISOString();
  const existing = id ? await dbi.customers.get(id) : undefined;
  const customerId = existing?.id ?? newId();

  const customer: Customer = {
    id: customerId,
    code: existing?.code || customerCodeFor(existing?.id ?? customerId),
    name: input.name.trim(),
    phone: (input.phone ?? "").trim(),
    email: (input.email ?? "").trim(),
    note: (input.note ?? "").trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    syncState: "pending",
  };

  await dbi.customers.put(customer);

  await logActivity({
    kind: "customer",
    message: existing ? `Updated customer ${customer.name}` : `Added customer ${customer.name}`,
    detail: [customer.code, customer.phone].filter(Boolean).join(" · "),
    referenceId: customer.id,
  });

  return customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const customer = await getDb().customers.get(id);
  if (!customer) return;
  const now = new Date().toISOString();
  await getDb().customers.put({ ...customer, deletedAt: now, updatedAt: now, syncState: "pending" });
}

export async function searchCustomers(term: string, limit = 8): Promise<Customer[]> {
  const query = term.trim().toLowerCase();
  const all = await getDb().customers.filter((c) => !c.deletedAt).toArray();
  const rows = query
    ? all.filter((c) => [c.name, c.phone, c.email, c.code].join(" ").toLowerCase().includes(query))
    : all;
  return rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/** Finds an existing customer by phone, or creates one — used at checkout. */
export async function upsertCustomerByPhone(name: string, phone: string): Promise<Customer | null> {
  const trimmedPhone = phone.trim();
  const trimmedName = name.trim();
  if (!trimmedPhone && !trimmedName) return null;

  if (trimmedPhone) {
    const existing = await getDb().customers.where("phone").equals(trimmedPhone).first();
    if (existing && !existing.deletedAt) {
      if (trimmedName && trimmedName !== existing.name) {
        return saveCustomer({ ...existing, name: trimmedName }, existing.id);
      }
      return existing;
    }
  }

  return saveCustomer({ name: trimmedName || trimmedPhone, phone: trimmedPhone });
}

/* ------------------------------------------------------------------ */
/* Shifts and cash-up                                                 */
/* ------------------------------------------------------------------ */

export async function getOpenShift(): Promise<Shift | undefined> {
  return getDb().shifts.where("status").equals("open").first();
}

export async function openShift(cashierName: string, openingFloat: number): Promise<Shift> {
  const existing = await getOpenShift();
  if (existing) return existing;

  const now = new Date().toISOString();
  const shift: Shift = {
    id: newId(),
    cashierName: cashierName.trim() || "Counter",
    deviceId: await getDeviceId(),
    openedAt: now,
    closedAt: null,
    openingFloat: round2(openingFloat),
    countedCash: 0,
    expectedCash: 0,
    variance: 0,
    cashTotal: 0,
    transferTotal: 0,
    cardTotal: 0,
    salesCount: 0,
    note: "",
    status: "open",
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };

  await getDb().shifts.add(shift);
  return shift;
}

export interface ShiftTotals {
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  salesCount: number;
  expectedCash: number;
}

export async function shiftTotals(shift: Shift): Promise<ShiftTotals> {
  const sales = await getDb()
    .sales.filter((sale) => sale.shiftId === shift.id && sale.status === "completed")
    .toArray();

  const sum = (method: PaymentMethod) =>
    round2(sales.filter((s) => s.paymentMethod === method).reduce((total, s) => total + s.total, 0));

  const cashTotal = sum("cash");
  return {
    cashTotal,
    transferTotal: sum("transfer"),
    cardTotal: sum("card"),
    salesCount: sales.length,
    expectedCash: round2(shift.openingFloat + cashTotal),
  };
}

export async function closeShift(id: string, countedCash: number, note = ""): Promise<Shift | undefined> {
  const dbi = getDb();
  const shift = await dbi.shifts.get(id);
  if (!shift || shift.status === "closed") return shift;

  const totals = await shiftTotals(shift);
  const now = new Date().toISOString();
  const closed: Shift = {
    ...shift,
    ...totals,
    countedCash: round2(countedCash),
    variance: round2(countedCash - totals.expectedCash),
    note: note.trim(),
    closedAt: now,
    status: "closed",
    updatedAt: now,
    syncState: "pending",
  };

  await dbi.shifts.put(closed);
  return closed;
}

/* ------------------------------------------------------------------ */
/* Held (parked) sales — local to the device only                     */
/* ------------------------------------------------------------------ */

export async function holdSale(lines: CartLine[], label: string, customerName = ""): Promise<void> {
  if (lines.length === 0) return;
  await getDb().heldSales.add({
    id: newId(),
    label: label.trim() || `Held ${new Date().toLocaleTimeString()}`,
    lines,
    customerName,
    createdAt: new Date().toISOString(),
  });
}

export async function resumeHeldSale(id: string): Promise<HeldSale | undefined> {
  const held = await getDb().heldSales.get(id);
  if (held) await getDb().heldSales.delete(id);
  return held;
}

export async function discardHeldSale(id: string): Promise<void> {
  await getDb().heldSales.delete(id);
}

export type { Coupon, Customer, Shift, HeldSale };
