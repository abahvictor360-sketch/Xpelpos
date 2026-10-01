"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, BadgeCheck, Clock, Download, Loader2, Mail, MessageCircle, Pencil, Printer, Send } from "lucide-react";
import Modal from "./Modal";
import InvoiceSheet from "./InvoiceSheet";
import { toast } from "./Toaster";
import {
  STATUS_LABEL,
  STATUS_TONE,
  canShare,
  cancelInvoice,
  checkAdminPin,
  hasAdminPin,
  confirmInvoicePayment,
  emailInvoice,
  markInvoiceSent,
  whatsappNumber,
} from "@/lib/invoices";
import { buildInvoicePdf, downloadBlob, invoiceFilename, type InvoiceDocumentKind } from "@/lib/invoice-pdf";
import { printInvoice } from "@/lib/printing";
import { useStoreProfile } from "@/lib/store-profile";
import type { Invoice } from "@/lib/types";
import { cx, formatDateTime, formatMoney } from "@/lib/utils";

interface Props {
  invoice: Invoice;
  onClose: () => void;
  /** Called with the admin PIN once it has been checked. */
  onEdit: (adminPin: string) => void;
}

type Busy = "" | "whatsapp" | "email" | "download" | "print" | "pay" | "cancel";

/** One invoice: the A4 preview, where it stands, and everything that can be done with it. */
export default function InvoiceDetail({ invoice, onClose, onEdit }: Props) {
  const store = useStoreProfile();
  const [busy, setBusy] = useState<Busy>("");
  const [emailing, setEmailing] = useState<InvoiceDocumentKind | null>(null);
  const [paying, setPaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const shareable = canShare(invoice);
  const paid = invoice.status === "paid";
  const docKind: InvoiceDocumentKind = paid ? "payment" : "invoice";
  const editable = invoice.status !== "cancelled";
  const [askingPin, setAskingPin] = useState(false);

  useEffect(() => setMounted(true), []);

  const run = async (what: Busy, task: () => Promise<void>) => {
    setBusy(what);
    try {
      await task();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy("");
    }
  };

  const message = (kind: InvoiceDocumentKind) =>
    kind === "payment"
      ? `Hello ${invoice.customerName || ""}, thank you! We have received ${formatMoney(invoice.paidAmount || invoice.total)} for invoice ${invoice.invoiceNo}. Your payment confirmation is attached. — ${store.name}`
      : `Hello ${invoice.customerName || ""}, here is invoice ${invoice.invoiceNo} from ${store.name} for ${formatMoney(invoice.total)}.\n\nPay to: ${invoice.accountName}\n${invoice.bankName} · ${invoice.accountNumber}\nNarration: ${invoice.invoiceNo}\n\n${[store.phone, store.website].filter(Boolean).join(" · ")}`;

  const shareWhatsApp = () =>
    run("whatsapp", async () => {
      const pdf = await buildInvoicePdf(invoice, docKind);
      const filename = invoiceFilename(invoice, docKind);
      const file = new File([pdf], filename, { type: "application/pdf" });
      const text = message(docKind);
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      // Phones: share the PDF itself straight into WhatsApp.
      if (nav.canShare?.({ files: [file] }) && /android|iphone|ipad/i.test(navigator.userAgent)) {
        try {
          await nav.share({ files: [file], text, title: filename });
          if (!paid) await markInvoiceSent(invoice);
          return;
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
        }
      }
      // Computers: save the PDF and open the chat, so it can be attached there.
      downloadBlob(pdf, filename);
      const number = whatsappNumber(invoice.customerPhone);
      const url = `https://wa.me/${number}?text=${encodeURIComponent(`${text}\n\n(PDF attached: ${filename})`)}`;
      window.open(url, "_blank", "noopener");
      toast("PDF saved — attach it in the WhatsApp chat that just opened.", "info");
      if (!paid) await markInvoiceSent(invoice);
    });

  const download = () =>
    run("download", async () => {
      downloadBlob(await buildInvoicePdf(invoice, docKind), invoiceFilename(invoice, docKind));
    });

  const print = () =>
    run("print", async () => {
      const result = await printInvoice();
      if (!result.ok && result.reason && result.reason !== "cancelled") toast(`Printing failed: ${result.reason}`, "error");
    });

  const cancel = () =>
    run("cancel", async () => {
      if (!window.confirm(`Cancel invoice ${invoice.invoiceNo}? It cannot be sent or paid after this.`)) return;
      await cancelInvoice(invoice);
      toast(`Invoice ${invoice.invoiceNo} cancelled.`, "info");
    });

  return (
    <>
      <Modal title={`Invoice ${invoice.invoiceNo}`} onClose={onClose} size="lg">
        <div className="space-y-4">
          <StatusBanner invoice={invoice} />

          <div className="flex flex-wrap gap-2">
            {shareable && (
              <>
                <button onClick={() => void shareWhatsApp()} disabled={Boolean(busy)} className="btn-primary">
                  {busy === "whatsapp" ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                  WhatsApp
                </button>
                <button onClick={() => setEmailing(docKind)} disabled={Boolean(busy)} className="btn-ghost">
                  <Mail size={16} /> Email
                </button>
                <button onClick={() => void download()} disabled={Boolean(busy)} className="btn-ghost">
                  {busy === "download" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download PDF
                </button>
                <button onClick={() => void print()} disabled={Boolean(busy)} className="btn-ghost">
                  <Printer size={16} /> Print (A4)
                </button>
              </>
            )}
            {shareable && !paid && (
              <button onClick={() => setPaying(true)} disabled={Boolean(busy)} className="btn-dark">
                <BadgeCheck size={16} /> Confirm payment
              </button>
            )}
            {editable && (
              <button onClick={() => setAskingPin(true)} disabled={Boolean(busy)} className="btn-ghost">
                <Pencil size={16} /> Edit (admin)
              </button>
            )}
            {editable && !paid && (
              <button onClick={() => void cancel()} disabled={Boolean(busy)} className="btn-ghost text-red-700">
                <Ban size={16} /> Cancel invoice
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-black/[0.02] p-2 sm:p-4">
            <div className="relative min-w-[560px]">
              <InvoiceSheet invoice={invoice} className="rounded-xl p-6 shadow-card" />
              {invoice.status === "cancelled" && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/50">
                  <span className="rotate-[-12deg] rounded-xl border-4 border-red-600/60 px-4 py-1 text-2xl font-black uppercase tracking-widest text-red-700/70">
                    Cancelled
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {mounted &&
        shareable &&
        createPortal(
          <div className="print-invoice-root">
            <InvoiceSheet invoice={invoice} />
          </div>,
          document.body,
        )}

      {emailing && (
        <EmailInvoice invoice={invoice} kind={emailing} defaultMessage={message(emailing)} onClose={() => setEmailing(null)} />
      )}
      {paying && <ConfirmPayment invoice={invoice} onClose={() => setPaying(false)} />}
      {askingPin && (
        <AdminPinPrompt
          onClose={() => setAskingPin(false)}
          onUnlocked={(pin) => {
            setAskingPin(false);
            onEdit(pin);
          }}
        />
      )}
    </>
  );
}

function StatusBanner({ invoice }: { invoice: Invoice }) {
  const tone = STATUS_TONE[invoice.status];
  let text = "";
  let Icon = Clock;
  switch (invoice.status) {
    case "ready":
      Icon = BadgeCheck;
      text = `${formatMoney(invoice.total)} due${invoice.dueDate ? ` by ${new Date(invoice.dueDate).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}` : ""}. Send it by WhatsApp or email, or print it on A4.`;
      break;
    case "sent":
      Icon = Send;
      text = `Sent${invoice.sentAt ? ` ${formatDateTime(invoice.sentAt)}` : ""} · waiting for payment. When the money arrives, tap Confirm payment.`;
      break;
    case "paid":
      Icon = BadgeCheck;
      text = `Paid ${invoice.paidAt ? formatDateTime(invoice.paidAt) : ""} · ${formatMoney(invoice.paidAmount || invoice.total)} received${invoice.paymentReference ? ` (ref ${invoice.paymentReference})` : ""}. Send the customer their payment confirmation.`;
      break;
    case "cancelled":
      Icon = Ban;
      text = "This invoice was cancelled.";
      break;
  }
  return (
    <div className={cx("flex items-start gap-2 rounded-2xl p-3 text-sm", tone)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-bold">{STATUS_LABEL[invoice.status]}</p>
        <p className="opacity-90">{text}</p>
      </div>
    </div>
  );
}

function EmailInvoice({
  invoice,
  kind,
  defaultMessage,
  onClose,
}: {
  invoice: Invoice;
  kind: InvoiceDocumentKind;
  defaultMessage: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState(invoice.customerEmail);
  const [text, setText] = useState(defaultMessage);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const pdf = await buildInvoicePdf(invoice, kind);
      await emailInvoice(invoice, { to: to.trim(), message: text, pdf, filename: invoiceFilename(invoice, kind), kind });
      toast(`Emailed to ${to.trim()}.`, "success");
      onClose();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      toast(`${reason} You can download the PDF and send it yourself.`, "error");
    } finally {
      setSending(false);
    }
  };

  const mailto = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(
    kind === "payment" ? `Payment received — invoice ${invoice.invoiceNo}` : `Invoice ${invoice.invoiceNo} from Xpel Beauty`,
  )}&body=${encodeURIComponent(text)}`;

  return (
    <Modal
      title={kind === "payment" ? "Email the payment confirmation" : "Email the invoice"}
      onClose={onClose}
      footer={
        <>
          <a
            href={mailto}
            onClick={() => void buildInvoicePdf(invoice, kind).then((pdf) => downloadBlob(pdf, invoiceFilename(invoice, kind)))}
            className="btn-ghost flex-1"
          >
            Use my email app
          </a>
          <button onClick={() => void send()} disabled={sending || !to.trim()} className="btn-primary flex-1">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} className="input" type="email" placeholder="customer@example.com" />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} className="input min-h-[140px]" />
        </label>
        <p className="text-xs text-ink-700/55">
          The PDF is attached automatically. “Use my email app” saves the PDF and opens your own email, for you to attach it.
        </p>
      </div>
    </Modal>
  );
}

function ConfirmPayment({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [amount, setAmount] = useState(String(invoice.total));
  const [reference, setReference] = useState("");
  const [when, setWhen] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await confirmInvoicePayment(invoice, {
        amount: Number(amount) || 0,
        reference,
        paidAt: new Date(when).toISOString(),
      });
      toast(`Invoice ${invoice.invoiceNo} marked as paid. Send the customer their confirmation.`, "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Confirm payment"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost flex-1">
            Not yet
          </button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary flex-1">
            <BadgeCheck size={16} /> Mark as paid
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-700/70">
          Check the money is in <b>{invoice.accountName}</b> ({invoice.bankName} {invoice.accountNumber}) before confirming.
        </p>
        <label className="block">
          <span className="label">Amount received (₦)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="input tabular" inputMode="decimal" />
        </label>
        <label className="block">
          <span className="label">Transfer reference</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="From the bank alert (optional)" />
        </label>
        <label className="block">
          <span className="label">Received on</span>
          <input value={when} onChange={(e) => setWhen(e.target.value)} className="input" type="datetime-local" />
        </label>
      </div>
    </Modal>
  );
}

function AdminPinPrompt({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void hasAdminPin().then(setPinSet);
  }, []);

  const submit = async () => {
    setChecking(true);
    try {
      if (await checkAdminPin(pin)) onUnlocked(pin.trim());
      else toast("Wrong admin PIN.", "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal title="Admin PIN" size="sm" onClose={onClose}>
      {pinSet === false ? (
        <p className="text-sm text-ink-700/70">
          Only the admin can edit invoices. Set the admin PIN first in Settings → Invoices.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-ink-700/70">Only the admin can edit invoices. Enter the admin PIN to continue.</p>
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="input"
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Admin PIN"
            aria-label="Admin PIN to edit"
          />
          <button type="submit" disabled={checking || !pin.trim()} className="btn-primary w-full">
            <Pencil size={16} /> Edit invoice
          </button>
        </form>
      )}
    </Modal>
  );
}
