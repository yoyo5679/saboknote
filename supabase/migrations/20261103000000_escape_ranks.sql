-- 사복노트: 야근탈출 게임 랭킹 표 (전체 최고점 · 오늘의 챌린지)
-- 게임(sabok-game/sabok-escape/overtime-escape.html)과 놀이터 'TOP 6'가 이 두 표를 쓴다.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 하면 됩니다. (이미 있으면 그대로 두고, 여러 번 실행해도 안전)

create table if not exists public.escape_ranks (
  user_id text primary key check (char_length(user_id) between 1 and 80),
  nickname text check (nickname is null or char_length(nickname) <= 40),
  best_score integer not null default 0 check (best_score >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.escape_daily_ranks (
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  user_id text not null check (char_length(user_id) between 1 and 80),
  nickname text check (nickname is null or char_length(nickname) <= 40),
  best_score integer not null default 0 check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);
create index if not exists escape_ranks_score_idx on public.escape_ranks (best_score desc);
create index if not exists escape_daily_ranks_day_score_idx on public.escape_daily_ranks (day, best_score desc);

-- 게임은 로그인 없이(익명 키) 점수를 올리고 순위를 읽는다
alter table public.escape_ranks enable row level security;
alter table public.escape_daily_ranks enable row level security;

drop policy if exists "escape ranks read" on public.escape_ranks;
drop policy if exists "escape ranks write" on public.escape_ranks;
drop policy if exists "escape ranks update" on public.escape_ranks;
create policy "escape ranks read" on public.escape_ranks for select to anon, authenticated using (true);
create policy "escape ranks write" on public.escape_ranks for insert to anon, authenticated with check (true);
create policy "escape ranks update" on public.escape_ranks for update to anon, authenticated using (true) with check (true);

drop policy if exists "escape daily read" on public.escape_daily_ranks;
drop policy if exists "escape daily write" on public.escape_daily_ranks;
drop policy if exists "escape daily update" on public.escape_daily_ranks;
create policy "escape daily read" on public.escape_daily_ranks for select to anon, authenticated using (true);
create policy "escape daily write" on public.escape_daily_ranks for insert to anon, authenticated with check (true);
create policy "escape daily update" on public.escape_daily_ranks for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.escape_ranks to anon, authenticated;
grant select, insert, update on public.escape_daily_ranks to anon, authenticated;

-- 확인용: 전체 TOP 6
--   select nickname, best_score from public.escape_ranks order by best_score desc limit 6;
