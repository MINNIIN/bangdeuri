# 무료 배포 가이드

화면은 **Cloudflare Pages**, 백엔드(DB · 로그인 · 실시간 · 알림 함수)는 **Supabase 무료 플랜**에 올린다. 서버를 따로 만들지 않는다.

```
브라우저 (React + PWA)
  ├─ Supabase Auth      카카오 · 구글 · 이메일 로그인
  ├─ Supabase DB        프로필 · 방 · 아이템 · 채팅 · 알림 기기 (RLS로 권한)
  ├─ Supabase Realtime  같은 방 사람들: Presence(누가 있나) + Broadcast(움직임·채팅)
  └─ Edge Function      notify: 방 주인에게 웹 푸시
```

> Supabase는 **개인 계정**으로 로그인해서 진행한다 (회사 계정 X).

## 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com) → 개인 계정 로그인 → **New project** (Region: Northeast Asia (Seoul)).
2. **SQL Editor**에 `supabase/schema.sql`을 통째로 붙여넣고 **Run**.
3. **Project Settings → API**에서 `Project URL`, `Publishable key`를 메모.

## 2. 로그인 설정

**Authentication → Sign In / Providers**

- **Email**: 켜고, **Confirm email은 끈다** (기본 메일 발송이 시간당 몇 통으로 막혀 있어서. 끄면 가입 즉시 로그인).
- **URL Configuration**
  - Site URL: `https://<내 사이트>.pages.dev`
  - Redirect URLs: `https://<내 사이트>.pages.dev/**`, `http://localhost:5173/**`

### 카카오

1. [developers.kakao.com](https://developers.kakao.com) → 내 애플리케이션 → 앱 추가.
2. 개발자 계정 **본인인증** → 앱 설정 → 일반 → **개인 개발자 비즈 앱 전환** (Supabase가 카카오에 이메일을 요청해서 필요).
3. 카카오 로그인 → **활성화**, Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. 동의항목: 닉네임, 카카오계정(이메일).
5. 앱 키의 **REST API 키** = Client ID, 보안 → **Client Secret** 코드 생성·활성화.
6. Supabase → Providers → **Kakao**에 Client ID / Secret 입력하고 켠다.

### 구글

1. [console.cloud.google.com](https://console.cloud.google.com) → 새 프로젝트.
2. **OAuth 동의 화면**: External, 앱 이름 "방들이", 개인정보처리방침 URL `https://<내 사이트>.pages.dev/privacy.html` → 게시(프로덕션).
3. **사용자 인증 정보 → OAuth 클라이언트 ID**(웹): 승인된 리디렉션 URI `https://<project-ref>.supabase.co/auth/v1/callback`
4. Supabase → Providers → **Google**에 Client ID / Secret 입력하고 켠다.

> `public/privacy.html` 맨 아래 연락처에 운영자 이메일을 적어 둔다.

## 3. 푸시 알림 (선택)

```bash
npx web-push generate-vapid-keys        # Public Key / Private Key 출력
npx supabase login                       # 개인 계정
npx supabase link --project-ref <project-ref>
npx supabase secrets set VAPID_PUBLIC_KEY=<공개키> VAPID_PRIVATE_KEY=<비밀키> \
  VAPID_SUBJECT=mailto:<내 이메일> SITE_URL=https://<내 사이트>.pages.dev
npx supabase functions deploy notify --no-verify-jwt
```

- 공개 키는 화면 쪽 환경 변수 `VITE_VAPID_PUBLIC_KEY`에도 넣는다.
- 아이폰은 Safari → 공유 → **홈 화면에 추가**로 연 앱에서만 알림을 받는다 (iOS 16.4+).
- 같은 사람이 같은 방에 2분 안에 다시 들어오거나, 한 방에서 한 시간에 30개를 넘으면 알림을 보내지 않는다.

## 4. Cloudflare Pages

1. GitHub에 저장소를 올린다.
2. Cloudflare 대시보드 → Workers & Pages → **Create → Pages → Connect to Git**.
3. Build command `npm run build`, Output directory `dist`.
4. Environment variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_VAPID_PUBLIC_KEY`
   - `NODE_VERSION` = `22`
5. 배포가 끝나면 나온 주소를 위 2번의 Site URL·Redirect URLs, 구글 동의 화면, `SITE_URL`에 맞춰 넣는다.

방 링크는 `/?r=...` 형태라 따로 리다이렉트 규칙이 필요 없다.

## 5. 잠들지 않게 (선택)

무료 Supabase 프로젝트는 **7일 동안 요청이 없으면 일시정지**된다. 데이터는 그대로이고 대시보드에서 **Restore**를 누르면 다시 살아난다.

미리 막으려면 GitHub 저장소 → Settings → Secrets and variables → Actions에 `SUPABASE_URL`, `SUPABASE_KEY`를 넣는다. `.github/workflows/keepalive.yml`이 사흘마다 방 하나를 읽어서 깨워 둔다.

## 무료 한도 (2026-11 기준, 바뀔 수 있으니 [supabase.com/pricing](https://supabase.com/pricing)에서 확인)

| 항목 | 무료 |
|---|---|
| 월 활성 사용자(로그인) | 50,000명 |
| DB | 500MB |
| Realtime | 동시 접속·메시지 수에 한도가 있다. 한 방 최대 10명으로 막아 두었다 |
| Edge Function | 월 호출 수 한도 안에서 알림만 쓴다 |
| 프로젝트 | 2개, 7일 미사용 시 일시정지 |

## 알아 둘 한계

- **내보내기·방 주인 표시는 화면(클라이언트) 기준**이다. 실시간 채널에서 보내는 신호라, 마음먹고 코드를 고친 사람이 흉내 낼 수 있다. 방 주인이 아닌 사람이 DB의 아이템·채팅을 지우거나 방을 고치는 것은 RLS로 막혀 있다.
- 내보낸 손님은 같은 브라우저로 10분 동안 못 들어온다. 다른 브라우저로 오면 막을 수 없다 → 그럴 땐 **링크 새로 만들기**.
- 가입 안 한 손님은 아무 닉네임이나 쓸 수 있다.
