-- 사복노트: 결과보고서 키트 출시 알림 수요 확인
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 하면 됩니다. (여러 번 실행해도 안전)
-- 20261007 파일의 사용 기록 부분을 최신으로 맞추는 내용도 함께 들어 있어서, 이 파일 하나만 실행하면 돼요.

-- 1) 비밀편지 구독을 어디서 했는지 (예: 'kit_result_report' = 보물창고 결과보고서 키트 알림 버튼)
alter table public.newsletter_subscribers add column if not exists source text
  check (source is null or char_length(source) <= 40);

-- 2) 사용 기록: 유입 경로(src) + 키트 관심 이벤트(kit_interest = 알림 버튼 누름, kit_waitlist = 알림 신청 완료)
create table if not exists public.usage_daily (
  day date not null,
  event text not null,
  src text not null default '',
  uid uuid not null default '00000000-0000-0000-0000-000000000000',
  n integer not null default 1 check (n >= 0),
  primary key (day, event, src, uid)
);
-- 예전 버전(src 없음)을 먼저 실행했어도 맞춰지게
alter table public.usage_daily add column if not exists src text not null default '';
alter table public.usage_daily drop constraint if exists usage_daily_pkey;
alter table public.usage_daily add primary key (day, event, src, uid);
alter table public.usage_daily enable row level security;

drop function if exists public.track_use(text);
create or replace function public.track_use(ev text, source text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'visit','prompt_open','prompt_copy','prompt_save','admin_open','game_play',
    'balance_done','quiz_done','shred','ebook_get','workbook_open','workbook_get',
    'newsletter_sub','edu_open','edu_inquiry','login_click',
    'kit_interest','kit_waitlist'
  ];
  sources text[] := array[
    'instagram','threads','kakao','naver','google','daum','facebook','youtube','band',
    'workbook','direct','other'
  ];
  s text := '';
begin
  if ev is null or not (ev = any(allowed)) then
    return;
  end if;
  if ev = 'visit' then
    s := case when source = any(sources) then source else 'other' end;
  end if;
  insert into public.usage_daily as u (day, event, src, uid, n)
  values ((now() at time zone 'Asia/Seoul')::date, ev, s,
          coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 1)
  on conflict (day, event, src, uid) do update set n = least(u.n + 1, 200);  -- 한 사람이 하루에 부풀릴 수 있는 횟수 제한
end;
$$;
revoke all on function public.track_use(text, text) from public;
grant execute on function public.track_use(text, text) to anon, authenticated;

-- 대시보드에서 보는 요약: 날짜·기능(·유입 경로)별 총 횟수와 사용자 수 (클라이언트에는 열지 않음)
drop view if exists public.usage_summary;
create view public.usage_summary with (security_invoker = true) as
select day, event, src,
       sum(n)::int as total,
       count(distinct uid) filter (where uid <> '00000000-0000-0000-0000-000000000000') as users
from public.usage_daily
group by day, event, src;
revoke all on public.usage_summary from anon, authenticated;

-- 확인용
-- 키트 알림 신청자 수:   select count(*) from public.newsletter_subscribers where source = 'kit_result_report';
-- 키트 알림 버튼 누른 사람 수(날짜별): select day, users, total from public.usage_summary where event = 'kit_interest' order by day desc;
