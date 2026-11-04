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

-- ═══ 2026-11 추가: 달력 ═══════════════════════════════════
-- 이미 배포한 DB에도 이 파일을 통째로 다시 실행하면 된다 (모두 다시 돌려도 안전하게 썼다)

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms(id) on delete cascade,
  date        date not null,
  time        text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title       text not null check (char_length(title) between 1 and 40),
  name        text not null check (char_length(name) between 1 and 12),
  by_owner    boolean not null default false,
  private     boolean not null default false,
  -- 쓴 사람: 회원 이름으로 쓰면 계정, 익명(회원이 정체를 숨긴 경우 포함)이면 그 기기 비밀 키. 둘 다 남에게 안 보인다
  author_id   uuid,
  author_key  text check (author_key is null or char_length(author_key) between 16 and 64),
  created_at  timestamptz not null default now()
);

create index if not exists events_room_idx on public.events (room_id, date);
create index if not exists events_recent_idx on public.events (room_id, created_at);
create index if not exists events_author_idx on public.events (author_key, created_at);

alter table public.events enable row level security;
-- 테이블은 직접 못 읽는다. 아래 함수로만 읽고 쓴다 (쓴 사람 정보를 숨기고 나만 보기 일정을 거르려고)
revoke all on public.events from anon, authenticated;

-- 알림 종류 추가 (예전 기기는 꺼진 채로)
alter table public.push_subscriptions add column if not exists on_event boolean not null default false;
alter table public.push_subscriptions add column if not exists on_alarm boolean not null default false;

create or replace function public.list_events(p_room text, p_from date, p_to date, p_key text)
returns table (
  id uuid, room_id text, date date, "time" text, title text, name text,
  by_owner boolean, private boolean, mine boolean, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select e.id, e.room_id, e.date, e.time, e.title, e.name, e.by_owner, e.private,
    coalesce(r.owner_id = auth.uid(), false)
      or coalesce(e.author_id = auth.uid(), false)
      or coalesce(e.author_key = nullif(p_key, ''), false),
    e.created_at
  from events e
  join rooms r on r.id = e.room_id
  where e.room_id = p_room
    and e.date between p_from and p_to
    and (not e.private or coalesce(r.owner_id = auth.uid(), false))
  order by e.date, e.time nulls first
  limit 500
$$;

create or replace function public.add_event(
  p_room text, p_date date, p_time text, p_title text, p_name text, p_anon boolean, p_private boolean, p_key text
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_is_owner boolean;
  v_uid uuid;
  v_key text;
  v_row events;
begin
  select r.owner_id into v_owner from rooms r where r.id = p_room;
  if v_owner is null then
    raise exception 'room_not_found';
  end if;
  v_is_owner := coalesce(auth.uid() = v_owner, false);
  if p_private and not v_is_owner then
    raise exception 'forbidden';
  end if;
  -- 1년 전 ~ 2년 뒤만 (지난 날짜로 저장소를 채우지 못하게)
  if p_date is null
     or p_date < (now() at time zone 'Asia/Seoul')::date - 365
     or p_date > (now() at time zone 'Asia/Seoul')::date + 730 then
    raise exception 'bad_date';
  end if;
  -- 꽉 참·도배 제한은 손님 일정에만 (주인은 자기 달력을 늘 쓸 수 있다)
  if not v_is_owner then
    if (select count(*) from events e
        where e.room_id = p_room and not e.by_owner
          and e.date >= (now() at time zone 'Asia/Seoul')::date) >= 200 then
      raise exception 'calendar_full';
    end if;
    -- 기기 키를 바꿔 가며 도배하는 것 막기: 손님들은 한 방에 1분 20개까지
    if (select count(*) from events e
        where e.room_id = p_room and not e.by_owner
          and e.created_at > now() - interval '1 minute') >= 20 then
      raise exception 'too_fast';
    end if;
  end if;
  v_uid := case when p_anon then null else auth.uid() end;
  v_key := case when v_uid is null then nullif(p_key, '') else null end;
  if v_uid is null and v_key is null then
    raise exception 'forbidden';
  end if;
  -- 같은 사람이 1분에 5개까지
  if (select count(*) from events e
      where e.created_at > now() - interval '1 minute'
        and (coalesce(e.author_id = v_uid, false) or coalesce(e.author_key = v_key, false))) >= 5 then
    raise exception 'too_fast';
  end if;
  insert into events (room_id, date, time, title, name, by_owner, private, author_id, author_key)
  values (p_room, p_date, nullif(p_time, ''), trim(p_title), trim(p_name), v_is_owner and not p_anon, p_private, v_uid, v_key)
  returning * into v_row;
  return json_build_object(
    'id', v_row.id, 'room_id', v_row.room_id, 'date', v_row.date, 'time', v_row.time,
    'title', v_row.title, 'name', v_row.name, 'by_owner', v_row.by_owner, 'private', v_row.private,
    'mine', true, 'created_at', v_row.created_at
  );
end $$;

create or replace function public.delete_event(p_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  select coalesce(r.owner_id = auth.uid(), false)
      or coalesce(e.author_id = auth.uid(), false)
      or coalesce(e.author_key = nullif(p_key, ''), false)
    into v_ok
  from events e join rooms r on r.id = e.room_id
  where e.id = p_id;
  if not found then
    return;
  end if;
  if not v_ok then
    raise exception 'forbidden';
  end if;
  delete from events where id = p_id;
end $$;

revoke execute on function public.list_events(text, date, date, text) from public;
revoke execute on function public.add_event(text, date, text, text, text, boolean, boolean, text) from public;
revoke execute on function public.delete_event(uuid, text) from public;
grant execute on function public.list_events(text, date, date, text) to anon, authenticated;
grant execute on function public.add_event(text, date, text, text, text, boolean, boolean, text) to anon, authenticated;
grant execute on function public.delete_event(uuid, text) to anon, authenticated;

-- ═══ 2026-11 추가: 시계 알람 ═════════════════════════════════
-- 알람은 방 주인 계정에 딸린다. 시각은 한국 시간. 앱이 닫혀 있으면 1분마다 도는 예약 작업(pg_cron)이
-- Edge Function 'alarm'을 불러 푸시를 보낸다 (설정은 docs/deploy.md "알람" 참고).

-- p_after보다 뒤인 가장 빠른 알람 시각 (src/lib/alarm.ts nextAlarmAt과 같은 규칙)
create or replace function public.alarm_next(p_time text, p_days int[], p_after timestamptz)
returns timestamptz
language plpgsql stable
as $$
declare
  v_day date := (p_after at time zone 'Asia/Seoul')::date;
  v_at timestamptz;
begin
  for i in 0..8 loop
    v_at := ((v_day + i)::text || ' ' || p_time)::timestamp at time zone 'Asia/Seoul';
    if v_at > p_after
       and (coalesce(cardinality(p_days), 0) = 0 or extract(dow from (v_day + i))::int = any (p_days)) then
      return v_at;
    end if;
  end loop;
  return ((v_day + 1)::text || ' ' || p_time)::timestamp at time zone 'Asia/Seoul';
end $$;

create table if not exists public.alarms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  time        text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days        int[] not null default '{}' check (days <@ array[0, 1, 2, 3, 4, 5, 6]),
  label       text not null default '' check (char_length(label) <= 20),
  enabled     boolean not null default true,
  next_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists alarms_owner_idx on public.alarms (owner_id);
create index if not exists alarms_due_idx on public.alarms (next_at) where enabled;

alter table public.alarms enable row level security;
revoke all on public.alarms from anon, authenticated;
-- 내 알람은 나만 보고 고친다 (다음 울릴 시각은 아래 트리거·함수가 정한다)
grant select, delete on public.alarms to authenticated;
grant insert (time, days, label, enabled), update (time, days, label, enabled) on public.alarms to authenticated;
drop policy if exists "alarms own" on public.alarms;
create policy "alarms own" on public.alarms for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 만들거나 시각·요일·켜짐을 바꾸면 다음 울릴 시각을 다시 계산. 다음 시각을 직접 정한 경우(다시 울림·울린 뒤)는 그대로 둔다
create or replace function public.alarms_before()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from alarms a where a.owner_id = new.owner_id) >= 10 then
      raise exception 'too_many_alarms';
    end if;
    new.next_at := case when new.enabled then alarm_next(new.time, new.days, now()) else null end;
  elsif new.time is distinct from old.time
     or new.days is distinct from old.days
     or (new.enabled is distinct from old.enabled and new.next_at is not distinct from old.next_at) then
    new.next_at := case when new.enabled then alarm_next(new.time, new.days, now()) else null end;
  end if;
  return new;
end $$;

drop trigger if exists alarms_before on public.alarms;
create trigger alarms_before before insert or update on public.alarms
  for each row execute function public.alarms_before();

-- 울린 뒤 끄기: 반복이면 다음 시각으로, 한 번짜리면 끈다
create or replace function public.ack_alarm(p_id uuid)
returns public.alarms
language plpgsql security definer set search_path = public
as $$
declare
  v alarms;
begin
  update alarms a set
    next_at = case when cardinality(a.days) > 0 then alarm_next(a.time, a.days, now()) else null end,
    enabled = cardinality(a.days) > 0
  where a.id = p_id and a.owner_id = auth.uid()
  returning * into v;
  if v.id is null then
    raise exception 'forbidden';
  end if;
  return v;
end $$;

-- n분 뒤 다시 울리기 (1~60분)
create or replace function public.snooze_alarm(p_id uuid, p_min int)
returns public.alarms
language plpgsql security definer set search_path = public
as $$
declare
  v alarms;
begin
  update alarms a set
    enabled = true,
    next_at = now() + make_interval(mins => greatest(1, least(coalesce(p_min, 5), 60)))
  where a.id = p_id and a.owner_id = auth.uid()
  returning * into v;
  if v.id is null then
    raise exception 'forbidden';
  end if;
  return v;
end $$;

-- 예약 작업(Edge Function 'alarm')만 부른다: 지금 울릴 알람을 넘기고 다음 시각으로 옮긴다.
-- fresh = 10분 안에 울렸어야 하는 것 (예약 작업이 오래 멈췄다 돌아오면 지난 알람은 푸시하지 않는다)
create or replace function public.fire_due_alarms()
returns table (id uuid, owner_id uuid, "time" text, label text, fresh boolean)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  with due as (
    select a.id, a.next_at as was
    from alarms a
    where a.enabled and a.next_at <= now()
    for update skip locked
  )
  update alarms a set
    next_at = case when cardinality(a.days) > 0 then alarm_next(a.time, a.days, now()) else null end,
    enabled = cardinality(a.days) > 0
  from due
  where a.id = due.id
  returning a.id, a.owner_id, a.time, a.label, due.was > now() - interval '10 minutes';
end $$;

revoke execute on function public.alarm_next(text, int[], timestamptz) from public;
revoke execute on function public.alarms_before() from public;
revoke execute on function public.ack_alarm(uuid) from public;
revoke execute on function public.snooze_alarm(uuid, int) from public;
revoke execute on function public.fire_due_alarms() from public, anon, authenticated;
grant execute on function public.ack_alarm(uuid) to authenticated;
grant execute on function public.snooze_alarm(uuid, int) to authenticated;
grant execute on function public.fire_due_alarms() to service_role;

-- 예약 작업 등록 (한 번만, URL·비밀값을 채워서 SQL Editor에서 따로 실행. docs/deploy.md 참고):
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('bangdeuri-alarms', '* * * * *', $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/alarm',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<ALARM_CRON_SECRET>'),
--     body := '{}'::jsonb
--   )
-- $$);
