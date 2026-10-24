-- Table-wise dine-in and takeaway billing.
-- Apply this migration in Supabase SQL Editor after reviewing it for your environment.

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants(id) on delete cascade,
  table_number text not null,
  capacity integer not null default 4 check (capacity between 1 and 50),
  is_reserved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

create table if not exists public.table_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete restrict,
  order_type text not null check (order_type in ('dine_in','takeaway')),
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  customer_name text not null default 'Walk-in Customer',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_method text check (payment_method in ('cash','upi','card','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((order_type = 'dine_in' and table_id is not null) or (order_type = 'takeaway' and table_id is null))
);

create unique index if not exists table_orders_one_open_dinein_per_table
  on public.table_orders(restaurant_id, table_id)
  where status = 'open' and order_type = 'dine_in';

create index if not exists table_orders_restaurant_status_idx
  on public.table_orders(restaurant_id, status, created_at desc);

create table if not exists public.table_order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_restaurant_id()
    references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.table_orders(id) on delete cascade,
  menu_item_id bigint not null,
  item_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  food_type text,
  created_at timestamptz not null default now()
);

create index if not exists table_order_items_order_idx
  on public.table_order_items(restaurant_id, order_id);

alter table public.invoices
  add column if not exists order_type text not null default 'takeaway'
    check (order_type in ('dine_in','takeaway')),
  add column if not exists table_id uuid references public.restaurant_tables(id) on delete set null,
  add column if not exists payment_method text
    check (payment_method in ('cash','upi','card','other')),
  add column if not exists payment_status text not null default 'paid'
    check (payment_status in ('paid','refunded'));

alter table public.restaurant_tables enable row level security;
alter table public.table_orders enable row level security;
alter table public.table_order_items enable row level security;

grant select, insert, update, delete on public.restaurant_tables to authenticated;
grant select on public.table_orders, public.table_order_items to authenticated;

drop policy if exists restaurant_tables_tenant_select on public.restaurant_tables;
create policy restaurant_tables_tenant_select on public.restaurant_tables
  for select to authenticated using (restaurant_id = public.current_restaurant_id());
drop policy if exists restaurant_tables_tenant_insert on public.restaurant_tables;
create policy restaurant_tables_tenant_insert on public.restaurant_tables
  for insert to authenticated with check (restaurant_id = public.current_restaurant_id());
drop policy if exists restaurant_tables_tenant_update on public.restaurant_tables;
create policy restaurant_tables_tenant_update on public.restaurant_tables
  for update to authenticated using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
drop policy if exists restaurant_tables_tenant_delete on public.restaurant_tables;
create policy restaurant_tables_tenant_delete on public.restaurant_tables
  for delete to authenticated using (restaurant_id = public.current_restaurant_id());

drop policy if exists table_orders_tenant_select on public.table_orders;
create policy table_orders_tenant_select on public.table_orders
  for select to authenticated using (restaurant_id = public.current_restaurant_id());
drop policy if exists table_orders_tenant_insert on public.table_orders;
create policy table_orders_tenant_insert on public.table_orders
  for insert to authenticated with check (
    restaurant_id = public.current_restaurant_id()
    and (table_id is null or exists (
      select 1 from public.restaurant_tables t
      where t.id = table_id and t.restaurant_id = public.current_restaurant_id()
    ))
  );
drop policy if exists table_orders_tenant_update on public.table_orders;
create policy table_orders_tenant_update on public.table_orders
  for update to authenticated using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

drop policy if exists table_order_items_tenant_select on public.table_order_items;
create policy table_order_items_tenant_select on public.table_order_items
  for select to authenticated using (
    restaurant_id = public.current_restaurant_id()
    and exists (select 1 from public.table_orders o
      where o.id = order_id and o.restaurant_id = public.current_restaurant_id())
  );
drop policy if exists table_order_items_tenant_insert on public.table_order_items;
create policy table_order_items_tenant_insert on public.table_order_items
  for insert to authenticated with check (
    restaurant_id = public.current_restaurant_id()
    and exists (select 1 from public.table_orders o
      where o.id = order_id and o.restaurant_id = public.current_restaurant_id() and o.status = 'open')
  );
drop policy if exists table_order_items_tenant_update on public.table_order_items;
create policy table_order_items_tenant_update on public.table_order_items
  for update to authenticated using (
    restaurant_id = public.current_restaurant_id()
    and exists (select 1 from public.table_orders o
      where o.id = order_id and o.restaurant_id = public.current_restaurant_id() and o.status = 'open')
  ) with check (restaurant_id = public.current_restaurant_id());
drop policy if exists table_order_items_tenant_delete on public.table_order_items;
create policy table_order_items_tenant_delete on public.table_order_items
  for delete to authenticated using (
    restaurant_id = public.current_restaurant_id()
    and exists (select 1 from public.table_orders o
      where o.id = order_id and o.restaurant_id = public.current_restaurant_id() and o.status = 'open')
  );

create or replace function public.start_pos_order(
  p_order_type text,
  p_table_id uuid default null,
  p_customer_name text default 'Walk-in Customer'
)
returns public.table_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
  v_order public.table_orders;
begin
  if v_restaurant_id is null then raise exception 'Active restaurant membership is required.'; end if;
  if p_order_type not in ('dine_in','takeaway') then raise exception 'Invalid order type.'; end if;
  if p_order_type = 'dine_in' then
    if p_table_id is null or not exists (
      select 1 from public.restaurant_tables t
      where t.id = p_table_id and t.restaurant_id = v_restaurant_id
    ) then raise exception 'Select a valid table for dine-in.'; end if;
    select * into v_order from public.table_orders
      where restaurant_id = v_restaurant_id and table_id = p_table_id
        and order_type = 'dine_in' and status = 'open'
      limit 1;
    if found then return v_order; end if;
  elsif p_table_id is not null then
    raise exception 'Takeaway orders cannot be linked to a table.';
  end if;

  insert into public.table_orders(restaurant_id, table_id, order_type, customer_name)
  values (v_restaurant_id, p_table_id, p_order_type,
    coalesce(nullif(trim(p_customer_name), ''), 'Walk-in Customer'))
  returning * into v_order;
  return v_order;
exception
  when unique_violation then
    select * into v_order from public.table_orders
      where restaurant_id = v_restaurant_id and table_id = p_table_id
        and order_type = 'dine_in' and status = 'open'
      limit 1;
    if found then return v_order; end if;
    raise;
end;
$$;

create or replace function public.add_pos_order_item(
  p_order_id uuid,
  p_menu_item_id bigint,
  p_quantity integer default 1
)
returns public.table_order_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
  v_order public.table_orders;
  v_menu public.menu_items;
  v_item public.table_order_items;
begin
  if v_restaurant_id is null then raise exception 'Active restaurant membership is required.'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then raise exception 'Quantity must be between 1 and 999.'; end if;
  select * into v_order from public.table_orders
    where id = p_order_id and restaurant_id = v_restaurant_id and status = 'open'
    for update;
  if not found then raise exception 'Open order not found.'; end if;

  select * into v_menu from public.menu_items
    where id = p_menu_item_id and restaurant_id = v_restaurant_id and is_active = true;
  if not found then raise exception 'Menu item is unavailable.'; end if;

  insert into public.table_order_items(restaurant_id, order_id, menu_item_id, item_name, quantity, unit_price, food_type)
  values (v_restaurant_id, v_order.id, v_menu.id, v_menu.name, p_quantity, v_menu.price, v_menu.food_type)
  returning * into v_item;
  update public.table_orders set updated_at = now() where id = v_order.id;
  return v_item;
end;
$$;

create or replace function public.settle_pos_order(
  p_order_id uuid,
  p_invoice_number text,
  p_payment_method text
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
  v_order public.table_orders;
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_invoice public.invoices;
  v_invoice_limit bigint := public.get_feature_limit('daily_invoice_limit');
begin
  if v_restaurant_id is null then raise exception 'Active restaurant membership is required.'; end if;
  if p_payment_method not in ('cash','upi','card','other') then raise exception 'Select a valid payment method.'; end if;
  select * into v_order from public.table_orders
    where id = p_order_id and restaurant_id = v_restaurant_id and status = 'open'
    for update;
  if not found then raise exception 'Open order not found or already settled.'; end if;

  if not exists (select 1 from public.table_order_items i where i.order_id = v_order.id and i.restaurant_id = v_restaurant_id) then
    raise exception 'Add at least one item before settling the bill.';
  end if;
  if not public.has_feature('billing') then raise exception 'Billing is not available on the current plan.'; end if;
  if v_invoice_limit is not null and (
    select count(*) from public.invoices
    where restaurant_id = v_restaurant_id
      and invoice_date >= current_date
      and invoice_date < current_date + interval '1 day'
  ) >= v_invoice_limit then
    raise exception 'Daily invoice limit reached for your plan (% invoices/day).', v_invoice_limit;
  end if;

  select round(coalesce(sum(line_total), 0), 2) into v_subtotal
    from public.table_order_items where order_id = v_order.id and restaurant_id = v_restaurant_id;
  v_tax := round(v_subtotal * 0.05, 2);
  v_total := v_subtotal + v_tax;

  insert into public.invoices(
    restaurant_id, invoice_number, customer_name, subtotal, tax, total,
    order_type, table_id, payment_method, payment_status
  )
  values (
    v_restaurant_id, p_invoice_number, v_order.customer_name, v_subtotal, v_tax, v_total,
    v_order.order_type, v_order.table_id, p_payment_method, 'paid'
  )
  returning * into v_invoice;

  insert into public.invoice_items(
    restaurant_id, invoice_id, menu_item_id, item_name, quantity, unit_price, line_total, food_type
  )
  select v_restaurant_id, v_invoice.id, i.menu_item_id, i.item_name, i.quantity, i.unit_price, i.line_total, i.food_type
  from public.table_order_items i
  where i.order_id = v_order.id and i.restaurant_id = v_restaurant_id;

  update public.table_orders set status = 'paid', payment_method = p_payment_method,
    invoice_id = v_invoice.id, updated_at = now()
  where id = v_order.id;

  return v_invoice;
end;
$$;

create or replace function public.remove_pos_order_item(p_order_id uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
begin
  if v_restaurant_id is null then raise exception 'Active restaurant membership is required.'; end if;
  if not exists (
    select 1 from public.table_orders
    where id = p_order_id and restaurant_id = v_restaurant_id and status = 'open'
  ) then raise exception 'Open order not found.'; end if;
  delete from public.table_order_items
  where id = p_item_id and order_id = p_order_id and restaurant_id = v_restaurant_id;
  if not found then raise exception 'Order item not found.'; end if;
end;
$func$;

create or replace function public.update_pos_order_customer(p_order_id uuid, p_customer_name text)
returns public.table_orders
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
  v_order public.table_orders;
begin
  if v_restaurant_id is null then raise exception 'Active restaurant membership is required.'; end if;
  update public.table_orders
    set customer_name = coalesce(nullif(trim(p_customer_name), ''), 'Walk-in Customer'),
        updated_at = now()
    where id = p_order_id and restaurant_id = v_restaurant_id and status = 'open'
    returning * into v_order;
  if not found then raise exception 'Open order not found.'; end if;
  return v_order;
end;
$func$;

-- Business-critical order writes must go through the validated RPCs, not direct table writes.
revoke insert, update, delete on public.table_orders from authenticated;
revoke insert, update, delete on public.table_order_items from authenticated;

revoke all on function public.start_pos_order(text, uuid, text) from public;
revoke all on function public.add_pos_order_item(uuid, bigint, integer) from public;
revoke all on function public.settle_pos_order(uuid, text, text) from public;
revoke all on function public.remove_pos_order_item(uuid, uuid) from public;
revoke all on function public.update_pos_order_customer(uuid, text) from public;
grant execute on function public.start_pos_order(text, uuid, text) to authenticated;
grant execute on function public.add_pos_order_item(uuid, bigint, integer) to authenticated;
grant execute on function public.settle_pos_order(uuid, text, text) to authenticated;
grant execute on function public.remove_pos_order_item(uuid, uuid) to authenticated;
grant execute on function public.update_pos_order_customer(uuid, text) to authenticated;
