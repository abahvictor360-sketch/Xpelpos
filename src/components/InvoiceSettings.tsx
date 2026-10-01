"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { toast } from "./Toaster";
import {
  DEFAULT_PAYMENT_ACCOUNTS,
  accountKey,
  accountNeedsApproval,
  getMailStatus,
  loadDefaultAccount,
  loadPaymentAccounts,
  sameAccount,
  savePaymentAccounts,
  setAdminEmail,
  setDefaultAccount,
  type MailStatus,
} from "@/lib/invoices";
import type { PaymentAccount } from "@/lib/types";
import { cx } from "@/lib/utils";

const EMPTY: PaymentAccount = { bankName: "", accountNumber: "", accountName: "" };

/** Settings → Invoices: who approves payment accounts, and the accounts invoices offer. */
export default function InvoiceSettings() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [defaultKey, setDefaultKey] = useState("");
  const [draft, setDraft] = useState<PaymentAccount>(EMPTY);

  const loadAccounts = useCallback(async () => {
    setAccounts(await loadPaymentAccounts());
    const chosen = await loadDefaultAccount();
    setDefaultKey(chosen ? accountKey(chosen) : "");
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const next = await getMailStatus();
      setStatus(next);
      setStatusError("");
      setEmail((current) => current || next.adminEmail);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadStatus();
  }, [loadAccounts, loadStatus]);

  const saveEmail = async () => {
    setSavingEmail(true);
    try {
      const result = await setAdminEmail(email);
      toast(
        result.pending
          ? `The current admin has been emailed to confirm the change to ${result.pendingAdminEmail}.`
          : `Approval requests now go to ${result.adminEmail}.`,
        "success",
      );
      await loadStatus();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSavingEmail(false);
    }
  };

  const addAccount = async () => {
    const account = {
      bankName: draft.bankName.trim(),
      accountNumber: draft.accountNumber.replace(/\s+/g, ""),
      accountName: draft.accountName.trim(),
    };
    if (!account.bankName || !account.accountNumber || !account.accountName) {
      toast("Enter the bank, account number and account name.", "error");
      return;
    }
    if (accounts.some((a) => sameAccount(a, account))) {
      toast("That account is already saved.", "info");
      return;
    }
    await savePaymentAccounts([...accounts, account]);
    if (!defaultKey) await setDefaultAccount(account);
    setDraft(EMPTY);
    await loadAccounts();
  };

  const removeAccount = async (account: PaymentAccount) => {
    await savePaymentAccounts(accounts.filter((a) => !sameAccount(a, account)));
    await loadAccounts();
  };

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <FileText size={15} /> Invoices
      </h2>

      <div className="mt-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-700/60">
          <ShieldCheck size={13} /> Admin approval email
        </h3>
        <p className="mt-1 text-xs text-ink-700/55">
          When an invoice asks to be paid into an account that is not in Xpel&apos;s name, this person gets an email to
          approve or reject it. Changing it later needs the current admin to confirm.
        </p>
        {statusError ? (
          <p className="mt-2 rounded-2xl bg-black/[0.03] px-3 py-2 text-xs text-ink-700/65">{statusError}</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input min-w-0 flex-1 basis-56"
                type="email"
                placeholder="admin@xpelbeauty.com"
                aria-label="Admin email"
              />
              <button onClick={() => void saveEmail()} disabled={savingEmail || !email.trim()} className="btn-dark">
                {savingEmail ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save
              </button>
            </div>
            {status && (
              <ul className="mt-2 space-y-1 text-xs">
                <li className={status.adminEmail ? "text-olive-800" : "text-amber-700"}>
                  {status.adminEmail ? `Approvals go to ${status.adminEmail}.` : "No admin email set yet."}
                </li>
                {status.pendingAdminEmail && (
                  <li className="text-amber-700">Waiting for the admin to confirm the change to {status.pendingAdminEmail}.</li>
                )}
                <li className={status.emailReady ? "text-olive-800" : "text-amber-700"}>
                  {status.emailReady
                    ? "Email sending is switched on."
                    : "Email sending is not switched on yet: add the RESEND_API_KEY secret to the Supabase project."}
                </li>
              </ul>
            )}
          </>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-700/60">Payment accounts</h3>
        <p className="mt-1 text-xs text-ink-700/55">
          Offered on every invoice. The starred one is filled in on new invoices.
        </p>
        <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/[0.06]">
          {accounts.length === 0 && <li className="px-3 py-3 text-sm text-ink-700/55">No accounts saved yet.</li>}
          {accounts.map((account) => {
            const key = accountKey(account);
            const builtIn = DEFAULT_PAYMENT_ACCOUNTS.some((a) => sameAccount(a, account));
            return (
              <li key={key} className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => void setDefaultAccount(account).then(loadAccounts)}
                  aria-label={`Use ${account.accountName} by default`}
                  className={cx("rounded-lg p-1", defaultKey === key ? "text-brand-500" : "text-ink-700/30 hover:text-ink-700/60")}
                >
                  <Star size={16} fill={defaultKey === key ? "currentColor" : "none"} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{account.accountName}</p>
                  <p className="text-xs text-ink-700/60">
                    {account.bankName} · {account.accountNumber}
                    {accountNeedsApproval(account) && <span className="ml-1 text-amber-700">· needs admin approval</span>}
                  </p>
                </div>
                {!builtIn && (
                  <button
                    onClick={() => void removeAccount(account)}
                    aria-label={`Remove ${account.accountName}`}
                    className="rounded-lg p-1 text-ink-700/45 hover:bg-black/5"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
          <input value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} className="input" placeholder="Bank" aria-label="New account bank" />
          <input value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} className="input tabular" placeholder="Account number" inputMode="numeric" aria-label="New account number" />
          <input value={draft.accountName} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} className="input" placeholder="Account name" aria-label="New account name" />
          <button onClick={() => void addAccount()} className="btn-ghost">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>
    </section>
  );
}
