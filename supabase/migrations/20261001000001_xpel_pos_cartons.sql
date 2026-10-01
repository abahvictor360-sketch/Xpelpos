-- Selling and stocking in cartons.
-- Stock stays counted in pieces; a product may also say how many pieces make a
-- carton and what a whole carton sells for, and a sale line records whether it
-- was sold in pieces or cartons.

alter table public.pos_products
  add column if not exists units_per_carton integer not null default 0,
  add column if not exists carton_price numeric(12,2) not null default 0;

alter table public.pos_sale_items
  add column if not exists unit text not null default 'pcs',
  add column if not exists pack_size integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_sale_items_unit_check'
  ) then
    alter table public.pos_sale_items
      add constraint pos_sale_items_unit_check check (unit in ('pcs', 'carton'));
  end if;
end $$;
