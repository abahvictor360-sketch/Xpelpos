"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting } from "./db";

export interface StoreProfile {
  name: string;
  address: string;
  phone: string;
  vatRate: number;
  receiptFooter: string;
}

export const DEFAULT_PROFILE: StoreProfile = {
  name: "Xpel Beauty NG",
  address: "",
  phone: "",
  vatRate: 0,
  receiptFooter: "Thank you for shopping with Xpel Beauty NG",
};

export async function loadStoreProfile(): Promise<StoreProfile> {
  const [name, address, phone, vatRate, receiptFooter] = await Promise.all([
    getSetting("store_name", DEFAULT_PROFILE.name),
    getSetting("store_address", DEFAULT_PROFILE.address),
    getSetting("store_phone", DEFAULT_PROFILE.phone),
    getSetting("vat_rate", "0"),
    getSetting("receipt_footer", DEFAULT_PROFILE.receiptFooter),
  ]);
  return {
    name: name || DEFAULT_PROFILE.name,
    address,
    phone,
    vatRate: Math.min(Math.max(Number(vatRate) || 0, 0), 100),
    receiptFooter: receiptFooter || DEFAULT_PROFILE.receiptFooter,
  };
}

export async function saveStoreProfile(profile: StoreProfile): Promise<void> {
  await Promise.all([
    setSetting("store_name", profile.name.trim() || DEFAULT_PROFILE.name),
    setSetting("store_address", profile.address.trim()),
    setSetting("store_phone", profile.phone.trim()),
    setSetting("vat_rate", String(Math.min(Math.max(profile.vatRate || 0, 0), 100))),
    setSetting("receipt_footer", profile.receiptFooter.trim()),
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
