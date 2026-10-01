import type { Product } from "./types";

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  const sum = first12
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** EAN-13 when the code is one (most retail packaging); Code 128 prints anything else. */
export function barcodeFormat(code: string): "EAN13" | "CODE128" {
  return isValidEan13(code) ? "EAN13" : "CODE128";
}

export const normaliseBarcode = (code: string) => code.trim().toUpperCase();

/**
 * In-store barcodes for products whose packaging has none. The 200–299 prefix
 * is reserved by GS1 for a shop's own use, so these never clash with a
 * manufacturer's barcode. Numbers count up from the highest one already issued.
 */
export function nextStoreBarcodes(products: Pick<Product, "barcode">[], count = 1): string[] {
  const taken = new Set(products.map((p) => normaliseBarcode(p.barcode ?? "")).filter(Boolean));
  let serial = Math.max(
    0,
    ...[...taken].filter((code) => /^200\d{10}$/.test(code)).map((code) => Number(code.slice(3, 12))),
  );
  const codes: string[] = [];
  while (codes.length < count) {
    serial += 1;
    const first12 = `200${String(serial).padStart(9, "0")}`;
    const code = `${first12}${ean13CheckDigit(first12)}`;
    if (!taken.has(code)) {
      taken.add(code);
      codes.push(code);
    }
  }
  return codes;
}

/** Barcodes used by more than one live product, mapped to the products sharing them. */
export function duplicateBarcodes<T extends Pick<Product, "barcode">>(products: T[]): Map<string, T[]> {
  const byCode = new Map<string, T[]>();
  for (const product of products) {
    const code = normaliseBarcode(product.barcode ?? "");
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), product]);
  }
  return new Map([...byCode].filter(([, list]) => list.length > 1));
}
