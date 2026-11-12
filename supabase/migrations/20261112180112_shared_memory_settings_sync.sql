create table if not exists public.mae_shared_state (
  id text primary key default 'main',
  settings jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.mae_shared_state enable row level security;

drop policy if exists mae_shared_state_members_all on public.mae_shared_state;
create policy mae_shared_state_members_all
  on public.mae_shared_state
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

grant select, insert, update on public.mae_shared_state to authenticated;

insert into public.mae_shared_state(id, settings, events)
values (
  'main',
  '{"startMs":1776211080000,"startConfirmed":true,"firstFrom":1776211140000,"firstTo":1776217020000,"firstSourceId":"rubika_assassins_20260415_0329_0507","beganFrom":1776211116000,"beganTo":1776290837000,"beganSourceId":"rubika_private_main","beganCount":18,"presetsApplied":0}'::jsonb,
  '[]'::jsonb
)
on conflict (id) do nothing;
