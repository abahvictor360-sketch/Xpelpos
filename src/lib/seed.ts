"use client";

import { archiveProduct, createProduct } from "./repository";
import { getDb, getSetting, setSetting } from "./db";
import { logActivity } from "./activity";

/**
 * The Xpel Beauty NG catalogue a new till starts with. Every line opens at zero
 * stock: the shelf fills up through Transfer In, so what the till claims to
 * hold is only ever what the warehouse actually sent it.
 *
 * These are ordinary products once they land: rename, reprice, restock or
 * delete them like any other.
 */
const DEFAULT_CATALOGUE = [
  { name: "Aloe Vera Conditioner", sku: "XP-ALO-CON", category: "Hair care", price: 500, costPrice: 0, stockQty: 0 },
  { name: "Aloe Vera Shampoo", sku: "XP-ALO-SHP", category: "Hair care", price: 500, costPrice: 0, stockQty: 0 },
  { name: "Banana Scrub", sku: "XP-BAN-SCR", category: "Body care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Osiris Recovery Oil", sku: "XP-OSI-OIL", category: "Hair care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Rosemary Oil", sku: "XHC-ROS-OIL", category: "Hair care", price: 3800, costPrice: 0, stockQty: 0 },
  { name: "Vitamin C Face Mask", sku: "XBC-FM-VTC", category: "Face care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Papaya Face Mask", sku: "XBC-FM-PAP", category: "Face care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Tea Tree Face Mask", sku: "XBC-FM-TTR", category: "Face care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Charcoal Face Mask", sku: "XBC-FM-CHR", category: "Face care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "Aloe Vera Face Mask", sku: "XBC-FM-ALO", category: "Face care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "XHC Aloe Vera Leave-in Conditioner", sku: "XHC-LI-ALO", category: "Hair care", price: 1500, costPrice: 0, stockQty: 0 },
  { name: "XHC Argan Leave-in Conditioner", sku: "XHC-LI-ARG", category: "Hair care", price: 1000, costPrice: 0, stockQty: 0 },
  { name: "XHC Heat Defence", sku: "XHC-HD", category: "Hair care", price: 800, costPrice: 0, stockQty: 0 },
  { name: "XHC Rosemary Leave-in Conditioner", sku: "XHC-LI-ROS", category: "Hair care", price: 1500, costPrice: 0, stockQty: 0 },
];

/** Marks that this till has already been given its opening catalogue. */
const SEEDED_KEY = "catalogue_seeded";

/**
 * Bumped whenever the catalogue above changes in a way an existing till should
 * pick up. A till records the revision it has applied, so each change reaches
 * it once and only once.
 */
const CATALOGUE_REVISION = "2";
const REVISION_KEY = "catalogue_revision";

/** SKUs dropped from the catalogue, archived rather than deleted so sales keep their history. */
const RETIRED_SKUS = ["XBC-FM"];

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
  await setSetting(REVISION_KEY, CATALOGUE_REVISION);
}

/**
 * Brings a till that was stocked by an earlier version into line with the
 * catalogue above: products it never received are added at zero stock, and
 * products dropped from the catalogue are archived, not deleted, so past sales
 * keep their history.
 *
 * Products the shop added itself are left alone, as is the stock on everything
 * already there. Only the catalogue changes.
 */
export async function syncCatalogueOnUpdate(): Promise<void> {
  // A till that has never been seeded gets the whole catalogue instead.
  if ((await getSetting(SEEDED_KEY)) !== "1") return;
  if ((await getSetting(REVISION_KEY)) === CATALOGUE_REVISION) return;

  const existing = await getDb().products.toArray();
  const bySku = new Map(existing.map((product) => [product.sku.toUpperCase(), product]));

  const added: string[] = [];
  for (const product of DEFAULT_CATALOGUE) {
    if (bySku.has(product.sku.toUpperCase())) continue;
    await createProduct(product);
    added.push(product.name);
  }

  const archived: string[] = [];
  for (const sku of RETIRED_SKUS) {
    const product = bySku.get(sku.toUpperCase());
    if (!product || product.deletedAt) continue;
    await archiveProduct(product.id);
    archived.push(product.name);
  }

  await setSetting(REVISION_KEY, CATALOGUE_REVISION);

  if (added.length > 0 || archived.length > 0) {
    await logActivity({
      kind: "product",
      message: "Catalogue updated",
      detail: [
        added.length > 0 ? `Added ${added.join(", ")}` : "",
        archived.length > 0 ? `Archived ${archived.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
}
