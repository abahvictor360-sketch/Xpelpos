"use client";

import type { PaymentMethod, Sale, SaleItem } from "./types";
import { round2 } from "./utils";

export interface ReportRow {
  receiptNo: string;
  soldAt: string;
  items: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  cashierName: string;
  status: Sale["status"];
}

export interface ProductPerformance {
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface SeriesPoint {
  label: string;
  revenue: number;
  transactions: number;
}

export interface ReportSummary {
  revenue: number;
  transactions: number;
  itemsSold: number;
  averageBasket: number;
  grossProfit: number;
  discountGiven: number;
  byPayment: Record<PaymentMethod, { total: number; count: number }>;
}

export interface SalesReport {
  from: Date;
  to: Date;
  summary: ReportSummary;
  rows: ReportRow[];
  topProducts: ProductPerformance[];
  series: SeriesPoint[];
}

const emptyPayments = (): Record<PaymentMethod, { total: number; count: number }> => ({
  cash: { total: 0, count: 0 },
  transfer: { total: 0, count: 0 },
  card: { total: 0, count: 0 },
});

export function buildReport(
  sales: Sale[],
  items: SaleItem[],
  from: Date,
  to: Date,
): SalesReport {
  const counted = sales.filter((sale) => sale.status === "completed");
  const countedIds = new Set(counted.map((sale) => sale.id));
  const countedItems = items.filter((item) => countedIds.has(item.saleId));

  const itemsBySale = new Map<string, SaleItem[]>();
  for (const item of countedItems) {
    const list = itemsBySale.get(item.saleId) ?? [];
    list.push(item);
    itemsBySale.set(item.saleId, list);
  }

  const byPayment = emptyPayments();
  let revenue = 0;
  let discountGiven = 0;

  for (const sale of counted) {
    revenue += sale.total;
    discountGiven += sale.discount;
    const bucket = byPayment[sale.paymentMethod];
    if (bucket) {
      bucket.total += sale.total;
      bucket.count += 1;
    }
  }

  let itemsSold = 0;
  let grossProfit = 0;
  const performance = new Map<string, ProductPerformance>();

  for (const item of countedItems) {
    itemsSold += item.quantity;
    grossProfit += (item.unitPrice - item.costPrice) * item.quantity;
    const key = item.productId ?? item.name;
    const current = performance.get(key) ?? {
      name: item.name,
      sku: item.sku,
      quantity: 0,
      revenue: 0,
      profit: 0,
    };
    current.quantity += item.quantity;
    current.revenue += item.lineTotal;
    current.profit += (item.unitPrice - item.costPrice) * item.quantity;
    performance.set(key, current);
  }

  const rows: ReportRow[] = [...sales]
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    .map((sale) => {
      const saleItems = itemsBySale.get(sale.id) ?? items.filter((i) => i.saleId === sale.id);
      return {
        receiptNo: sale.receiptNo,
        soldAt: sale.soldAt,
        items: saleItems.map((i) => `${i.name} x${i.quantity}`).join(", "),
        itemCount: saleItems.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: round2(sale.subtotal),
        discount: round2(sale.discount),
        total: round2(sale.total),
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName,
        cashierName: sale.cashierName,
        status: sale.status,
      };
    });

  return {
    from,
    to,
    summary: {
      revenue: round2(revenue),
      transactions: counted.length,
      itemsSold,
      averageBasket: counted.length ? round2(revenue / counted.length) : 0,
      grossProfit: round2(grossProfit),
      discountGiven: round2(discountGiven),
      byPayment,
    },
    rows,
    topProducts: [...performance.values()]
      .map((entry) => ({ ...entry, revenue: round2(entry.revenue), profit: round2(entry.profit) }))
      .sort((a, b) => b.revenue - a.revenue),
    series: buildSeries(counted, from, to),
  };
}

/** Buckets by hour for a single day, otherwise by calendar day. */
export function buildSeries(sales: Sale[], from: Date, to: Date): SeriesPoint[] {
  const spanDays = Math.ceil((to.getTime() - from.getTime()) / 86400000);
  const byHour = spanDays <= 1;
  const buckets = new Map<string, SeriesPoint>();

  if (byHour) {
    for (let hour = 0; hour < 24; hour += 1) {
      const label = `${String(hour).padStart(2, "0")}:00`;
      buckets.set(label, { label, revenue: 0, transactions: 0 });
    }
  } else {
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= to) {
      const label = cursor.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
      buckets.set(label, { label, revenue: 0, transactions: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const sale of sales) {
    const date = new Date(sale.soldAt);
    const label = byHour
      ? `${String(date.getHours()).padStart(2, "0")}:00`
      : date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
    const bucket = buckets.get(label);
    if (!bucket) continue;
    bucket.revenue = round2(bucket.revenue + sale.total);
    bucket.transactions += 1;
  }

  return [...buckets.values()];
}
