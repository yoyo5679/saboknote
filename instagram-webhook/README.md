# 사복노트 인스타그램 DM 봇 🤖

> 인스타그램 게시물에 **'측정'** 댓글이 달리면 → 댓글 작성자에게 DM을 자동 발송하는 웹훅 서버

Next.js 14 (App Router) + Vercel로 배포하는 서버리스 구조입니다.

---

## 🗂 프로젝트 구조

```
instagram-webhook/
├── app/
│   ├── layout.tsx              # 루트 레이아웃
│   ├── page.tsx                # 상태 확인 홈페이지
│   └── api/
│       └── webhook/
│           └── route.ts        # ★ 웹훅 핵심 로직 (GET + POST)
├── .env.local.example          # 환경변수 예시
├── .gitignore
├── next.config.js
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## 🚀 로컬 실행 (맥북)

```bash
# 1. 이 폴더로 이동
cd instagram-webhook

# 2. 환경변수 설정
cp .env.local.example .env.local
# .env.local 파일을 열고 실제 값 입력

# 3. 의존성 설치
npm install

# 4. 개발 서버 실행
npm run dev
# → http://localhost:3000 에서 확인
```

---

## ☁️ Vercel 배포

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 배포
vercel

# 환경변수는 Vercel 대시보드에서 설정:
# 프로젝트 → Settings → Environment Variables
# VERIFY_TOKEN / META_ACCESS_TOKEN / IG_ACCOUNT_ID
```

---

## 🔗 Meta 웹훅 등록

Vercel 배포 후 발급된 URL을 Meta 개발자 콘솔에 등록합니다.

1. [Meta for Developers](https://developers.facebook.com) → 내 앱 → Webhooks
2. **Callback URL**: `https://your-vercel-url.vercel.app/api/webhook`
3. **Verify Token**: `.env.local`의 `VERIFY_TOKEN` 값과 동일하게 입력
4. **Subscriptions**: `comments` 체크 → 저장

---

## 🔑 필요한 환경변수

| 변수명 | 설명 | 발급 위치 |
|---|---|---|
| `VERIFY_TOKEN` | 내가 정한 비밀 토큰 | 직접 작성 |
| `META_ACCESS_TOKEN` | Page Access Token | Meta 개발자 콘솔 |
| `IG_ACCOUNT_ID` | 인스타 비즈니스 계정 ID | Graph API로 조회 |

---

## ⚡️ 동작 원리

```
댓글 '측정' 입력
       ↓
Meta 서버가 POST /api/webhook 호출
       ↓
route.ts: commentText.includes('측정') 확인
       ↓
sendDM() → Graph API → DM 발송 완료 ✅
```
