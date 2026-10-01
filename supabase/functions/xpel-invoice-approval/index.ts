// The admin's approve / reject link. No sign-in: the one-time token in the
// emailed link is the credential, and only its hash is stored.
import {
  corsHeaders,
  emailLayout,
  emailReady,
  escapeHtml,
  json,
  sendMail,
  serviceClient,
  setConfig,
  sha256Hex,
} from "../_shared/common.ts";

const LINK_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const id = String(body.id ?? "");
  const token = String(body.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || token.length < 20) return json({ error: "This link is not valid." }, 400);

  try {
    const admin = serviceClient();
    const { data: approval } = await admin.from("pos_invoice_approvals").select("*").eq("id", id).maybeSingle();
    if (!approval || approval.token_hash !== (await sha256Hex(token))) {
      return json({ error: "This link is not valid." }, 404);
    }

    let invoice: Record<string, unknown> | null = null;
    if (approval.kind === "invoice" && approval.invoice_id) {
      const { data } = await admin.from("pos_invoices").select("*").eq("id", approval.invoice_id).maybeSingle();
      invoice = data;
    }

    const expired = Date.now() - new Date(approval.created_at).getTime() > LINK_LIFETIME_MS;
    const decision = body.decision;

    if (decision === "approved" || decision === "rejected") {
      if (approval.decision) return json({ error: `This request was already ${approval.decision}.` }, 409);
      if (expired) return json({ error: "This link has expired. Ask the till to send a new request." }, 410);
      const decidedAt = new Date().toISOString();
      const { error } = await admin
        .from("pos_invoice_approvals")
        .update({ decision, decided_at: decidedAt })
        .eq("id", id)
        .is("decision", null);
      if (error) throw error;
      approval.decision = decision;
      approval.decided_at = decidedAt;

      if (approval.kind === "invoice" && invoice) {
        // Touching the row makes the guard trigger re-check it against this decision.
        const { data } = await admin
          .from("pos_invoices")
          .update({ updated_at: decidedAt })
          .eq("id", invoice.id)
          .select("*")
          .maybeSingle();
        invoice = data ?? invoice;
      }

      if (approval.kind === "admin-email" && decision === "approved") {
        const email = String((approval.payload as { email?: string })?.email ?? "");
        await setConfig(admin, "admin_email", email);
        if (emailReady()) {
          await sendMail({
            to: [email],
            subject: "You are the Xpel POS admin",
            html: emailLayout(
              "You are the Xpel POS admin",
              `<p>${escapeHtml(approval.admin_email)} handed over Xpel POS approvals to this address.</p>`,
            ),
          }).catch(() => {});
        }
      }
    }

    return json({
      kind: approval.kind,
      decision: approval.decision,
      decidedAt: approval.decided_at,
      expired: !approval.decision && expired,
      requestedBy: approval.requested_by,
      requestedAt: approval.created_at,
      newAdminEmail: approval.kind === "admin-email" ? (approval.payload as { email?: string })?.email ?? "" : undefined,
      // The invoice's account changed after this request was made: approving it no longer covers the invoice.
      superseded: Boolean(invoice && approval.account_key && invoice.needs_approval === true &&
        invoice.approved_account !== approval.account_key && approval.decision === "approved"),
      invoice: invoice
        ? {
            invoiceNo: invoice.invoice_no,
            status: invoice.status,
            customerName: invoice.customer_name,
            total: Number(invoice.total ?? 0),
            items: invoice.items,
            bankName: invoice.bank_name,
            accountNumber: invoice.account_number,
            accountName: invoice.account_name,
            issuedAt: invoice.issued_at,
          }
        : null,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
