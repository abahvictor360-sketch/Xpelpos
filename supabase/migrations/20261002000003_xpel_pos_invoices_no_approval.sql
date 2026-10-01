-- Payment accounts no longer go to the admin for approval by email: only the
-- admin can add an account in the first place (behind the admin PIN on the
-- till). Remove the approval guard and its tables, and release any invoice it
-- was holding.
drop trigger if exists pos_invoices_guard on public.pos_invoices;
drop function if exists public.pos_invoices_guard();
drop function if exists public.pos_invoice_account_key(text, text, text);
drop table if exists public.pos_invoice_approvals;
drop table if exists public.pos_config;

update public.pos_invoices
   set status = 'ready', updated_at = now()
 where status in ('awaiting_approval', 'rejected');
