-- Payment confirmation on invoices: what was received, and the bank reference.
alter table public.pos_invoices
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists payment_reference text;
