"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Archive, Download, PackagePlus, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import {
  archiveProduct,
  createProduct,
  deleteProductPermanently,
  productSaleCount,
  restockProduct,
  restoreProduct,
  updateProduct,
} from "@/lib/repository";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { exportCsvInventory } from "@/lib/exporters";
import type { Product } from "@/lib/types";
import { cx, formatMoney, formatNumber } from "@/lib/utils";

const EMPTY = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  price: "",
  costPrice: "",
  stockQty: "",
  lowStockThreshold: "5",
  barcode: "",
};

export default function InventoryPage() {
  const allProducts = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [restockFor, setRestockFor] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const products = useMemo(
    () => (allProducts ?? []).filter((product) => !product.deletedAt),
    [allProducts],
  );
  const archived = useMemo(
    () => (allProducts ?? []).filter((product) => product.deletedAt),
    [allProducts],
  );

  const list = useMemo(() => {
    const query = term.trim().toLowerCase();
    const rows = (showArchived ? archived : products).filter((product) =>
      !query
        ? true
        : [product.name, product.sku, product.category, product.brand]
            .join(" ")
            .toLowerCase()
            .includes(query),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, archived, showArchived, term]);

  const stats = useMemo(() => {
    const rows = products;
    return {
      count: rows.length,
      units: rows.reduce((sum, p) => sum + p.stockQty, 0),
      value: rows.reduce((sum, p) => sum + p.stockQty * p.price, 0),
      low: rows.filter((p) => p.stockQty > 0 && p.stockQty <= p.lowStockThreshold).length,
      out: rows.filter((p) => p.stockQty <= 0).length,
    };
  }, [products]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Products" value={formatNumber(stats.count)} />
        <Tile label="Units in stock" value={formatNumber(stats.units)} />
        <Tile label="Stock value" value={formatMoney(stats.value)} />
        <Tile
          label="Needs attention"
          value={`${stats.low} low · ${stats.out} out`}
          tone={stats.low + stats.out > 0 ? "warn" : "plain"}
        />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black/10 px-3 py-2">
            <Search size={16} className="text-ink-700/40" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search products…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={() => setShowArchived((value) => !value)}
            className={cx("btn-ghost", showArchived && "border-brand-500/40 bg-brand-50 text-brand-700")}
          >
            <Archive size={16} />
            {showArchived ? `Active (${products.length})` : `Archived (${archived.length})`}
          </button>
          <button
            onClick={() => void exportCsvInventory(list)}
            className="btn-ghost"
            disabled={list.length === 0}
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Add product
          </button>
        </div>

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-ink-700/55">
            {showArchived
              ? "Nothing is archived."
              : term
                ? `No product matches “${term}”.`
                : "No products yet — add your first Xpel product to start selling."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">In stock</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {list.map((product) => {
                  const out = product.stockQty <= 0;
                  const low = !out && product.stockQty <= product.lowStockThreshold;
                  const isArchived = Boolean(product.deletedAt);
                  return (
                    <tr key={product.id} className="hover:bg-black/[0.015]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-900">{product.name}</p>
                        <p className="text-xs text-ink-700/50">{product.sku || "No SKU"}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-700/70">{product.category || "—"}</td>
                      <td className="tabular px-4 py-3 text-right font-medium">{formatMoney(product.price)}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold">{product.stockQty}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cx(
                            "chip",
                            isArchived
                              ? "bg-black/5 text-ink-700/70"
                              : out
                                ? "bg-brand-50 text-brand-700"
                                : low
                                  ? "bg-[#fdf3e0] text-brand-700"
                                  : "bg-olive-100 text-olive-900",
                          )}
                        >
                          {!isArchived && (out || low) && <AlertTriangle size={12} />}
                          {isArchived ? "Archived" : out ? "Out of stock" : low ? "Low stock" : "In stock"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {showArchived ? (
                            <IconButton
                              label="Restore"
                              onClick={async () => {
                                await restoreProduct(product.id);
                                toast(`${product.name} restored.`, "success");
                              }}
                            >
                              <RotateCcw size={16} />
                            </IconButton>
                          ) : (
                            <>
                              <IconButton label="Restock" onClick={() => setRestockFor(product)}>
                                <PackagePlus size={16} />
                              </IconButton>
                              <IconButton
                                label="Edit"
                                onClick={() => {
                                  setEditing(product);
                                  setShowForm(true);
                                }}
                              >
                                <Pencil size={16} />
                              </IconButton>
                            </>
                          )}
                          <IconButton label="Delete" danger onClick={() => setDeleting(product)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {restockFor && <RestockDialog product={restockFor} onClose={() => setRestockFor(null)} />}

      {deleting && <DeleteDialog product={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function Tile({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "warn" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">{label}</p>
      <p className={cx("tabular mt-1 text-xl font-bold", tone === "warn" ? "text-brand-700" : "text-ink-900")}>
        {value}
      </p>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx(
        "grid h-8 w-8 place-items-center rounded-lg text-ink-700/55 transition hover:bg-black/5",
        danger && "hover:bg-brand-50 hover:text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          sku: product.sku,
          category: product.category,
          brand: product.brand,
          price: String(product.price),
          costPrice: String(product.costPrice),
          stockQty: String(product.stockQty),
          lowStockThreshold: String(product.lowStockThreshold),
          barcode: product.barcode,
        }
      : EMPTY,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!Number(form.price)) {
      setError("Enter a selling price.");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      brand: form.brand,
      price: Number(form.price) || 0,
      costPrice: Number(form.costPrice) || 0,
      stockQty: Number(form.stockQty) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 5,
      barcode: form.barcode,
    };
    if (product) await updateProduct(product.id, payload);
    else await createProduct(payload);
    setBusy(false);
    onClose();
  };

  return (
    <Dialog title={product ? "Edit product" : "Add product"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Product name" value={form.name} onChange={set("name")} placeholder="e.g. Xpel Glow Body Lotion" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / code" value={form.sku} onChange={set("sku")} placeholder="XP-001" />
          <Field label="Category" value={form.category} onChange={set("category")} placeholder="Body care" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price" value={form.price} onChange={set("price")} inputMode="decimal" placeholder="0.00" />
          <Field label="Cost price" value={form.costPrice} onChange={set("costPrice")} inputMode="decimal" placeholder="0.00" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={product ? "Quantity in stock" : "Opening quantity"}
            value={form.stockQty}
            onChange={set("stockQty")}
            inputMode="numeric"
            placeholder="0"
          />
          <Field
            label="Low stock alert at"
            value={form.lowStockThreshold}
            onChange={set("lowStockThreshold")}
            inputMode="numeric"
            placeholder="5"
          />
        </div>
        <Field label="Barcode (optional)" value={form.barcode} onChange={set("barcode")} placeholder="Scan or type" />

        {error && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RestockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(quantity);
    if (!value) return;
    await restockProduct(product.id, value, note || "Restock");
    onClose();
  };

  return (
    <Dialog title={`Restock ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink-700/65">
          Currently <span className="tabular font-semibold text-ink-900">{product.stockQty}</span> in stock. Enter how
          many units you received.
        </p>
        <Field
          label="Quantity received"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="numeric"
          placeholder="0"
          autoFocus
        />
        <Field label="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Supplier / invoice" />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1">
            Add to stock
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const [saleCount, setSaleCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void productSaleCount(product.id).then(setSaleCount);
  }, [product.id]);

  const sold = (saleCount ?? 0) > 0;

  const archive = async () => {
    setBusy(true);
    await archiveProduct(product.id);
    toast(`${product.name} archived — it stays on past receipts.`, "success");
    setBusy(false);
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    const result = await deleteProductPermanently(product.id);
    toast(
      result.deleted ? `${product.name} deleted.` : result.reason ?? "Archived instead.",
      result.deleted ? "success" : "info",
    );
    setBusy(false);
    onClose();
  };

  return (
    <Modal title={`Remove ${product.name}?`} onClose={onClose} size="sm">
      <div className="space-y-3 text-sm text-ink-700/75">
        {saleCount === null ? (
          <p>Checking sales history…</p>
        ) : sold ? (
          <p>
            This product appears on{" "}
            <strong className="text-ink-900">{saleCount} past sale line{saleCount === 1 ? "" : "s"}</strong>, so it can
            only be archived. Archiving hides it from the till and reports keep working.
          </p>
        ) : (
          <p>
            It has never been sold, so you can delete it outright — or archive it to keep it out of the till without
            losing the record.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button onClick={archive} disabled={busy} className="btn-ghost w-full">
          <Archive size={16} /> Archive (recommended)
        </button>
        <button onClick={remove} disabled={busy || sold} className="btn w-full bg-brand-600 text-white hover:bg-brand-700">
          <Trash2 size={16} /> Delete permanently
        </button>
        <button onClick={onClose} disabled={busy} className="btn w-full text-ink-700/70 hover:bg-black/5">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      {children}
    </Modal>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" {...props} />
    </label>
  );
}
