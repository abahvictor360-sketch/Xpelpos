"use client";

import Dexie, { type Table } from "dexie";
import { customerCodeFor } from "./utils";
import type {
  Activity,
  AppSetting,
  Coupon,
  Customer,
  HeldSale,
  Product,
  Sale,
  SaleItem,
  Shift,
  StockMovement,
  Transfer,
} from "./types";

class XpelPosDatabase extends Dexie {
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  stockMovements!: Table<StockMovement, string>;
  settings!: Table<AppSetting, string>;
  coupons!: Table<Coupon, string>;
  customers!: Table<Customer, string>;
  shifts!: Table<Shift, string>;
  heldSales!: Table<HeldSale, string>;
  transfers!: Table<Transfer, string>;
  activities!: Table<Activity, string>;

  constructor() {
    super("xpel-pos");
    this.version(1).stores({
      products: "id, name, sku, category, isActive, syncState, updatedAt, deletedAt",
      sales: "id, receiptNo, soldAt, paymentMethod, status, syncState, updatedAt",
      saleItems: "id, saleId, productId, syncState",
      stockMovements: "id, productId, reason, createdAt, syncState",
      settings: "key",
    });

    this.version(2)
      .stores({
        coupons: "id, code, isActive, updatedAt, syncState, deletedAt",
        customers: "id, phone, name, updatedAt, syncState, deletedAt",
        shifts: "id, status, openedAt, updatedAt, syncState",
        heldSales: "id, createdAt",
      })
      .upgrade(async (tx) => {
        // Sales created before coupons/customers/shifts existed get empty links.
        await tx
          .table("sales")
          .toCollection()
          .modify((sale: Record<string, unknown>) => {
            sale.couponCode ??= "";
            sale.customerId ??= null;
            sale.shiftId ??= null;
          });
      });

    this.version(3)
      .stores({
        transfers: "id, direction, productId, createdAt, updatedAt, syncState, deletedAt",
        activities: "id, kind, createdAt, syncState",
      })
      .upgrade(async (tx) => {
        // Customers predating codes get one, so same-named people stay apart.
        await tx
          .table("customers")
          .toCollection()
          .modify((customer: Record<string, unknown>) => {
            if (!customer.code) customer.code = customerCodeFor(String(customer.id ?? ""));
          });
      });
  }
}

let instance: XpelPosDatabase | null = null;

/** Dexie only exists in the browser; keep SSR imports safe. */
export function getDb(): XpelPosDatabase {
  if (!instance) instance = new XpelPosDatabase();
  return instance;
}

export const db = new Proxy({} as XpelPosDatabase, {
  get(_target, prop) {
    const value = getDb()[prop as keyof XpelPosDatabase];
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await getDb().settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getDb().settings.put({ key, value });
}
