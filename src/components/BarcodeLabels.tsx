"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BarcodeSvg from "./BarcodeSvg";
import { desktopBridge } from "@/lib/printing";
import type { Product } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

export type LabelLayout = "sheet" | "roll50" | "roll40";

export const LABEL_LAYOUTS: Record<LabelLayout, { label: string; hint: string; page: string | null }> = {
  sheet: { label: "A4 sheet", hint: "3 labels across, any office printer", page: null },
  roll50: { label: "50 × 25 mm labels", hint: "Thermal label printers (Xprinter, Zebra…)", page: "50mm 25mm" },
  roll40: { label: "40 × 30 mm labels", hint: "Smaller thermal label rolls", page: "40mm 30mm" },
};

export interface LabelRequest {
  product: Pick<Product, "id" | "name" | "barcode" | "price">;
  copies: number;
}

function Label({ product, showPrice }: { product: LabelRequest["product"]; showPrice: boolean }) {
  return (
    <div className="barcode-label">
      <p className="barcode-label-name">{product.name}</p>
      <BarcodeSvg code={product.barcode} height={34} width={1.4} className="barcode-label-svg" />
      {showPrice && <p className="barcode-label-price">{formatMoney(product.price)}</p>}
    </div>
  );
}

/** The labels as they will print; used for the on-screen preview too. */
export function LabelSheet({
  requests,
  layout,
  showPrice,
}: {
  requests: LabelRequest[];
  layout: LabelLayout;
  showPrice: boolean;
}) {
  const labels = requests.flatMap(({ product, copies }) =>
    Array.from({ length: Math.max(0, copies) }, (_, index) => ({ product, key: `${product.id}-${index}` })),
  );
  return (
    <div className="barcode-labels" data-layout={layout}>
      {labels.map(({ product, key }) => (
        <Label key={key} product={product} showPrice={showPrice} />
      ))}
    </div>
  );
}

/**
 * Prints labels: renders them into a print-only root and opens the print
 * dialog (labels usually go to a different printer from receipts, so the
 * desktop app asks rather than printing silently).
 */
export function usePrintLabels() {
  const [job, setJob] = useState<{ requests: LabelRequest[]; layout: LabelLayout; showPrice: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!job) return;
    document.body.classList.add("printing-labels");
    const page = LABEL_LAYOUTS[job.layout].page;
    const style = document.createElement("style");
    style.textContent = page ? `@page { size: ${page}; margin: 0; }` : `@page { size: A4; margin: 8mm; }`;
    document.head.appendChild(style);

    // Let the barcodes draw before the page is captured.
    const timer = window.setTimeout(async () => {
      const desktop = desktopBridge();
      if (desktop) await desktop.print({ silent: false });
      else window.print();
      style.remove();
      document.body.classList.remove("printing-labels");
      setJob(null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [job]);

  const portal =
    job && typeof document !== "undefined"
      ? createPortal(
          <div className="print-labels-root">
            <LabelSheet requests={job.requests} layout={job.layout} showPrice={job.showPrice} />
          </div>,
          document.body,
        )
      : null;

  return { print: setJob, portal };
}
