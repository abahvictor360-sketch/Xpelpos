"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { buildReport, type SalesReport } from "./analytics";
import type { Sale, SaleItem } from "./types";

/** Raw sales and their lines for a date range — live, like `useReport`. */
export function useSalesData(from: Date, to: Date): { sales: Sale[]; items: SaleItem[] } | undefined {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  return useLiveQuery(async () => {
    const sales = (await db.sales
      .filter((sale: Sale) => sale.soldAt >= fromIso && sale.soldAt <= toIso)
      .toArray()) as Sale[];
    const ids = new Set(sales.map((sale) => sale.id));
    const items = (await db.saleItems
      .filter((item: SaleItem) => ids.has(item.saleId))
      .toArray()) as SaleItem[];
    return { sales, items };
  }, [fromIso, toIso]);
}

/** Live sales report for a date range — recomputes whenever Dexie changes. */
export function useReport(from: Date, to: Date): SalesReport | undefined {
  const data = useSalesData(from, to);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  // Keyed by the ISO strings so a new Date object for the same range does not rebuild.
  return useMemo(() => (data ? buildReport(data.sales, data.items, from, to) : undefined), [data, fromIso, toIso]);
}
