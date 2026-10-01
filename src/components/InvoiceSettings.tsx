"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, KeyRound, Lock, Plus, Star, Trash2, Unlock } from "lucide-react";
import { toast } from "./Toaster";
import {
  accountKey,
  addPaymentAccount,
  checkAdminPin,
  hasAdminPin,
  isBuiltInAccount,
  loadDefaultAccount,
  loadPaymentAccounts,
  removePaymentAccount,
  setAdminPin,
  setDefaultAccount,
} from "@/lib/invoices";
import type { PaymentAccount } from "@/lib/types";
import { cx } from "@/lib/utils";

const EMPTY: PaymentAccount = { bankName: "", accountNumber: "", accountName: "" };

/**
 * Settings → Invoices: the bank accounts invoices can be paid into. Anyone can
 * see them; only the admin, with the admin PIN, can add, remove or change the
 * default.
 */
export default function InvoiceSettings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [defaultKey, setDefaultKey] = useState("");
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [unlockedPin, setUnlockedPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [draft, setDraft] = useState<PaymentAccount>(EMPTY);
  const unlocked = Boolean(unlockedPin);

  const load = useCallback(async () => {
    setAccounts(await loadPaymentAccounts());
    setDefaultKey(accountKey(await loadDefaultAccount()));
    setPinSet(await hasAdminPin());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const attempt = async (task: () => Promise<void>, done?: string) => {
    try {
      await task();
      if (done) toast(done, "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const unlock = () =>
    attempt(async () => {
      if (!(await checkAdminPin(pin))) throw new Error("Wrong admin PIN.");
      setUnlockedPin(pin);
      setPin("");
    });

  const createPin = () =>
    attempt(async () => {
      await setAdminPin(newPin);
      setUnlockedPin(newPin.trim());
      setNewPin("");
    }, "Admin PIN set. Keep it to yourself — it is needed to change payment accounts.");

  const changePin = () =>
    attempt(async () => {
      await setAdminPin(newPin, unlockedPin);
      setUnlockedPin(newPin.trim());
      setNewPin("");
    }, "Admin PIN changed.");

  const add = () =>
    attempt(async () => {
      await addPaymentAccount(draft, unlockedPin);
      setDraft(EMPTY);
    }, "Payment account added.");

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <FileText size={15} /> Invoices — payment accounts
        </h2>
        {unlocked ? (
          <button onClick={() => setUnlockedPin("")} className="chip bg-olive-100 text-olive-900">
            <Unlock size={13} /> Admin unlocked · Lock
          </button>
        ) : (
          <span className="chip bg-black/[0.04] text-ink-700/70">
            <Lock size={13} /> Admin only
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-700/55">
        Invoices are paid into one of these accounts. Staff choose from the list; only the admin can add an account
        number, remove one, or change which is starred as the default.
      </p>

      <ul className="mt-3 divide-y divide-black/5 rounded-2xl border border-black/[0.06]">
        {accounts.map((account) => {
          const key = accountKey(account);
          const isDefault = defaultKey === key;
          return (
            <li key={key} className="flex items-center gap-2 px-3 py-2.5">
              <button
                onClick={() => unlocked && void attempt(() => setDefaultAccount(account, unlockedPin), "Default account changed.")}
                disabled={!unlocked}
                aria-label={`Use ${account.accountName} by default`}
                className={cx("rounded-lg p-1", isDefault ? "text-brand-500" : "text-ink-700/30", unlocked && !isDefault && "hover:text-ink-700/60")}
              >
                <Star size={16} fill={isDefault ? "currentColor" : "none"} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{account.accountName}</p>
                <p className="text-xs text-ink-700/60">
                  {account.bankName} · <span className="tabular font-semibold">{account.accountNumber}</span>
                  {isDefault && <span className="ml-1 text-brand-700">· default</span>}
                  {isBuiltInAccount(account) && <span className="ml-1">· Xpel</span>}
                </p>
              </div>
              {unlocked && !isBuiltInAccount(account) && (
                <button
                  onClick={() => void attempt(() => removePaymentAccount(account, unlockedPin), "Account removed.")}
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

      {pinSet === false && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <KeyRound size={14} /> Set the admin PIN
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80">The admin chooses a PIN once; it is then needed to change accounts.</p>
          <div className="mt-2 flex gap-2">
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="input min-w-0 flex-1"
              type="password"
              inputMode="numeric"
              placeholder="4–8 digits"
              aria-label="New admin PIN"
            />
            <button onClick={() => void createPin()} className="btn-dark">
              Set PIN
            </button>
          </div>
        </div>
      )}

      {pinSet && !unlocked && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="input min-w-0 flex-1"
            type="password"
            inputMode="numeric"
            placeholder="Admin PIN"
            aria-label="Admin PIN"
          />
          <button type="submit" className="btn-dark">
            <Unlock size={16} /> Unlock
          </button>
        </form>
      )}

      {unlocked && (
        <div className="mt-3 space-y-3 rounded-2xl bg-black/[0.025] p-3">
          <p className="text-xs font-semibold text-ink-900">Add an account</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} className="input" placeholder="Bank" aria-label="New account bank" />
            <input value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} className="input tabular" placeholder="10-digit account number" inputMode="numeric" maxLength={10} aria-label="New account number" />
            <input value={draft.accountName} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} className="input" placeholder="Account name" aria-label="New account name" />
            <button onClick={() => void add()} className="btn-dark">
              <Plus size={16} /> Add account
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="input min-w-0 flex-1"
              type="password"
              inputMode="numeric"
              placeholder="New admin PIN"
              aria-label="Change admin PIN"
            />
            <button onClick={() => void changePin()} disabled={!newPin.trim()} className="btn-ghost">
              <KeyRound size={16} /> Change PIN
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
