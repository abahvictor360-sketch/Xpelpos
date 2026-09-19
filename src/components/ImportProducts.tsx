"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { toast } from "./Toaster";
import {
  downloadImportTemplate,
  importProducts,
  parseProductFile,
  type ParsedRow,
} from "@/lib/import-products";
import { cx, formatMoney } from "@/lib/utils";

export default function ImportProducts({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [addToStock, setAddToStock] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const valid = rows?.filter((row) => !row.error) ?? [];
  const invalid = rows?.filter((row) => row.error) ?? [];
  const creates = valid.filter((row) => row.action === "create").length;
  const updates = valid.filter((row) => row.action === "update").length;

  const pickFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const result = await parseProductFile(file);
      if (result.rows.length === 0) {
        toast("That file has no rows the importer could read.", "error");
        setRows(null);
      } else {
        setRows(result.rows);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not read that file.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!rows) return;
    setBusy(true);
    const summary = await importProducts(rows, { updateExisting, addToStock });
    setBusy(false);
    toast(
      `${summary.created} added, ${summary.updated} updated, ${summary.skipped} skipped.`,
      "success",
    );
    onClose();
  };

  return (
    <Modal title="Import products" onClose={onClose} size="lg">
      {!rows ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700/75">
            Upload an Excel (.xlsx) or CSV file of your stock. Columns are matched by name, so headings
            like <em>Product</em>, <em>Qty</em> or <em>Selling price</em> are understood as well.
          </p>

          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-black/15 px-4 py-10 transition hover:border-brand-400 hover:bg-brand-50/40"
          >
            {busy ? (
              <Loader2 size={22} className="animate-spin text-brand-600" />
            ) : (
              <FileUp size={22} className="text-brand-600" />
            )}
            <span className="text-sm font-semibold text-ink-900">
              {busy ? "Reading…" : "Choose a spreadsheet"}
            </span>
            <span className="text-xs text-ink-700/55">.xlsx, .xls or .csv</span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="hidden"
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />

          <div className="rounded-xl bg-black/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-700/55">
              Expected columns
            </p>
            <p className="mt-1 text-sm text-ink-700/75">
              Name and Price are required. SKU, Category, Brand, Cost price, Quantity, Low stock alert
              and Barcode are optional.
            </p>
            <button onClick={() => void downloadImportTemplate()} className="btn-ghost mt-2">
              <Download size={16} /> Download template
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="chip bg-olive-100 text-olive-900">
              <CheckCircle2 size={14} /> {creates} new
            </span>
            <span className="chip bg-[#e8f1fb] text-[#0d5aa0]">{updates} matched existing</span>
            {invalid.length > 0 && (
              <span className="chip bg-brand-50 text-brand-700">
                <AlertTriangle size={14} /> {invalid.length} skipped
              </span>
            )}
            <span className="ml-auto truncate text-xs text-ink-700/55">{fileName}</span>
          </div>

          <div className="max-h-64 overflow-auto rounded-xl border border-black/5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((row) => (
                  <tr key={row.row} className={cx(row.error && "bg-brand-50/40")}>
                    <td className="tabular px-3 py-2 text-ink-700/55">{row.row}</td>
                    <td className="px-3 py-2">
                      <span className="block truncate font-medium text-ink-900">
                        {row.name || "—"}
                      </span>
                      {row.sku && <span className="block text-xs text-ink-700/50">{row.sku}</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{formatMoney(row.price)}</td>
                    <td className="tabular px-3 py-2 text-right">{row.stockQty}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.error ? (
                        <span className="text-brand-700">{row.error}</span>
                      ) : row.action === "update" ? (
                        <span className="text-[#0d5aa0]">Updates existing product</span>
                      ) : (
                        <span className="text-olive-800">Will be added</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-xl bg-black/[0.03] p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(event) => setUpdateExisting(event.target.checked)}
                className="h-4 w-4 accent-[#cf6d1e]"
              />
              Update products that already exist (matched on SKU, else name)
            </label>
            <label className={cx("flex items-center gap-2", !updateExisting && "opacity-50")}>
              <input
                type="checkbox"
                checked={addToStock}
                disabled={!updateExisting}
                onChange={(event) => setAddToStock(event.target.checked)}
                className="h-4 w-4 accent-[#cf6d1e]"
              />
              Add the sheet quantity to current stock instead of replacing it
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setRows(null);
                setFileName("");
              }}
              className="btn-ghost flex-1"
            >
              Choose another file
            </button>
            <button
              onClick={() => void runImport()}
              disabled={busy || valid.length === 0}
              className="btn-primary flex-1"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Import {updateExisting ? valid.length : creates} product
              {(updateExisting ? valid.length : creates) === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
