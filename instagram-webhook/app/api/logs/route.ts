import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────
// DM 발송 로그 조회 API
// GET /api/logs → 최근 50건 로그 반환
// ─────────────────────────────────────────────────────────────

export async function GET() {
  const logs = getLogs();
  return NextResponse.json({ logs, total: logs.length });
}
