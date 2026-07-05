// ─────────────────────────────────────────────────────────────
// DM 발송 로그 — 메모리 기반 (최근 50건 유지)
// Vercel 서버리스는 콜드스타트 시 초기화됨 (정상)
// ─────────────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  timestamp: string;
  userId: string;       // 수신자 Instagram 사용자 ID
  keyword: string;      // 매칭된 키워드
  trigger: string;      // comment | dm
  success: boolean;
  error?: string;
}

// 전역 메모리 로그 (서버리스 인스턴스 내에서 유지)
const logs: LogEntry[] = [];
const MAX_LOGS = 50;

export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
  const newEntry: LogEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logs.unshift(newEntry); // 최신 것이 앞에
  if (logs.length > MAX_LOGS) logs.pop();
  return newEntry;
}

export function getLogs(): LogEntry[] {
  return [...logs];
}
