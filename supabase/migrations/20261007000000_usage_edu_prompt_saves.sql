-- 사복노트: 사용 기록 · 기관 교육 문의 · 프롬프트 보관함
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 하면 됩니다. (여러 번 실행해도 안전하게 작성)

-- 1) 사용 기록: 하루 단위 · 익명 ID별 횟수만 센다 (무엇을 입력했는지는 저장하지 않음)
--    클라이언트는 표를 직접 읽거나 쓸 수 없고 track_use 함수로만 기록한다.
create table if not exists public.usage_daily (
  day date not null,
  event text not null,
  uid uuid not null default '00000000-0000-0000-0000-000000000000',
  n integer not null default 1 check (n >= 0),
  primary key (day, event, uid)
);
alter table public.usage_daily enable row level security;

create or replace function public.track_use(ev text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'visit','prompt_open','prompt_copy','prompt_save','admin_open','game_play',
    'balance_done','quiz_done','shred','ebook_get','workbook_open','workbook_get',
    'newsletter_sub','edu_open','edu_inquiry','login_click'
  ];
begin
  if ev is null or not (ev = any(allowed)) then
    return;
  end if;
  insert into public.usage_daily as u (day, event, uid, n)
  values ((now() at time zone 'Asia/Seoul')::date, ev,
          coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 1)
  on conflict (day, event, uid) do update set n = least(u.n + 1, 200);  -- 한 사람이 하루에 부풀릴 수 있는 횟수 제한
end;
$$;
revoke all on function public.track_use(text) from public;
grant execute on function public.track_use(text) to anon, authenticated;

-- 대시보드에서 보는 요약: 날짜·기능별 총 횟수와 사용자 수 (클라이언트에는 열지 않음)
create or replace view public.usage_summary with (security_invoker = true) as
select day, event,
       sum(n)::int as total,
       count(distinct uid) filter (where uid <> '00000000-0000-0000-0000-000000000000') as users
from public.usage_daily
group by day, event;
revoke all on public.usage_summary from anon, authenticated;

-- 2) 기관 교육 문의: 누구나 보내기만 가능, 읽기는 대시보드(Table Editor)에서만
create table if not exists public.edu_inquiries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  org_name text not null check (char_length(org_name) between 1 and 80),
  contact_name text not null check (char_length(contact_name) between 1 and 40),
  contact text not null check (char_length(contact) between 5 and 100),
  edu_type text not null check (edu_type in ('출강','온라인','미정')),
  headcount text check (headcount is null or char_length(headcount) <= 20),
  preferred_date text check (preferred_date is null or char_length(preferred_date) <= 40),
  message text check (message is null or char_length(message) <= 1000),
  agreed boolean not null check (agreed),
  user_id uuid default auth.uid(),
  status text not null default '신규' check (status in ('신규','연락함','확정','종료'))
);
alter table public.edu_inquiries enable row level security;
drop policy if exists "edu inquiry insert" on public.edu_inquiries;
create policy "edu inquiry insert" on public.edu_inquiries
  for insert to anon, authenticated
  with check (agreed and status = '신규' and (user_id is null or user_id = (select auth.uid())));

-- 3) 프롬프트 보관함: 내 것만 보고 고칠 수 있음
--    익명 계정에도 저장되고(이 기기), 카카오·구글을 연결하면 다른 기기에서도 이어 쓴다.
create table if not exists public.prompt_saves (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prompt_key text not null check (prompt_key ~ '^[a-z_]{2,40}$'),
  fav boolean not null default false,
  fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 8000),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_key)
);
alter table public.prompt_saves enable row level security;
drop policy if exists "own select" on public.prompt_saves;
drop policy if exists "own insert" on public.prompt_saves;
drop policy if exists "own update" on public.prompt_saves;
drop policy if exists "own delete" on public.prompt_saves;
create policy "own select" on public.prompt_saves for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own insert" on public.prompt_saves for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own update" on public.prompt_saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own delete" on public.prompt_saves for delete to authenticated
  using (user_id = (select auth.uid()));

-- 확인용 (실행 후 아무 문제 없으면 무시해도 됨)
-- select * from public.usage_summary order by day desc, event;
-- select * from public.edu_inquiries order by created_at desc;
