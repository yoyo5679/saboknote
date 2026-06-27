import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────
// 사복노트 인스타그램 댓글 자동 DM 웹훅
// 동작: 게시물에 '측정' 댓글이 달리면 → 댓글 작성자에게 DM 자동 발송
//
// 필요한 환경변수 (.env.local):
//   VERIFY_TOKEN       — 메타 웹훅 설정 시 내가 직접 정한 비밀 토큰
//   META_ACCESS_TOKEN  — Meta 개발자 콘솔에서 발급한 Page Access Token
//   IG_ACCOUNT_ID      — 사복노트 인스타그램 비즈니스 계정 ID (숫자)
// ─────────────────────────────────────────────────────────────

// ──────────────────────────────────────────
// GET: 메타 웹훅 '연결 확인' 요청 처리
// 메타가 서버를 처음 등록할 때 이 엔드포인트를 호출합니다.
// hub.verify_token이 일치하면 hub.challenge 값을 그대로 돌려줘야 합니다.
// ──────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ 웹훅 연결 확인 성공');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('⛔ 웹훅 연결 실패: 토큰 불일치', { mode, token });
  return new NextResponse('Forbidden', { status: 403 });
}

// ──────────────────────────────────────────
// POST: 실제 인스타그램 이벤트(댓글 등) 수신 처리
// 댓글 텍스트에 '측정'이 포함되면 해당 사용자에게 DM을 발송합니다.
// ──────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 인스타그램 플랫폼 이벤트인지 확인
    if (body.object !== 'instagram') {
      return new NextResponse('Not Found', { status: 404 });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {

        // 이벤트 필드가 'comments'(댓글)인지 확인
        if (change.field !== 'comments') continue;

        const commentText: string = change.value?.text ?? '';
        const fromUserId: string  = change.value?.from?.id ?? '';

        console.log(`📩 댓글 수신 | 작성자: ${fromUserId} | 내용: "${commentText}"`);

        // ★ 트리거 키워드 체크 — 필요에 따라 배열로 확장 가능
        const TRIGGER_KEYWORDS = ['측정'];
        const isTriggered = TRIGGER_KEYWORDS.some((kw) => commentText.includes(kw));

        if (isTriggered && fromUserId) {
          const dmMessage =
            '안녕하세요! 사복노트입니다 😊\n' +
            '요청하신 측정 자료 링크를 보내드립니다:\n' +
            '👉 https://saboknote.com\n\n' +
            '궁금한 점이 있으시면 언제든지 댓글 남겨주세요!';

          const result = await sendDM(fromUserId, dmMessage);

          if (result.success) {
            console.log(`✅ DM 발송 성공 → ${fromUserId}`);
          } else {
            console.error(`❌ DM 발송 실패 → ${fromUserId}:`, result.error);
          }
        }
      }
    }

    // 메타는 200 OK + 'EVENT_RECEIVED' 응답을 기대합니다 (필수)
    return new NextResponse('EVENT_RECEIVED', { status: 200 });

  } catch (error) {
    console.error('🚨 웹훅 처리 오류:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// ──────────────────────────────────────────
// 헬퍼: 인스타그램 DM 발송
// Meta Graph API v19.0 사용
// ──────────────────────────────────────────
interface DMResult {
  success: boolean;
  error?: unknown;
}

async function sendDM(recipientId: string, messageText: string): Promise<DMResult> {
  const PAGE_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const IG_ACCOUNT_ID     = process.env.IG_ACCOUNT_ID;

  if (!PAGE_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
    console.error('❌ 환경변수 누락: META_ACCESS_TOKEN 또는 IG_ACCOUNT_ID');
    return { success: false, error: 'Missing env vars' };
  }

  const url = `https://graph.facebook.com/v19.0/${IG_ACCOUNT_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAGE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message:   { text: messageText },
      }),
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
