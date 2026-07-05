import { NextResponse } from 'next/server';
import { findMatchingTrigger } from '@/lib/store';
import { addLog } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────
// 사복노트 인스타그램 자동 DM 웹훅 (ManyChat 대체 무료 버전)
//
// 지원 이벤트:
//   1. comments  — 게시물 댓글에 키워드 → 댓글 작성자에게 DM
//   2. messages  — DM 수신 시 키워드 → 자동 답장
//
// 환경변수 (.env.local):
//   VERIFY_TOKEN      — 메타 웹훅 인증 토큰 (직접 설정)
//   META_ACCESS_TOKEN — Page Access Token (Meta 개발자 콘솔)
//   IG_ACCOUNT_ID     — 인스타 비즈니스 계정 ID
//   TRIGGERS_JSON     — JSON 배열로 키워드 설정 (선택, 없으면 기본값)
// ─────────────────────────────────────────────────────────────

// ──────────────────────────────────────────
// GET: 메타 웹훅 연결 인증
// ──────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ 웹훅 연결 인증 성공');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('⛔ 웹훅 인증 실패: 토큰 불일치', { mode, token });
  return new NextResponse('Forbidden', { status: 403 });
}

// ──────────────────────────────────────────
// POST: 인스타그램 이벤트 수신 및 처리
// ──────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object !== 'instagram') {
      return new NextResponse('Not Found', { status: 404 });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {

        // ── 1. 댓글 이벤트 처리 ──────────────────────
        if (change.field === 'comments') {
          const commentText: string = change.value?.text ?? '';
          const fromUserId: string  = change.value?.from?.id ?? '';
          const commentId: string   = change.value?.id ?? '';

          console.log(`💬 댓글 수신 | ${fromUserId} | "${commentText}"`);

          const trigger = findMatchingTrigger(commentText);
          if (trigger && commentId) {
            // 댓글 작성자에게 비공개 답장(Private Reply) — comment_id 필수
            const result = await sendDM({ comment_id: commentId }, trigger.message);
            addLog({
              userId: fromUserId,
              keyword: trigger.keyword,
              trigger: 'comment',
              success: result.success,
              error: result.success ? undefined : JSON.stringify(result.error),
            });

            if (result.success) {
              console.log(`✅ DM 발송 성공 (댓글) → ${fromUserId} | 키워드: "${trigger.keyword}"`);
            } else {
              console.error(`❌ DM 발송 실패 (댓글) → ${fromUserId}:`, result.error);
            }
          }
        }

        // ── 2. DM 수신 이벤트 처리 ───────────────────
        if (change.field === 'messages') {
          const messageText: string = change.value?.message?.text ?? '';
          const fromUserId: string  = change.value?.sender?.id ?? '';
          const myAccountId = process.env.IG_ACCOUNT_ID;

          // 내가 보낸 DM은 무시 (무한 루프 방지)
          if (!fromUserId || fromUserId === myAccountId) continue;

          console.log(`📩 DM 수신 | ${fromUserId} | "${messageText}"`);

          const trigger = findMatchingTrigger(messageText);
          if (trigger) {
            const result = await sendDM({ id: fromUserId }, trigger.message);
            addLog({
              userId: fromUserId,
              keyword: trigger.keyword,
              trigger: 'dm',
              success: result.success,
              error: result.success ? undefined : JSON.stringify(result.error),
            });

            if (result.success) {
              console.log(`✅ DM 답장 성공 | 키워드: "${trigger.keyword}"`);
            } else {
              console.error(`❌ DM 답장 실패:`, result.error);
            }
          }
        }
      }
    }

    // Meta는 항상 200 OK + 'EVENT_RECEIVED' 를 기대함
    return new NextResponse('EVENT_RECEIVED', { status: 200 });

  } catch (error) {
    console.error('🚨 웹훅 처리 오류:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// ──────────────────────────────────────────
// 헬퍼: Instagram DM 발송
// ──────────────────────────────────────────
interface DMResult {
  success: boolean;
  error?: unknown;
}

// 댓글 비공개 답장이면 { comment_id }, DM 답장이면 { id }
type Recipient = { comment_id: string } | { id: string };

async function sendDM(recipient: Recipient, messageText: string): Promise<DMResult> {
  const PAGE_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const IG_ACCOUNT_ID     = process.env.IG_ACCOUNT_ID;

  if (!PAGE_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
    console.error('❌ 환경변수 누락: META_ACCESS_TOKEN 또는 IG_ACCOUNT_ID');
    return { success: false, error: 'Missing env vars' };
  }

  const url = `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/messages`;

  // 댓글 비공개 답장(comment_id)에는 messaging_type을 넣지 않음
  const payload: Record<string, unknown> = {
    recipient,
    message: { text: messageText },
  };
  if ('id' in recipient) {
    payload.messaging_type = 'RESPONSE';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAGE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return { success: false, error: errorData };
    }

    return { success: true };

  } catch (err) {
    return { success: false, error: err };
  }
}
