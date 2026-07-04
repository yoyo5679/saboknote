// ─────────────────────────────────────────────────────────────
// 트리거(키워드 → DM 메시지) 저장소
// 환경변수 TRIGGERS_JSON에 JSON 배열로 저장
// 예: [{"keyword":"측정","message":"DM 내용","active":true}]
// ─────────────────────────────────────────────────────────────

export interface Trigger {
  id: string;        // 고유 ID (timestamp 기반)
  keyword: string;   // 댓글/DM에서 감지할 키워드
  message: string;   // 자동 발송할 DM 내용
  active: boolean;   // 활성/비활성 토글
  createdAt: string; // 생성일
}

// 기본 트리거 (환경변수 없을 때 사용)
const DEFAULT_TRIGGERS: Trigger[] = [
  {
    id: '1',
    keyword: '측정',
    message:
      '안녕하세요! 사복노트입니다 😊\n' +
      '요청하신 자료 링크를 보내드립니다:\n' +
      '👉 https://saboknote.com\n\n' +
      '궁금한 점이 있으시면 언제든지 댓글 남겨주세요!',
    active: true,
    createdAt: new Date().toISOString(),
  },
];

/** 환경변수에서 트리거 목록 읽기 */
export function getTriggers(): Trigger[] {
  const raw = process.env.TRIGGERS_JSON;
  if (!raw) return DEFAULT_TRIGGERS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_TRIGGERS;
  } catch {
    return DEFAULT_TRIGGERS;
  }
}

/** 키워드 매칭 — 댓글/DM 텍스트에서 해당 트리거 찾기 */
export function findMatchingTrigger(text: string): Trigger | null {
  const triggers = getTriggers();
  const lower = text.toLowerCase();
  return (
    triggers.find(
      (t) => t.active && lower.includes(t.keyword.toLowerCase())
    ) ?? null
  );
}
