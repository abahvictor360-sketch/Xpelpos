"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { XPEL_LOGO_DATA_URI } from "@/lib/brand-assets";
import { getSupabase } from "@/lib/supabase";
import { formatDateTime, formatMoney } from "@/lib/utils";

interface ApprovalView {
  kind: "invoice" | "admin-email";
  decision: "approved" | "rejected" | null;
  decidedAt: string | null;
  expired: boolean;
  requestedBy: string;
  requestedAt: string;
  newAdminEmail?: string;
  superseded: boolean;
  invoice: {
    invoiceNo: string;
    status: string;
    customerName: string;
    total: number;
    items: Array<{ name: string; quantity: number; unit?: string; lineTotal: number }>;
    bankName: string;
    accountNumber: string;
    accountName: string;
    issuedAt: string;
  } | null;
}

async function callApproval(body: Record<string, unknown>): Promise<ApprovalView> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("This app is not connected to the cloud.");
  const { data, error } = await supabase.functions.invoke("xpel-invoice-approval", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as ApprovalView;
}

/**
 * Opened from the admin's email: shows what is being asked and records the
 * admin's answer. Stands alone (no till menu) and needs no sign-in — the
 * one-time token in the link is the proof.
 */
export default function ApprovePage() {
  const [params, setParams] = useState<{ id: string; token: string } | null>(null);
  const [view, setView] = useState<ApprovalView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "load" | "approved" | "rejected">("load");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setParams({ id: search.get("id") ?? "", token: search.get("t") ?? "" });
  }, []);

  useEffect(() => {
    if (!params) return;
    callApproval({ id: params.id, token: params.token })
      .then(setView)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(""));
  }, [params]);

  const decide = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!params) return;
      setBusy(decision);
      setError("");
      try {
        setView(await callApproval({ id: params.id, token: params.token, decision }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setBusy("");
      }
    },
    [params],
  );

  const invoice = view?.invoice;

  return (
    <main className="min-h-screen bg-[var(--page)] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <img src={XPEL_LOGO_DATA_URI} alt="" className="h-11 w-11 rounded-xl bg-white p-1 shadow-card" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Xpel POS</p>
            <h1 className="text-lg font-bold text-ink-900">
              {view?.kind === "admin-email" ? "Change of admin email" : "Payment account approval"}
            </h1>
          </div>
        </div>

        <div className="card p-5">
          {busy === "load" && (
            <p className="flex items-center gap-2 text-sm text-ink-700/70">
              <Loader2 size={16} className="animate-spin" /> Loading the request…
            </p>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          {view && view.kind === "invoice" && invoice && (
            <>
              <p className="text-sm text-ink-700/75">
                <b>{view.requestedBy || "Staff"}</b> raised invoice <b>{invoice.invoiceNo}</b> asking the customer to pay
                into an account that is <b>not in Xpel&apos;s name</b>.
              </p>
              <div className="mt-4 rounded-2xl bg-brand-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Account to be paid</p>
                <p className="mt-1 text-base font-bold text-ink-900">{invoice.accountName}</p>
                <p className="text-sm text-ink-800">
                  {invoice.bankName} · <span className="font-bold tracking-wider">{invoice.accountNumber}</span>
                </p>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-700/60">Customer</dt>
                  <dd className="font-medium">{invoice.customerName || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-700/60">Amount</dt>
                  <dd className="font-bold tabular">{formatMoney(invoice.total)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-700/60">Requested</dt>
                  <dd>{formatDateTime(view.requestedAt)}</dd>
                </div>
              </dl>
              {invoice.items?.length > 0 && (
                <ul className="mt-3 divide-y divide-black/5 rounded-2xl border border-black/5 text-sm">
                  {invoice.items.map((item, index) => (
                    <li key={index} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {item.quantity} {item.unit === "carton" ? "ctn" : "×"} {item.name}
                      </span>
                      <span className="shrink-0 tabular">{formatMoney(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {view && view.kind === "admin-email" && (
            <p className="text-sm text-ink-700/75">
              <b>{view.requestedBy || "Staff"}</b> wants approval requests to go to <b>{view.newAdminEmail}</b> instead of
              you. Approve only if you know about this change.
            </p>
          )}

          {view && (
            <div className="mt-5">
              {view.decision ? (
                <p
                  className={
                    view.decision === "approved"
                      ? "flex items-center gap-2 rounded-2xl bg-olive-100 p-3 text-sm font-semibold text-olive-900"
                      : "flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700"
                  }
                >
                  {view.decision === "approved" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  {view.decision === "approved" ? "Approved" : "Rejected"}
                  {view.decidedAt ? ` · ${formatDateTime(view.decidedAt)}` : ""}
                </p>
              ) : view.expired ? (
                <p className="rounded-2xl bg-black/[0.04] p-3 text-sm text-ink-700/70">
                  This link has expired. The till can send a new request.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void decide("rejected")} disabled={Boolean(busy)} className="btn-ghost">
                    {busy === "rejected" ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Reject
                  </button>
                  <button onClick={() => void decide("approved")} disabled={Boolean(busy)} className="btn-primary">
                    {busy === "approved" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Approve
                  </button>
                </div>
              )}
              {view.superseded && (
                <p className="mt-3 text-xs text-ink-700/60">
                  The invoice&apos;s account has been changed since this request, so this approval no longer covers it.
                </p>
              )}
              {view.decision === "rejected" && view.kind === "invoice" && (
                <p className="mt-3 text-xs text-ink-700/60">
                  The invoice stays on hold. Staff can change the account or ask you again.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
