"use client";

import { getDb, getSetting, setSetting } from "./db";
import { logActivity } from "./activity";
import { getDeviceId, saveCustomer } from "./repository";
import { getSupabase } from "./supabase";
import { syncNow } from "./sync";
import type { Invoice, InvoiceLine, InvoiceStatus, PaymentAccount } from "./types";
import { buildReceiptNo, newId, round2 } from "./utils";

/* ------------------------------------------------------------------ */
/* Payment accounts                                                    */
/* ------------------------------------------------------------------ */

/** Xpel's own account: on every till, the default on every new invoice. */
export const DEFAULT_PAYMENT_ACCOUNTS: PaymentAccount[] = [
  { bankName: "FIDELITY BANK", accountNumber: "5620075648", accountName: "XPEL PHARMACEUTICAL LTD" },
];

const ACCOUNTS_KEY = "invoice_accounts";
const DEFAULT_ACCOUNT_KEY = "invoice_default_account";
const ADMIN_PIN_KEY = "admin_pin_hash";

/** What tells two accounts apart: bank, the digits of the number, and the name. */
export function accountKey(account: PaymentAccount): string {
  const squash = (value: string) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return `${squash(account.bankName)}|${(account.accountNumber ?? "").replace(/\D/g, "")}|${squash(account.accountName)}`;
}

export function sameAccount(a: PaymentAccount, b: PaymentAccount): boolean {
  return accountKey(a) === accountKey(b);
}

export function isBuiltInAccount(account: PaymentAccount): boolean {
  return DEFAULT_PAYMENT_ACCOUNTS.some((built) => sameAccount(built, account));
}

export function describeAccount(account: PaymentAccount): string {
  return [account.accountName, account.bankName, account.accountNumber].filter(Boolean).join(" · ");
}

/** The accounts invoices can be paid into: Xpel's own first, then any the admin added. */
export async function loadPaymentAccounts(): Promise<PaymentAccount[]> {
  await removeRetiredAccounts();
  let saved: PaymentAccount[] = [];
  try {
    const parsed = JSON.parse((await getSetting(ACCOUNTS_KEY)) || "[]");
    if (Array.isArray(parsed)) saved = parsed;
  } catch {
    saved = [];
  }
  const all = [...DEFAULT_PAYMENT_ACCOUNTS];
  for (const account of saved) {
    if (account?.accountNumber && !all.some((a) => sameAccount(a, account))) all.push(account);
  }
  return all;
}

/** GTBank accounts were taken off the list; clear any saved on this till, once. */
async function removeRetiredAccounts(): Promise<void> {
  const FLAG = "invoice_accounts_gtb_removed";
  if (await getSetting(FLAG)) return;
  try {
    const parsed = JSON.parse((await getSetting(ACCOUNTS_KEY)) || "[]");
    if (Array.isArray(parsed)) {
      const retired = (account: PaymentAccount) => /\b(gtb|gtbank|guaranty)/i.test(account?.bankName ?? "");
      const kept = parsed.filter((account: PaymentAccount) => !retired(account));
      if (kept.length !== parsed.length) {
        await setSetting(ACCOUNTS_KEY, JSON.stringify(kept));
        const defaultKey = await getSetting(DEFAULT_ACCOUNT_KEY);
        if (parsed.some((account: PaymentAccount) => retired(account) && accountKey(account) === defaultKey)) {
          await setSetting(DEFAULT_ACCOUNT_KEY, "");
        }
      }
    }
  } catch {
    // A list that will not parse is replaced the next time the admin saves one.
  }
  await setSetting(FLAG, "1");
}

async function saveAccountList(accounts: PaymentAccount[]): Promise<void> {
  await setSetting(ACCOUNTS_KEY, JSON.stringify(accounts.filter((a) => !isBuiltInAccount(a))));
}

/** The account a new invoice starts with: the admin's choice, else Xpel's own. */
export async function loadDefaultAccount(): Promise<PaymentAccount> {
  const accounts = await loadPaymentAccounts();
  const key = await getSetting(DEFAULT_ACCOUNT_KEY);
  return accounts.find((a) => accountKey(a) === key) ?? DEFAULT_PAYMENT_ACCOUNTS[0];
}

/* ------------------------------------------------------------------ */
/* Admin PIN: only the admin adds, removes or changes payment accounts */
/* ------------------------------------------------------------------ */

async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`xpel-admin:${pin}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasAdminPin(): Promise<boolean> {
  return Boolean(await getSetting(ADMIN_PIN_KEY));
}

export async function checkAdminPin(pin: string): Promise<boolean> {
  const stored = await getSetting(ADMIN_PIN_KEY);
  return Boolean(stored) && stored === (await hashPin(pin.trim()));
}

/** Sets the PIN the first time, or changes it when the current PIN is given. */
export async function setAdminPin(newPin: string, currentPin = ""): Promise<void> {
  const pin = newPin.trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Use 4 to 8 digits for the admin PIN.");
  if ((await hasAdminPin()) && !(await checkAdminPin(currentPin))) throw new Error("The current admin PIN is wrong.");
  await setSetting(ADMIN_PIN_KEY, await hashPin(pin));
  await logActivity({ kind: "system", message: "Admin PIN set" });
}

async function requireAdmin(pin: string): Promise<void> {
  if (!(await checkAdminPin(pin))) throw new Error("Wrong admin PIN.");
}

export async function addPaymentAccount(account: PaymentAccount, pin: string): Promise<void> {
  await requireAdmin(pin);
  const clean: PaymentAccount = {
    bankName: account.bankName.trim(),
    accountNumber: account.accountNumber.replace(/\s+/g, ""),
    accountName: account.accountName.trim(),
  };
  if (!clean.bankName || !clean.accountName || !/^\d{10}$/.test(clean.accountNumber)) {
    throw new Error("Enter the bank, a 10-digit account number and the account name.");
  }
  const accounts = await loadPaymentAccounts();
  if (accounts.some((a) => sameAccount(a, clean))) throw new Error("That account is already saved.");
  await saveAccountList([...accounts, clean]);
  await logActivity({ kind: "system", message: "Admin added a payment account", detail: describeAccount(clean) });
}

export async function removePaymentAccount(account: PaymentAccount, pin: string): Promise<void> {
  await requireAdmin(pin);
  if (isBuiltInAccount(account)) throw new Error("Xpel's own account cannot be removed.");
  const accounts = await loadPaymentAccounts();
  await saveAccountList(accounts.filter((a) => !sameAccount(a, account)));
  if ((await getSetting(DEFAULT_ACCOUNT_KEY)) === accountKey(account)) await setSetting(DEFAULT_ACCOUNT_KEY, "");
  await logActivity({ kind: "system", message: "Admin removed a payment account", detail: describeAccount(account) });
}

export async function setDefaultAccount(account: PaymentAccount, pin: string): Promise<void> {
  await requireAdmin(pin);
  await setSetting(DEFAULT_ACCOUNT_KEY, accountKey(account));
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function canShare(invoice: Invoice): boolean {
  return invoice.status !== "cancelled";
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  ready: "Not sent yet",
  sent: "Sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<InvoiceStatus, string> = {
  ready: "bg-sky-100 text-sky-800",
  sent: "bg-brand-50 text-brand-700",
  paid: "bg-olive-100 text-olive-900",
  cancelled: "bg-black/[0.05] text-ink-700/60",
};

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export function invoiceTotals(items: InvoiceLine[], discount: number, vatRate: number) {
  const subtotal = round2(items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const safeDiscount = round2(Math.min(Math.max(discount || 0, 0), subtotal));
  const taxable = Math.max(0, subtotal - safeDiscount);
  const tax = round2(taxable * ((vatRate || 0) / 100));
  return { subtotal, discount: safeDiscount, tax, total: round2(taxable + tax) };
}

async function nextInvoiceNo(deviceId: string): Promise<string> {
  const count = await getDb().invoices.count();
  let sequence = Math.max(count, Number(await getSetting("invoice_seq", "0")) || 0) + 1;
  let invoiceNo = `INV-${buildReceiptNo(deviceId, sequence).slice(1)}`;
  while (await getDb().invoices.where("invoiceNo").equals(invoiceNo).count()) {
    sequence += 1;
    invoiceNo = `INV-${buildReceiptNo(deviceId, sequence).slice(1)}`;
  }
  await setSetting("invoice_seq", String(sequence));
  return invoiceNo;
}

export interface InvoiceDraft extends PaymentAccount {
  id?: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: InvoiceLine[];
  discount: number;
  vatRate: number;
  notes: string;
  dueDate: string;
}

/**
 * Saves a new invoice, or — with the admin PIN — changes an existing one, paid
 * or not. Only a cancelled invoice is final.
 */
export async function saveInvoice(draft: InvoiceDraft, adminPin = ""): Promise<Invoice> {
  if (!draft.customerName.trim()) throw new Error("Enter who the invoice is for.");
  if (draft.items.length === 0) throw new Error("Add at least one item.");
  const db = getDb();
  const account: PaymentAccount = {
    bankName: draft.bankName.trim(),
    accountNumber: draft.accountNumber.replace(/\s+/g, ""),
    accountName: draft.accountName.trim(),
  };
  const now = new Date().toISOString();
  const existing = draft.id ? await db.invoices.get(draft.id) : undefined;
  // Staff choose from the admin's accounts; they cannot type in their own.
  const keptAccount = existing ? sameAccount(existing, account) : false;
  if (!keptAccount && !(await loadPaymentAccounts()).some((a) => sameAccount(a, account))) {
    throw new Error("Choose one of the payment accounts the admin has set up.");
  }
  if (existing) {
    if (!(await hasAdminPin())) throw new Error("Set the admin PIN in Settings → Invoices first.");
    await requireAdmin(adminPin);
    if (existing.status === "cancelled") throw new Error("A cancelled invoice cannot be changed.");
  }
  const deviceId = existing?.deviceId || (await getDeviceId());

  // A new name gets saved as a customer, so next time it can be picked from the list.
  let customerId = draft.customerId;
  if (!customerId) {
    const customer = await saveCustomer({
      name: draft.customerName,
      phone: draft.customerPhone,
      email: draft.customerEmail,
    });
    customerId = customer.id;
  }

  const invoice: Invoice = {
    id: existing?.id ?? newId(),
    invoiceNo: existing?.invoiceNo ?? (await nextInvoiceNo(deviceId)),
    status: existing?.status ?? "ready",
    customerId,
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    customerEmail: draft.customerEmail.trim(),
    customerAddress: draft.customerAddress.trim(),
    items: draft.items.map((line) => ({ ...line, lineTotal: round2(line.unitPrice * line.quantity) })),
    ...invoiceTotals(draft.items, draft.discount, draft.vatRate),
    notes: draft.notes.trim(),
    issuedAt: existing?.issuedAt ?? now,
    dueDate: draft.dueDate,
    ...account,
    sentAt: existing?.sentAt ?? null,
    // An admin correcting a paid invoice keeps its payment record.
    paidAt: existing?.paidAt ?? null,
    paidAmount: existing?.paidAmount ?? 0,
    paymentReference: existing?.paymentReference ?? "",
    createdBy: existing?.createdBy || (await getSetting("cashier_name", "Counter")) || "Counter",
    deviceId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    syncState: "pending",
  };

  await db.invoices.put(invoice);
  await logActivity({
    kind: "invoice",
    message: `${existing ? "Admin edited" : "Raised"} invoice ${invoice.invoiceNo}`,
    detail: invoice.customerName,
    amount: invoice.total,
    referenceId: invoice.id,
    staffName: invoice.createdBy,
  });
  return invoice;
}

async function patchInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
  const db = getDb();
  const current = await db.invoices.get(id);
  if (!current) throw new Error("Invoice not found.");
  const next: Invoice = { ...current, ...patch, updatedAt: new Date().toISOString(), syncState: "pending" };
  await db.invoices.put(next);
  return next;
}

export async function markInvoiceSent(invoice: Invoice): Promise<Invoice> {
  if (invoice.status !== "ready") return invoice;
  return patchInvoice(invoice.id, { status: "sent", sentAt: invoice.sentAt ?? new Date().toISOString() });
}

export async function confirmInvoicePayment(
  invoice: Invoice,
  payment: { amount: number; reference: string; paidAt: string },
): Promise<Invoice> {
  if (invoice.status === "cancelled") throw new Error("A cancelled invoice cannot be paid.");
  if (!(payment.amount > 0)) throw new Error("Enter the amount received.");
  const next = await patchInvoice(invoice.id, {
    status: "paid",
    paidAt: payment.paidAt,
    paidAmount: round2(payment.amount),
    paymentReference: payment.reference.trim(),
  });
  await logActivity({
    kind: "invoice",
    message: `Payment received on invoice ${invoice.invoiceNo}`,
    detail: [invoice.customerName, payment.reference.trim()].filter(Boolean).join(" · "),
    amount: next.paidAmount,
    referenceId: invoice.id,
  });
  return next;
}

export async function cancelInvoice(invoice: Invoice): Promise<Invoice> {
  const next = await patchInvoice(invoice.id, { status: "cancelled" });
  await logActivity({
    kind: "invoice",
    message: `Cancelled invoice ${invoice.invoiceNo}`,
    detail: invoice.customerName,
    amount: invoice.total,
    referenceId: invoice.id,
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Email (through the cloud)                                           */
/* ------------------------------------------------------------------ */

async function callMail<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync is not configured.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You are offline. Try again when connected.");
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Sign in on the Settings page first.");
  const { data, error } = await supabase.functions.invoke("xpel-mail", { body });
  if (error) {
    // The function's own message is more useful than "non-2xx status code".
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      const detail = await context.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function emailInvoice(
  invoice: Invoice,
  options: { to: string; message: string; pdf: Blob; filename: string; kind: "invoice" | "payment" },
): Promise<void> {
  // The cloud copy must exist before the cloud can email it.
  const report = await syncNow();
  if (!report.ok) throw new Error(report.message);
  await callMail({
    action: "send-invoice",
    kind: options.kind,
    invoiceId: invoice.id,
    to: options.to,
    message: options.message,
    filename: options.filename,
    pdfBase64: await blobToBase64(options.pdf),
  });
  await syncNow();
  await logActivity({
    kind: "invoice",
    message: `Emailed ${options.kind === "payment" ? "payment confirmation" : "invoice"} ${invoice.invoiceNo}`,
    detail: options.to,
    referenceId: invoice.id,
  });
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

/** Nigerian numbers written locally (0803…) become 234803… for wa.me. */
export function whatsappNumber(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}
