-- 방들이 Supabase 스키마 (회원 + 실시간 버전)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 예전(가입 없는) 버전 테이블이 있으면 맨 아래 "옛 버전 정리"를 먼저 실행한다.

create extension if not exists pgcrypto;

-- ─── 프로필: 회원의 닉네임과 직접 만든 미니미 ─────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 8),
  look        jsonb not null check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 600),
  created_at  timestamptz not null default now()
);

-- ─── 방 ──────────────────────────────────────────────

create table if not exists public.rooms (
  id            text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  -- 링크에 쓰는 주소. 방 주인이 링크를 새로 만들면 바뀐다
  slug          text not null unique,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 12),
  theme         text not null check (theme in ('pink', 'studio', 'night')),
  motto         text not null default '' check (char_length(motto) <= 40),
  total_visits  int  not null default 0,
  today_visits  int  not null default 0,
  today_date    date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at    timestamptz not null default now(),
  -- 방 주인이 꾸민 벽·바닥. null이면 테마 기본값
  decor         jsonb check (decor is null or (jsonb_typeof(decor) = 'object' and octet_length(decor::text) <= 16000))
);

create index if not exists rooms_owner_idx on public.rooms (owner_id, created_at desc);

-- ─── 친구가 놓고 간 아이템 + 방명록 ──────────────────────────

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

-- ─── 채팅 기록 (방마다 최근 500개, 30일까지) ───────────────────

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 10),
  body        text not null check (char_length(body) between 1 and 100),
  owner       boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists messages_room_idx on public.messages (room_id, created_at desc);

-- ─── 푸시 알림 받을 기기 ─────────────────────────────────

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  on_enter    boolean not null default true,
  on_drop     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- 알림 도배 막기용 기록 (Edge Function만 쓴다)
create table if not exists public.notify_log (
  id       bigint generated always as identity primary key,
  room_id  text not null references public.rooms(id) on delete cascade,
  kind     text not null,
  name     text not null,
  at       timestamptz not null default now()
);

create index if not exists notify_log_idx on public.notify_log (room_id, at desc);

-- ─── 권한 ──────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.drops enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notify_log enable row level security;

revoke all on public.profiles, public.rooms, public.drops, public.messages, public.push_subscriptions, public.notify_log
  from anon, authenticated;

-- 누구나 읽기 (닉네임·미니미·방·아이템·채팅은 링크를 아는 사람에게 보이는 정보)
grant select on public.profiles, public.rooms, public.drops, public.messages to anon, authenticated;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "rooms readable" on public.rooms;
create policy "rooms readable" on public.rooms for select using (true);
drop policy if exists "drops readable" on public.drops;
create policy "drops readable" on public.drops for select using (true);
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages for select using (true);

-- 내 프로필은 내가 만들고 고친다
grant insert (id, nickname, look), update (nickname, look) on public.profiles to authenticated;
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 방 주인만 한마디·꾸미기를 고치고, 방을 지운다 (만들기·링크 바꾸기는 아래 함수로)
grant update (motto, decor) on public.rooms to authenticated;
grant delete on public.rooms to authenticated;
drop policy if exists "rooms owner update" on public.rooms;
create policy "rooms owner update" on public.rooms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "rooms owner delete" on public.rooms;
create policy "rooms owner delete" on public.rooms for delete to authenticated using (owner_id = auth.uid());

-- 방 주인만 아이템·채팅을 치운다
grant delete on public.drops, public.messages to authenticated;
drop policy if exists "drops owner delete" on public.drops;
create policy "drops owner delete" on public.drops for delete to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));
drop policy if exists "messages owner delete" on public.messages;
create policy "messages owner delete" on public.messages for delete to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));

-- 내 알림 기기는 나만
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── 함수 ──────────────────────────────────────────────

create or replace function public.new_slug()
returns text
language sql volatile
as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) $$;

create or replace function public.create_room(p_name text, p_theme text, p_motto text)
returns public.rooms
language plpgsql security definer set search_path = public
as $$
declare
  v_row rooms;
begin
  if auth.uid() is null then
    raise exception 'login_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if (select count(*) from rooms where owner_id = auth.uid()) >= 5 then
    raise exception 'too_many_rooms';
  end if;
  loop
    begin
      insert into rooms (slug, owner_id, name, theme, motto)
      values (new_slug(), auth.uid(), trim(p_name), p_theme, coalesce(trim(p_motto), ''))
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- 주소가 겹치면 다시 뽑는다
    end;
  end loop;
  return v_row;
end $$;

create or replace function public.reset_room_link(p_room text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_slug text;
begin
  loop
    begin
      update rooms set slug = new_slug() where id = p_room and owner_id = auth.uid() returning slug into v_slug;
      exit;
    exception when unique_violation then
    end;
  end loop;
  if v_slug is null then
    raise exception 'forbidden';
  end if;
  return v_slug;
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

create or replace function public.post_message(p_room text, p_name text, p_body text)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_row messages;
begin
  select owner_id into v_owner from rooms where id = p_room;
  if v_owner is null then
    raise exception 'room_not_found';
  end if;
  -- 한 방에 10초 동안 20개 넘게 오면 도배로 본다
  if (select count(*) from messages where room_id = p_room and created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'too_fast';
  end if;
  insert into messages (room_id, name, body, owner)
  values (p_room, trim(p_name), trim(p_body), auth.uid() is not null and auth.uid() = v_owner)
  returning * into v_row;
  -- 오래된 대화 정리: 30일 지난 것, 최근 500개 밖의 것
  delete from messages where room_id = p_room and created_at < now() - interval '30 days';
  delete from messages where id in (
    select id from messages where room_id = p_room order by created_at desc offset 500
  );
  return v_row;
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

revoke execute on function public.new_slug() from public;
revoke execute on function public.create_room(text, text, text) from public;
revoke execute on function public.reset_room_link(text) from public;
revoke execute on function public.add_drop(text, text, real, real, text, text) from public;
revoke execute on function public.post_message(text, text, text) from public;
revoke execute on function public.visit_room(text) from public;

grant execute on function public.create_room(text, text, text) to authenticated;
grant execute on function public.reset_room_link(text) to authenticated;
grant execute on function public.add_drop(text, text, real, real, text, text) to anon, authenticated;
grant execute on function public.post_message(text, text, text) to anon, authenticated;
grant execute on function public.visit_room(text) to anon, authenticated;

-- ─── 옛 버전 정리 (가입 없이 쓰던 테이블이 남아 있을 때만, 한 번) ─────
-- 실제 사용자가 없어서 새로 시작한다. 필요하면 아래 주석을 풀고 맨 위보다 먼저 실행:
-- drop function if exists public.create_room(text, text, text, text);
-- drop function if exists public.delete_drop(text, text, uuid);
-- drop function if exists public.update_room(text, text, text);
-- drop function if exists public.delete_room(text, text);
-- drop function if exists public.update_decor(text, text, jsonb);
-- drop table if exists public.drops cascade;
-- drop table if exists public.rooms cascade;
