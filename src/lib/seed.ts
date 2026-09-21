"use client";

import { createProduct } from "./repository";
import { getDb, getSetting, setSetting } from "./db";

/**
 * The Xpel Beauty NG catalogue a new till starts with, taken from the shop's
 * own inventory. These are ordinary products once they land: rename, reprice,
 * restock or delete them like any other.
 */
const DEFAULT_CATALOGUE = [
  { name: "Aloe Vera Conditioner", sku: "XP-ALO-CON", category: "Hair care", price: 500, costPrice: 0, stockQty: 1200 },
  { name: "Aloe Vera Shampoo", sku: "XP-ALO-SHP", category: "Hair care", price: 500, costPrice: 0, stockQty: 1200 },
  { name: "Banana Scrub", sku: "XP-BAN-SCR", category: "Body care", price: 1000, costPrice: 0, stockQty: 1200 },
  { name: "Osiris Recovery Oil", sku: "XP-OSI-OIL", category: "Hair care", price: 1000, costPrice: 0, stockQty: 1200 },
  { name: "Rosemary Oil", sku: "XHC-ROS-OIL", category: "Hair care", price: 3800, costPrice: 0, stockQty: 2400 },
  { name: "XBC Face Mask", sku: "XBC-FM", category: "Face care", price: 1000, costPrice: 0, stockQty: 2400 },
  { name: "XHC Aloe Vera Leave-in Conditioner", sku: "XHC-LI-ALO", category: "Hair care", price: 1500, costPrice: 0, stockQty: 1200 },
  { name: "XHC Argan Leave-in Conditioner", sku: "XHC-LI-ARG", category: "Hair care", price: 1000, costPrice: 0, stockQty: 1200 },
  { name: "XHC Heat Defence", sku: "XHC-HD", category: "Hair care", price: 800, costPrice: 0, stockQty: 1200 },
  { name: "XHC Rosemary Leave-in Conditioner", sku: "XHC-LI-ROS", category: "Hair care", price: 1500, costPrice: 0, stockQty: 1200 },
];

/** Marks that this till has already been given its opening catalogue. */
const SEEDED_KEY = "catalogue_seeded";

/** Loads the opening catalogue. Refuses if the till already has products. */
export async function seedDefaultProducts(): Promise<number> {
  const existing = await getDb().products.count();
  if (existing > 0) return 0;

  for (const product of DEFAULT_CATALOGUE) await createProduct(product);
  await setSetting(SEEDED_KEY, "1");
  return DEFAULT_CATALOGUE.length;
}

/**
 * Stocks a brand new till on first launch, so the shop can sell straight out of
 * the box. It runs once per install: a till whose products were deliberately
 * deleted stays empty rather than having them reappear.
 */
export async function seedOnFirstRun(): Promise<void> {
  if ((await getSetting(SEEDED_KEY)) === "1") return;

  // An existing till already has its catalogue; just record that it is set up.
  if ((await getDb().products.count()) > 0) {
    await setSetting(SEEDED_KEY, "1");
    return;
  }

  await seedDefaultProducts();
}
