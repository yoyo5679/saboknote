-- 사복노트: AI 프롬프트 워크북 신청자를 따로 모은다
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 하면 됩니다. (여러 번 실행해도 안전)
--
-- 워크북을 받으면 두 곳에 저장된다.
--   1) workbook_requests        : 워크북 신청 기록 (이 파일에서 만드는 표, 같은 사람이 다시 받으면 한 줄 더 쌓임)
--   2) newsletter_subscribers   : 비밀편지 구독자 (source = 'workbook' 으로 표시)
-- 사이트는 이 표가 없어도 다운로드를 막지 않는다. 이 SQL을 실행한 뒤부터 쌓인다.

create table if not exists public.workbook_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 3 and 254),
  device_id text check (device_id is null or char_length(device_id) <= 80),   -- 기기별 익명 아이디(로그인 아님)
  agreed boolean not null check (agreed),
  user_id uuid default auth.uid()
);
create index if not exists workbook_requests_email_idx on public.workbook_requests (lower(email));

-- 누구나 '넣기'만 가능, 읽기는 대시보드(관리자)에서만
alter table public.workbook_requests enable row level security;
drop policy if exists "workbook request insert" on public.workbook_requests;
create policy "workbook request insert" on public.workbook_requests
  for insert to anon, authenticated
  with check (agreed and (user_id is null or user_id = (select auth.uid())));
grant insert on public.workbook_requests to anon, authenticated;

-- 자주 쓰는 조회 (실행할 때 앞의 -- 를 지우세요)
-- 신청자 목록(사람별 최초 신청일):
--   select lower(email) as email, min(created_at) as first_at, count(*) as times
--   from public.workbook_requests group by 1 order by 2 desc;
-- 신청자 수:
--   select count(distinct lower(email)) from public.workbook_requests;
-- 워크북으로 들어온 비밀편지 구독자:
--   select email, created_at from public.newsletter_subscribers where source = 'workbook' order by created_at desc;
