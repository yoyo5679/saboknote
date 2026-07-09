# 사복노트 정서 기능 — 설계 명세 (2026-07-09 구현 완료분 반영)

## 한 줄 정의
신입 사회복지사 첫 1년 정서 동반자. 감정을 털어놓으면 현장 선배의 결로 위로하고,
원본은 저장하지 않되 성장 궤적(힘듦 정도·주제 태그·위로 한 줄)만 쌓는다.

## 핵심 원칙
1. 원본 감정 텍스트는 서버에 저장하지 않는다 (재노출 위험 + 민감정보 리스크).
2. 남기는 것은 세 조각: hardness(1~5), topic_tags(최대 3), comfort_line.
3. 회고는 개별 날짜가 아니라 추세(흐름)로 보여준다.
4. 삭제권은 항상 사용자에게 (전체 삭제 버튼).
5. 상담 서비스가 아니다 — safety_flag 시 전문 자원(109, 1577-0199, 129) 안내 + 고지 명시.

## 구현 현황 (2026-07-09)
- Supabase 프로젝트: saboksnote (seldrnpohdkggennjieo)
- `growth_entries` 테이블 + RLS (본인만 select/insert/delete, update 불가) — 마이그레이션 `create_growth_entries`
- Edge Function `comfort` (verify_jwt): Gemini Flash 1회 호출로 위로+세 조각 JSON 동시 산출,
  KST 기준 일일 5회 한도(env `COMFORT_DAILY_LIMIT`), 태그 정화 필터, 세 조각만 저장, 원본 폐기.
  모델은 env `GEMINI_MODEL` (기본 gemini-2.5-flash).
- index.js: 앱 시작 시 익명 로그인 자동 발급(`ensureAnonSession`), `startComfort`(선배 답장 → 파쇄),
  `doShred`(위로 없이 바로 파쇄, 기존 유지), 성장 궤적 뷰(`openGrowthView` — hardness SVG 추세 +
  태그 변화(처음엔/요즘은) + comfort_line 목록 + 전체 삭제).
- index.html: view-shredder 확장 (comfort-btn / shredder-btn / growth-view).

## 남은 수동 단계
1. Supabase 대시보드 → Authentication → Sign In/Up → "Allow anonymous sign-ins" ON
2. 대시보드 → Edge Functions → Secrets → `GEMINI_API_KEY` 등록 (사복노트 전용 GCP 프로젝트의 유료 Flash 키)
3. GCP 프로젝트에 예산 알림/지출 상한 설정
4. 로컬 테스트 후 배포 (saboknote.com)

## 2단계 (검증 후)
- 카카오/이메일 계정 연결(익명 계정 승격) — 손실 회피 문구
- 명시적 컨텍스트 캐싱 (현재는 Flash 암시적 캐싱에 의존)

## 검증 질문
- 실제로 털어놓는가 / 재방문하는가 / 회고 화면을 여는가 / 알림 요청이 나오는가
