-- "FIX" button: any signed-in staff member can report a problem or suggest an improvement;
-- the admin reads, marks done and exports them.
create table public.fix_request (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text not null,
  staff_role text,
  kind text not null check (kind in ('problem', 'idea')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  page_path text,
  page_title text,
  device text,
  status text not null default 'new' check (status in ('new', 'done')),
  done_at timestamptz
);

create index fix_request_status_idx on public.fix_request (status, created_at desc);

alter table public.fix_request enable row level security;
revoke all on public.fix_request from anon;
grant select, insert, update, delete on public.fix_request to authenticated;

-- anyone signed in may add one, but only as themselves
create policy fix_request_insert on public.fix_request for insert to authenticated
  with check (staff_id = (select s.id from public.staff s where s.auth_user_id = auth.uid()));

-- you see your own; the admin sees all
create policy fix_request_select on public.fix_request for select to authenticated
  using (public.is_admin() or staff_id = (select s.id from public.staff s where s.auth_user_id = auth.uid()));

-- only the admin changes or removes them
create policy fix_request_update on public.fix_request for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy fix_request_delete on public.fix_request for delete to authenticated
  using (public.is_admin());
