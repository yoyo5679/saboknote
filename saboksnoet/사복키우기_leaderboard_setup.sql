-- Supabase SQL script to create the leaderboard table for 사복키우기
-- Run this in the Supabase SQL Editor

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.sabok_game_leaderboard (
    uuid UUID PRIMARY KEY,
    nickname TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 1,
    total_wp BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.sabok_game_leaderboard ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
-- Policy: Allow anyone to read the leaderboard
CREATE POLICY "Allow public read access" ON public.sabok_game_leaderboard
    FOR SELECT USING (true);

-- Policy: Allow anyone to insert/upsert their score
-- Note: In a real production environment, you might want more secure authentication,
-- but for this simple game, we allow anonymous upserts based on UUID.
CREATE POLICY "Allow anonymous insert" ON public.sabok_game_leaderboard
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON public.sabok_game_leaderboard
    FOR UPDATE USING (true) WITH CHECK (true);
