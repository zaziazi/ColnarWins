-- =====================================================================
--  VINARNA — order-to-cash schema
--  Postgres 15+ / Supabase.  Implements §6 of the specification.
--
--  Run this on a NEW, EMPTY Supabase project (not the one already
--  running another app).  Everything downstream — invoices, routes,
--  dunning, the management app — reads from these tables.
--
--  Design rules baked in here:
--    * prices are SNAPSHOTTED on the order line, never looked up later
--    * quantity_ordered and quantity_delivered are separate columns
--    * every timestamp that analytics or the cash forecast needs is
--      captured from day one, even where nothing reads it yet
--    * delivery proof is append-only and hashed
-- =====================================================================

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_trgm";      -- fast customer name search

-- ---------------------------------------------------------------------
-- 0 · enums
-- ---------------------------------------------------------------------
create type order_status as enum
  ('draft','confirmed','planned','delivered','invoiced','cancelled');

create type order_source as enum
  ('phone','email','standing','field','manual','webshop');

create type einvoice_channel as enum
  ('email_pdf','e_slog_bank','peppol');

create type route_status as enum
  ('planned','in_progress','completed');

create type stop_status as enum
  ('pending','arrived','completed','failed');

create type dunning_level as enum
  ('reminder_1','reminder_2','formal_notice','escalated');

create type prospect_stage as enum
  ('contacted','tasting_done','quote_sent','won','lost');

create type sample_status as enum
  ('given','converted','no_response','written_off');

create type staff_role as enum
  ('office','driver','sales','manager');

-- ---------------------------------------------------------------------
-- 1 · shared helper: updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2 · staff
-- ---------------------------------------------------------------------
create table staff (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                       -- maps to auth.users on Supabase
  full_name     text not null,
  role          staff_role not null,
  phone         text,
  email         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger staff_updated before update on staff
  for each row execute function set_updated_at();

comment on table staff is
  'Office, drivers, sales reps, managers. Drivers may access via signed link rather than login.';

-- ---------------------------------------------------------------------
-- 3 · master data — mirrored FROM e-Računi, never edited here
-- ---------------------------------------------------------------------
create table customer (
  id                  uuid primary key default gen_random_uuid(),
  eracuni_id          text unique,                 -- the link that must never break
  name                text not null,
  vat_id              text,
  address             text,
  city                text,
  post_code           text,
  contact_name        text,
  phone               text,
  email               text,                        -- invoice + reminder destination
  delivery_region     text,                        -- drives van assignment
  delivery_notes      text,                        -- "rear entrance", "before 10:00"
  payment_terms_days  int  not null default 30,
  einvoice_channel    einvoice_channel not null default 'email_pdf',
  dunning_paused      boolean not null default false,   -- §7.8 pause switch
  dunning_paused_note text,
  credit_hold         boolean not null default false,   -- §7.6 hold new orders
  sales_rep_id        uuid references staff(id),
  active              boolean not null default true,
  synced_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger customer_updated before update on customer
  for each row execute function set_updated_at();
create index customer_name_trgm on customer using gin (name gin_trgm_ops);
create index customer_region on customer(delivery_region) where active;

create table product (
  id              uuid primary key default gen_random_uuid(),
  eracuni_id      text unique,
  name            text not null,
  vintage         int,
  volume_l        numeric(5,3),
  unit_price_net  numeric(12,4) not null,
  vat_rate        numeric(5,4) not null default 0.2200,
  case_size       int not null default 6,          -- used by the email parser
  active          boolean not null default true,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger product_updated before update on product
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4 · standing orders — the "usual order" that pre-fills everything
-- ---------------------------------------------------------------------
create table standing_order (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null unique references customer(id) on delete cascade,
  interval_days int,                               -- typical gap; drives "quiet" detection
  note         text,
  updated_at   timestamptz not null default now()
);

create table standing_order_line (
  id                uuid primary key default gen_random_uuid(),
  standing_order_id uuid not null references standing_order(id) on delete cascade,
  product_id        uuid not null references product(id),
  quantity          int  not null check (quantity > 0),
  unique (standing_order_id, product_id)
);

-- ---------------------------------------------------------------------
-- 5 · orders
-- ---------------------------------------------------------------------
create table sales_order (
  id                  uuid primary key default gen_random_uuid(),
  order_number        bigint generated always as identity,
  customer_id         uuid not null references customer(id),
  source              order_source not null,
  status              order_status not null default 'draft',
  delivery_date       date,
  driver_note         text,

  -- email agent provenance (§7.2)
  source_email_id     text,
  source_email_text   text,
  ai_confidence       numeric(4,3),

  -- who / when — every one of these feeds analytics (§6)
  created_by          uuid references staff(id),
  confirmed_by        uuid references staff(id),
  created_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  planned_at          timestamptz,
  delivered_at        timestamptz,
  invoiced_at         timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  updated_at          timestamptz not null default now()
);
create trigger sales_order_updated before update on sales_order
  for each row execute function set_updated_at();
create index sales_order_delivery on sales_order(delivery_date, status);
create index sales_order_customer on sales_order(customer_id, created_at desc);
create index sales_order_status on sales_order(status);

comment on column sales_order.status is
  'draft -> confirmed -> planned -> delivered -> invoiced. The invoice is created at delivered, never at confirmed.';

create table order_line (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references sales_order(id) on delete cascade,
  product_id         uuid not null references product(id),
  quantity_ordered   int not null check (quantity_ordered >= 0),
  quantity_delivered int,                                   -- null until delivery
  unit_price_net     numeric(12,4) not null,                -- SNAPSHOT at confirmation
  vat_rate           numeric(5,4) not null,
  discount_pct       numeric(5,4) not null default 0,
  line_total_net     numeric(14,4)
    generated always as (
      coalesce(quantity_delivered, quantity_ordered)
      * unit_price_net * (1 - discount_pct)
    ) stored,
  unique (order_id, product_id)
);
create index order_line_product on order_line(product_id);

comment on column order_line.unit_price_net is
  'Copied from product at confirmation. Never re-read the catalogue — a later price change must not rewrite history.';

-- ---------------------------------------------------------------------
-- 6 · routes and delivery
-- ---------------------------------------------------------------------
create table route (
  id                    uuid primary key default gen_random_uuid(),
  route_date            date not null,
  vehicle               text not null,
  driver_id             uuid references staff(id),
  status                route_status not null default 'planned',
  total_distance_km     numeric(8,2),
  planned_duration_min  int,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  unique (route_date, vehicle)
);

create table route_stop (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references route(id) on delete cascade,
  order_id     uuid not null unique references sales_order(id),
  sequence     int not null,
  status       stop_status not null default 'pending',
  planned_eta  timestamptz,
  arrived_at   timestamptz,
  completed_at timestamptz,
  fail_reason  text,
  unique (route_id, sequence)
);
create index route_stop_route on route_stop(route_id, sequence);

-- Append-only: one row per delivery, never updated after it is written.
create table delivery_proof (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references sales_order(id),
  signature_image  text not null,          -- storage path or data URL
  signer_name      text not null,
  signed_at        timestamptz not null default now(),   -- SERVER time, not device
  gps_lat          numeric(9,6),
  gps_lng          numeric(9,6),
  gps_accuracy_m   numeric(7,2),
  device_id        text,
  photo            text,
  hash             text not null,          -- sha256 over lines + signature + timestamp
  created_at       timestamptz not null default now()
);

comment on table delivery_proof is
  'Append-only evidence. Compute hash server-side at signing and never recompute it; that is what makes later tampering detectable.';

-- ---------------------------------------------------------------------
-- 7 · invoices, payments, dunning
-- ---------------------------------------------------------------------
create table invoice (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references sales_order(id),
  customer_id        uuid not null references customer(id),
  eracuni_invoice_id text,
  invoice_number     text,
  issued_on          date,
  due_date           date,
  total_net          numeric(14,2),
  total_gross        numeric(14,2),
  amount_paid        numeric(14,2) not null default 0,
  paid_at            timestamptz,                     -- fully paid moment
  channel_sent       einvoice_channel,
  sent_at            timestamptz,
  disputed           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger invoice_updated before update on invoice
  for each row execute function set_updated_at();
create index invoice_open on invoice(due_date) where paid_at is null;
create index invoice_customer on invoice(customer_id, issued_on desc);

comment on column invoice.paid_at is
  'Written by the daily payment check against e-Racuni. Without this one column the dunning engine and the cash forecast are both impossible.';

-- Individual payments (supports partial payment without resetting the clock)
create table payment (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoice(id) on delete cascade,
  amount       numeric(14,2) not null,
  paid_on      date not null,
  source       text not null default 'eracuni_sync',
  created_at   timestamptz not null default now()
);
create index payment_invoice on payment(invoice_id);

create table dunning_event (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoice(id) on delete cascade,
  customer_id  uuid not null references customer(id),
  level        dunning_level not null,
  days_overdue int not null,
  amount_due   numeric(14,2) not null,
  sent_at      timestamptz,                 -- null = queued, not yet sent
  sent_to      text,
  message_body text not null,               -- exact text sent, for the record
  suppressed   boolean not null default false,
  suppress_reason text,
  created_at   timestamptz not null default now()
);
create index dunning_customer on dunning_event(customer_id, created_at desc);

comment on table dunning_event is
  'One row per reminder, queued or sent. The 7-day guard rule reads this table: no customer gets a second reminder within 7 days of the last one.';

-- ---------------------------------------------------------------------
-- 8 · sales rep: visits, samples, prospects, targets
-- ---------------------------------------------------------------------
create table visit (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references customer(id),
  prospect_id  uuid,                        -- FK added after prospect table
  staff_id     uuid not null references staff(id),
  planned_for  date,
  visited_at   timestamptz,
  reason       text,                        -- why the system proposed this visit
  note         text,
  gps_lat      numeric(9,6),
  gps_lng      numeric(9,6),
  created_at   timestamptz not null default now()
);
create index visit_staff_date on visit(staff_id, planned_for);

create table prospect (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  city         text,
  contact_name text,
  phone        text,
  email        text,
  stage        prospect_stage not null default 'contacted',
  next_action  text,
  next_action_on date,
  sales_rep_id uuid references staff(id),
  customer_id  uuid references customer(id),  -- set when they convert
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger prospect_updated before update on prospect
  for each row execute function set_updated_at();
alter table visit add constraint visit_prospect_fk
  foreign key (prospect_id) references prospect(id);

create table sample (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customer(id),
  prospect_id   uuid references prospect(id),
  staff_id      uuid not null references staff(id),
  given_on      date not null default current_date,
  status        sample_status not null default 'given',
  follow_up_on  date,                        -- given_on + 14 by default
  converted_order_id uuid references sales_order(id),
  note          text,
  created_at    timestamptz not null default now(),
  check (customer_id is not null or prospect_id is not null)
);

create table sample_line (
  id         uuid primary key default gen_random_uuid(),
  sample_id  uuid not null references sample(id) on delete cascade,
  product_id uuid not null references product(id),
  quantity   int not null check (quantity > 0)
);

-- Targets are stored per period so history stays honest when a target is revised.
create table target (
  id          uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  staff_id     uuid references staff(id),    -- null = company-wide
  metric       text not null,                -- 'revenue_net' | 'visits' | 'new_customers'
  target_value numeric(14,2) not null,
  created_at   timestamptz not null default now(),
  unique (period_start, staff_id, metric)
);

-- ---------------------------------------------------------------------
-- 9 · job log — every scheduled run leaves a trace
-- ---------------------------------------------------------------------
create table job_run (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null,                 -- 'payment_check' | 'dunning' | 'route_plan' | 'forecast'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      jsonb
);
create index job_run_name on job_run(job_name, started_at desc);

comment on table job_run is
  'If the payment check did not run or failed, no reminders go out that day. This table is how you know which it was.';

-- =====================================================================
--  VIEWS — the management app reads these, it does not compute
-- =====================================================================

-- Open balance per invoice
create or replace view v_open_invoice as
select
  i.*,
  (i.total_gross - i.amount_paid)                          as balance_open,
  greatest(0, current_date - i.due_date)                   as days_overdue
from invoice i
where i.paid_at is null
  and (i.total_gross - i.amount_paid) > 0.01;

-- Receivables ageing (feeds the ageing bar in App 3)
create or replace view v_receivables_ageing as
select
  case
    when days_overdue = 0            then 'within_terms'
    when days_overdue between 1 and 30 then 'overdue_1_30'
    else 'overdue_30_plus'
  end                                as bucket,
  count(*)                           as invoice_count,
  sum(balance_open)                  as amount
from v_open_invoice
group by 1;

-- How late each customer really pays — the input to the cash forecast.
-- Median, not average: one holiday-season outlier must not move it.
create or replace view v_customer_payment_behaviour as
select
  i.customer_id,
  count(*)                                                     as payments_counted,
  percentile_cont(0.5) within group (
    order by (i.paid_at::date - i.due_date)
  )                                                            as median_lateness_days
from invoice i
where i.paid_at is not null
  and i.due_date is not null
group by i.customer_id;

-- Customer health input: their own rhythm, compared with themselves
create or replace view v_customer_rhythm as
select
  c.id                                       as customer_id,
  c.name,
  max(o.confirmed_at)                        as last_order_at,
  (current_date - max(o.confirmed_at)::date) as days_since_last_order,
  so.interval_days                           as usual_interval_days,
  count(o.id) filter (
    where o.confirmed_at > now() - interval '90 days'
  )                                          as orders_last_90d
from customer c
left join sales_order o
       on o.customer_id = c.id and o.status <> 'cancelled'
left join standing_order so on so.customer_id = c.id
where c.active
group by c.id, c.name, so.interval_days;

-- =====================================================================
--  NEXT STEPS after running this file
--  1. Enable Row Level Security on every table and add policies.
--     Supabase does NOT do this for you and the tables are open until
--     you do.  Drivers must see only their own route for today.
--  2. Seed staff, then sync customer and product from e-Racuni.
--  3. Set standing_order.interval_days from each customer's real history
--     once you have three months of orders — before that, set it by hand.
-- =====================================================================
