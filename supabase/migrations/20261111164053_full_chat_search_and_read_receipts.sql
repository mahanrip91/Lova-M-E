create extension if not exists pg_trgm with schema extensions;

create or replace function private.normalize_chat_search(value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select btrim(
    regexp_replace(
      translate(lower(coalesce(value, '')), 'يىك‌', 'ییک'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create index if not exists archive_messages_body_search_idx
  on public.archive_messages
  using gin (private.normalize_chat_search(body) extensions.gin_trgm_ops);

create index if not exists messages_body_search_idx
  on public.messages
  using gin (private.normalize_chat_search(body) extensions.gin_trgm_ops);

create or replace function public.search_all_messages(
  search_text text,
  source_filter text default null,
  side_filter text default null,
  result_limit integer default 300,
  result_offset integer default 0
)
returns table (
  uid text,
  source_id text,
  occurred_at timestamptz,
  sender_side text,
  sender_key text,
  body text,
  kind text,
  original_order integer,
  reply_uid text,
  media_label text,
  is_edited boolean,
  is_forwarded boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private, extensions
as $$
  with needle as (
    select private.normalize_chat_search(search_text) as q
  ),
  matches as (
    select
      a.uid::text,
      a.source_id,
      a.occurred_at,
      a.sender_side,
      a.sender_key,
      a.body,
      a.kind,
      a.original_order,
      a.reply_uid,
      a.media_label,
      a.is_edited,
      a.is_forwarded
    from public.archive_messages as a
    cross join needle as n
    where length(n.q) >= 2
      and private.normalize_chat_search(a.body) like '%' || n.q || '%'
      and (source_filter is null or source_filter = '' or a.source_id = source_filter)
      and (side_filter is null or side_filter = '' or a.sender_side = side_filter)

    union all

    select
      m.id::text,
      'LIVE'::text,
      m.created_at,
      p.side,
      p.side,
      m.body,
      m.kind,
      0,
      m.reply_to::text,
      null::text,
      (m.edited_at is not null),
      false
    from public.messages as m
    join public.profiles as p on p.id = m.sender_id
    cross join needle as n
    where length(n.q) >= 2
      and private.normalize_chat_search(m.body) like '%' || n.q || '%'
      and (source_filter is null or source_filter = '' or source_filter = 'LIVE')
      and (side_filter is null or side_filter = '' or p.side = side_filter)
  )
  select
    matches.uid,
    matches.source_id,
    matches.occurred_at,
    matches.sender_side,
    matches.sender_key,
    matches.body,
    matches.kind,
    matches.original_order,
    matches.reply_uid,
    matches.media_label,
    matches.is_edited,
    matches.is_forwarded,
    count(*) over () as total_count
  from matches
  order by matches.occurred_at desc, matches.uid desc
  limit greatest(1, least(coalesce(result_limit, 300), 300))
  offset greatest(coalesce(result_offset, 0), 0);
$$;

revoke all on function public.search_all_messages(text, text, text, integer, integer)
  from public, anon;

grant execute on function public.search_all_messages(text, text, text, integer, integer)
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_receipts'
  ) then
    alter publication supabase_realtime add table public.message_receipts;
  end if;
end;
$$;
