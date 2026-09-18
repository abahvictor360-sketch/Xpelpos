"use client";

import { createProduct } from "./repository";
import { getDb } from "./db";

const SAMPLE = [
  { name: "Xpel Glow Body Lotion 400ml", sku: "XP-BL400", category: "Body care", price: 12500, costPrice: 8200, stockQty: 24 },
  { name: "Xpel Radiance Face Cream 50g", sku: "XP-FC50", category: "Face care", price: 9800, costPrice: 6100, stockQty: 18 },
  { name: "Xpel Brightening Soap 200g", sku: "XP-SP200", category: "Cleansers", price: 4500, costPrice: 2600, stockQty: 40 },
  { name: "Xpel Carrot Glow Serum 30ml", sku: "XP-SR30", category: "Serums", price: 15000, costPrice: 9700, stockQty: 12 },
  { name: "Xpel Shea Butter Cream 250g", sku: "XP-SB250", category: "Body care", price: 7800, costPrice: 4900, stockQty: 30 },
  { name: "Xpel Vitamin C Toner 150ml", sku: "XP-TN150", category: "Face care", price: 8900, costPrice: 5400, stockQty: 16 },
  { name: "Xpel Hair Food 150g", sku: "XP-HF150", category: "Hair care", price: 6200, costPrice: 3800, stockQty: 22 },
  { name: "Xpel Sunscreen SPF50 60ml", sku: "XP-SS60", category: "Face care", price: 13500, costPrice: 8800, stockQty: 9 },
];

/** Loads a small demo catalogue so the app can be tried before real stock is entered. */
export async function seedSampleProducts(): Promise<number> {
  const existing = await getDb().products.count();
  if (existing > 0) return 0;
  for (const product of SAMPLE) await createProduct(product);
  return SAMPLE.length;
}
