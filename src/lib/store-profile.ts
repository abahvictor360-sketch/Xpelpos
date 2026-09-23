"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting } from "./db";

export interface StoreProfile {
  name: string;
  address: string;
  phone: string;
  vatRate: number;
  receiptFooter: string;
  /** Stock at or below this many units raises a low-stock alert. */
  lowStockAlert: number;
}

export const DEFAULT_PROFILE: StoreProfile = {
  name: "Xpel Beauty NG",
  address:
    "Zeal Plaza, Adjacent First Bank BBA, Beside Anambra Clusters, Trade Fair International Market, Lagos",
  phone: "",
  vatRate: 0,
  receiptFooter: "Thank you for shopping with Xpel Beauty NG",
  lowStockAlert: 10,
};

export async function loadStoreProfile(): Promise<StoreProfile> {
  const [name, address, phone, vatRate, receiptFooter, lowStockAlert] = await Promise.all([
    getSetting("store_name", DEFAULT_PROFILE.name),
    getSetting("store_address", DEFAULT_PROFILE.address),
    getSetting("store_phone", DEFAULT_PROFILE.phone),
    getSetting("vat_rate", "0"),
    getSetting("receipt_footer", DEFAULT_PROFILE.receiptFooter),
    getSetting("low_stock_alert", String(DEFAULT_PROFILE.lowStockAlert)),
  ]);
  return {
    name: name || DEFAULT_PROFILE.name,
    address,
    phone,
    vatRate: Math.min(Math.max(Number(vatRate) || 0, 0), 100),
    receiptFooter: receiptFooter || DEFAULT_PROFILE.receiptFooter,
    lowStockAlert: Math.max(Number(lowStockAlert) || DEFAULT_PROFILE.lowStockAlert, 0),
  };
}

export async function saveStoreProfile(profile: StoreProfile): Promise<void> {
  await Promise.all([
    setSetting("store_name", profile.name.trim() || DEFAULT_PROFILE.name),
    setSetting("store_address", profile.address.trim()),
    setSetting("store_phone", profile.phone.trim()),
    setSetting("vat_rate", String(Math.min(Math.max(profile.vatRate || 0, 0), 100))),
    setSetting("receipt_footer", profile.receiptFooter.trim()),
    setSetting("low_stock_alert", String(Math.max(profile.lowStockAlert || 0, 0))),
  ]);
}

/** Live store profile for components — updates as soon as Settings is saved. */
export function useStoreProfile(): StoreProfile {
  return (
    useLiveQuery(async () => {
      await db.settings.toArray(); // subscribe to the settings table
      return loadStoreProfile();
    }, []) ?? DEFAULT_PROFILE
  );
}
