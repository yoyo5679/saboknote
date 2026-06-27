# Meta Developer 설정 가이드 — 인스타 자동 업로드용

## 준비물
- 인스타그램 비즈니스 계정 (이미 있음 ✅)
- 페이스북 페이지 (비즈니스 계정에 연결된 것)
- 브라우저

---

## Step 1. Meta Developer 앱 생성

1. https://developers.facebook.com 접속 → 로그인
2. 상단 **"My Apps"** → **"Create App"**
3. 앱 유형: **"Other"** 선택 → Next
4. 앱 카테고리: **"Business"** 선택 → Next
5. 앱 이름: `saboknote-instagram` (아무거나 OK)
6. **Create App** 클릭

---

## Step 2. Instagram Graph API 추가

1. 앱 대시보드 → **"Add a Product"**
2. **Instagram Graph API** → **"Set Up"**

---

## Step 3. 비즈니스 계정 연결

1. 왼쪽 메뉴 → **Instagram Graph API** → **Basic Display** 또는 **API Setup**
2. "Add Instagram Test Users" → 본인 인스타 계정 추가
3. 인스타 앱에서 초대 수락 (앱 설정 → 허용된 앱)

---

## Step 4. 권한 설정

앱 대시보드 → **App Review** → **Permissions and Features**에서 아래 2개 요청:
- `instagram_basic`
- `instagram_content_publish`

> ⚠️ 심사 없이 바로 쓰려면 **개발 모드(Development Mode)** 에서 테스트 계정으로만 사용

---

## Step 5. Access Token 발급

### 방법 A: Graph API Explorer (가장 빠름)
1. https://developers.facebook.com/tools/explorer 접속
2. 상단에서 본인 앱 선택
3. **"Generate Access Token"** 클릭
4. 권한 체크: `instagram_basic`, `instagram_content_publish`, `pages_show_list`
5. 토큰 복사 → `.env`의 `INSTAGRAM_ACCESS_TOKEN`에 붙여넣기

### 방법 B: Long-lived Token으로 교환 (60일 유지)
```bash
curl "https://graph.facebook.com/oauth/access_token\
?grant_type=fb_exchange_token\
&client_id=YOUR_APP_ID\
&client_secret=YOUR_APP_SECRET\
&fb_exchange_token=SHORT_LIVED_TOKEN"
```
반환된 `access_token`이 60일짜리 Long-lived Token

---

## Step 6. Instagram Business Account ID 확인

```bash
# 페이지 목록 조회
curl "https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_TOKEN"

# 반환 예시: { "id": "123456789", "name": "내 페이지" }
# 그 페이지 ID로 인스타 계정 ID 조회:
curl "https://graph.facebook.com/v21.0/123456789?fields=instagram_business_account&access_token=YOUR_TOKEN"

# 반환: { "instagram_business_account": { "id": "17841400000000000" } }
# 이 id가 INSTAGRAM_USER_ID
```

---

## 최종 .env 예시

```
ANTHROPIC_API_KEY=sk-ant-...
CLOUDINARY_CLOUD_NAME=saboknote
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijk...
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxx...
INSTAGRAM_USER_ID=17841400000000000
```

---

## 자주 막히는 곳

| 문제 | 원인 | 해결 |
|------|------|------|
| 토큰 만료 (1시간) | Short-lived token | Step 5-B로 Long-lived 교환 |
| `#10` 권한 오류 | `instagram_content_publish` 없음 | Step 4 권한 추가 |
| `instagram_business_account` 없음 | 개인 계정 or 페이지 미연결 | 인스타 → 설정 → 계정 → 비즈니스 전환 |
| 앱이 개발 모드 | 외부 계정 게시 불가 | 테스트 계정으로만 테스트 or 앱 심사 |
