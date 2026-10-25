-- 방들이 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.

create extension if not exists pgcrypto;

-- ─── 테이블 ─────────────────────────────────────────────

create table if not exists public.rooms (
  id            text primary key,
  name          text not null check (char_length(name) between 1 and 12),
  character     text not null check (character in ('bob', 'cap', 'bear')),
  theme         text not null check (theme in ('pink', 'studio', 'night')),
  motto         text not null default '' check (char_length(motto) <= 40),
  total_visits  int  not null default 0,
  today_visits  int  not null default 0,
  today_date    date not null default ((now() at time zone 'Asia/Seoul')::date),
  owner_secret  text not null,
  created_at    timestamptz not null default now(),
  -- 방 주인이 꾸민 벽·바닥 (벽지·색·도트 그림·벽 장식). null이면 테마 기본값
  decor         jsonb
);

-- 이미 만든 테이블에도 꾸미기 칸을 붙인다
alter table public.rooms add column if not exists decor jsonb;

create table if not exists public.drops (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms(id) on delete cascade,
  item        text not null check (item ~ '^[a-z0-9_-]{1,24}$'),
  u           real not null check (u between 0 and 1),
  v           real not null check (v between 0 and 1),
  nickname    text not null check (char_length(nickname) between 1 and 10),
  message     text not null default '' check (char_length(message) <= 60),
  created_at  timestamptz not null default now()
);

create index if not exists drops_room_idx on public.drops (room_id, created_at);

-- ─── 읽기 권한: 누구나 읽되 owner_secret은 못 읽는다 ─────────

alter table public.rooms enable row level security;
alter table public.drops enable row level security;

revoke all on public.rooms from anon, authenticated;
revoke all on public.drops from anon, authenticated;

grant select (id, name, character, theme, motto, total_visits, today_visits, today_date, created_at, decor)
  on public.rooms to anon, authenticated;
grant select on public.drops to anon, authenticated;

drop policy if exists "rooms readable" on public.rooms;
create policy "rooms readable" on public.rooms for select using (true);
drop policy if exists "drops readable" on public.drops;
create policy "drops readable" on public.drops for select using (true);

-- ─── 쓰기는 전부 아래 함수로만 ─────────────────────────────

create or replace function public.create_room(p_name text, p_character text, p_theme text, p_motto text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_id text;
  v_secret text := gen_random_uuid()::text;
begin
  loop
    v_id := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    begin
      insert into rooms (id, name, character, theme, motto, owner_secret)
      values (v_id, trim(p_name), p_character, p_theme, coalesce(trim(p_motto), ''), v_secret);
      exit;
    exception when unique_violation then
      -- 8자리 id가 겹치면 다시 뽑는다
    end;
  end loop;
  return json_build_object('id', v_id, 'secret', v_secret);
end $$;

create or replace function public.add_drop(
  p_room text, p_item text, p_u real, p_v real, p_nickname text, p_message text
)
returns public.drops
language plpgsql security definer set search_path = public
as $$
declare
  v_row drops;
begin
  if not exists (select 1 from rooms where id = p_room) then
    raise exception 'room_not_found';
  end if;
  if (select count(*) from drops where room_id = p_room) >= 60 then
    raise exception 'room_full';
  end if;
  insert into drops (room_id, item, u, v, nickname, message)
  values (p_room, p_item, p_u, p_v, trim(p_nickname), coalesce(trim(p_message), ''))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.delete_drop(p_room text, p_secret text, p_drop uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from drops d
  using rooms r
  where d.id = p_drop and d.room_id = p_room and r.id = p_room and r.owner_secret = p_secret;
  if not found then
    raise exception 'forbidden';
  end if;
end $$;

create or replace function public.update_room(p_room text, p_secret text, p_motto text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update rooms set motto = coalesce(trim(p_motto), '')
  where id = p_room and owner_secret = p_secret;
  if not found then
    raise exception 'forbidden';
  end if;
end $$;

create or replace function public.delete_room(p_room text, p_secret text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- drops는 on delete cascade로 같이 지워진다
  delete from rooms where id = p_room and owner_secret = p_secret;
  if not found then
    raise exception 'forbidden';
  end if;
end $$;

create or replace function public.update_decor(p_room text, p_secret text, p_decor jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 벽 그림 두 장(각 64×46 = 2944칸) + 장식 정도면 넉넉한 크기. 화면에서 다시 검사하고 쓴다
  if jsonb_typeof(p_decor) <> 'object' or octet_length(p_decor::text) > 16000 then
    raise exception 'invalid_decor';
  end if;
  update rooms set decor = p_decor
  where id = p_room and owner_secret = p_secret;
  if not found then
    raise exception 'forbidden';
  end if;
end $$;

create or replace function public.visit_room(p_room text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_row rooms;
begin
  update rooms set
    today_visits = case when today_date = v_today then today_visits + 1 else 1 end,
    today_date   = v_today,
    total_visits = total_visits + 1
  where id = p_room
  returning * into v_row;
  if v_row.id is null then
    raise exception 'room_not_found';
  end if;
  return json_build_object('today', v_row.today_visits, 'total', v_row.total_visits);
end $$;

revoke execute on function public.create_room(text, text, text, text) from public;
revoke execute on function public.add_drop(text, text, real, real, text, text) from public;
revoke execute on function public.delete_drop(text, text, uuid) from public;
revoke execute on function public.update_room(text, text, text) from public;
revoke execute on function public.delete_room(text, text) from public;
revoke execute on function public.update_decor(text, text, jsonb) from public;
revoke execute on function public.visit_room(text) from public;

grant execute on function public.create_room(text, text, text, text) to anon, authenticated;
grant execute on function public.add_drop(text, text, real, real, text, text) to anon, authenticated;
grant execute on function public.delete_drop(text, text, uuid) to anon, authenticated;
grant execute on function public.update_room(text, text, text) to anon, authenticated;
grant execute on function public.delete_room(text, text) to anon, authenticated;
grant execute on function public.update_decor(text, text, jsonb) to anon, authenticated;
grant execute on function public.visit_room(text) to anon, authenticated;
