"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Printer, ScanBarcode, Search, Sparkles, Wand2, X } from "lucide-react";
import { db } from "@/lib/db";
import { setProductBarcode } from "@/lib/repository";
import { duplicateBarcodes, nextStoreBarcodes, normaliseBarcode } from "@/lib/barcodes";
import type { Product } from "@/lib/types";
import { cx, formatMoney, formatNumber } from "@/lib/utils";
import Modal from "@/components/Modal";
import BarcodeSvg from "@/components/BarcodeSvg";
import { LABEL_LAYOUTS, LabelSheet, usePrintLabels, type LabelLayout } from "@/components/BarcodeLabels";
import { toast } from "@/components/Toaster";

type Filter = "all" | "missing" | "duplicates";

export default function BarcodesPage() {
  const all = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const products = useMemo(
    () => all.filter((p) => !p.deletedAt && p.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [all],
  );
  const duplicates = useMemo(() => duplicateBarcodes(products), [products]);
  const duplicateIds = useMemo(
    () => new Set([...duplicates.values()].flat().map((p) => p.id)),
    [duplicates],
  );

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [assignCode, setAssignCode] = useState<string | null>(null);

  const missing = products.filter((p) => !p.barcode?.trim());
  const query = term.trim().toLowerCase();
  const list = products.filter((p) => {
    if (filter === "missing" && p.barcode?.trim()) return false;
    if (filter === "duplicates" && !duplicateIds.has(p.id)) return false;
    if (!query) return true;
    return [p.name, p.sku, p.barcode, p.category].join(" ").toLowerCase().includes(query);
  });

  // A scanned code nobody has yet: offer to give it to a product.
  const unknownScan =
    query.length >= 6 && /^[\w-]+$/.test(term.trim()) && list.length === 0 ? normaliseBarcode(term) : null;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generateMissing = async () => {
    const codes = nextStoreBarcodes(products, missing.length);
    for (const [index, product] of missing.entries()) {
      await setProductBarcode(product.id, codes[index]);
    }
    toast(`Gave ${missing.length} product(s) a store barcode.`, "success");
    setConfirmGenerate(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="Products" value={formatNumber(products.length)} />
        <Tile label="With a barcode" value={formatNumber(products.length - missing.length)} />
        <Tile label="Missing a barcode" value={formatNumber(missing.length)} warn={missing.length > 0} />
        <Tile label="Shared barcodes" value={formatNumber(duplicates.size)} warn={duplicates.size > 0} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/45" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Scan a barcode or search products…"
              aria-label="Search barcodes"
              className="input pl-9 pr-9"
              autoFocus
            />
            {term && (
              <button
                onClick={() => setTerm("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-ink-700/55 hover:bg-black/5"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="flex gap-1.5">
            {(
              [
                ["all", "All"],
                ["missing", `Missing (${missing.length})`],
                ["duplicates", `Shared (${duplicates.size})`],
              ] as Array<[Filter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cx(
                  "rounded-2xl px-3 py-2 text-sm font-medium transition",
                  filter === id
                    ? "bg-brand-500 text-white shadow-brand"
                    : "border border-black/10 bg-white text-ink-700/70 hover:bg-black/[0.03]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {missing.length > 0 && (
              <button onClick={() => setConfirmGenerate(true)} className="btn-ghost">
                <Wand2 size={16} /> Generate for missing
              </button>
            )}
            <button
              onClick={() => setLabelsOpen(true)}
              disabled={selected.size === 0}
              className="btn-primary"
            >
              <Printer size={16} /> Print labels{selected.size ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>

        {unknownScan && (
          <div className="flex flex-wrap items-center gap-3 border-b border-black/5 bg-brand-50 px-4 py-3 text-sm">
            <ScanBarcode size={18} className="text-brand-700" />
            <span className="text-ink-800">
              No product has <span className="font-mono font-semibold">{unknownScan}</span> yet.
            </span>
            <button onClick={() => setAssignCode(unknownScan)} className="btn-dark ml-auto py-1.5">
              Give it to a product
            </button>
          </div>
        )}

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-ink-700/55">
            {filter === "missing"
              ? "Every product has a barcode."
              : filter === "duplicates"
                ? "No two products share a barcode."
                : "No products match."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all with a barcode"
                      className="h-4 w-4 accent-brand-500"
                      checked={list.some((p) => p.barcode) && list.filter((p) => p.barcode).every((p) => selected.has(p.id))}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked ? new Set(list.filter((p) => p.barcode).map((p) => p.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Barcode</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {list.map((product) => {
                  const code = product.barcode?.trim();
                  const shared = duplicateIds.has(product.id);
                  return (
                    <tr key={product.id} className="hover:bg-black/[0.015]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          disabled={!code}
                          checked={selected.has(product.id)}
                          onChange={() => toggle(product.id)}
                          aria-label={`Select ${product.name} for labels`}
                          className="h-4 w-4 accent-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{product.name}</p>
                        <p className="text-xs text-ink-700/55">
                          {[product.sku, formatMoney(product.price)].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {code ? (
                          <BarcodeSvg code={code} height={26} width={1.2} className="h-12 max-w-[200px]" />
                        ) : (
                          <span className="text-xs text-ink-700/45">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!code ? (
                          <span className="chip bg-black/5 text-ink-700/70">Missing</span>
                        ) : shared ? (
                          <span className="chip bg-brand-50 text-brand-700">
                            <AlertTriangle size={12} /> Shared
                          </span>
                        ) : (
                          <span className="chip bg-olive-100 text-olive-900">Ready to scan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditing(product)} className="btn-ghost py-1.5">
                          <ScanBarcode size={15} /> {code ? "Change" : "Add barcode"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <BarcodeEditor
          product={editing}
          products={products}
          onClose={() => setEditing(null)}
        />
      )}

      {assignCode && (
        <AssignDialog
          code={assignCode}
          products={products}
          onClose={(done) => {
            setAssignCode(null);
            if (done) setTerm("");
          }}
        />
      )}

      {labelsOpen && (
        <LabelsDialog
          products={products.filter((p) => selected.has(p.id) && p.barcode?.trim())}
          onClose={() => setLabelsOpen(false)}
        />
      )}

      {confirmGenerate && (
        <Modal
          title={`Generate barcodes for ${missing.length} product(s)?`}
          onClose={() => setConfirmGenerate(false)}
          size="sm"
          footer={
            <>
              <button onClick={() => setConfirmGenerate(false)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button onClick={() => void generateMissing()} className="btn-primary flex-1">
                <Sparkles size={16} /> Generate
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700/75">
            Each product without a barcode gets a store code (EAN-13 starting 200, a range kept for shops&apos; own
            use). Print labels for them afterwards and stick them on the packs, so they scan at the till.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">{label}</p>
      <p className={cx("tabular mt-1 text-xl font-bold", warn ? "text-brand-700" : "text-ink-900")}>{value}</p>
    </div>
  );
}

/** Scan (or type) a product's barcode, or generate a store code for it. */
function BarcodeEditor({
  product,
  products,
  onClose,
}: {
  product: Product;
  products: Product[];
  onClose: () => void;
}) {
  const [code, setCode] = useState(product.barcode ?? "");
  const [error, setError] = useState("");

  const save = async (value = code) => {
    try {
      await setProductBarcode(product.id, value);
      toast(value.trim() ? `Barcode saved for ${product.name}.` : `Barcode removed from ${product.name}.`, "success");
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save that barcode.");
    }
  };

  return (
    <Modal
      title={`Barcode for ${product.name}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          {product.barcode && (
            <button onClick={() => void save("")} className="btn-ghost">
              Remove
            </button>
          )}
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={!code.trim()} className="btn-primary flex-1">
            Save
          </button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block">
          <span className="label">Scan the product, or type its barcode</span>
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError("");
            }}
            className="input font-mono"
            placeholder="e.g. 6151100123456"
            autoFocus
          />
        </label>
        <button
          type="button"
          onClick={() => setCode(nextStoreBarcodes(products)[0])}
          className="btn-ghost w-full"
        >
          <Wand2 size={16} /> No barcode on the pack? Generate a store code
        </button>
        {code.trim() && (
          <div className="grid place-items-center rounded-2xl border border-black/5 bg-white p-3">
            <BarcodeSvg code={code.trim()} height={40} />
          </div>
        )}
        {error && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
      </form>
    </Modal>
  );
}

/** A code was scanned that no product has: pick which product it belongs to. */
function AssignDialog({
  code,
  products,
  onClose,
}: {
  code: string;
  products: Product[];
  onClose: (done: boolean) => void;
}) {
  const [productId, setProductId] = useState("");
  const [error, setError] = useState("");

  const assign = async () => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    try {
      await setProductBarcode(product.id, code);
      toast(`${code} now scans as ${product.name}.`, "success");
      onClose(true);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign that barcode.");
    }
  };

  return (
    <Modal
      title={`Assign ${code}`}
      onClose={() => onClose(false)}
      size="sm"
      footer={
        <>
          <button onClick={() => onClose(false)} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={() => void assign()} disabled={!productId} className="btn-primary flex-1">
            Assign
          </button>
        </>
      }
    >
      <label className="block">
        <span className="label">Which product is this?</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)} className="input" autoFocus>
          <option value="">Choose a product…</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.barcode ? ` (replaces ${product.barcode})` : ""}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
    </Modal>
  );
}

function LabelsDialog({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<LabelLayout>("sheet");
  const [showPrice, setShowPrice] = useState(true);
  const { print, portal } = usePrintLabels();

  const requests = products.map((product) => ({
    product,
    copies: Math.max(0, Math.trunc(Number(copies[product.id] ?? "1") || 0)),
  }));
  const total = requests.reduce((sum, request) => sum + request.copies, 0);

  return (
    <Modal
      title="Print barcode labels"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost flex-1">
            Close
          </button>
          <button
            onClick={() => print({ requests, layout, showPrice })}
            disabled={total === 0}
            className="btn-primary flex-1"
          >
            <Printer size={16} /> Print {total} label{total === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Label paper">
          {(Object.keys(LABEL_LAYOUTS) as LabelLayout[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={layout === id}
              onClick={() => setLayout(id)}
              className={cx(
                "rounded-2xl border p-3 text-left transition",
                layout === id ? "border-brand-500 bg-brand-50" : "border-black/10 hover:bg-black/[0.03]",
              )}
            >
              <span className="block text-sm font-semibold text-ink-900">{LABEL_LAYOUTS[id].label}</span>
              <span className="mt-0.5 block text-xs text-ink-700/55">{LABEL_LAYOUTS[id].hint}</span>
            </button>
          ))}
        </div>

        <ul className="divide-y divide-black/5 rounded-2xl border border-black/5">
          {products.map((product) => (
            <li key={product.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{product.name}</span>
              <span className="font-mono text-xs text-ink-700/55">{product.barcode}</span>
              <label className="flex items-center gap-1.5 text-xs text-ink-700/60">
                Copies
                <input
                  value={copies[product.id] ?? "1"}
                  onChange={(event) => setCopies((current) => ({ ...current, [product.id]: event.target.value }))}
                  inputMode="numeric"
                  className="input w-16 py-1.5 text-center"
                  aria-label={`Copies of ${product.name}`}
                />
              </label>
            </li>
          ))}
        </ul>

        <label className="flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            checked={showPrice}
            onChange={(event) => setShowPrice(event.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
          Show the price on each label
        </label>

        <div className="barcode-labels-preview max-h-72 overflow-auto rounded-2xl bg-black/[0.03] p-3">
          <LabelSheet requests={requests.map((r) => ({ ...r, copies: Math.min(r.copies, 1) }))} layout={layout} showPrice={showPrice} />
        </div>
        <p className="text-xs text-ink-700/55">Preview shows one of each. The print dialog lets you pick the label printer.</p>
      </div>
      {portal}
    </Modal>
  );
}
