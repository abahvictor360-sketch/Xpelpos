"use client";

import { getDb, getSetting, setSetting } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { Product, Sale, SaleItem, StockMovement } from "./types";

const LAST_PULL_KEY = "last_pull_at";
const CHUNK = 200;

export interface SyncReport {
  ok: boolean;
  pushed: number;
  pulled: number;
  message: string;
  at: string;
}

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const toRemoteProduct = (p: Product) => ({
  id: p.id,
  sku: p.sku || null,
  name: p.name,
  category: p.category || null,
  brand: p.brand || null,
  price: p.price,
  cost_price: p.costPrice,
  stock_qty: p.stockQty,
  low_stock_threshold: p.lowStockThreshold,
  barcode: p.barcode || null,
  is_active: p.isActive,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
  deleted_at: p.deletedAt,
});

const fromRemoteProduct = (row: Record<string, any>): Product => ({
  id: row.id,
  sku: row.sku ?? "",
  name: row.name,
  category: row.category ?? "",
  brand: row.brand ?? "",
  price: Number(row.price ?? 0),
  costPrice: Number(row.cost_price ?? 0),
  stockQty: Number(row.stock_qty ?? 0),
  lowStockThreshold: Number(row.low_stock_threshold ?? 5),
  barcode: row.barcode ?? "",
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? null,
  syncState: "synced",
});

const toRemoteSale = (s: Sale) => ({
  id: s.id,
  receipt_no: s.receiptNo,
  sold_at: s.soldAt,
  subtotal: s.subtotal,
  discount: s.discount,
  tax: s.tax,
  total: s.total,
  payment_method: s.paymentMethod,
  amount_paid: s.amountPaid,
  change_due: s.changeDue,
  customer_name: s.customerName || null,
  customer_phone: s.customerPhone || null,
  note: s.note || null,
  cashier_id: s.cashierId,
  cashier_name: s.cashierName || null,
  device_id: s.deviceId,
  status: s.status,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

const fromRemoteSale = (row: Record<string, any>): Sale => ({
  id: row.id,
  receiptNo: row.receipt_no,
  soldAt: row.sold_at,
  subtotal: Number(row.subtotal ?? 0),
  discount: Number(row.discount ?? 0),
  tax: Number(row.tax ?? 0),
  total: Number(row.total ?? 0),
  paymentMethod: row.payment_method,
  amountPaid: Number(row.amount_paid ?? 0),
  changeDue: Number(row.change_due ?? 0),
  customerName: row.customer_name ?? "",
  customerPhone: row.customer_phone ?? "",
  note: row.note ?? "",
  cashierId: row.cashier_id ?? null,
  cashierName: row.cashier_name ?? "",
  deviceId: row.device_id ?? "",
  status: row.status ?? "completed",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: "synced",
});

const toRemoteItem = (i: SaleItem) => ({
  id: i.id,
  sale_id: i.saleId,
  product_id: i.productId,
  name: i.name,
  sku: i.sku || null,
  unit_price: i.unitPrice,
  cost_price: i.costPrice,
  quantity: i.quantity,
  line_total: i.lineTotal,
  created_at: i.createdAt,
});

const fromRemoteItem = (row: Record<string, any>): SaleItem => ({
  id: row.id,
  saleId: row.sale_id,
  productId: row.product_id ?? null,
  name: row.name,
  sku: row.sku ?? "",
  unitPrice: Number(row.unit_price ?? 0),
  costPrice: Number(row.cost_price ?? 0),
  quantity: Number(row.quantity ?? 0),
  lineTotal: Number(row.line_total ?? 0),
  createdAt: row.created_at,
  syncState: "synced",
});

const toRemoteMovement = (m: StockMovement) => ({
  id: m.id,
  product_id: m.productId,
  change_qty: m.changeQty,
  reason: m.reason,
  reference_id: m.referenceId,
  note: m.note || null,
  created_at: m.createdAt,
});

export async function syncNow(): Promise<SyncReport> {
  const at = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return { ok: false, pushed: 0, pulled: 0, message: "Cloud sync is not configured.", at };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, pushed: 0, pulled: 0, message: "You are offline — data stays on this device.", at };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, pushed: 0, pulled: 0, message: "Cloud sync is not configured.", at };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, pushed: 0, pulled: 0, message: "Sign in on the Settings page to sync.", at };
  }

  const dbi = getDb();
  let pushed = 0;
  let pulled = 0;

  try {
    // ---- Push local changes (sales before their items, for the FK) ----
    const products = await dbi.products.where("syncState").equals("pending").toArray();
    for (const batch of chunk(products)) {
      const { error } = await supabase.from("pos_products").upsert(batch.map(toRemoteProduct));
      if (error) throw error;
      await dbi.products.bulkPut(batch.map((p) => ({ ...p, syncState: "synced" as const })));
      pushed += batch.length;
    }

    const sales = await dbi.sales.where("syncState").equals("pending").toArray();
    for (const batch of chunk(sales)) {
      const { error } = await supabase.from("pos_sales").upsert(batch.map(toRemoteSale));
      if (error) throw error;
      await dbi.sales.bulkPut(batch.map((s) => ({ ...s, syncState: "synced" as const })));
      pushed += batch.length;
    }

    const items = await dbi.saleItems.where("syncState").equals("pending").toArray();
    for (const batch of chunk(items)) {
      const { error } = await supabase.from("pos_sale_items").upsert(batch.map(toRemoteItem));
      if (error) throw error;
      await dbi.saleItems.bulkPut(batch.map((i) => ({ ...i, syncState: "synced" as const })));
      pushed += batch.length;
    }

    const movements = await dbi.stockMovements.where("syncState").equals("pending").toArray();
    for (const batch of chunk(movements)) {
      const { error } = await supabase.from("pos_stock_movements").upsert(batch.map(toRemoteMovement));
      if (error) throw error;
      await dbi.stockMovements.bulkPut(batch.map((m) => ({ ...m, syncState: "synced" as const })));
      pushed += batch.length;
    }

    // ---- Pull remote changes since the last successful sync ----
    const since = (await getSetting(LAST_PULL_KEY)) || "1970-01-01T00:00:00.000Z";

    const { data: remoteProducts, error: productError } = await supabase
      .from("pos_products")
      .select("*")
      .gt("updated_at", since);
    if (productError) throw productError;

    for (const row of remoteProducts ?? []) {
      const incoming = fromRemoteProduct(row);
      const local = await dbi.products.get(incoming.id);
      // Last write wins; never clobber edits this device has not pushed yet.
      if (!local || (local.syncState === "synced" && incoming.updatedAt > local.updatedAt)) {
        await dbi.products.put(incoming);
        pulled += 1;
      }
    }

    const { data: remoteSales, error: saleError } = await supabase
      .from("pos_sales")
      .select("*")
      .gt("updated_at", since);
    if (saleError) throw saleError;

    const pulledSaleIds: string[] = [];
    for (const row of remoteSales ?? []) {
      const incoming = fromRemoteSale(row);
      const local = await dbi.sales.get(incoming.id);
      if (!local || (local.syncState === "synced" && incoming.updatedAt > local.updatedAt)) {
        await dbi.sales.put(incoming);
        pulledSaleIds.push(incoming.id);
        pulled += 1;
      }
    }

    for (const batch of chunk(pulledSaleIds, 50)) {
      const { data: remoteItems, error: itemError } = await supabase
        .from("pos_sale_items")
        .select("*")
        .in("sale_id", batch);
      if (itemError) throw itemError;
      if (remoteItems?.length) {
        await dbi.saleItems.bulkPut(remoteItems.map(fromRemoteItem));
      }
    }

    await setSetting(LAST_PULL_KEY, at);
    await setSetting("last_sync_at", at);

    return {
      ok: true,
      pushed,
      pulled,
      message: `Synced — ${pushed} uploaded, ${pulled} downloaded.`,
      at,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    return { ok: false, pushed, pulled, message, at };
  }
}

export async function getLastSyncAt(): Promise<string> {
  return getSetting("last_sync_at");
}
