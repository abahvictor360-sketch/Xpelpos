"use client";

import { getSetting, setSetting } from "./db";

/**
 * Receipt printers come in three kinds: 80 mm and 58 mm thermal rolls (the
 * common till printers) and ordinary sheet printers (A4 / Letter). Each needs
 * the receipt laid out at its own width, in solid black, on a page as long as
 * the receipt itself so a roll is not fed metres of blank paper.
 */
export type PaperSize = "80mm" | "58mm" | "a4";

export const PAPER_SIZES: Record<
  PaperSize,
  { label: string; hint: string; pageWidthMm: number | null; contentWidthMm: number }
> = {
  "80mm": {
    label: "80 mm roll",
    hint: "Most thermal receipt printers (Epson TM-T20, Xprinter XP-80…)",
    pageWidthMm: 80,
    contentWidthMm: 72,
  },
  "58mm": {
    label: "58 mm roll",
    hint: "Small thermal and Bluetooth printers",
    pageWidthMm: 58,
    contentWidthMm: 48,
  },
  a4: {
    label: "A4 / Letter",
    hint: "Ordinary office or inkjet printers",
    pageWidthMm: null,
    contentWidthMm: 90,
  },
};

export interface PrintSettings {
  paper: PaperSize;
  /** Faded logo behind the receipt. Some thermal printers render it as speckle. */
  watermark: boolean;
  /** Desktop app only: print straight to this printer. Empty = show the print dialog. */
  printer: string;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = { paper: "80mm", watermark: true, printer: "" };

export async function loadPrintSettings(): Promise<PrintSettings> {
  const [paper, watermark, printer] = await Promise.all([
    getSetting("receipt_paper", DEFAULT_PRINT_SETTINGS.paper),
    getSetting("receipt_watermark", "1"),
    getSetting("receipt_printer", ""),
  ]);
  return {
    paper: paper in PAPER_SIZES ? (paper as PaperSize) : DEFAULT_PRINT_SETTINGS.paper,
    watermark: watermark !== "0",
    printer,
  };
}

export async function savePrintSettings(settings: PrintSettings): Promise<void> {
  await Promise.all([
    setSetting("receipt_paper", settings.paper),
    setSetting("receipt_watermark", settings.watermark ? "1" : "0"),
    setSetting("receipt_printer", settings.printer),
  ]);
}

/** What the desktop app's preload exposes; absent in a browser. */
export interface DesktopPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}

interface DesktopBridge {
  listPrinters: () => Promise<DesktopPrinter[]>;
  print: (options: {
    deviceName?: string;
    silent: boolean;
    pageWidthMicrons?: number;
    pageHeightMicrons?: number;
  }) => Promise<{ ok: boolean; reason?: string }>;
}

export function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { xpelDesktop?: DesktopBridge }).xpelDesktop;
}

const MM_PER_PX = 25.4 / 96;

/**
 * How long the printed receipt will be, in mm: the receipt body is copied
 * off-screen at the paper's printable width and measured.
 */
function measureReceiptMm(paper: PaperSize): number {
  const source = document.getElementById("xpel-receipt");
  if (!source) return 200;
  const probe = document.createElement("div");
  probe.className = "receipt-measure";
  probe.dataset.paper = paper;
  probe.style.width = `${PAPER_SIZES[paper].contentWidthMm}mm`;
  probe.appendChild(source.cloneNode(true));
  document.body.appendChild(probe);
  const heightPx = probe.getBoundingClientRect().height;
  probe.remove();
  // Room for the printer's own top/bottom margin and the tear-off.
  return Math.ceil(heightPx * MM_PER_PX) + 14;
}

/** Prints the receipt currently on screen to whatever printer the till uses. */
export async function printReceipt(): Promise<{ ok: boolean; reason?: string }> {
  const settings = await loadPrintSettings();
  const paper = PAPER_SIZES[settings.paper];
  const body = document.body;
  body.dataset.paper = settings.paper;
  body.dataset.watermark = settings.watermark ? "1" : "0";

  const heightMm = paper.pageWidthMm ? measureReceiptMm(settings.paper) : 0;
  const pageStyle = document.createElement("style");
  pageStyle.textContent = paper.pageWidthMm
    ? `@page { size: ${paper.pageWidthMm}mm ${heightMm}mm; margin: 0; }`
    : `@page { size: auto; margin: 12mm; }`;
  document.head.appendChild(pageStyle);

  try {
    const desktop = desktopBridge();
    if (desktop) {
      return await desktop.print({
        deviceName: settings.printer || undefined,
        silent: Boolean(settings.printer),
        ...(paper.pageWidthMm
          ? { pageWidthMicrons: paper.pageWidthMm * 1000, pageHeightMicrons: heightMm * 1000 }
          : {}),
      });
    }
    window.print();
    return { ok: true };
  } finally {
    pageStyle.remove();
  }
}

/**
 * Prints the invoice sheet on screen (`.print-invoice-root`) on A4. Invoices
 * always go through the print dialog, so a till whose receipts print straight
 * to a thermal roll can still pick the office printer here.
 */
export async function printInvoice(): Promise<{ ok: boolean; reason?: string }> {
  const body = document.body;
  const pageStyle = document.createElement("style");
  pageStyle.textContent = "@page { size: A4 portrait; margin: 0; }";
  document.head.appendChild(pageStyle);
  body.classList.add("printing-invoice");
  try {
    const desktop = desktopBridge();
    if (desktop) {
      return await desktop.print({ silent: false, pageWidthMicrons: 210_000, pageHeightMicrons: 297_000 });
    }
    window.print();
    return { ok: true };
  } finally {
    body.classList.remove("printing-invoice");
    pageStyle.remove();
  }
}
