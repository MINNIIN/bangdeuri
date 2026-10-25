# 방들이

> 내 방은 친구들이 채워줘.

미니미와 방을 고르고 링크를 스토리에 올리면, 들어온 친구들이 아이템을 하나씩 놓고 한마디를 남기고 가는 미니룸 서비스입니다.
싸이월드 미니룸 + 방명록 + 롤링페이퍼. 결제·회원가입 없음.

- 기획·설계 문서: [docs/design.md](docs/design.md)

## 주요 기능

| 기능 | 설명 |
|---|---|
| 방 만들기 | 미니미 3종(단발 · 캡모자 · 곰돌이) × 방 3종(핑크 하트방 · 원룸 자취방 · 밤하늘 다락방), 이름과 오늘의 한마디 |
| 아이템 놓기 | 친구가 링크로 들어와 아이템 42종(가구·가전·소품·먹을거·킹받는거) 중 하나를 골라 방 바닥에 놓고 닉네임·한마디를 남김. 놓자마자 방에 보임. 방마다 1개, 방 하나에 최대 60개 |
| 방명록 | 아이템을 누르면 그 위에 말풍선. "방명록 보기"에서 5개씩 페이지로 넘겨 보기. 방 주인은 아이템 치우기·한마디 수정, "친구 입장으로 보기"로 직접 놓아 보기 |
| 방 회전 | 좌우로 끌면 방이 ±30° 안에서 살짝 돌아감 |
| 방 꾸미기 (방 주인) | 벽지 무늬 9종·색 12색(왼쪽/오른쪽/양쪽), 벽에 도트 그림 그리기(12색·지우개·되돌리기), 벽 장식 10종 붙이고 끌어 옮기기(벽마다 5개), 바닥 무늬 6종·색 12색 |
| 미니미 이동 | 빈 바닥을 탭/클릭하거나 PC에서 우클릭하면 그 자리에 작은 링이 오므라들며 표시되고 미니미가 걸어감 (좌우 드래그는 회전, 살짝 탭은 이동이라 겹치지 않음) |
| 방 삭제 | 방 주인 화면 맨 아래 '방 삭제하기' → 한 번 더 확인하면 방과 아이템·방명록이 모두 지워짐 |
| 방문자 수 | 싸이월드식 `TODAY | TOTAL` (한국 날짜 기준) |
| 공유 | 9:16 스토리 이미지 저장, 링크 복사, 공유 시트 |

## 기술 구성

- Vite + React + TypeScript, 테스트는 Vitest
- 그림은 전부 코드: 미니미·아이템은 `src/art`의 문자열 격자 도트 스프라이트, 방은 아이소메트릭 SVG
- 저장소: Supabase (SDK 없이 `fetch`로 PostgREST 호출). 키가 없으면 **로컬 모드**로 이 브라우저 localStorage에만 저장
- 폰트: [갈무리(Galmuri)](https://github.com/quiple/galmuri) — SIL Open Font License 1.1

```
src/
  art/          미니미·아이템 스프라이트, 방 테마
  lib/          저장소(Supabase/로컬), 좌표, 규칙, 공유 이미지 (단위 테스트 있음)
  components/   화면 (첫 화면, 방 만들기, 방), 방 SVG, 시트
supabase/       schema.sql (테이블 · 권한 · RPC 함수)
```

## 실행

```bash
npm install
npm run dev      # 비어 있는 포트로 뜸 (기본 5173, 쓰고 있으면 5174, 5175 …)
npm test
npm run build
```

개발 서버 주소 뒤에 `/?gallery` 를 붙여 열면 (예: `http://localhost:5173/?gallery`) 미니미·아이템·방을 한눈에 볼 수 있습니다.

## Supabase 연결 (친구들과 실제로 쓰려면)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다 (무료 플랜).
2. 대시보드 **SQL Editor**에 `supabase/schema.sql`을 통째로 붙여넣고 **Run**.
3. **Project Settings → API**에서 Project URL과 Publishable key(또는 예전 anon key)를 복사.
4. 프로젝트 폴더에 `.env.local`을 만들고 붙여넣기 (`.env.example` 참고):
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_xxxxxxxx
   ```
5. `npm run dev`를 다시 띄우면 화면 아래 "로컬 모드" 표시가 사라진다.

배포는 정적 사이트라 Vercel·Netlify·Cloudflare Pages 어디든 `npm run build` → `dist`를 올리고 위 두 환경 변수만 넣어 주면 됩니다.

### 보안 메모

- 테이블에 직접 쓰는 권한은 없고, 쓰기는 전부 `security definer` RPC 함수로만 한다.
- 방 주인 비밀 키(`owner_secret`)는 컬럼 권한으로 막아서 익명 사용자가 읽을 수 없다.
- 방문자 "방마다 1개" 제한은 브라우저 기준의 느슨한 제한이다. 장난 아이템은 방 주인이 치울 수 있다.
