"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { barcodeFormat } from "@/lib/barcodes";

/** Draws a scannable barcode as crisp SVG, for screen and for printed labels. */
export default function BarcodeSvg({
  code,
  height = 40,
  width = 1.6,
  showText = true,
  className,
}: {
  code: string;
  height?: number;
  width?: number;
  showText?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !code) return;
    try {
      JsBarcode(ref.current, code, {
        format: barcodeFormat(code),
        height,
        width,
        displayValue: showText,
        fontSize: 12,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // A code the format cannot draw falls back to plain Code 128.
      JsBarcode(ref.current, code, { format: "CODE128", height, width, displayValue: showText, fontSize: 12, margin: 0 });
    }
  }, [code, height, width, showText]);

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${code}`} />;
}
