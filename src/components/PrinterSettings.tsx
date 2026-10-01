"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import Receipt from "./Receipt";
import { toast } from "./Toaster";
import {
  DEFAULT_PRINT_SETTINGS,
  PAPER_SIZES,
  desktopBridge,
  loadPrintSettings,
  savePrintSettings,
  type DesktopPrinter,
  type PaperSize,
  type PrintSettings,
} from "@/lib/printing";
import type { Sale, SaleItem } from "@/lib/types";
import { cx } from "@/lib/utils";

/** A made-up sale, so a printer can be tried without recording anything. */
function sampleReceipt(): { sale: Sale; items: SaleItem[] } {
  const now = new Date().toISOString();
  const base = { createdAt: now, syncState: "synced" as const };
  const items: SaleItem[] = [
    { id: "t1", saleId: "test", productId: null, name: "Aloe Vera Shampoo", sku: "", unitPrice: 2500, costPrice: 0, quantity: 2, lineTotal: 5000, unit: "pcs", packSize: 1, ...base },
    { id: "t2", saleId: "test", productId: null, name: "Shea Butter Lotion", sku: "", unitPrice: 24000, costPrice: 0, quantity: 1, lineTotal: 24000, unit: "carton", packSize: 6, ...base },
  ];
  const sale: Sale = {
    id: "test",
    receiptNo: "TEST-PRINT",
    soldAt: now,
    subtotal: 29000,
    discount: 0,
    tax: 0,
    total: 29000,
    paymentMethod: "cash",
    amountPaid: 30000,
    changeDue: 1000,
    customerName: "",
    customerPhone: "",
    note: "",
    cashierId: null,
    cashierName: "Test print",
    deviceId: "",
    couponCode: "",
    customerId: null,
    shiftId: null,
    status: "completed",
    updatedAt: now,
    ...base,
  };
  return { sale, items };
}

export default function PrinterSettings() {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [printers, setPrinters] = useState<DesktopPrinter[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<ReturnType<typeof sampleReceipt> | null>(null);
  const desktop = typeof window !== "undefined" && Boolean(desktopBridge());

  useEffect(() => {
    void loadPrintSettings().then(setSettings);
    void desktopBridge()?.listPrinters().then(setPrinters).catch(() => setPrinters([]));
  }, []);

  const update = (patch: Partial<PrintSettings>) => {
    setSaved(false);
    setSettings((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    await savePrintSettings(settings);
    setSaved(true);
    toast("Receipt printer settings saved.", "success");
  };

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <Printer size={15} /> Receipt printer
      </h2>
      <p className="mt-1 text-xs text-ink-700/55">
        Match the paper in your printer. Receipts print in solid black at the right width, on a page as long as the
        receipt, so thermal rolls are not wasted.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Paper size">
        {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={settings.paper === size}
            onClick={() => update({ paper: size })}
            className={cx(
              "rounded-2xl border p-3 text-left transition",
              settings.paper === size
                ? "border-brand-500 bg-brand-50"
                : "border-black/10 hover:bg-black/[0.03]",
            )}
          >
            <span className="block text-sm font-semibold text-ink-900">{PAPER_SIZES[size].label}</span>
            <span className="mt-0.5 block text-xs text-ink-700/55">{PAPER_SIZES[size].hint}</span>
          </button>
        ))}
      </div>

      {desktop ? (
        <label className="mt-3 block">
          <span className="label">Printer</span>
          <select
            value={settings.printer}
            onChange={(event) => update({ printer: event.target.value })}
            className="input"
          >
            <option value="">Ask each time (show the print dialog)</option>
            {(printers ?? []).map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.displayName}
                {printer.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-700/55">
            Choosing a printer sends every receipt straight to it, with no dialog.
            {printers && printers.length === 0 && " No printers found — install the printer's Windows driver first."}
          </span>
        </label>
      ) : (
        <p className="mt-3 rounded-2xl bg-black/[0.03] px-3 py-2 text-xs text-ink-700/65">
          In the browser, Print opens the print dialog: pick your receipt printer there and set Margins to “None”.
          The Windows desktop app can print straight to a chosen printer.
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={settings.watermark}
          onChange={(event) => update({ watermark: event.target.checked })}
          className="h-4 w-4 accent-brand-500"
        />
        Print the faded Xpel Beauty watermark
        <span className="text-xs text-ink-700/50">(turn off if your printer shows it as dots)</span>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void save()} className="btn-dark">
          {saved ? <CheckCircle2 size={16} /> : null} Save printer settings
        </button>
        <button
          onClick={() => void savePrintSettings(settings).then(() => setTesting(sampleReceipt()))}
          className="btn-ghost"
        >
          <Printer size={16} /> Print a test receipt
        </button>
      </div>

      {testing && (
        <Receipt
          sale={testing.sale}
          items={testing.items}
          onClose={() => setTesting(null)}
          title="Test receipt — nothing is recorded"
          actionLabel="Done"
        />
      )}
    </section>
  );
}
