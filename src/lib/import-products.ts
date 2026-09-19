"use client";

import { getDb } from "./db";
import { createProduct, updateProduct } from "./repository";
import type { Product } from "./types";
import { newId, round2 } from "./utils";

export interface ParsedRow {
  row: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  barcode: string;
  error?: string;
  action: "create" | "update" | "skip";
  existingId?: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
}

/** Header aliases so a shop's own spreadsheet usually imports without editing. */
const FIELD_ALIASES: Record<keyof Omit<ParsedRow, "row" | "error" | "action" | "existingId">, string[]> = {
  name: ["name", "product", "product name", "item", "description", "title"],
  sku: ["sku", "code", "product code", "item code", "ref"],
  category: ["category", "type", "group"],
  brand: ["brand", "make", "manufacturer"],
  price: ["price", "selling price", "sale price", "unit price", "amount", "retail price"],
  costPrice: ["cost", "cost price", "buying price", "purchase price"],
  stockQty: ["stock", "quantity", "qty", "stock qty", "in stock", "opening stock", "units"],
  lowStockThreshold: ["low stock", "low stock alert", "reorder level", "minimum", "min stock"],
  barcode: ["barcode", "ean", "upc", "scan code"],
};

const normalise = (value: string) => value.toString().trim().toLowerCase().replace(/[_-]+/g, " ");

function resolveColumns(headers: string[]): Partial<Record<keyof typeof FIELD_ALIASES, string>> {
  const map: Partial<Record<keyof typeof FIELD_ALIASES, string>> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof typeof FIELD_ALIASES, string[]]
  >) {
    const match = headers.find((header) => aliases.includes(normalise(header)));
    if (match) map[field] = match;
  }
  return map;
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  // Tolerate "₦12,500.00" and "12 500"
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function parseProductFile(file: File): Promise<{ rows: ParsedRow[]; headers: string[] }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], headers: [] };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = raw.length ? Object.keys(raw[0]) : [];
  const columns = resolveColumns(headers);

  const existing = await getDb().products.toArray();
  const bySku = new Map(
    existing.filter((p) => p.sku).map((p) => [p.sku.trim().toUpperCase(), p] as const),
  );
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p] as const));
  const seen = new Set<string>();

  const rows: ParsedRow[] = raw.map((record, index) => {
    const read = (field: keyof typeof FIELD_ALIASES) => {
      const column = columns[field];
      return column === undefined ? "" : record[column];
    };

    const name = String(read("name") ?? "").trim();
    const sku = String(read("sku") ?? "").trim();
    const price = round2(toNumber(read("price")));

    const parsed: ParsedRow = {
      row: index + 2, // +2: sheets are 1-indexed and row 1 is the header
      name,
      sku,
      category: String(read("category") ?? "").trim(),
      brand: String(read("brand") ?? "").trim(),
      price,
      costPrice: round2(toNumber(read("costPrice"))),
      stockQty: Math.trunc(toNumber(read("stockQty"))),
      lowStockThreshold: Math.trunc(toNumber(read("lowStockThreshold"))) || 5,
      barcode: String(read("barcode") ?? "").trim(),
      action: "create",
    };

    if (!name) {
      return { ...parsed, error: "Missing product name", action: "skip" };
    }
    if (price <= 0) {
      return { ...parsed, error: "Missing or invalid selling price", action: "skip" };
    }

    const key = sku ? `sku:${sku.toUpperCase()}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) {
      return { ...parsed, error: "Duplicate of an earlier row in this file", action: "skip" };
    }
    seen.add(key);

    const match = sku ? bySku.get(sku.toUpperCase()) : byName.get(name.toLowerCase());
    if (match) {
      return { ...parsed, action: "update", existingId: match.id };
    }
    return parsed;
  });

  return { rows, headers };
}

export interface ImportOptions {
  /** When false, rows matching an existing product are skipped instead of updated. */
  updateExisting: boolean;
  /** When true, an update adds the sheet quantity to stock instead of replacing it. */
  addToStock: boolean;
}

export async function importProducts(
  rows: ParsedRow[],
  options: ImportOptions,
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    if (row.error) {
      summary.skipped += 1;
      continue;
    }

    if (row.action === "update") {
      if (!options.updateExisting || !row.existingId) {
        summary.skipped += 1;
        continue;
      }
      const current = await getDb().products.get(row.existingId);
      await updateProduct(row.existingId, {
        name: row.name,
        sku: row.sku,
        category: row.category,
        brand: row.brand,
        price: row.price,
        costPrice: row.costPrice,
        barcode: row.barcode,
        lowStockThreshold: row.lowStockThreshold,
        stockQty: options.addToStock ? (current?.stockQty ?? 0) + row.stockQty : row.stockQty,
      });
      summary.updated += 1;
      continue;
    }

    await createProduct({
      name: row.name,
      sku: row.sku,
      category: row.category,
      brand: row.brand,
      price: row.price,
      costPrice: row.costPrice,
      stockQty: row.stockQty,
      lowStockThreshold: row.lowStockThreshold,
      barcode: row.barcode,
    });
    summary.created += 1;
  }

  return summary;
}

/** Downloads a spreadsheet with the expected headers and one example row. */
export async function downloadImportTemplate(): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet([
    {
      Name: "Xpel Glow Body Lotion 400ml",
      SKU: "XP-BL400",
      Category: "Body care",
      Brand: "Xpel",
      Price: 12500,
      "Cost price": 8200,
      Quantity: 24,
      "Low stock alert": 5,
      Barcode: "",
    },
  ]);
  sheet["!cols"] = [
    { wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Products");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "xpel-product-import-template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type { Product };
export { newId };
