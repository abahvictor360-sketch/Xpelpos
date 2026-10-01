// Email for the till: invoices to customers, and payment-account approvals to the admin.
// Called by signed-in staff only.
import {
  DEFAULT_APP_URL,
  corsHeaders,
  emailLayout,
  emailReady,
  escapeHtml,
  getConfig,
  isEmail,
  json,
  naira,
  newToken,
  sendMail,
  serviceClient,
  setConfig,
  sha256Hex,
} from "../_shared/common.ts";

const SENDABLE = ["ready", "sent", "paid"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = serviceClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: "Sign in on the Settings page first." }, 401);
  const staff = user.email ?? "staff";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  try {
    const appUrl = (await getConfig(admin, "app_url")) || DEFAULT_APP_URL;

    switch (body.action) {
      case "status": {
        const adminEmail = await getConfig(admin, "admin_email");
        const { data: pending } = await admin
          .from("pos_invoice_approvals")
          .select("payload, created_at")
          .eq("kind", "admin-email")
          .is("decision", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return json({
          emailReady: emailReady(),
          adminEmail,
          pendingAdminEmail: (pending?.payload as { email?: string } | null)?.email ?? "",
        });
      }

      case "set-admin-email": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!isEmail(email)) return json({ error: "Enter a valid email address." }, 400);
        const current = await getConfig(admin, "admin_email");
        if (current === email) return json({ adminEmail: current, pending: false });

        if (!current) {
          await setConfig(admin, "admin_email", email);
          if (emailReady()) {
            await sendMail({
              to: [email],
              subject: "You are the Xpel POS admin",
              html: emailLayout(
                "You are the Xpel POS admin",
                `<p>${escapeHtml(staff)} set this address as the admin for Xpel POS. When an invoice asks to be paid into an account that is not in Xpel's name, the approval request comes here.</p>`,
              ),
            }).catch(() => {});
          }
          return json({ adminEmail: email, pending: false });
        }

        // Changing the admin needs the current admin's say-so, or anyone at the
        // till could send approvals to themselves.
        if (!emailReady()) {
          return json({ error: "Email is not set up yet, so the current admin cannot confirm the change." }, 503);
        }
        const token = newToken();
        const { data: row, error } = await admin
          .from("pos_invoice_approvals")
          .insert({
            kind: "admin-email",
            payload: { email },
            token_hash: await sha256Hex(token),
            admin_email: current,
            requested_by: staff,
          })
          .select("id")
          .single();
        if (error) throw error;
        const link = `${appUrl}/approve?id=${row.id}&t=${token}`;
        await sendMail({
          to: [current],
          subject: "Confirm the new Xpel POS admin email",
          html: emailLayout(
            "Change the admin email?",
            `<p>${escapeHtml(staff)} wants approval emails to go to <b>${escapeHtml(email)}</b> instead of you.</p>
<p><a href="${link}" style="display:inline-block;background:#cf6d1e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Review the change</a></p>
<p style="font-size:12px;color:#8a877f">If you did not expect this, open the link and reject it.</p>`,
          ),
        });
        return json({ adminEmail: current, pending: true, pendingAdminEmail: email });
      }

      case "request-approval": {
        const { data: invoice, error } = await admin
          .from("pos_invoices")
          .select("*")
          .eq("id", String(body.invoiceId ?? ""))
          .maybeSingle();
        if (error) throw error;
        if (!invoice) return json({ error: "Sync first — this invoice is not in the cloud yet." }, 404);
        if (!invoice.needs_approval || invoice.approved_account) {
          return json({ status: invoice.status, needed: false });
        }
        const adminEmail = await getConfig(admin, "admin_email");
        if (!adminEmail) return json({ error: "Set the admin email in Settings first." }, 412);
        if (!emailReady()) return json({ error: "Email is not set up yet: add the RESEND_API_KEY secret in Supabase." }, 503);

        const { data: key, error: keyError } = await admin.rpc("pos_invoice_account_key", {
          bank: invoice.bank_name,
          number: invoice.account_number,
          name: invoice.account_name,
        });
        if (keyError) throw keyError;
        const token = newToken();
        const { data: row, error: insertError } = await admin
          .from("pos_invoice_approvals")
          .insert({
            kind: "invoice",
            invoice_id: invoice.id,
            account_key: key,
            token_hash: await sha256Hex(token),
            admin_email: adminEmail,
            requested_by: staff,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        const link = `${appUrl}/approve?id=${row.id}&t=${token}`;
        const cell = "padding:6px 0;border-bottom:1px solid #eee";
        await sendMail({
          to: [adminEmail],
          subject: `Approve payment account on invoice ${invoice.invoice_no}`,
          html: emailLayout(
            `Invoice ${invoice.invoice_no} needs your approval`,
            `<p>${escapeHtml(staff)} raised an invoice asking the customer to pay into an account that is <b>not in Xpel's name</b>. It will not be sent until you approve it.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
<tr><td style="${cell};color:#8a877f">Customer</td><td style="${cell};text-align:right">${escapeHtml(invoice.customer_name || "—")}</td></tr>
<tr><td style="${cell};color:#8a877f">Amount</td><td style="${cell};text-align:right;font-weight:700">${naira(invoice.total)}</td></tr>
<tr><td style="${cell};color:#8a877f">Bank</td><td style="${cell};text-align:right">${escapeHtml(invoice.bank_name || "—")}</td></tr>
<tr><td style="${cell};color:#8a877f">Account number</td><td style="${cell};text-align:right;font-weight:700">${escapeHtml(invoice.account_number || "—")}</td></tr>
<tr><td style="${cell};color:#8a877f">Account name</td><td style="${cell};text-align:right;font-weight:700">${escapeHtml(invoice.account_name || "—")}</td></tr>
</table>
<p><a href="${link}" style="display:inline-block;background:#cf6d1e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Review and approve or reject</a></p>`,
          ),
        });
        const now = new Date().toISOString();
        await admin
          .from("pos_invoices")
          .update({ approval_requested_at: now, updated_at: now })
          .eq("id", invoice.id);
        return json({ status: "awaiting_approval", needed: true, sentTo: adminEmail });
      }

      case "send-invoice": {
        const to = String(body.to ?? "").trim();
        if (!isEmail(to)) return json({ error: "Enter the customer's email address." }, 400);
        const pdf = String(body.pdfBase64 ?? "");
        if (!pdf || pdf.length > 8_000_000) return json({ error: "The invoice PDF is missing or too large." }, 400);
        const { data: invoice, error } = await admin
          .from("pos_invoices")
          .select("*")
          .eq("id", String(body.invoiceId ?? ""))
          .maybeSingle();
        if (error) throw error;
        if (!invoice) return json({ error: "Sync first — this invoice is not in the cloud yet." }, 404);
        const payment = body.kind === "payment";
        if (payment && invoice.status !== "paid") {
          return json({ error: "Confirm the payment first, then send the confirmation." }, 409);
        }
        if (!SENDABLE.includes(invoice.status)) {
          const why = invoice.status === "awaiting_approval"
            ? "It is waiting for the admin to approve its payment account."
            : invoice.status === "rejected"
              ? "The admin rejected its payment account."
              : "It has been cancelled.";
          return json({ error: `This invoice cannot be sent. ${why}`, status: invoice.status }, 409);
        }
        if (!emailReady()) return json({ error: "Email is not set up yet: add the RESEND_API_KEY secret in Supabase." }, 503);

        const message = String(body.message ?? "").trim();
        const intro = message ? `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>` : "";
        await sendMail({
          to: [to],
          subject: payment
            ? `Payment received for invoice ${invoice.invoice_no} - Xpel Beauty`
            : `Invoice ${invoice.invoice_no} from Xpel Beauty`,
          html: payment
            ? emailLayout(
                "Payment received - thank you",
                `${intro}
<p>We have received <b>${naira(Number(invoice.paid_amount) || invoice.total)}</b> for invoice <b>${escapeHtml(invoice.invoice_no)}</b>${invoice.payment_reference ? ` (reference ${escapeHtml(invoice.payment_reference)})` : ""}. Your payment confirmation is attached.</p>`,
              )
            : emailLayout(
                `Invoice ${invoice.invoice_no}`,
                `${intro}
<p>Please find your invoice attached. Amount due: <b>${naira(invoice.total)}</b>.</p>
<p style="background:#f4f2ef;border-radius:12px;padding:12px;font-size:14px">Pay to<br><b>${escapeHtml(invoice.account_name)}</b><br>${escapeHtml(invoice.bank_name)} · <b>${escapeHtml(invoice.account_number)}</b><br><span style="color:#8a877f">Use ${escapeHtml(invoice.invoice_no)} as the narration.</span></p>`,
              ),
          attachments: [{ filename: String(body.filename || `Invoice-${invoice.invoice_no}.pdf`), content: pdf }],
        });
        const now = new Date().toISOString();
        if (!payment) {
          await admin
            .from("pos_invoices")
            .update({
              status: invoice.status === "ready" ? "sent" : invoice.status,
              sent_at: invoice.sent_at ?? now,
              customer_email: invoice.customer_email || to,
              updated_at: now,
            })
            .eq("id", invoice.id);
        }
        return json({ ok: true, sentTo: to });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
