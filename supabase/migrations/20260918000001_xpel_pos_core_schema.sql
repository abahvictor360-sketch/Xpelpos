-- Xpel POS core schema
create table if not exists public.pos_products (
  id uuid primary key,
  sku text,
  name text not null,
  category text,
  brand text,
  price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  stock_qty integer not null default 0,
  low_stock_threshold integer not null default 5,
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pos_products_name_idx on public.pos_products (lower(name));
create index if not exists pos_products_updated_idx on public.pos_products (updated_at);

create table if not exists public.pos_sales (
  id uuid primary key,
  receipt_no text not null,
  sold_at timestamptz not null default now(),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('cash','transfer','card')),
  amount_paid numeric(12,2) not null default 0,
  change_due numeric(12,2) not null default 0,
  customer_name text,
  customer_phone text,
  note text,
  cashier_id uuid,
  cashier_name text,
  device_id text,
  status text not null default 'completed' check (status in ('completed','refunded','void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_sales_receipt_no_idx on public.pos_sales (receipt_no);
create index if not exists pos_sales_sold_at_idx on public.pos_sales (sold_at desc);

create table if not exists public.pos_sale_items (
  id uuid primary key,
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  product_id uuid,
  name text not null,
  sku text,
  unit_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  quantity integer not null default 1,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_sale_items_sale_idx on public.pos_sale_items (sale_id);

create table if not exists public.pos_stock_movements (
  id uuid primary key,
  product_id uuid not null,
  change_qty integer not null,
  reason text not null,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists pos_stock_movements_product_idx on public.pos_stock_movements (product_id);

alter table public.pos_products enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.pos_stock_movements enable row level security;
