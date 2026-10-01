// Emails invoices and payment confirmations to customers, with the PDF attached.
// Called by signed-in staff only.
import { corsHeaders, emailLayout, emailReady, escapeHtml, isEmail, json, naira, sendMail, serviceClient } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = serviceClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: "Sign in on the Settings page first." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  try {
    switch (body.action) {
      case "status":
        return json({ emailReady: emailReady() });

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
        if (invoice.status === "cancelled") return json({ error: "This invoice has been cancelled." }, 409);
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
