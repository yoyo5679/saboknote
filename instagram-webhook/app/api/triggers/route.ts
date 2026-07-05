import { NextResponse } from 'next/server';
import { getTriggers } from '@/lib/store';

// ─────────────────────────────────────────────────────────────
// 키워드 트리거 조회 API
// GET /api/triggers → 현재 트리거 목록 반환
// ─────────────────────────────────────────────────────────────

export async function GET() {
  const triggers = getTriggers();
  return NextResponse.json({ triggers, total: triggers.length });
}
