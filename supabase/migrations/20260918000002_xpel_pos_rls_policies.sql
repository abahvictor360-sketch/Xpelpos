-- Signed-in staff can read and write POS data.
do $$
declare t text;
begin
  foreach t in array array['pos_products','pos_sales','pos_sale_items','pos_stock_movements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_auth_all', t);
  end loop;
end $$;
