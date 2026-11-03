# 오브젝트 실사용 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가구를 진짜로 쓰게 한다 — 레시피(조리대·냉장고), 타이머(책상·전자레인지·세탁기), 턴테이블 같이 듣기, 달력 일정 공유, 시계 알람(방 소리 + 푸시).

**Architecture:** 가구를 누르면 미니미가 걸어가고, 도착하면(`RoomScene.onMeArrive`) `RoomScreen`이 그 가구의 도구 시트를 연다. 순수 로직은 `src/lib/*`에 두고 테스트하며, 서버가 필요한 달력·알람은 `Backend` 인터페이스에 local·supabase 둘 다 구현한다. 알람과 타이머는 앱 전체(App.tsx)에서 돈다.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest(jsdom), Supabase(PostgREST RPC·RLS·Realtime·Edge Function·pg_cron·pg_net), Cloudflare Pages Functions, Web Audio.

**Spec:** `docs/superpowers/specs/2026-11-03-real-objects-design.md`

## Global Constraints

- 시간대는 한국 시간(KST, `Asia/Seoul`) 고정. 기기 시간대와 상관없이 계산한다.
- 쓰기는 RPC(`security definer`) 또는 RLS 정책으로만. 비밀 컬럼(계정 id·기기 키)은 컬럼 권한으로 남이 못 읽게.
- 새 SQL은 `supabase/schema.sql` 끝에 이어 붙이고 `if not exists` / `create or replace` / `drop policy if exists`로 다시 돌려도 되게.
- 새 그림은 문자열 격자 도트 스프라이트(`Sprite`), 아이콘은 `src/art/icons.ts`.
- 화면 문구는 기존 말투(반말 아닌 해요체, 짧게, 이모지 대신 도트 아이콘).
- 저장소 접근은 try/catch (시크릿 창).
- 알람 최대 10개(방 주인 계정당), 알람 문구 20자. 일정 내용 40자, 방당 앞으로 있을 일정 200개, 같은 작성자 1분 5개.
- 턴테이블: iTunes Search API `country=KR&entity=song&media=music&limit=20`, 앨범 아트와 "Apple Music에서 듣기"(`trackViewUrl`) 함께 표시, 미리듣기는 저장하지 않음.
- 작업(Task)마다 커밋한다. 커밋 메시지는 한글 + `feat:`/`fix:`/`docs:` 접두, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 검사: `npx vitest run <파일>`, `npx tsc -b`, `npx oxlint src`. (`src/lib/avatar.test.ts`의 "어떻게 조합해도…" 시간 초과는 원래 있던 실패라 무시)

## Review Focus

1. **기기 시간대가 KST가 아닐 때** (해외·설정 바뀜): 알람은 KST 기준 시각에 울려야 한다 → Task 6 `nextAlarmAt` 테스트에 UTC 인스턴트로 검증.
2. **앱을 늦게 열었을 때 지난 알람**: 몇 시간 전에 울렸어야 할 알람이 앱을 열자마자 울리면 안 된다 (1분 넘게 지난 건 건너뛰고 다음 시각으로) → Task 6 `dueAlarms` 테스트.
3. **미리듣기 없는 iTunes 결과**: `previewUrl`이 없는 곡은 목록에서 뺀다 → Task 4 `parseItunes` 테스트.
4. **늦게 들어온 사람에게 이미 끝난 곡**: 시작한 지 30초 넘은 곡은 틀지 않는다 → Task 4 `songOffset` 테스트.
5. **달력 월 경계**: 윤년 2월, 1일이 일요일/토요일인 달에 칸이 맞아야 한다 → Task 5 `monthGrid` 테스트.

---

### Task 1: 가구 도구 시트 틀 + 레시피

**Files:**
- Create: `src/lib/tools.ts`, `src/lib/recipes.ts`, `src/lib/recipes.test.ts`, `src/components/tools/ToolSheet.tsx`, `src/components/tools/RecipeTool.tsx`
- Modify: `src/components/RoomScene.tsx` (prop `onMeArrive`, 도구 있는 가구에 반짝 표시), `src/components/RoomScreen.tsx` (시트 열기), `src/index.css`

**Interfaces:**
- Produces:
  - `type ToolId = 'recipe' | 'pantry' | 'timer-desk' | 'timer-microwave' | 'timer-washer' | 'turntable' | 'calendar' | 'alarm'`
  - `toolFor(item: string): ToolId | undefined` — `counter→recipe`, `fridge→pantry`, `desk→timer-desk`, `microwave→timer-microwave`, `washer→timer-washer`, `turntable→turntable`, `calendar→calendar`, `alarm→alarm`. 이 Task에서는 표에 다 넣고, 아직 없는 도구는 `ToolSheet`가 렌더하지 않는다.
  - `RoomScene` prop `onMeArrive?: (key: string, item: string) => void` — 내 미니미(`a.id === 'me'`)가 `arrive()` 할 때만 부른다. 같은 걸 다시 눌러 `startAct`가 `arrive`를 다시 부를 때도 부른다(시트를 다시 여는 길).
  - `ToolSheet({ tool, room, owner, entry, ctx, onClose, onTimer })` — `tool`에 따라 각 도구 컴포넌트를 `Sheet` 안에 렌더.
  - `interface Recipe { id: string; name: string; minutes: number; level: 1 | 2 | 3; ingredients: string[]; steps: string[]; tags: string[] }`
  - `RECIPES: Recipe[]` (20개 이상), `PANTRY: string[]` (재료 고르기 목록 = 모든 레시피 재료의 합집합, 기본양념 `소금`·`설탕`·`간장`·`식용유`·`물`은 빼고 늘 있다고 본다)
  - `recipesWith(have: string[], all = RECIPES): Recipe[]` — 기본양념 외 재료가 모두 `have`에 있는 레시피만, 빠진 게 없는 것 먼저 걸리는 시간 짧은 순.

- [ ] **Step 1: 실패하는 테스트** `src/lib/recipes.test.ts`
  - `it('레시피가 20개 이상이고 id가 겹치지 않는다')` — `RECIPES.length >= 20`, `new Set(ids).size === RECIPES.length`, 모든 레시피 `steps.length >= 2`, `minutes > 0`.
  - `it('기본양념은 없어도 된다')` — 재료가 `['라면','물','계란']`인 레시피는 `recipesWith(['라면','계란'])`에 들어 있다.
  - `it('재료가 하나라도 없으면 빠진다')` — `recipesWith(['라면'])`에 계란 들어간 레시피는 없다.
  - `it('빈 냉장고면 기본양념만으로 되는 것만')`.
  - `it('PANTRY에 기본양념은 없다')`.
  - `toolFor` 테스트: `toolFor('counter') === 'recipe'`, `toolFor('sofa') === undefined`.
- [ ] **Step 2:** `npx vitest run src/lib/recipes.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3:** `tools.ts`, `recipes.ts` 구현. 레시피는 자취 요리(라면 변형, 계란밥, 김치볶음밥, 참치마요, 떡볶이, 토스트, 계란말이, 컵밥, 두부조림 등). 순서는 한 줄 20자 안팎.
- [ ] **Step 4:** 테스트 PASS
- [ ] **Step 5:** `RoomScene`에 `onMeArrive` 연결, 도구 있는 가구(`toolFor(fixture.item)`)는 그림 위에 작은 반짝이(기존 `sparkle` 도트 재사용 가능)를 늘 그린다. `RoomScreen`: `const [tool, setTool] = useState<ToolId | null>(null)`, `onMeArrive={(key, item) => setTool(toolFor(item) ?? null)}`. 놓기·꾸미기 모드에서는 열지 않는다.
- [ ] **Step 6:** `RecipeTool({ mode: 'list' | 'pantry', onTimer })` — list: 태그 칩으로 거르기 + 레시피 카드(재료, 순서). pantry: `PANTRY` 칩을 골라 `recipesWith` 결과. 카드에 "⏲ N분 타이머" 버튼 → `onTimer(recipe.name, recipe.minutes * 60)` (Task 2 전까지는 버튼 숨김: `onTimer`가 없으면 안 보인다).
- [ ] **Step 7:** `npx tsc -b && npx oxlint src && npx vite build` 통과
- [ ] **Step 8:** 커밋 `feat: 조리대·냉장고를 누르면 레시피 카드와 냉장고 털기`

### Task 2: 타이머 (책상·전자레인지·세탁기) + 알림음

**Files:**
- Create: `src/lib/timers.ts`, `src/lib/timers.test.ts`, `src/lib/chime.ts`, `src/components/tools/TimerTool.tsx`, `src/components/TimerDock.tsx`
- Modify: `src/App.tsx` (TimerDock 띄우기), `src/components/RoomScreen.tsx`, `src/components/tools/ToolSheet.tsx`, `src/lib/music.ts`(필요하면), `src/index.css`

**Interfaces:**
- Consumes: `ToolSheet`의 `onTimer`, `bgm.hold(on)` (`src/lib/music.ts`)
- Produces:
  - `interface Timer { id: string; label: string; source: 'desk' | 'microwave' | 'washer' | 'recipe'; endsAt: number; total: number; pomodoro?: { phase: 'focus' | 'break'; round: number } }`
  - `POMODORO = { focus: 25 * 60, break: 5 * 60 }`, `MICROWAVE_PRESETS = [60, 120, 180]`, `WASHER_DEFAULT = 40 * 60`
  - `remaining(t: Timer, now: number): number` (초, 0 아래로 안 감)
  - `nextPomodoro(t: Timer, now: number): Timer` — focus 끝 → break(같은 round), break 끝 → focus(round+1)
  - `timers` 스토어: `timers.list(): Timer[]`, `timers.start(t: Omit<Timer,'id'>): Timer`, `timers.cancel(id)`, `timers.subscribe(cb): () => void`. sessionStorage가 아니라 **localStorage** `bangdeuri:timers`에 저장 (새로고침해도 남게), 저장 실패 무시.
  - `useTimerClock()` (TimerDock 안): 1초마다 확인, 끝난 타이머는 `chime.ring('timer')` + 토스트 대신 큰 알림 창("OO 끝났어요" + 확인), 뽀모도로면 다음 단계로 자동 이어감.
  - `chime.ring(kind: 'timer' | 'alarm'): () => void` — Web Audio로 삑삑(타이머 3번) / 따르릉(알람, 끌 때까지 2초 간격 반복). 돌려주는 함수로 멈춘다. 울리는 동안 `bgm.hold(true)`, 멈추면 `bgm.hold(false)`.
- [ ] **Step 1: 실패하는 테스트** `timers.test.ts`
  - `remaining`: `endsAt = 1000_000`, `now = 1000_000 - 30_000` → 30, 지나면 0.
  - `nextPomodoro`: focus round 1 → break round 1, `endsAt = now + 300_000`; break round 1 → focus round 2.
  - `timers.start` 후 `timers.list()`에 있고, `cancel` 후 없다; localStorage에 남아서 모듈 상태와 상관없이 다시 읽힌다.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** `TimerTool({ source })` — desk: 뽀모도로 시작/멈춤 + 지금 단계·라운드. microwave: 1·2·3분 버튼. washer: 40분 기본, ±5분 조절. 같은 source 타이머가 돌고 있으면 남은 시간 + 취소 버튼을 보인다. `TimerDock`: App 맨 위(모든 화면)에 돌고 있는 타이머를 작은 알약(아이콘 + mm:ss)으로, 누르면 취소 확인.
- [ ] **Step 6:** RecipeTool의 `onTimer`를 연결(`source: 'recipe'`).
- [ ] **Step 7:** tsc·oxlint·build 통과
- [ ] **Step 8:** 커밋 `feat: 책상 뽀모도로·전자레인지·세탁기 타이머와 끝났을 때 알림음`

### Task 3: 턴테이블 가구 그림과 자리

(Task 4와 나눈 이유: 그림·배치만으로 리뷰해서 되돌릴 수 있게)

**Files:**
- Modify: `src/art/fixtures.ts` (`turntable`, `calendar` 스프라이트 — 달력은 Task 5에서 쓰지만 같은 파일·같은 리뷰라 여기서 함께), `src/lib/home.ts` (`FIXTURES`에 `fx-turntable`, `fx-calendar` 추가; 기존 가구·칸막이와 안 겹치고 `findPath`로 갈 수 있는 자리), `src/lib/interactions.ts` (`turntable: { verb: '노래 틀기', pose: 'dance', fx: ['notes'], lines: [...] }`, `calendar: { verb: '달력 보기', pose: 'back', fx: [], lines: [...], ms: 1800 }`), `src/lib/home.test.ts`
- [ ] **Step 1: 실패하는 테스트** `home.test.ts`에 `it('턴테이블·달력 가구가 있고 미니미가 갈 수 있다')` — `FIXTURES`에 두 id, `interactionFor` 존재, 거실 기준점에서 `findPath`로 각 가구 `standSpot` 근처까지 길이 있다(기존 가구 테스트 방식 그대로).
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS. 기존 "스프라이트 팔레트" 테스트(`logic.test.ts`)가 새 스프라이트도 통과하는지 함께 확인.
- [ ] **Step 5:** 커밋 `feat: 거실에 턴테이블과 벽걸이 달력 가구 추가`

### Task 4: 턴테이블 노래 검색·같이 듣기

**Files:**
- Create: `src/lib/songs.ts`, `src/lib/songs.test.ts`, `src/lib/turntable.ts`, `src/components/tools/TurntableTool.tsx`, `functions/api/music.ts`
- Modify: `vite.config.ts` (dev 프록시), `src/lib/realtime.ts` (`RoomEvent`·`SharedRoomState`), `src/components/RoomScreen.tsx`, `src/components/RoomScene.tsx`(`snapshot`에 song 포함 — 아니면 RoomScreen에서 hello에 덧붙임), `src/index.css`

**Interfaces:**
- Consumes: `bgm.hold`, `RoomChannel.send/onEvent`, Task 1 `ToolSheet`
- Produces:
  - `interface Song { id: number; title: string; artist: string; art: string; preview: string; link: string }`
  - `parseItunes(json: unknown): Song[]` — `results[]`에서 `trackId, trackName, artistName, artworkUrl100(→ '100x100'을 '200x200'으로), previewUrl, trackViewUrl`. `previewUrl` 없거나 `kind !== 'song'`이면 뺀다.
  - `searchSongs(term: string, signal?: AbortSignal): Promise<Song[]>` — `fetch('/api/music?term=' + encodeURIComponent(term))`. 빈 검색어는 `[]`.
  - `functions/api/music.ts`: `onRequestGet({ request })` → `https://itunes.apple.com/search?term=…&country=KR&entity=song&media=music&limit=20` 그대로 전달, `Cache-Control: public, max-age=3600`. term 1~60자 아니면 400.
  - `vite.config.ts` `server.proxy['/api/music']` → `https://itunes.apple.com` 로 `/search?...&country=KR&entity=song&media=music&limit=20` 재작성 (dev에서도 같은 주소로 동작).
  - `RoomEvent` 추가: `{ t: 'song'; cid: string; by: string; song: Song; at: number }` (at = 시작 시각 epoch ms, 보낸 사람 시계), `{ t: 'song-stop'; cid: string }`
  - `SharedRoomState`에 `song?: { by: string; song: Song; at: number } | null` — hello로 새로 들어온 사람에게 전달.
  - `PREVIEW_SEC = 30`, `songOffset(at: number, now: number): number | null` — 초 단위 재생 위치, 0 미만이면 0, `PREVIEW_SEC` 이상이면 `null`.
  - `turntable` 플레이어: `turntable.play(song, at): Promise<'playing' | 'blocked'>`(Audio 요소, `currentTime = songOffset`, `play()`가 거부되면 `'blocked'`), `turntable.stop()`, `turntable.muted`/`setMuted(bool)`(내 화면만), `turntable.subscribe(cb)`, `turntable.current(): { by, song, at } | null`. 재생 시작 시 `bgm.hold(true)`, 끝·멈춤·방 나가기 시 `bgm.hold(false)`.
- [ ] **Step 1: 실패하는 테스트** `songs.test.ts`
  - `parseItunes`: previewUrl 있는 곡 1개 + 없는 곡 1개 + `kind: 'music-video'` 1개 → 1개, 필드 매핑과 art가 `200x200`.
  - `parseItunes(null)`·`parseItunes({})` → `[]`.
  - `songOffset(1000, 1000) === 0`, `songOffset(1000, 11_000) === 10`, `songOffset(1000, 31_000) === null`, `songOffset(5000, 1000) === 0`.
- [ ] **Step 2:** FAIL → **Step 3:** `songs.ts`·`turntable.ts`·`functions/api/music.ts`·프록시 구현 → **Step 4:** PASS
- [ ] **Step 5:** `TurntableTool` — 검색창(입력 멈추고 400ms 뒤 검색, 이전 요청 abort), 결과 목록(앨범 아트 40px, 곡명, 가수, ▶, "Apple Music에서 듣기" 링크 `target=_blank rel=noopener`). ▶ 누르면 `turntable.play(song, Date.now())` + `send({ t: 'song', cid, by: entry.name, song, at })`. 지금 나오는 곡 카드(누가 틀었는지, 남은 초, 내 화면 음소거, 멈추기 → `song-stop` 전송). 검색 실패 시 "노래를 못 불러왔어요".
- [ ] **Step 6:** `RoomScreen` 이벤트 처리: `song` → `turntable.play(e.song, e.at)`; `'blocked'`이면 화면에 "OO님이 노래를 틀었어요 — 눌러서 같이 듣기" 버튼(누르면 다시 `play`). `song-stop` → `stop()`. `hello` 받을 때 `room.song`이 있으면 같은 처리. 방을 나가면 `turntable.stop()`. 재생 중 턴테이블 가구에 `notes` 효과.
- [ ] **Step 7:** tsc·oxlint·build 통과
- [ ] **Step 8:** 커밋 `feat: 턴테이블에서 노래 검색하고 방 사람들과 30초 미리듣기 같이 듣기`

### Task 5: 달력 일정 공유

**Files:**
- Create: `src/lib/calendar.ts`, `src/lib/calendar.test.ts`, `src/components/tools/CalendarTool.tsx`
- Modify: `supabase/schema.sql`, `src/lib/types.ts`, `src/lib/backend.ts`, `src/lib/supabase.ts`, `src/lib/localBackend.ts`, `src/lib/logic.test.ts`(로컬 백엔드 테스트), `src/lib/storage.ts`(기기 키), `src/lib/realtime.ts`, `src/lib/push.ts`, `src/components/Home.tsx`(알림 스위치), `src/components/RoomScreen.tsx`, `supabase/functions/notify/index.ts`, `docs/deploy.md`, `src/index.css`

**Interfaces:**
- Produces:
  - `interface CalEvent { id: string; roomId: string; date: string /* YYYY-MM-DD */; time: string | null /* HH:MM */; title: string; name: string; byOwner: boolean; private: boolean; mine: boolean; createdAt: string }` — `mine`은 내가 지울 수 있는지(서버가 계산해 주지 않으므로 클라이언트에서: 주인이면 전부, 아니면 내 계정 id 또는 내 기기 키로 쓴 것 — 아래 RPC가 `mine`을 돌려준다).
  - `interface NewEvent { date: string; time: string | null; title: string; name: string; anon: boolean; private: boolean }`
  - `Backend.listEvents(roomId: string, month: string /* YYYY-MM */): Promise<CalEvent[]>` — 그 달 앞뒤 1주까지
  - `Backend.addEvent(roomId: string, e: NewEvent): Promise<CalEvent>`
  - `Backend.deleteEvent(roomId: string, id: string): Promise<void>`
  - `store.deviceKey(): string` — 처음 부를 때 32자 랜덤 생성해 localStorage(`bangdeuri:v2`의 `deviceKey`)에 저장.
  - `monthGrid(month: string): { date: string; inMonth: boolean }[]` — 일요일 시작, 항상 42칸(6주).
  - `addMonths(month: string, n: number): string`, `kstToday(now?: number): string` (기존 `kstDate` 재사용 가능하면 그것).
  - `PushPrefs`에 `event: boolean` 추가 (기본 false, 저장된 옛 값에 없으면 false).
  - `RoomEvent` 추가: `{ t: 'cal'; cid: string }` (받으면 지금 달 다시 불러오기)
  - SQL:
    - `events(id uuid pk default gen_random_uuid(), room_id text references rooms on delete cascade, date date not null, time text null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'), title text not null check (char_length(title) between 1 and 40), name text not null check (char_length(name) between 1 and 12), by_owner boolean not null default false, private boolean not null default false, author_id uuid null, author_key text null, created_at timestamptz default now())`, 인덱스 `(room_id, date)`.
    - 테이블 직접 select 권한 주지 않는다. 읽기는 `list_events(p_room text, p_from date, p_to date, p_key text) returns table(id, room_id, date, time, title, name, by_owner, private, mine, created_at)` (`security definer`): `private`은 주인에게만, `mine = 주인 or author_id = auth.uid() or (author_key is not null and author_key = p_key)`. `author_id`·`author_key`는 돌려주지 않는다.
    - `add_event(p_room, p_date, p_time, p_title, p_name, p_anon boolean, p_private boolean, p_key text) returns json`(위 table 한 줄 모양): 방 없음 `room_not_found`; `p_private`인데 주인 아님 `forbidden`; 오늘(KST) 이후 일정 200개 이상 `calendar_full`; 같은 작성자(`author_id` 또는 `author_key`) 최근 1분 5개 이상 `too_fast`. `author_id = case when p_anon then null else auth.uid() end`, `author_key = p_key`(익명·비회원일 때만; 회원 이름으로 쓰면 null), `by_owner = auth.uid() = owner and not p_anon`.
    - `delete_event(p_id uuid, p_key text)`: 주인 또는 위 `mine` 조건일 때만, 아니면 `forbidden`.
    - `push_subscriptions`에 `on_event boolean not null default false`, `on_alarm boolean not null default true` 추가(`add column if not exists`; 알람 컬럼은 Task 6에서 쓰지만 같은 마이그레이션에 넣어 SQL 한 번만 돌리게).
    - grant: `list_events`·`add_event`·`delete_event` to anon, authenticated.
  - notify 함수: `kind`에 `'event'` 허용, 문구 `${name}님이 달력에 일정을 적었어요`, `on_event` 컬럼으로 거르기. 클라이언트 `notify(roomId, { kind: 'event', name })` 타입 확장. 주인이 직접 쓴 건 알리지 않는다.
- [ ] **Step 1: 실패하는 테스트** `calendar.test.ts`
  - `monthGrid('2028-02')`: 42칸, `inMonth` 29개, 첫 칸은 일요일(2028-01-30).
  - `monthGrid('2026-11')`: 2026-11-01이 일요일 → 첫 칸이 `2026-11-01`, `inMonth: true`.
  - `monthGrid('2026-08')`: 8월 1일 토요일 → 첫 칸 `2026-07-26`.
  - `addMonths('2026-12', 1) === '2027-01'`, `addMonths('2026-01', -1) === '2025-12'`.
  - `kstToday(Date.UTC(2026, 10, 3, 15, 30))` === `'2026-11-04'` (UTC 15:30 = KST 다음날 00:30).
- [ ] **Step 2: 로컬 백엔드 테스트** `logic.test.ts` (기존 `memoryStorage` 두 백엔드 방식)
  - 손님(로그인 안 함, 키 A)이 쓴 일정은 손님 목록에서 `mine: true`, 다른 키 B로 보면 `mine: false`, 주인은 `mine: true`.
  - 키 B로 지우면 `forbidden`, 주인이 지우면 사라진다.
  - 주인 `private` 일정은 손님 목록에 없다; 손님이 `private: true`로 쓰면 `forbidden`.
  - 1분 안에 같은 키로 6번째 → `too_fast`.
- [ ] **Step 3:** FAIL → **Step 4:** `calendar.ts`, 로컬 백엔드, 타입, `deviceKey` 구현 → **Step 5:** PASS
- [ ] **Step 6:** SQL·supabase 백엔드(`sb.rpc('list_events'…)`)·notify 함수·`push.ts` 구현. `setPushPrefs`의 "모두 꺼지면 구독 지우기"를 `Object.values(prefs).every((v) => !v)`로 바꾸고 `savePush`에 `on_event`·`on_alarm` 저장.
- [ ] **Step 7:** `CalendarTool({ room, owner, entry })` — 월 이동, 6주 격자(일정 있는 날 점, 주인 일정·친구 일정 색 다르게, 오늘 테두리), 날짜 누르면 그날 목록 + 쓰기 폼(시각 선택 없음/HH:MM, 내용 40자, 주인이면 "나만 보기" 체크). 이름은 `entry.name`, `anon`은 `entry.anon`. `mine`인 일정에 지우기. 쓰거나 지우면 `send({ t: 'cal', cid })`, 손님이 쓰면 `backend.notify(room.id, { kind: 'event', name })`. 에러 코드 → 기존 `errorText`에 `calendar_full`·`too_fast` 문구 추가.
- [ ] **Step 8:** Home 알림 설정에 "친구가 달력에 일정을 적으면" 스위치.
- [ ] **Step 9:** `docs/deploy.md`에 "업데이트: 달력·알람" 절 — schema.sql 다시 실행(그대로 다시 돌려도 됨), notify 함수 재배포.
- [ ] **Step 10:** tsc·oxlint·build 통과
- [ ] **Step 11:** 커밋 `feat: 달력에 내 일정과 친구가 적는 약속 공유`

### Task 6: 시계 알람 (방 소리 + 푸시)

**Files:**
- Create: `src/lib/alarm.ts`, `src/lib/alarm.test.ts`, `src/components/tools/AlarmTool.tsx`, `src/components/AlarmWatcher.tsx`, `supabase/functions/alarm/index.ts`
- Modify: `supabase/schema.sql`, `src/lib/types.ts`, `src/lib/backend.ts`, `src/lib/supabase.ts`, `src/lib/localBackend.ts`, `src/lib/logic.test.ts`, `src/lib/push.ts`, `src/components/Home.tsx`, `src/App.tsx`, `src/components/tools/ToolSheet.tsx`, `public/sw.js`(필요 시 `requireInteraction`), `docs/deploy.md`, `src/index.css`

**Interfaces:**
- Consumes: Task 2 `chime.ring('alarm')`, Task 5 `on_alarm` 컬럼·`PushPrefs`
- Produces:
  - `interface Alarm { id: string; time: string /* HH:MM */; days: number[] /* 0=일…6=토, 빈 배열 = 한 번 */; label: string; enabled: boolean; nextAt: string | null /* ISO */ }`
  - `nextAlarmAt(a: Pick<Alarm,'time'|'days'>, after: number): number` — `after`(epoch ms)보다 **뒤**인 가장 빠른 KST 시각(epoch ms). days 비면 오늘/내일 중 다음 HH:MM.
  - `dueAlarms(list: Alarm[], now: number, graceMs = 60_000): Alarm[]` — `enabled`이고 `nextAt <= now`이며 `now - nextAt <= graceMs`인 것.
  - `PushPrefs`에 `alarm: boolean` (기본 true — 단 구독이 없으면 소용없음).
  - `Backend.listAlarms(): Promise<Alarm[]>` (로그인한 내 것), `Backend.saveAlarm(a: Omit<Alarm,'id'|'nextAt'> & { id?: string }): Promise<Alarm>`, `Backend.deleteAlarm(id: string): Promise<void>`, `Backend.ackAlarm(id: string): Promise<Alarm>` (울린 뒤 다음 시각으로 넘기기·한 번짜리면 끄기), `Backend.snoozeAlarm(id: string, minutes: number): Promise<Alarm>`.
  - SQL:
    - `alarm_next(p_time text, p_days int[], p_after timestamptz) returns timestamptz` (immutable 아님, `language plpgsql`) — `nextAlarmAt`과 같은 규칙, `Asia/Seoul`.
    - `alarms(id uuid pk, owner_id uuid references auth.users on delete cascade default auth.uid(), time text check HH:MM, days int[] not null default '{}', label text check ≤20, enabled boolean default true, next_at timestamptz, created_at)`. RLS: `owner_id = auth.uid()`로 select/insert/update/delete. 트리거 `before insert or update of time, days, enabled`: `next_at := case when enabled then alarm_next(time, days, now()) else null end`. 계정당 10개 넘으면 insert 트리거에서 `too_many_alarms`.
    - `ack_alarm(p_id uuid)`/`snooze_alarm(p_id uuid, p_min int)` RPC (`owner_id = auth.uid()` 확인).
    - `fire_due_alarms() returns setof alarms` (service role 전용): `next_at <= now()`인 것을 돌려주고, 같은 문장에서 반복이면 `next_at = alarm_next(time, days, now())`, 한 번짜리면 `enabled = false, next_at = null`.
    - pg_cron: `select cron.schedule('bangdeuri-alarms', '* * * * *', $$ select net.http_post(url := '<함수 URL>', headers := jsonb_build_object('x-cron-secret', '<비밀>'), body := '{}'::jsonb) $$)` — 실제 URL·비밀은 deploy.md 안내로, schema.sql에는 주석 예시로만.
  - Edge Function `alarm`: `x-cron-secret`이 `ALARM_CRON_SECRET`과 다르면 401. `rpc('fire_due_alarms')` → 각 owner의 `on_alarm = true` 구독에 푸시 `{ title: '⏰ ' + (label || '알람'), body: 'HH:MM 알람이에요', url: '/', tag: 'alarm:' + id }`. 404/410 구독 정리(notify와 같은 방식, `serverKey()` 복사).
  - `AlarmWatcher` (App.tsx, 로그인했을 때만): 시작 시와 `visibilitychange`(보일 때)·30초마다 `listAlarms()`, 1초마다 `dueAlarms` 확인 → 큰 알림 창(시각·문구, "끄기" → `ackAlarm`, "5분 뒤 다시" → `snoozeAlarm(id, 5)`) + `chime.ring('alarm')`. 같은 알람이 서버 cron 때문에 이미 다음 시각으로 넘어갔어도 클라이언트가 먼저 본 `nextAt`으로 한 번은 울리고, ack가 실패해도 창은 닫힌다(서버가 이미 넘겼을 수 있음). 같은 `id:nextAt`은 한 번만 울린다.
- [ ] **Step 1: 실패하는 테스트** `alarm.test.ts`
  - `nextAlarmAt({ time: '07:30', days: [] }, Date.UTC(2026,10,3,21,0))` (= KST 11/4 06:00) → `Date.UTC(2026,10,3,22,30)` (KST 11/4 07:30).
  - 같은 조건, `after` = KST 11/4 08:00 → KST 11/5 07:30.
  - `days: [1,2,3,4,5]`(평일), `after` = KST 2026-11-07(토) 09:00 → KST 11/9(월) 07:30.
  - 정확히 그 시각이 `after`면 다음 날/다음 요일 (뒤인 시각만).
  - `dueAlarms`: nextAt 30초 전 → 포함, 2분 전 → 제외(Review Focus 2), `enabled: false` → 제외, 미래 → 제외.
- [ ] **Step 2: 로컬 백엔드 테스트** — 손님(다른 세션)은 주인 알람 목록이 비어 있다; 11번째 저장 `too_many_alarms`; `saveAlarm` 하면 `nextAt`이 채워진다; 한 번짜리 `ackAlarm` 후 `enabled: false`; `snoozeAlarm(id,5)` 후 `nextAt ≈ now + 5분`.
- [ ] **Step 3:** FAIL → **Step 4:** `alarm.ts`·로컬 백엔드 구현 → **Step 5:** PASS
- [ ] **Step 6:** SQL·supabase 백엔드·Edge Function `alarm` 구현.
- [ ] **Step 7:** `AlarmTool({ owner })` — 주인: 목록(켜기 스위치, 시각, 요일 칩 일~토, 문구, 지우기) + 추가. 맨 위에 지금 시각(KST) 크게. `pushSupport() !== 'ok'` 이거나 `savedPrefs().alarm`이 꺼졌거나 구독이 없으면 "앱을 닫으면 안 울려요" + 알림 켜기 버튼(`setPushPrefs({...prefs, alarm: true})`). 손님: 지금 시각 + "방 주인만 알람을 맞출 수 있어요". 로컬 모드 안내: "테스트 모드에서는 앱이 열려 있을 때만 울려요".
- [ ] **Step 8:** Home 알림 설정에 "알람" 스위치, App에 `AlarmWatcher`.
- [ ] **Step 9:** `docs/deploy.md` — pg_cron·pg_net 확장 켜기(Database → Extensions), `alarm` 함수 배포(`--no-verify-jwt`), 비밀값 `ALARM_CRON_SECRET`, cron 등록 SQL(위 예시에 실제 값 채워 SQL Editor에서 한 번), 확인 방법(`select * from cron.job_run_details order by start_time desc limit 5`).
- [ ] **Step 10:** tsc·oxlint·build 통과
- [ ] **Step 11:** 커밋 `feat: 시계 알람을 방 주인만 맞추고 정해진 시각에 방 소리와 푸시로 울리기`

### Task 7: 마무리 검토

- [ ] **Step 1:** 전체 `npx vitest run` (avatar 시간 초과 하나 빼고 통과), `npx tsc -b`, `npx oxlint src`, `npx vite build`
- [ ] **Step 2:** `docs/design.md`의 "하지 않는 것"·기술 구성에 새 기능 반영 (한 단락)
- [ ] **Step 3:** 커밋 `docs: 오브젝트 실사용 기능 반영`
