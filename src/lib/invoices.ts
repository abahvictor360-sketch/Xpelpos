"use client";

import { getDb, getSetting, setSetting } from "./db";
import { logActivity } from "./activity";
import { getDeviceId } from "./repository";
import { getSupabase } from "./supabase";
import { syncNow } from "./sync";
import type { Invoice, InvoiceLine, InvoiceStatus, PaymentAccount } from "./types";
import { buildReceiptNo, newId, round2 } from "./utils";

/* ------------------------------------------------------------------ */
/* Payment accounts and the approval rule                              */
/* ------------------------------------------------------------------ */

/**
 * Xpel's own account, offered on every new invoice. Accounts in Xpel's name
 * never need the admin's approval.
 */
export const DEFAULT_PAYMENT_ACCOUNTS: PaymentAccount[] = [];

const ACCOUNTS_KEY = "invoice_accounts";
const DEFAULT_ACCOUNT_KEY = "invoice_default_account";

/** Any account whose name does not carry "Xpel" must be approved by the admin. */
export function accountNeedsApproval(account: Pick<PaymentAccount, "accountName">): boolean {
  return !/xpel/i.test(account.accountName ?? "");
}

/** Mirrors pos_invoice_account_key in the database: what an approval covers. */
export function accountKey(account: PaymentAccount): string {
  const squash = (value: string) => (value ?? "").replace(/\s+/g, " ").toLowerCase();
  return `${squash(account.bankName)}|${(account.accountNumber ?? "").replace(/\D/g, "")}|${squash(account.accountName)}`;
}

export function sameAccount(a: PaymentAccount, b: PaymentAccount): boolean {
  return accountKey(a) === accountKey(b);
}

export function describeAccount(account: PaymentAccount): string {
  return [account.accountName, account.bankName, account.accountNumber].filter(Boolean).join(" · ");
}

/** Saved accounts on this till, Xpel's defaults first. */
export async function loadPaymentAccounts(): Promise<PaymentAccount[]> {
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

export async function savePaymentAccounts(accounts: PaymentAccount[]): Promise<void> {
  const own = accounts.filter((a) => !DEFAULT_PAYMENT_ACCOUNTS.some((d) => sameAccount(d, a)));
  await setSetting(ACCOUNTS_KEY, JSON.stringify(own));
}

/** The account a new invoice starts with. */
export async function loadDefaultAccount(): Promise<PaymentAccount | null> {
  const accounts = await loadPaymentAccounts();
  const key = await getSetting(DEFAULT_ACCOUNT_KEY);
  return accounts.find((a) => accountKey(a) === key) ?? accounts[0] ?? null;
}

export async function setDefaultAccount(account: PaymentAccount): Promise<void> {
  await setSetting(DEFAULT_ACCOUNT_KEY, accountKey(account));
}

/** Adds an account to the saved list the first time it is used. */
async function rememberAccount(account: PaymentAccount): Promise<void> {
  if (!account.accountNumber.trim()) return;
  const accounts = await loadPaymentAccounts();
  if (accounts.some((a) => sameAccount(a, account))) return;
  await savePaymentAccounts([...accounts, account]);
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function isApproved(invoice: Invoice): boolean {
  return !accountNeedsApproval(invoice) || invoice.approvedAccount === accountKey(invoice);
}

/** Only an approved, live invoice may be printed, downloaded or sent. */
export function canShare(invoice: Invoice): boolean {
  return ["ready", "sent", "paid"].includes(invoice.status) && isApproved(invoice);
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  awaiting_approval: "Awaiting approval",
  rejected: "Account rejected",
  ready: "Ready to send",
  sent: "Sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<InvoiceStatus, string> = {
  awaiting_approval: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
  ready: "bg-sky-100 text-sky-800",
  sent: "bg-brand-50 text-brand-700",
  paid: "bg-olive-100 text-olive-900",
  cancelled: "bg-black/[0.05] text-ink-700/60",
};

/** What status an invoice should hold, given its account and what has happened to it. */
function settleStatus(invoice: Invoice, wanted: InvoiceStatus): InvoiceStatus {
  if (wanted === "cancelled") return "cancelled";
  if (!isApproved(invoice)) return invoice.status === "rejected" && wanted !== "awaiting_approval" ? "rejected" : "awaiting_approval";
  if (wanted === "awaiting_approval" || wanted === "rejected") return "ready";
  return wanted;
}

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

export async function saveInvoice(draft: InvoiceDraft): Promise<Invoice> {
  if (draft.items.length === 0) throw new Error("Add at least one item.");
  if (!draft.accountNumber.trim() || !draft.accountName.trim() || !draft.bankName.trim()) {
    throw new Error("Enter the bank, account number and account name the customer should pay into.");
  }
  const db = getDb();
  const now = new Date().toISOString();
  const existing = draft.id ? await db.invoices.get(draft.id) : undefined;
  if (existing && (existing.status === "paid" || existing.status === "cancelled")) {
    throw new Error("A paid or cancelled invoice cannot be changed.");
  }
  const deviceId = existing?.deviceId || (await getDeviceId());
  const totals = invoiceTotals(draft.items, draft.discount, draft.vatRate);
  const account: PaymentAccount = {
    bankName: draft.bankName.trim(),
    accountNumber: draft.accountNumber.replace(/\s+/g, ""),
    accountName: draft.accountName.trim(),
  };
  const accountChanged = existing ? !sameAccount(existing, account) : true;

  const invoice: Invoice = {
    id: existing?.id ?? newId(),
    invoiceNo: existing?.invoiceNo ?? (await nextInvoiceNo(deviceId)),
    status: existing?.status ?? "ready",
    customerId: draft.customerId,
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    customerEmail: draft.customerEmail.trim(),
    customerAddress: draft.customerAddress.trim(),
    items: draft.items.map((line) => ({ ...line, lineTotal: round2(line.unitPrice * line.quantity) })),
    ...totals,
    notes: draft.notes.trim(),
    issuedAt: existing?.issuedAt ?? now,
    dueDate: draft.dueDate,
    ...account,
    needsApproval: accountNeedsApproval(account),
    approvedAccount: accountChanged ? null : existing?.approvedAccount ?? null,
    approvedAt: accountChanged ? null : existing?.approvedAt ?? null,
    approvalRequestedAt: accountChanged ? null : existing?.approvalRequestedAt ?? null,
    sentAt: existing?.sentAt ?? null,
    paidAt: null,
    paidAmount: 0,
    paymentReference: "",
    createdBy: existing?.createdBy || (await getSetting("cashier_name", "Counter")) || "Counter",
    deviceId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    syncState: "pending",
  };
  if (accountChanged && invoice.status === "rejected") invoice.status = "awaiting_approval";
  invoice.status = settleStatus(invoice, invoice.status === "sent" ? "sent" : "ready");

  await db.invoices.put(invoice);
  await rememberAccount(account);
  await logActivity({
    kind: "invoice",
    message: `${existing ? "Updated" : "Raised"} invoice ${invoice.invoiceNo}`,
    detail: [invoice.customerName, invoice.needsApproval ? `pay to ${invoice.accountName} — needs admin approval` : ""]
      .filter(Boolean)
      .join(" · "),
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
  if (!canShare(invoice) || invoice.status !== "ready") return invoice;
  return patchInvoice(invoice.id, { status: "sent", sentAt: invoice.sentAt ?? new Date().toISOString() });
}

export async function confirmInvoicePayment(
  invoice: Invoice,
  payment: { amount: number; reference: string; paidAt: string },
): Promise<Invoice> {
  if (!canShare(invoice)) throw new Error("Only an approved invoice can be marked as paid.");
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
/* Cloud: approval and email                                           */
/* ------------------------------------------------------------------ */

export interface MailStatus {
  emailReady: boolean;
  adminEmail: string;
  pendingAdminEmail: string;
}

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

export function getMailStatus(): Promise<MailStatus> {
  return callMail<MailStatus>({ action: "status" });
}

export function setAdminEmail(email: string): Promise<{ adminEmail: string; pending: boolean; pendingAdminEmail?: string }> {
  return callMail({ action: "set-admin-email", email });
}

/** Uploads the invoice, then has the cloud email the admin for approval. */
export async function requestApproval(invoice: Invoice): Promise<{ needed: boolean; sentTo?: string }> {
  const report = await syncNow();
  if (!report.ok) throw new Error(report.message);
  const result = await callMail<{ needed: boolean; status: InvoiceStatus; sentTo?: string }>({
    action: "request-approval",
    invoiceId: invoice.id,
  });
  if (result.needed) {
    // Asking again after a rejection puts the invoice back in the queue.
    const current = await getDb().invoices.get(invoice.id);
    if (current && current.status === "rejected") {
      await getDb().invoices.put({ ...current, status: "awaiting_approval", approvalRequestedAt: new Date().toISOString() });
    }
    await logActivity({
      kind: "invoice",
      message: `Asked the admin to approve invoice ${invoice.invoiceNo}`,
      detail: `${invoice.accountName} · ${invoice.bankName} ${invoice.accountNumber}`,
      referenceId: invoice.id,
    });
  }
  await syncNow();
  return result;
}

/** Pulls the latest approval decisions from the cloud. */
export async function refreshInvoices(): Promise<string> {
  const report = await syncNow();
  if (!report.ok) throw new Error(report.message);
  return report.message;
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
