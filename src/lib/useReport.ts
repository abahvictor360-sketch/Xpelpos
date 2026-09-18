"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { buildReport, type SalesReport } from "./analytics";
import type { Sale, SaleItem } from "./types";

/** Live sales report for a date range — recomputes whenever Dexie changes. */
export function useReport(from: Date, to: Date): SalesReport | undefined {
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
    return buildReport(sales, items, from, to);
  }, [fromIso, toIso]);
}
