-- Coupons / promo codes
create table if not exists public.pos_coupons (
  id uuid primary key,
  code text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null default 0,
  min_spend numeric(12,2) not null default 0,
  max_discount numeric(12,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer not null default 0,
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists pos_coupons_code_idx on public.pos_coupons (upper(code));

-- Customers
create table if not exists public.pos_customers (
  id uuid primary key,
  name text not null,
  phone text,
  email text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pos_customers_phone_idx on public.pos_customers (phone);

-- Till shifts / cash-up
create table if not exists public.pos_shifts (
  id uuid primary key,
  cashier_name text,
  device_id text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_float numeric(12,2) not null default 0,
  counted_cash numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  variance numeric(12,2) not null default 0,
  cash_total numeric(12,2) not null default 0,
  transfer_total numeric(12,2) not null default 0,
  card_total numeric(12,2) not null default 0,
  sales_count integer not null default 0,
  note text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_shifts_opened_idx on public.pos_shifts (opened_at desc);

-- Link sales to a coupon, customer and shift
alter table public.pos_sales add column if not exists coupon_code text;
alter table public.pos_sales add column if not exists customer_id uuid;
alter table public.pos_sales add column if not exists shift_id uuid;

alter table public.pos_coupons enable row level security;
alter table public.pos_customers enable row level security;
alter table public.pos_shifts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pos_coupons','pos_customers','pos_shifts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_auth_all', t);
  end loop;
end $$;
