-- Invoices, and the admin approval that guards payment accounts.
--
-- An invoice asks the customer to pay into a bank account. When that account's
-- name does not carry "Xpel", the admin must approve it by email before the
-- invoice can be sent. The guard lives here, in the database, so no till can
-- skip it: an unapproved invoice is always held at 'awaiting_approval'.

create table if not exists public.pos_invoices (
  id uuid primary key,
  invoice_no text not null,
  status text not null default 'ready'
    check (status in ('awaiting_approval','rejected','ready','sent','paid','cancelled')),
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  issued_at timestamptz not null default now(),
  due_date date,
  bank_name text,
  account_number text,
  account_name text,
  needs_approval boolean not null default false,
  approved_account text,
  approved_at timestamptz,
  approval_requested_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by text,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pos_invoices_no_idx on public.pos_invoices (invoice_no);
create index if not exists pos_invoices_updated_idx on public.pos_invoices (updated_at);

alter table public.pos_invoices enable row level security;
drop policy if exists pos_invoices_auth_all on public.pos_invoices;
create policy pos_invoices_auth_all on public.pos_invoices
  for all to authenticated using (true) with check (true);

-- Approval requests. Only the edge functions (service role) touch this table:
-- it holds hashes of the one-time links emailed to the admin.
create table if not exists public.pos_invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'invoice' check (kind in ('invoice','admin-email')),
  invoice_id uuid references public.pos_invoices(id) on delete cascade,
  account_key text,
  payload jsonb not null default '{}'::jsonb,
  token_hash text not null,
  admin_email text not null,
  requested_by text,
  decision text check (decision in ('approved','rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pos_invoice_approvals_invoice_idx
  on public.pos_invoice_approvals (invoice_id, created_at desc);

alter table public.pos_invoice_approvals enable row level security;

-- Server-side settings (the admin's email). No client policies: read and
-- written only through the edge functions.
create table if not exists public.pos_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.pos_config enable row level security;

-- The account an approval covers. Changing any part of it needs a new approval.
create or replace function public.pos_invoice_account_key(bank text, number text, name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(bank, ''), '\s+', ' ', 'g')) || '|' ||
         regexp_replace(coalesce(number, ''), '\D', '', 'g') || '|' ||
         lower(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'))
$$;

create or replace function public.pos_invoices_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text := public.pos_invoice_account_key(new.bank_name, new.account_number, new.account_name);
  latest record;
  before_status text := new.status;
begin
  new.needs_approval := coalesce(new.account_name, '') !~* 'xpel';

  if not new.needs_approval then
    new.approved_account := null;
    new.approved_at := null;
    if new.status in ('awaiting_approval', 'rejected') then
      new.status := 'ready';
    end if;
  else
    select decision, decided_at into latest
      from public.pos_invoice_approvals
     where kind = 'invoice' and invoice_id = new.id and account_key = key
     order by created_at desc
     limit 1;

    if found and latest.decision = 'approved' then
      new.approved_account := key;
      new.approved_at := latest.decided_at;
      if new.status in ('awaiting_approval', 'rejected') then
        new.status := 'ready';
      end if;
    else
      new.approved_account := null;
      new.approved_at := null;
      if new.status <> 'cancelled' then
        new.status := case when found and latest.decision = 'rejected'
                           then 'rejected' else 'awaiting_approval' end;
      end if;
    end if;
  end if;

  -- A status the guard changed must reach the till that sent the row, so it
  -- counts as a fresh change for the next pull.
  if new.status is distinct from before_status then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists pos_invoices_guard on public.pos_invoices;
create trigger pos_invoices_guard
  before insert or update on public.pos_invoices
  for each row execute function public.pos_invoices_guard();

revoke execute on function public.pos_invoices_guard() from public, anon, authenticated;
