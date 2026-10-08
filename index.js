try {
    /**
     * Social Worker's Secret Note - Core Logic
     */

    /* --- Supabase Configuration --- */
    const supabaseUrl = 'https://seldrnpohdkggennjieo.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbGRybnBvaGRrZ2dlbm5qaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzI3MjksImV4cCI6MjA4NzgwODcyOX0.PyzWPa-kwYgh-HmuDELD642TCVn7Ajri54FsR7Ik2Gs';
    const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

    /* --- 네트워크가 멈춰도 "불러오는 중..."에 영원히 갇히지 않도록 --- */
    function withTimeout(promise, ms = 10000) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('요청 시간이 초과됐습니다.')), ms))
        ]);
    }

    /* --- 익명 로그인 (정서 동반자) — 앱 여는 순간 자동 발급, 사용자 입력 0 --- */
    let sabokAuthPromise = null;
    function ensureAnonSession() {
        if (!supabase) return Promise.resolve(null);
        if (!sabokAuthPromise) {
            const authTask = supabase.auth.getSession()
                .then(async ({ data, error }) => {
                    const session = data ? data.session : null;
                    if (session) return session;
                    const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
                    if (anonError) { console.warn('anon auth:', anonError.message); return null; }
                    return anonData ? anonData.session : null;
                })
                .catch(err => { console.warn('session error:', err); return null; });

            // 주의: localStorage의 sb-*-auth-token을 지우지 말 것.
            // (이전 버그: 타임아웃 콜백이 race 결과와 무관하게 3초 뒤 무조건 실행되며
            //  토큰을 삭제 → 방문마다 새 익명 유저 발급 → 성장 궤적이 매번 초기화됨)
            let timeoutId = null;
            const timeoutTask = new Promise(resolve => {
                timeoutId = setTimeout(() => {
                    console.warn('ensureAnonSession timed out');
                    resolve(null);
                }, 8000);
            });

            sabokAuthPromise = Promise.race([authTask, timeoutTask]).then(res => {
                clearTimeout(timeoutId);
                if (!res) sabokAuthPromise = null;
                return res;
            });
        }
        return sabokAuthPromise;
    }
    ensureAnonSession();

    /* --- 사용 기록: 하루 단위로 몇 명이 어떤 기능을 썼는지만 센다 (입력 내용은 보내지 않음) ---
       방문은 어디서 들어왔는지(인스타·카카오·검색 등)도 함께 센다. 링크에 ?utm_source=instagram 처럼 붙이면 가장 정확하다.
       서버의 track_use 함수가 허용된 이름만 받고, 한 사람이 하루에 부풀릴 수 있는 횟수도 막는다. */
    const NL_DONE_KEY = 'saboknote_nl_done';            // 비밀편지 구독함 → 구독 권유 숨김
    const PS_KEY = 'saboknote_prompt_saves';            // 프롬프트 보관함 (이 기기 사본)
    const COPY_COUNT_KEY = 'saboknote_prompt_copies';   // 프롬프트 복사 횟수 (로그인 권유 시점)
    function trackUse(ev, source) {
        if (!supabase) return;
        ensureAnonSession()
            .then(() => supabase.rpc('track_use', source ? { ev, source } : { ev }))
            // 서버 함수가 경로(source)를 모르는 예전 버전이면 경로 없이라도 기록
            .then(res => { if (source && res && res.error) return supabase.rpc('track_use', { ev }); })
            .catch(() => { /* 기록 실패는 무시 */ });
    }
    window.trackUse = trackUse;
    function visitSource() {
        try {
            const utm = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase();
            const ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
            const s = utm || ref;
            if (!s || /saboknote\.com$/.test(s) || s === location.hostname) return 'direct';
            const known = [['instagram', /instagram|^ig$/], ['threads', /threads/], ['kakao', /kakao/], ['naver', /naver/],
                ['google', /google/], ['daum', /daum/], ['facebook', /facebook|^fb$/], ['youtube', /youtube/], ['band', /band/], ['workbook', /^workbook$/]];
            const hit = known.find(([, re]) => re.test(s));
            return hit ? hit[0] : 'other';
        } catch (e) { return 'other'; }
    }
    try {
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
        if (localStorage.getItem('saboknote_visit_day') !== today) {
            localStorage.setItem('saboknote_visit_day', today);
            trackUse('visit', visitSource());
        }
    } catch (e) { /* noop */ }

    /* --- OAuth 콜백 에러 처리 ---
       [버그 원인] 다른 기기에서 linkIdentity()로 이미 연결된 카카오/구글을 시도하면
       클라이언트가 아닌 콜백(redirect) 단계에서 422(Identity is already linked)로 실패하고,
       에러가 URL 해시(#error_description=...)에 담겨 돌아온다.
       기존에는 이걸 아무도 읽지 않아 "로그인이 안 되는" 것처럼 보였다.
       → 여기서 잡아 기존 계정 로그인(signInWithOAuth)으로 이어준다. */
    (function handleOAuthCallbackError() {
        try {
            const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
            const queryParams = new URLSearchParams(window.location.search);
            const desc = hashParams.get('error_description') || queryParams.get('error_description');
            const errCode = hashParams.get('error_code') || queryParams.get('error_code');
            if (!desc && !errCode) return;
            history.replaceState(null, '', window.location.pathname);
            const provider = localStorage.getItem('sabok_pending_provider') || 'kakao';
            const providerName = provider === 'google' ? '구글' : '카카오';
            const already = (desc && desc.toLowerCase().indexOf('already linked') !== -1) || errCode === 'identity_already_exists';
            if (already) {
                if (confirm('이 ' + providerName + ' 계정은 예전에 이미 연결한 적이 있어요. 🙌\n그 계정으로 로그인해서 기존 기록(성장 궤적·닉네임·게임)을 불러올까요?\n\n(지금 이 기기의 임시 기록은 사라져요)')) {
                    if (supabase) supabase.auth.signInWithOAuth({
                        provider: provider,
                        options: { redirectTo: window.location.origin + window.location.pathname }
                    });
                }
            } else if (desc) {
                alert('소셜 로그인 중 문제가 발생했어요. 😢\n잠시 후 다시 시도해 주세요.\n(' + desc + ')');
            }
        } catch (_) { /* noop */ }
    })();

    /* --- Anonymous User ID (localStorage) --- */
    /* --- Utility: HTML Escape --- */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // HTML 속성값(value="...")용 이스케이프 — 따옴표까지 처리
    function escapeAttr(text) {
        return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* --- Anonymous User ID (localStorage) --- */
    function getOrCreateUserId() {
        let userId = localStorage.getItem('sabok_user_id');
        if (!userId) {
            // First time user: generate a temporary ID
            userId = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('sabok_user_id', userId);
        }
        return userId;
    }

    /* --- Anonymous Profile & Sync --- */
    window.changeToNewRandomName = function () {
        localStorage.removeItem('saboks_anonymous_name');
        const newName = getRandomAnonymousName();
        // Force refresh UI components
        if (typeof initMypage === 'function') initMypage();
        if (typeof initHomeGreeting === 'function') initHomeGreeting();
        alert('새로운 닉네임이 생성되었습니다! ✨\n' + newName);
    };

    window.copySyncCode = function () {
        const code = getOrCreateUserId();
        navigator.clipboard.writeText(code).then(() => {
            alert('동기화 코드가 복사되었습니다. 다른 기기에서 이 코드를 입력해 정보를 가져올 수 있습니다.');
        });
    };

    /* --- Bokjiro Gateway Configuration --- */
    const BOKJIRO_SIMULATOR_URL = "https://www.bokjiro.go.kr/ssis-tbu/twatbz/mkclAsis/mkclInsertNblgPage.do";

    const CHECKLIST_2026 = [
        "대상 가구의 정확한 가구원 수(동거 여부)를 확인하셨나요?",
        "근로소득 외 소액의 현금성 수입(지인 보조금 등) 여부를 체크하셨나요?",
        "금융자산 중 6개월 이내 인입된 거액의 출처가 소명 가능한가요?",
        "부양의무자(부모/자녀)와의 실질적인 가족관계 단절 여부를 확인하셨나요?"
    ];

    const LTC_THRESHOLDS_2026 = {
        1: 2512900,
        2: 2331200,
        3: 1528200,
        4: 1409700,
        5: 1208900,
        6: 676320 // 인지지원
    };

    const LTC_HOURLY_RATES_2026 = {
        30: 18450,
        60: 26320,
        90: 35120,
        120: 45430,
        150: 52640,
        180: 59020,
        210: 65530,
        240: 72080
    };

    /* --- Newsletter Reader (비밀 편지) --- */
    window.openNewsletterSubModal = function() {
        const modalContent = `
        <div style="text-align:center; padding: 20px 0;">
            <div style="font-size:3rem; margin-bottom:12px; animation: bounce 2s infinite">💌</div>
            <h3 style="font-size:1.4rem; color:var(--text-dark); margin-bottom:8px; font-weight:900">팀장님 몰래 보는 비밀편지</h3>
            <p style="font-size:0.95rem; color:var(--text-5); margin-bottom:24px; line-height:1.6;"><strong>"쉿! 사복천재가 이메일로 직접 배달 갑니다."</strong><br>막히는 서류 업무 뚫어주는 AI 꼼수부터 최신 복지 트렌드까지! 출퇴근길 3분이면 칼퇴 쌉가능 😎 메일 주소만 쓱 남겨주세요!</p>
            
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <input type="email" id="newsletter-email" class="calc-input" placeholder="칼퇴를 도와줄 이메일 주소 입력" style="font-size:1rem; padding:14px; border:2px solid var(--border); border-radius:12px;">
                <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; padding:12px; background:#f5f9ff; border-radius:12px; border:1px solid #dbeafe;">
                    <input type="checkbox" id="newsletter-agree" style="width:18px; height:18px; accent-color:#2563eb; flex-shrink:0; margin-top:2px;">
                    <span style="font-size:0.8rem; color:var(--text-4); line-height:1.5;">
                        [필수] <strong style="color:#2563eb;">개인정보 수집·이용</strong> 건 동의 완료!<br>
                        <span style="color:var(--text-6); font-size:0.75rem;">쿨하게 약속함: 수집한 이메일은 뉴스레터 발송용으로만 쓰고, 언제든 구독 취소 가능함 🤙</span>
                    </span>
                </label>
                <button class="btn-primary" style="background:linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding:16px; font-size:1.1rem; border-radius:12px; box-shadow:0 4px 14px rgba(37, 99, 235,0.3)" onclick="subscribeNewsletter()">💌 나도 이 편지 받을래!</button>
            </div>
        </div>`;
        openModal('비밀 편지 구독 신청', modalContent, 'newsletter');
    };

    function initNewsletterReader() {
        const btn = document.getElementById('open-newsletter-read');
        if (btn) {
            btn.onclick = window.openNewsletterSubModal;
        }
    }

    // iframe (보물창고 등)에서의 접근을 위한 postMessage 리스너
    window.addEventListener('message', function(event) {
        if (event.data === 'openNewsletterModal') {
            if (typeof window.openNewsletterSubModal === 'function') {
                window.openNewsletterSubModal();
            }
        }
        if (event.data === 'openEbookGate') window.openEbookGate();
    });
    /* --- 감정 파쇄기 로직 --- */
    const SHRED_MESSAGES = [
        { emoji: '🌙', msg: '오늘 하루도 그 무거운 마음을 견디느라 정말 애썼어요. 이제 두 다리 뻗고 푹 쉬어요.' },
        { emoji: '✨', msg: '꾹 참았던 한숨들이 가루가 되어 날아갔네요. 수고했어요, 정말로.' },
        { emoji: '☀️', msg: '버거웠던 오늘을 잘 버텨낸 당신에게 가장 따뜻한 위로를 보냅니다.' },
        { emoji: '👏', msg: '잘 해내지 않아도 괜찮아요. 이렇게 털어낸 것만으로도 당신은 충분히 멋진걸요.' },
        { emoji: '☁️', msg: '당신을 짓누르던 감정들은 모두 제가 갈아버렸으니, 오늘은 좋은 꿈만 꾸기를 바라요.' },
        { emoji: '🌊', msg: '오늘 흘린 눈물과 한숨은 이 파쇄기에 두고, 홀가분한 마음만 챙겨가세요.' },
        { emoji: '🧹', msg: '하루 종일 짊어지고 있던 마음의 짐, 이제 제가 대신 치워둘게요.' },
        { emoji: '🌿', msg: '모든 감정은 틀리지 않았어요. 그저 잠시 비워내고 쉴 자리가 필요했을 뿐입니다.' },
        { emoji: '💎', msg: '종이는 산산조각 났지만, 그걸 견뎌낸 당신의 마음은 오히려 더 단단해졌을 거예요.' },
        { emoji: '🌸', msg: '나쁜 기억을 잘게 부수고 나니, 당신의 예쁜 마음만 온전히 남았네요.' },
        { emoji: '🛡️', msg: '갈려나간 건 당신을 괴롭히던 상황일 뿐, 당신의 가치는 조금도 훼손되지 않았습니다.' },
        { emoji: '🌬️', msg: '날카로웠던 감정들이 부드러운 먼지가 되어 사라집니다. 이제 안심하세요.' },
        { emoji: '🌅', msg: '파쇄된 조각들 틈으로 내일의 따뜻한 햇살이 스며들기를 바랍니다.' },
        { emoji: '🧶', msg: '엉켜있던 마음의 실타래가 잘려나갔어요. 이제 편안하게 깊은 숨을 쉬어도 좋아요.' },
        { emoji: '🕊️', msg: '미움도, 슬픔도 모두 종이와 함께 흩어졌어요. 당신의 마음엔 평온만 남기를.' },
        { emoji: '🫂', msg: '아픈 기억을 지워버리기로 한 건, 스스로를 아끼기 시작했다는 가장 아름다운 증거입니다.' },
        { emoji: '💖', msg: '상처받은 감정들을 미련 없이 갈아버린 당신의 용기에 다정한 박수를 보내요.' },
        { emoji: '🎈', msg: '텅 빈 이 마음에, 내일은 더 크고 따뜻한 행복이 채워질 자리일 거예요.' },
        { emoji: '🚫', msg: '당신을 아프게 하는 것들은 결코 당신 곁에 오래 머물지 못할 겁니다.' },
        { emoji: '😊', msg: '오늘의 우울을 비워냈으니, 내일은 아주 작은 미소라도 지을 수 있을 거예요.' },
        { emoji: '🍀', msg: '아팠던 만큼, 아니 그보다 훨씬 더 많이 행복해질 자격이 당신에게 있습니다.' },
        { emoji: '💪', msg: '스스로를 지키기 위해 아픔을 끊어낸 당신, 참 다정하고 강한 사람이네요.' },
        { emoji: '🦋', msg: '모든 걸 훌훌 털어버린 지금의 당신이 세상에서 가장 홀가분하고 자유로워 보입니다.' },
        { emoji: '🤐', msg: '아무에게도 말하지 못했던 그 아픈 마음, 제가 끝까지 비밀로 지켜줄게요.' },
        { emoji: '🏚️', msg: '혼자 삭이느라 많이 힘들었죠? 언제든 무거워지면 다시 찾아와요. 다 부숴줄게요.' },
        { emoji: '🛌', msg: '당신이 쏟아낸 감정의 조각들은 제가 잘 치워둘 테니, 뒤돌아보지 말고 편히 잠드세요.' },
        { emoji: '🧩', msg: '괜찮아요, 가끔은 이렇게 다 부수고 지워버리고 싶은 날도 있는 법이니까요.' },
        { emoji: '🎁', msg: '당신의 슬픔을 제가 갉아먹을 테니, 저는 당신에게 평안을 선물할게요.' },
        { emoji: '💝', msg: '여기서 비워낸 만큼, 당신의 일상에 다시 사랑과 여유가 스며들기를 응원합니다.' },
        { emoji: '🌈', msg: '당신의 고통은 이제 세상 어디에도 없습니다. 내일은 당신을 위한 하루가 될 거예요.' }
    ];

    /* ===== 정서 동반자: 파쇄 애니메이션 공통 ===== */
    function runShredAnimation(renderSuccess) {
        trackUse('shred');
        const ta = document.getElementById('shredder-textarea');
        const stripped = document.getElementById('shredder-strips');
        const writeArea = document.getElementById('shredder-write-area');
        const successArea = document.getElementById('shredder-success');

        ta.style.animation = 'shredSlide 0.6s ease-in forwards';
        const colors = ['#ef4444', '#f97316', '#dc2626', '#fb923c', '#b91c1c', '#fca5a5', '#fed7aa'];
        stripped.style.display = 'flex';
        stripped.innerHTML = Array.from({ length: 22 }, (_, i) => {
            const delay = (i * 0.03).toFixed(2);
            const h = 60 + Math.random() * 50;
            return `<div class="shred-strip" style="background:${colors[i % colors.length]}; height:${h}px; animation-delay:${delay}s;"></div>`;
        }).join('');

        setTimeout(() => {
            writeArea.style.display = 'none';
            successArea.style.display = 'block';
            renderSuccess(successArea);
        }, 800);
    }

    window.resetShredder = function () {
        const ta = document.getElementById('shredder-textarea');
        const stripped = document.getElementById('shredder-strips');
        const writeArea = document.getElementById('shredder-write-area');
        const successArea = document.getElementById('shredder-success');
        if (ta) { ta.value = ''; ta.style.animation = 'none'; }
        if (stripped) { stripped.style.display = 'none'; stripped.innerHTML = ''; }
        if (writeArea) writeArea.style.display = 'block';
        if (successArea) { successArea.style.display = 'none'; successArea.innerHTML = ''; }
    };

    function validateShredInput() {
        const ta = document.getElementById('shredder-textarea');
        if (!ta || !ta.value.trim()) {
            if (ta) {
                ta.style.borderColor = '#ef4444';
                ta.placeholder = '먼저 힘든 일을 적어주세요!';
                ta.focus();
                setTimeout(() => { ta.style.borderColor = '#fca5a5'; }, 1500);
            }
            return null;
        }
        return ta.value.trim();
    }

    /* --- 그냥 파쇄 (AI 없이) --- */
    window.doShred = function () {
        if (!validateShredInput()) return;
        runShredAnimation((successArea) => {
            const pick = SHRED_MESSAGES[Math.floor(Math.random() * SHRED_MESSAGES.length)];
            successArea.innerHTML = `
                <div style="font-size:4rem; margin-bottom:16px;">${pick.emoji}</div>
                <h3 style="font-size:1.15rem; font-weight:900; color:var(--text-2); margin-bottom:10px; white-space:pre-line;">${pick.msg}</h3>
                <p style="font-size:0.85rem; color:var(--text-6); margin-top:16px;">3초 후 자동으로 닫힙니다</p>`;
            let countdown = 3;
            const timer = setInterval(() => {
                countdown--;
                const p = successArea.querySelector('p');
                if (p) p.textContent = `${countdown}초 후 파쇄기가 다시 준비됩니다...`;
                if (countdown <= 0) { clearInterval(timer); window.resetShredder(); }
            }, 1000);
        });
    };

    /* ===== 정서 동반자: 선배에게 털어놓기 =====
       원칙: 원본 텍스트는 Edge Function이 위로 생성에만 쓰고 폐기.
             DB에는 힘듦 정도·주제 태그·위로 한 줄, 세 조각만 남는다. */
    const SAFETY_RESOURCES_HTML = `
        <div style="margin-top:16px; background:#fef2f2; border:1.5px solid #fecaca; border-radius:14px; padding:16px; text-align:left;">
            <p style="font-size:0.9rem; font-weight:800; color:#b91c1c; margin-bottom:8px;">🫶 지금 마음이 많이 무거워 보여요</p>
            <p style="font-size:0.85rem; color:var(--text-4); line-height:1.6; margin-bottom:10px;">
                여기서 다 풀어내려 하지 않아도 괜찮아요. 전문가와 이야기하면 훨씬 든든합니다.</p>
            <p style="font-size:0.88rem; color:var(--text-3); line-height:1.8; margin:0;">
                📞 <strong>자살예방 상담전화 109</strong> (24시간)<br>
                📞 <strong>정신건강 위기상담 1577-0199</strong> (24시간)<br>
                📞 <strong>보건복지상담센터 129</strong></p>
        </div>`;

    const COMFORT_DISCLAIMER = '<p style="font-size:0.75rem; color:var(--text-6); margin-top:14px; text-align:center;">이 기능은 전문 심리상담을 대체하지 않습니다 · 적은 글은 저장되지 않아요</p>';

    window.startComfort = async function () {
        const text = validateShredInput();
        if (!text) return;

        // 프론트엔드 일일 사용량 제한 (API 비용 절감)
        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const todayStr = kstTime.toISOString().split('T')[0];
        const limitKey = 'comfort_usage_' + todayStr;
        let usageCount = parseInt(localStorage.getItem(limitKey) || '0', 10);
        
        if (usageCount >= 3) {
            alert('오늘은 선배와 충분히 이야기했어요. 🌙\n내일 다시 찾아와 주세요. (하루 3회 제한)\n지금은 바로 파쇄만 할 수 있어요.');
            return;
        }

        const btn = document.getElementById('comfort-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '🌿 선배가 읽고 있어요...'; }

        let payload = null, errCode = null;
        try {
            const session = await ensureAnonSession();
            if (!session) throw new Error('no_session');
            const { data, error } = await supabase.functions.invoke('comfort', { body: { text } });
            if (error) {
                try { errCode = (await error.context.json()).error; } catch (_) { errCode = 'network'; }
            } else {
                payload = data;
            }
        } catch (_) {
            errCode = errCode || 'network';
        }

        if (btn) { btn.disabled = false; btn.innerHTML = '💬 선배에게 털어놓고 파쇄하기'; }

        if (errCode === 'unauthorized' && !window.__comfortRetried) {
            // 세션이 깨진 경우(예: 서버측 계정 정리) — 새 익명 세션으로 1회 자동 재시도
            window.__comfortRetried = true;
            try { await supabase.auth.signOut(); } catch (_) { /* noop */ }
            sabokAuthPromise = null;
            return window.startComfort();
        }
        if (payload && payload.comfort) window.__comfortRetried = false;

        if (errCode === 'daily_limit') {
            alert('오늘은 선배와 충분히 이야기했어요. 🌙\n내일 다시 찾아와 주세요. 지금은 바로 파쇄만 할 수 있어요.');
            return;
        }
        if (!payload || !payload.comfort) {
            alert('지금은 선배와 연결이 어려워요. 😢\n아래 "위로 없이 바로 파쇄하기"는 언제든 가능해요.');
            return;
        }

        // 성공적으로 응답을 받았을 때만 카운트 증가
        usageCount++;
        localStorage.setItem(limitKey, usageCount.toString());

        runShredAnimation((successArea) => {
            const saved = payload.saved || {};
            const hd = Math.min(5, Math.max(0, saved.hardness || 0));
            const dots = '●'.repeat(hd) + '○'.repeat(5 - hd);
            const tags = (saved.topic_tags || []).map(t =>
                `<span style="display:inline-block; background:#f0fdf4; color:#16a34a; border-radius:999px; padding:3px 10px; font-size:0.78rem; font-weight:700; margin:2px;">${escapeHtml(t)}</span>`).join('');
            successArea.innerHTML = `
                <div style="font-size:3rem; margin-bottom:10px;">🌿</div>
                <p style="font-size:0.8rem; font-weight:800; color:#16a34a; letter-spacing:0.05em; margin-bottom:12px;">선배의 답장</p>
                <div style="background:var(--surface-2); border:1.5px solid var(--border); border-radius:16px; padding:20px; text-align:left;">
                    <p style="font-size:0.98rem; color:var(--text-2); line-height:1.75; margin:0; white-space:pre-line;">${escapeHtml(payload.comfort)}</p>
                </div>
                ${payload.safety_flag ? SAFETY_RESOURCES_HTML : ''}
                <div style="margin-top:14px; font-size:0.82rem; color:var(--text-5);">
                    오늘의 흔적 — 힘듦 <span style="color:#f97316; letter-spacing:2px;">${dots}</span><br>
                    <span style="display:inline-block; margin-top:6px;">${tags}</span>
                </div>
                <button onclick="resetShredder()" style="width:100%; margin-top:18px; padding:15px; background:linear-gradient(135deg,#16a34a,#15803d); color:#fff; border:none; border-radius:14px; font-size:1rem; font-weight:800; cursor:pointer;">확인 — 오늘도 수고했어요</button>
                <button onclick="openGrowthView()" style="width:100%; margin-top:10px; padding:12px; background:var(--surface-3); color:var(--text-3); border:none; border-radius:12px; font-size:0.9rem; font-weight:700; cursor:pointer;">🌱 나의 성장 궤적 보기</button>
                ${COMFORT_DISCLAIMER}`;
        });
    };

    /* ===== 성장 궤적 (회고) — 추세 우선, 개별 날짜 파고들기 지양 ===== */
    window.openGrowthView = async function () {
        const body = document.getElementById('shredder-body');
        const view = document.getElementById('growth-view');
        if (!body || !view) return;
        body.style.display = 'none';
        view.style.display = 'block';
        view.innerHTML = '<p style="text-align:center; color:var(--text-6); padding:60px 0;">궤적을 불러오는 중... 🌱</p>';

        let entries = [];
        const authFlags = { anonymous: false, linked: false };
        try {
            const session = await ensureAnonSession();
            if (session) {
                const u = session.user || {};
                authFlags.linked = (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google');
                authFlags.anonymous = !!u.is_anonymous && !authFlags.linked;
                const { data, error } = await supabase
                    .from('growth_entries')
                    .select('created_at, hardness, topic_tags, comfort_line')
                    .eq('user_id', u.id)
                    .order('created_at', { ascending: true })
                    .limit(500);
                if (!error && data) entries = data;
            }
        } catch (_) { /* noop */ }

        lastGrowthEntries = entries;
        view.innerHTML = renderGrowthView(entries, authFlags);
        // 자연스러운 순간에 딱 한 번: 궤적 3개 이상 + 아직 익명일 때만 권유
        if (authFlags.anonymous && entries.length >= 3 && !localStorage.getItem(LINK_OFFER_KEY)) {
            localStorage.setItem(LINK_OFFER_KEY, '1');
            showLinkOfferModal(entries.length);
        }
    };

    window.closeGrowthView = function () {
        const body = document.getElementById('shredder-body');
        const view = document.getElementById('growth-view');
        if (view) { view.style.display = 'none'; view.innerHTML = ''; }
        if (body) body.style.display = 'flex';
        window.resetShredder();
    };

    window.deleteAllGrowth = async function () {
        if (!confirm('지금까지 쌓인 성장 궤적을 전부 삭제할까요?\n삭제하면 되돌릴 수 없어요.')) return;
        try {
            const session = await ensureAnonSession();
            if (session) {
                await supabase.from('growth_entries').delete().eq('user_id', session.user.id);
            }
            alert('모든 궤적을 삭제했어요.');
            window.openGrowthView();
        } catch (_) {
            alert('삭제 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
        }
    };

    function fmtMD(iso) {
        const d = new Date(iso);
        return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    }

    function buildHardnessSvg(entries) {
        const W = 340, H = 140, PAD = 18;
        const n = entries.length;
        const x = i => n === 1 ? W / 2 : PAD + (W - PAD * 2) * (i / (n - 1));
        const y = h => H - PAD - (H - PAD * 2) * ((h - 1) / 4);
        const pts = entries.map((e, i) => `${x(i).toFixed(1)},${y(e.hardness).toFixed(1)}`);
        const line = pts.join(' ');
        const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
        const dots = entries.map((e, i) =>
            `<circle cx="${x(i).toFixed(1)}" cy="${y(e.hardness).toFixed(1)}" r="3.5" fill="#f97316"/>`).join('');
        const grid = [1, 2, 3, 4, 5].map(h =>
            `<line x1="${PAD}" y1="${y(h)}" x2="${W - PAD}" y2="${y(h)}" stroke="#f1f5f9" stroke-width="1"/>`).join('');
        return `
            <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">
                ${grid}
                <polygon points="${area}" fill="rgba(249,115,22,0.10)"/>
                <polyline points="${line}" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
                ${dots}
                <text x="${PAD}" y="${H - 4}" font-size="10" fill="#94a3b8">${fmtMD(entries[0].created_at)}</text>
                <text x="${W - PAD}" y="${H - 4}" font-size="10" fill="#94a3b8" text-anchor="end">${fmtMD(entries[n - 1].created_at)}</text>
            </svg>`;
    }

    function topTags(entries) {
        const cnt = {};
        entries.forEach(e => (e.topic_tags || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
        return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    }

    function renderGrowthView(entries, auth = {}) {
        const linkBanner = auth.linked
            ? `<p style="text-align:center; font-size:0.8rem; color:#ca8a04; font-weight:700; margin-bottom:14px;">💛 계정 연결됨 — 폰을 바꿔도 이 궤적 그대로예요</p>`
            : `
            <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:16px; padding:16px; margin-bottom:16px; text-align:left;">
                <p style="font-size:0.9rem; font-weight:900; color:#92400e; margin-bottom:6px;">☁️ 이 궤적, 지금은 이 기기에만 있어요</p>
                <p style="font-size:0.83rem; color:#78716c; line-height:1.6; margin-bottom:12px;">폰 바꾸는 순간 사르르 증발… 여기까지 걸어온 기록인데, 그러기엔 아깝잖아요?</p>
                <button onclick="linkKakao()" style="width:100%; padding:13px; background:#FEE500; color:var(--text-1); border:none; border-radius:12px; font-size:0.92rem; font-weight:800; cursor:pointer; margin-bottom:8px;">💬 카카오 3초 연결로 궤적 지키기</button>
                <button onclick="linkGoogle()" style="width:100%; padding:13px; background:var(--surface); color:var(--text-1); border:1px solid var(--border-strong); border-radius:12px; font-size:0.92rem; font-weight:800; cursor:pointer;">🌐 구글 3초 연결로 궤적 지키기</button>
                <p style="font-size:0.72rem; color:#a8a29e; margin-top:8px; text-align:center;">익명은 그대로. 아무에게도 공개되지 않아요.</p>
            </div>`;
        const back = `<button onclick="closeGrowthView()" style="background:none; border:none; font-size:0.9rem; font-weight:700; color:var(--text-5); cursor:pointer; padding:8px 0;">← 파쇄기로 돌아가기</button>`;
        const head = `
            <div style="text-align:center; margin:8px 0 20px;">
                <div style="font-size:3rem; margin-bottom:8px;">🌱</div>
                <h2 style="font-size:1.3rem; font-weight:900; color:var(--text-2);">나의 성장 궤적</h2>
                <p style="font-size:0.85rem; color:var(--text-5); margin-top:6px;">그날의 아픔이 아니라, 걸어온 흐름을 봐요.</p>
            </div>`;

        if (entries.length < 3) {
            return `${back}${head}${linkBanner}
                <div style="text-align:center; padding:30px 20px; background:var(--surface-2); border-radius:16px;">
                    <p style="font-size:0.95rem; color:var(--text-4); line-height:1.7;">
                        아직 궤적이 쌓이는 중이에요. (지금 ${entries.length}개)<br>
                        선배에게 세 번쯤 털어놓으면<br>여기서 흐름이 보이기 시작해요. 🌿</p>
                </div>
                ${COMFORT_DISCLAIMER}`;
        }

        const half = Math.floor(entries.length / 2);
        const earlyTags = topTags(entries.slice(0, half));
        const recentTags = topTags(entries.slice(half));
        const tagChip = (t, css) => `<span style="display:inline-block; background:${css}; border-radius:999px; padding:4px 12px; font-size:0.8rem; font-weight:700; margin:3px;">${escapeHtml(t)}</span>`;

        const lines = entries.slice(-10).reverse().map(e => `
            <div style="padding:12px 14px; background:var(--surface-2); border-radius:12px; margin-bottom:8px;">
                <p style="font-size:0.72rem; color:var(--text-6); margin-bottom:4px;">${fmtMD(e.created_at)}의 선배</p>
                <p style="font-size:0.88rem; color:var(--text-3); line-height:1.6; margin:0;">"${escapeHtml(e.comfort_line)}"</p>
            </div>`).join('');

        return `${back}${head}${linkBanner}
            <div style="background:var(--surface); border:1.5px solid var(--border); border-radius:16px; padding:16px; margin-bottom:16px;">
                <p style="font-size:0.85rem; font-weight:800; color:var(--text-3); margin-bottom:10px;">힘듦의 흐름 <span style="font-weight:400; color:var(--text-6);">(위로 갈수록 힘든 날)</span></p>
                ${buildHardnessSvg(entries)}
            </div>
            <div style="background:var(--surface); border:1.5px solid var(--border); border-radius:16px; padding:16px; margin-bottom:16px;">
                <p style="font-size:0.85rem; font-weight:800; color:var(--text-3); margin-bottom:10px;">이야기 주제의 변화</p>
                <p style="font-size:0.78rem; color:var(--text-6); margin-bottom:4px;">처음엔</p>
                <div>${earlyTags.map(t => tagChip(t, '#fff7ed; color:#ea580c')).join('') || '<span style="font-size:0.8rem; color:var(--text-6);">기록 없음</span>'}</div>
                <p style="font-size:0.78rem; color:var(--text-6); margin:10px 0 4px;">요즘은</p>
                <div>${recentTags.map(t => tagChip(t, '#f0fdf4; color:#16a34a')).join('') || '<span style="font-size:0.8rem; color:var(--text-6);">기록 없음</span>'}</div>
            </div>
            <div style="margin-bottom:16px;">
                <p style="font-size:0.85rem; font-weight:800; color:var(--text-3); margin-bottom:10px;">그때 들었던 말들</p>
                ${lines}
            </div>
            <p style="font-size:0.8rem; color:var(--text-5); text-align:center; line-height:1.6;">${entries.length}개의 흔적이 쌓였어요.<br>여기까지 걸어온 건 다른 누구도 아닌 당신이에요. 👏</p>
            <button id="growth-card-btn" onclick="downloadGrowthCard()" style="width:100%; margin-top:16px; padding:14px; background:linear-gradient(135deg,#3b82f6,#3b82f6); color:#fff; border:none; border-radius:14px; font-size:0.92rem; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(59, 130, 246,0.25);">🖼️ 이 궤적 카드로 저장하기</button>
            <button onclick="deleteAllGrowth()" style="width:100%; margin-top:10px; padding:12px; background:none; border:1.5px solid #fecaca; color:#ef4444; border-radius:12px; font-size:0.85rem; font-weight:700; cursor:pointer;">궤적 전체 삭제</button>
            ${COMFORT_DISCLAIMER}`;
    }

    /* ===== 성장 궤적 카드 내보내기 (이미지 저장) =====
       심리테스트 결과 카드(pgDownloadImage)와 같은 캔버스 다운로드 패턴을 그대로 따른다. */
    let lastGrowthEntries = [];

    window.downloadGrowthCard = async function () {
        const btn = document.getElementById('growth-card-btn');
        try {
            await buildGrowthCardImage(lastGrowthEntries);
            if (btn) {
                const oldBg = btn.style.background;
                btn.innerHTML = '✅ 저장 완료!';
                btn.style.background = '#4CAF50';
                setTimeout(() => {
                    btn.style.background = oldBg;
                    btn.innerHTML = '🖼️ 이 궤적 카드로 저장하기';
                }, 3000);
            }
        } catch (e) {
            alert('카드 저장에 실패했어요.\n(일부 브라우저 환경에서는 직접 다운로드가 제한될 수 있습니다.)');
            console.error(e);
        }
    };

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawHardnessSparkline(ctx, entries, x, y, w, h) {
        const n = entries.length;
        const px = i => n === 1 ? x + w / 2 : x + w * (i / (n - 1));
        const py = hVal => y + h - h * ((hVal - 1) / 4);
        ctx.beginPath();
        entries.forEach((e, i) => {
            const xx = px(i), yy = py(e.hardness);
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        });
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        entries.forEach((e, i) => {
            ctx.beginPath();
            ctx.arc(px(i), py(e.hardness), 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        });
    }

    function drawTagChips(ctx, tags, x, y, maxW) {
        ctx.textAlign = 'left';
        if (!tags.length) {
            ctx.font = '15px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('기록 없음', x, y + 16);
            return;
        }
        let cx2 = x;
        ctx.font = 'bold 16px Arial';
        tags.forEach(t => {
            const label = '#' + t;
            const tw = ctx.measureText(label).width + 24;
            if (cx2 + tw > x + maxW) return; // 카드 폭을 넘는 태그는 생략
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            roundRect(ctx, cx2, y, tw, 30, 15);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, cx2 + 12, y + 20);
            cx2 += tw + 8;
        });
    }

    async function buildGrowthCardImage(entries) {
        if (!entries || entries.length < 3) throw new Error('not_enough_entries');
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (_) { /* noop */ }
        }

        const W = 800, H = 1040;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#3b82f6');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        [[W * 0.88, H * 0.07, 150, 0.10], [W * 0.08, H * 0.93, 130, 0.08]].forEach(([x, y, r, a]) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fill();
        });

        const cx = W / 2;
        ctx.textAlign = 'center';

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('사복노트 — 나의 성장 궤적', cx, 60);

        ctx.font = '90px serif';
        ctx.fillText('🌱', cx, 175);

        ctx.font = 'bold 38px Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${entries.length}개의 흔적을 쌓았어요`, cx, 235);

        ctx.font = '20px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText('여기까지 걸어온 건 다른 누구도 아닌 나예요', cx, 268);

        // 힘듦의 흐름 카드
        const cardX = 60, cardY = 310, cardW = W - 120, cardH = 260;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(ctx, cardX, cardY, cardW, cardH, 20);
        ctx.fill();

        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('힘듦의 흐름 (위로 갈수록 힘든 날)', cardX + 24, cardY + 38);

        drawHardnessSparkline(ctx, entries, cardX + 24, cardY + 60, cardW - 48, cardH - 100);

        // 주제 변화 카드
        const tagCardY = cardY + cardH + 24, tagCardH = 180;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(ctx, cardX, tagCardY, cardW, tagCardH, 20);
        ctx.fill();

        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('이야기 주제의 변화', cardX + 24, tagCardY + 38);

        const half = Math.floor(entries.length / 2);
        const earlyTags = topTags(entries.slice(0, half));
        const recentTags = topTags(entries.slice(half));

        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('처음엔', cardX + 24, tagCardY + 68);
        drawTagChips(ctx, earlyTags, cardX + 24, tagCardY + 82, cardW - 48);

        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText('요즘은', cardX + 24, tagCardY + 132);
        drawTagChips(ctx, recentTags, cardX + 24, tagCardY + 146, cardW - 48);

        ctx.textAlign = 'center';
        ctx.font = '18px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('saboknote.com', cx, H - 24);

        return new Promise((resolve, reject) => {
            try {
                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `나의_성장_궤적_${entries.length}개.png`;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    /* ===== 2단계: 계정 연결 (익명 → 카카오 승격) =====
       원칙: 궤적이 쌓인 뒤 자연스러운 순간에 딱 한 번, 손실 회피로 권유.
             user_id가 유지되므로 쌓인 growth_entries는 그대로 이어진다. */
    const LINK_OFFER_KEY = 'sabok_link_offer_shown';
    const LINK_DONE_KEY = 'sabok_link_celebrated';

    window.linkKakao = async function () {
        try {
            localStorage.setItem('sabok_pending_provider', 'kakao');
            const session = await ensureAnonSession();
            if (!session) throw new Error('no_session');
            const { error } = await supabase.auth.linkIdentity({
                provider: 'kakao',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
            // 성공 시 카카오 로그인 페이지로 이동됨
        } catch (e) {
            const msg = String((e && e.message) || e);
            if (msg.indexOf('already') !== -1) {
                // 이 카카오는 이미 예전에 연결한 계정이 있음 → 승격(link) 대신 그 계정으로 로그인
                if (confirm('이 카카오는 예전에 이미 연결한 적이 있어요. 🙌\n그 계정으로 로그인해서 예전 기록(성장 궤적·게임·게시글)을 불러올까요?')) {
                    return window.signInKakao();
                }
            } else if (msg.indexOf('linking') !== -1 || msg.indexOf('disabled') !== -1) {
                alert('앗, 연결 기능이 아직 준비 중이에요. 조금만 기다려주세요! 🙏');
            } else {
                alert('연결에 실패했어요. 잠시 후 다시 시도해 주세요. 😢');
            }
        }
    };

    // 이미 카카오에 연결된 계정으로 되돌아가는 로그인 (기기 변경·재방문 시 복원 경로)
    window.signInKakao = async function () {
        try {
            localStorage.setItem('sabok_pending_provider', 'kakao');
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'kakao',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
        } catch (e) {
            alert('로그인에 실패했어요. 잠시 후 다시 시도해 주세요. 😢');
        }
    };

    window.linkGoogle = async function () {
        try {
            localStorage.setItem('sabok_pending_provider', 'google');
            const session = await ensureAnonSession();
            if (!session) throw new Error('no_session');
            const { error } = await supabase.auth.linkIdentity({
                provider: 'google',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
            // 성공 시 구글 로그인 페이지로 이동됨
        } catch (e) {
            const msg = String((e && e.message) || e);
            if (msg.indexOf('already') !== -1) {
                if (confirm('이 구글은 예전에 이미 연결한 적이 있어요. 🙌\n그 계정으로 로그인해서 예전 기록(성장 궤적·게임·게시글)을 불러올까요?')) {
                    return window.signInGoogle();
                }
            } else if (msg.indexOf('linking') !== -1 || msg.indexOf('disabled') !== -1) {
                alert('앗, 연결 기능이 아직 준비 중이에요. 조금만 기다려주세요! 🙏');
            } else {
                alert('연결에 실패했어요. 잠시 후 다시 시도해 주세요. 😢');
            }
        }
    };

    window.signInGoogle = async function () {
        try {
            localStorage.setItem('sabok_pending_provider', 'google');
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) throw error;
        } catch (e) {
            alert('로그인에 실패했어요. 잠시 후 다시 시도해 주세요. 😢');
        }
    };

    /* ===== 내 정보 탭 소셜 로그인 진입점 =====
       처음 연결이면 익명 계정 승격(linkIdentity),
       예전에 연결한 적 있으면 그 계정으로 로그인(signInWithOAuth).
       동기화 코드(sabok_user_id)는 연결 직전에 계정 메타데이터에 바인딩해
       다른 기기에서 로그인만 해도 닉네임·게시글·게임 기록까지 복원되게 한다. */
    window.socialLogin = async function (provider) {
        if (!supabase) { alert('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); return; }
        trackUse('login_click');
        const providerName = provider === 'google' ? '구글' : '카카오';
        try {
            localStorage.setItem('sabok_pending_provider', provider);
            const session = await ensureAnonSession();
            const u = session && session.user;
            if (u && (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google')) {
                alert('이미 소셜 계정으로 로그인돼 있어요. 😊');
                if (typeof initMypage === 'function') initMypage();
                return;
            }
            const hasAccount = confirm('예전에 ' + providerName + ' 계정을 연결한 적이 있나요?\n\n[확인] 네 — 그 계정으로 로그인해서 기존 기록을 불러올게요\n[취소] 아니요, 처음이에요 — 지금 이 기기의 기록을 계정에 묶을게요');
            const redirectTo = window.location.origin + window.location.pathname;
            if (hasAccount || !session) {
                // 기존 계정 로그인 (다른 기기에서 재로그인하는 경로)
                const { error } = await supabase.auth.signInWithOAuth({ provider: provider, options: { redirectTo: redirectTo } });
                if (error) throw error;
                return;
            }
            // 처음 연결: 동기화 코드를 계정에 먼저 심고 익명 → 소셜 승격
            try { await supabase.auth.updateUser({ data: { sabok_user_id: getOrCreateUserId() } }); } catch (_) { /* noop */ }
            const { error } = await supabase.auth.linkIdentity({ provider: provider, options: { redirectTo: redirectTo } });
            if (error) throw error;
        } catch (e) {
            const msg = String((e && e.message) || e);
            if (msg.indexOf('already') !== -1) {
                if (confirm('이 ' + providerName + ' 계정은 이미 연결돼 있어요. 🙌\n그 계정으로 로그인해서 기존 기록을 불러올까요?')) {
                    return provider === 'google' ? window.signInGoogle() : window.signInKakao();
                }
            } else if (msg.indexOf('linking') !== -1 || msg.indexOf('disabled') !== -1) {
                // 수동 연결 기능이 꺼져 있으면 로그인으로 대체
                return provider === 'google' ? window.signInGoogle() : window.signInKakao();
            } else {
                alert('로그인에 실패했어요. 잠시 후 다시 시도해 주세요. 😢');
            }
        }
    };

    // 로그아웃 — 소셜 세션 종료 + 이 기기 신원 초기화(재로그인 시 원래 기록으로 복원)
    window.logout = async function () {
        try {
            const session = await ensureAnonSession();
            const u = session && session.user;
            const linked = u && (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google');
            if (!linked) {
                alert('지금은 소셜 계정으로 로그인돼 있지 않아요. (익명 사용 중)');
                return;
            }
            if (!confirm('로그아웃할까요?\n이 기기는 완전히 새 동기화 코드로 초기화되고,\n다시 카카오/구글로 로그인하면 원래 기록으로 돌아와요. 🌱')) return;
            try { await supabase.auth.signOut(); } catch (_) { /* noop */ }
            // 로컬 신원 초기화 → 완전한 "새 기기" 상태
            try {
                localStorage.removeItem('sabok_user_id');
                localStorage.removeItem('saboks_anonymous_name');
                localStorage.removeItem(LINK_OFFER_KEY);
                localStorage.removeItem(LINK_DONE_KEY);
                localStorage.removeItem(SABOK_RESTORE_DECLINED_KEY);
                localStorage.removeItem('sabok_pending_provider');
                localStorage.removeItem(PS_KEY);   // 공용 PC에서 다음 사람에게 보관함이 보이지 않게
                localStorage.removeItem(COPY_COUNT_KEY);
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
                });
            } catch (_) { /* noop */ }
            sabokAuthPromise = null;
            alert('로그아웃됐어요. 이 기기에는 새 동기화 코드가 발급돼요.\n다시 카카오/구글로 로그인하면 기존 기록으로 돌아와요. 👋');
            location.reload();
        } catch (_) {
            alert('로그아웃 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
        }
    };

    function showLinkOfferModal(count) {
        if (document.getElementById('link-offer-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'link-offer-modal';
        wrap.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:9998; display:flex; align-items:center; justify-content:center; padding:24px;';
        wrap.innerHTML = `
            <div style="background:var(--surface); border-radius:24px; padding:28px 22px; max-width:340px; width:100%; text-align:center;">
                <div style="font-size:3rem; margin-bottom:10px;">🎒</div>
                <h3 style="font-size:1.15rem; font-weight:900; color:var(--text-2); line-height:1.5; margin-bottom:10px;">잠깐! 이 궤적,<br>잃어버리면 진짜 아까워요</h3>
                <p style="font-size:0.88rem; color:var(--text-4); line-height:1.65; margin-bottom:6px;">
                    ${count}개의 흔적이 쌓였는데, 지금은 <strong>이 기기에만</strong> 있어요.<br>
                    폰 바꾸면? 브라우저 정리하면? 사르르… 💨</p>
                <p style="font-size:0.82rem; color:var(--text-6); line-height:1.6; margin-bottom:16px;">
                    카카오 3초 연결이면 어느 기기에서든 그대로.<br>익명은 그대로 유지 — 아무에게도 공개 안 돼요.</p>
                <button onclick="document.getElementById('link-offer-modal').remove(); linkKakao();"
                    style="width:100%; padding:15px; background:#FEE500; color:var(--text-1); border:none; border-radius:14px; font-size:1rem; font-weight:800; cursor:pointer; margin-bottom:8px;">💬 카카오로 내 궤적 지키기</button>
                <button onclick="document.getElementById('link-offer-modal').remove(); linkGoogle();"
                    style="width:100%; padding:15px; background:var(--surface); color:var(--text-1); border:1px solid var(--border-strong); border-radius:14px; font-size:1rem; font-weight:800; cursor:pointer;">🌐 구글로 내 궤적 지키기</button>
                <button onclick="document.getElementById('link-offer-modal').remove();"
                    style="width:100%; margin-top:10px; padding:12px; background:none; border:none; color:var(--text-6); font-size:0.85rem; font-weight:700; cursor:pointer;">나중에 할게요 (제 기억력을 믿어볼게요)</button>
            </div>`;
        document.body.appendChild(wrap);
    }

    async function celebrateLinkIfNeeded() {
        try {
            if (localStorage.getItem(LINK_DONE_KEY)) return;
            const session = await ensureAnonSession();
            const u = session && session.user;
            if (!u || !(u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google')) return;
            localStorage.setItem(LINK_DONE_KEY, '1');
            const t = document.createElement('div');
            t.style.cssText = 'position:fixed; left:50%; bottom:90px; transform:translateX(-50%); background:#1e293b; color:#fff; padding:14px 20px; border-radius:14px; z-index:9999; font-size:0.9rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,0.25); max-width:90%; text-align:center; line-height:1.5;';
            t.innerHTML = '🎉 연결 완료! 이제 폰을 바꿔도, 앱을 지워도<br>당신의 성장 궤적은 안전해요.';
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 6000);
        } catch (_) { /* noop */ }
    }
    celebrateLinkIfNeeded();

    /* ===== 계정 통합 다리: 동기화 코드(sabok_user_id) ↔ 카카오/구글 계정 =====
       원리: 성장 궤적은 auth UUID에 묶여 카카오 연동만으로 따라오지만,
             닉네임·게시글·게임(sabok_user_id 체계)은 별개라 안 따라온다.
             그래서 이 동기화 코드를 auth 계정 메타데이터에 심어둔다.
             → 다른 기기에서 카카오 로그인만 하면 성장 궤적 + 동기화 코드까지 한 번에 복원. */
    const SABOK_RESTORE_DECLINED_KEY = 'sabok_restore_declined_for';

    async function applySabokId(sabokId) {
        // 계정에 저장돼 있던 동기화 코드를 이 기기에 적용 (닉네임·게임 데이터까지 복원)
        localStorage.setItem('sabok_user_id', sabokId);
        try {
            const { data } = await supabase.from('profiles').select('nickname').eq('user_id', sabokId).single();
            if (data && data.nickname) localStorage.setItem('saboks_anonymous_name', data.nickname);
        } catch (_) { /* noop */ }
        try {
            const { data: rankData } = await supabase.from('rankings').select('game_data').eq('user_id', sabokId).single();
            if (rankData && rankData.game_data) localStorage.setItem('gameData_' + sabokId, JSON.stringify(rankData.game_data));
        } catch (_) { /* noop */ }
        alert('연결된 계정에 저장돼 있던 기록을 불러왔어요.\n앱을 다시 시작합니다. 🌱');
        location.reload();
    }

    async function syncSabokAccount() {
        try {
            const session = await ensureAnonSession();
            const u = session && session.user;
            if (!u || !supabase) return;
            const linked = (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google');
            const meta = u.user_metadata || {};
            const localId = getOrCreateUserId();
            const storedId = meta.sabok_user_id;

            if (linked) {
                // 다른 기기에서 로그인 → 계정에 저장된 코드가 있고 이 기기와 다르면 복원 권유(1회)
                if (storedId && storedId !== localId) {
                    if (localStorage.getItem(SABOK_RESTORE_DECLINED_KEY) === storedId) return;
                    const ok = confirm('이 계정에 저장돼 있던 기존 기록(닉네임·게시글·사복키우기)을\n이 기기로 불러올까요?\n\n(지금 이 기기의 임시 기록은 사라져요)');
                    if (ok) { await applySabokId(storedId); return; }
                    localStorage.setItem(SABOK_RESTORE_DECLINED_KEY, storedId);
                    return;
                }
                // 계정에 코드가 아직 안 묶임(레거시 연결) → 이 기기에 실제 데이터가 있을 때만 바인딩
                if (!storedId) {
                    try {
                        const { data: prof } = await supabase.from('profiles').select('user_id').eq('user_id', localId).limit(1);
                        if (prof && prof.length) {
                            await supabase.auth.updateUser({ data: { sabok_user_id: localId } });
                        }
                    } catch (_) { /* noop */ }
                }
                return;
            }

            // 익명 상태 → 연결에 대비해 현재 동기화 코드를 계정 메타데이터에 저장해둔다
            if (storedId !== localId) {
                await supabase.auth.updateUser({ data: { sabok_user_id: localId } });
            }
        } catch (_) { /* noop */ }
    }
    syncSabokAccount();

    /* --- User Request Modal (무엇이든 요청해보살) --- */
    function initRequestModal() {
        const btn = document.getElementById('open-request-modal');
        if (btn) {
            btn.onclick = () => {
                const content = `
                <div style="text-align:center; padding: 10px 0;">
                    <div style="font-size:3rem; margin-bottom:12px; animation: float 3s ease-in-out infinite">🪔</div>
                    <h3 style="font-size:1.3rem; color:var(--text-dark); margin-bottom:8px; font-weight:900">사복 지니에게 소원 빌기</h3>
                    <p style="font-size:0.9rem; color:var(--text-5); margin-bottom:24px; line-height:1.7;">
                        필요한 프롬프트, 헷갈리는 복지 용어…<br>
                        무엇이든 소원을 말해보세요. ✨<br>
                        다음 업데이트 때 <strong style="color:var(--text-3);">사복 지니</strong>가 쓱- 들어드릴게요!
                    </p>
                    
                    <div style="text-align:left; margin-bottom:20px;">
                        <label style="font-size:0.85rem; font-weight:800; color:var(--text-4); display:block; margin-bottom:8px;">어떤 카테고리의 요청인가요?</label>
                        <select id="request-category" class="calc-input" style="font-size:0.95rem; padding:12px; border:1px solid var(--border-strong); border-radius:10px; background:var(--surface-2);">
                            <option value="prompt">🪄 AI 비밀 프롬프트 추가 요청</option>
                            <option value="voca">📖 초보복지사 생존단어 추가 요청</option>
                            <option value="calc">💸 행정/회계 마스터 계산기 추가 요청</option>
                            <option value="other">💡 기타 아이디어 및 건의사항</option>
                        </select>
                    </div>

                    <div style="text-align:left; margin-bottom:24px;">
                        <label style="font-size:0.85rem; font-weight:800; color:var(--text-4); display:block; margin-bottom:8px;">자세한 내용을 적어주세요</label>
                        <textarea id="request-content" class="calc-input" placeholder="예: 사례관리 기록할 때 쓸 수 있는 프롬프트 좀 만들어주세요!&#10;예: '결연후원' 정확한 행정 처리 뜻이 뭔가요?" style="height:120px; font-size:0.95rem; padding:14px; border:1px solid var(--border-strong); border-radius:10px; resize:none;"></textarea>
                    </div>

                    <button class="btn-primary" style="width:100%; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding:16px; font-size:1.1rem; border-radius:12px; box-shadow:0 4px 14px rgba(245,158,11,0.3); border:none;" onclick="submitRequest()">🪔 램프 문지르기 (요청 전송)</button>
                </div>
            `;
                openModal('사복천재 소환하기', content, 'request');
            };
        }
    }

    window.subscribeNewsletter = async function () {
        const myUserId = getOrCreateUserId();
        const emailEl = document.getElementById('newsletter-email');
        const agreeEl = document.getElementById('newsletter-agree');
        const email = emailEl ? emailEl.value.trim() : '';

        if (!email || !email.includes('@')) {
            emailEl.style.borderColor = '#2563eb';
            emailEl.focus();
            setTimeout(() => { emailEl.style.borderColor = 'var(--border)'; }, 1500);
            return;
        }
        if (!agreeEl || !agreeEl.checked) {
            agreeEl.closest('label').style.borderColor = '#ef4444';
            agreeEl.closest('label').style.background = '#fff5f5';
            setTimeout(() => {
                agreeEl.closest('label').style.borderColor = '#dbeafe';
                agreeEl.closest('label').style.background = '#f5f9ff';
            }, 1500);
            return;
        }

        const btn = document.querySelector('button[onclick="subscribeNewsletter()"]');
        if (btn) {
            btn.innerText = '접수 중...';
            btn.disabled = true;
        }

        if (supabase) {
            try {
                await supabase.from('newsletter_subscribers').insert({
                    email: email,
                    user_id: myUserId || 'anonymous',
                    agreed_to_terms: agreeEl.checked,
                    created_at: new Date().toISOString()
                });
            } catch (e) {
                console.error('Subscription Error', e);
                alert('앗! 등록 중에 오류가 발생했어요. 나중에 다시 시도해주세요.');
                if (btn) {
                    btn.innerText = '💌 나도 이 편지 받을래!';
                    btn.disabled = false;
                }
                return;
            }
        }

        try { localStorage.setItem(NL_DONE_KEY, '1'); } catch (e) { /* noop */ }
        trackUse('newsletter_sub');

        // 구독 완료 UI
        const body = document.getElementById('modal-body');
        if (body) {
            body.innerHTML = `
                <div style="text-align:center; padding:30px 0;">
                    <div style="font-size:3.5rem; margin-bottom:16px; animation:float 3s ease-in-out infinite">💌</div>
                    <h3 style="font-size:1.2rem; font-weight:900; color:#1e40af; margin-bottom:10px;">오케이! 접수됐어 💙</h3>
                    <p style="font-size:0.9rem; color:var(--text-5); line-height:1.6;">평생 무료로 비밀 편지 보내줄게!<br>팀장님 몰래 잘 읽어봐 😎</p>
                </div>`;
        }
    };

    /* --- 베타 이벤트: 이메일 남기면 안티그래비티 IDE 전자책 PDF 바로 다운로드 ---
       이메일은 비밀편지 구독자(newsletter_subscribers)로 함께 저장 → 정식 출시 알림 대상 */
    const EBOOK_PDF_URL = '/downloads/saboknote-antigravity-ide-beta.pdf';
    const EBOOK_DONE_KEY = 'saboknote_ebook_beta_done';

    function ebookDownloadHtml(already) {
        return `
            <div style="text-align:center; padding:24px 0 8px;">
                <div style="font-size:3.2rem; margin-bottom:12px;">🎉</div>
                <h3 style="font-size:1.15rem; font-weight:900; color:#1e40af; margin-bottom:8px;">${already ? '다시 받으러 오셨군요!' : '신청 완료! 바로 받아가세요'}</h3>
                <p style="font-size:0.88rem; color:var(--text-5); line-height:1.6; margin-bottom:20px;">정식 출시되면 베타 참여자에게<br>가장 먼저 알려드릴게요 💙</p>
                <a href="${EBOOK_PDF_URL}" download="사복노트_안티그래비티IDE_실전마스터_베타.pdf"
                   style="display:block; text-decoration:none; background:linear-gradient(135deg,#2563eb,#1e40af); color:#fff; font-weight:900; font-size:1.05rem; padding:16px; border-radius:12px; box-shadow:0 4px 14px rgba(37,99,235,0.3);">📥 PDF 전자책 다운로드</a>
                <p style="font-size:0.75rem; color:var(--text-6); margin-top:12px;">휴대폰에서 안 열리면 '파일' 앱이나 다운로드 폴더를 확인해 주세요.</p>
            </div>`;
    }

    window.openEbookGate = function () {
        let done = false;
        try { done = localStorage.getItem(EBOOK_DONE_KEY) === '1'; } catch (e) { /* noop */ }
        if (done) { openModal('📥 실전 레시피 PDF', ebookDownloadHtml(true), 'ebook'); return; }
        const content = `
        <div style="text-align:center; padding:12px 0 4px;">
            <div style="font-size:3rem; margin-bottom:10px;">📘</div>
            <h3 style="font-size:1.2rem; color:var(--text-dark); margin-bottom:8px; font-weight:900; word-break:keep-all;">안티그래비티 IDE 실전 마스터 <span style="white-space:nowrap;">(베타)</span></h3>
            <p style="font-size:0.9rem; color:var(--text-5); margin-bottom:20px; line-height:1.6;">레시피 8개 + 프롬프트 40개 + 치트시트를<br>한 권으로 정리한 <b>PDF 전자책</b>이에요.<br>이메일만 남기면 <b>바로 다운로드</b>돼요.</p>
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <input type="email" id="ebook-email" class="calc-input" placeholder="이메일 주소 입력" style="font-size:1rem; padding:14px; border:2px solid var(--border); border-radius:12px;">
                <label id="ebook-agree-label" style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; padding:12px; background:#f5f9ff; border-radius:12px; border:1px solid #dbeafe;">
                    <input type="checkbox" id="ebook-agree" style="width:18px; height:18px; accent-color:#2563eb; flex-shrink:0; margin-top:2px;">
                    <span style="font-size:0.8rem; color:var(--text-4); line-height:1.5;">
                        [필수] <strong style="color:#2563eb;">개인정보 수집·이용</strong>에 동의해요<br>
                        <span style="color:var(--text-6); font-size:0.75rem;">수집 항목: 이메일 · 목적: 비밀편지(뉴스레터)와 정식 출시 안내 발송 · 보관: 구독 취소 시까지 (언제든 취소 가능)</span>
                    </span>
                </label>
                <button class="btn-primary" id="ebook-submit" style="background:linear-gradient(135deg,#2563eb 0%,#1e40af 100%); padding:16px; font-size:1.05rem; border-radius:12px;" onclick="submitEbookGate()">📥 PDF 받기</button>
            </div>
        </div>`;
        openModal('📥 실전 레시피 PDF 받기', content, 'ebook');
    };

    window.submitEbookGate = async function () {
        const emailEl = document.getElementById('ebook-email');
        const agreeEl = document.getElementById('ebook-agree');
        const label = document.getElementById('ebook-agree-label');
        const email = emailEl ? emailEl.value.trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailEl.style.borderColor = '#ef4444'; emailEl.focus();
            setTimeout(() => { emailEl.style.borderColor = 'var(--border)'; }, 1500);
            return;
        }
        if (!agreeEl || !agreeEl.checked) {
            label.style.borderColor = '#ef4444'; label.style.background = '#fff5f5';
            setTimeout(() => { label.style.borderColor = '#dbeafe'; label.style.background = '#f5f9ff'; }, 1500);
            return;
        }
        const btn = document.getElementById('ebook-submit');
        if (btn) { btn.innerText = '준비 중...'; btn.disabled = true; }

        // 저장에 실패해도 다운로드는 막지 않는다 (무료 이벤트이므로 사용자 경험 우선)
        if (supabase) {
            try {
                const { error } = await withTimeout(supabase.from('newsletter_subscribers').insert({
                    email: email,
                    user_id: getOrCreateUserId() || 'anonymous',
                    agreed_to_terms: true,
                    created_at: new Date().toISOString()
                }));
                if (error) console.error('Ebook gate save error', error);
            } catch (e) { console.error('Ebook gate save error', e); }
        }
        try { localStorage.setItem(EBOOK_DONE_KEY, '1'); localStorage.setItem(NL_DONE_KEY, '1'); } catch (e) { /* noop */ }
        trackUse('ebook_get');

        const body = document.getElementById('modal-body');
        if (body) body.innerHTML = ebookDownloadHtml(false);
    };

    /* --- AI 프롬프트 워크북 PDF: 이메일 남기면 바로 다운로드 (비밀편지 구독자로 함께 저장) ---
       비밀편지를 이미 구독한 기기는 이메일을 다시 묻지 않는다. */
    const WORKBOOK_PDF_URL = '/downloads/saboknote-prompt-workbook.pdf';
    const WORKBOOK_DONE_KEY = 'saboknote_workbook_done';

    function workbookDownloadHtml(mode) {
        const title = mode === 'again' ? '다시 받으러 오셨군요!' : mode === 'subscriber' ? '비밀편지 구독자는 바로 받아 가세요' : '신청 완료! 바로 받아 가세요';
        return `
            <div style="text-align:center; padding:24px 0 8px;">
                <div style="font-size:3.2rem; margin-bottom:12px;">📘</div>
                <h3 style="font-size:1.15rem; font-weight:900; color:#1e40af; margin-bottom:8px;">${title}</h3>
                <p style="font-size:0.88rem; color:var(--text-5); line-height:1.6; margin-bottom:20px;">강의 교재로 써도 좋아요.<br>우리 기관도 함께 배우고 싶다면 교육 문의를 남겨 주세요.</p>
                <a href="${WORKBOOK_PDF_URL}" download="사복노트_AI프롬프트워크북_초안.pdf"
                   style="display:block; text-decoration:none; background:linear-gradient(135deg,#2563eb,#1e40af); color:#fff; font-weight:900; font-size:1.05rem; padding:16px; border-radius:12px; box-shadow:0 4px 14px rgba(37,99,235,0.3);">📥 워크북 PDF 다운로드</a>
                <button class="btn-primary btn-outline" onclick="openEduModal()" style="margin-top:10px; width:100%; padding:13px; border-radius:12px;">🏫 기관 교육 문의</button>
                <p style="font-size:0.75rem; color:var(--text-6); margin-top:12px;">휴대폰에서 안 열리면 '파일' 앱이나 다운로드 폴더를 확인해 주세요.</p>
            </div>`;
    }

    window.openWorkbookGate = function () {
        trackUse('workbook_open');
        let done = false, subscribed = false;
        try {
            done = localStorage.getItem(WORKBOOK_DONE_KEY) === '1';
            subscribed = localStorage.getItem(NL_DONE_KEY) === '1';
        } catch (e) { /* noop */ }
        if (done || subscribed) {
            if (!done) { try { localStorage.setItem(WORKBOOK_DONE_KEY, '1'); } catch (e) { /* noop */ } trackUse('workbook_get'); }
            openModal('📘 AI 프롬프트 워크북', workbookDownloadHtml(done ? 'again' : 'subscriber'), 'workbook');
            return;
        }
        const content = `
        <div style="text-align:center; padding:12px 0 4px;">
            <div style="font-size:3rem; margin-bottom:10px;">📘</div>
            <h3 style="font-size:1.2rem; color:var(--text-dark); margin-bottom:8px; font-weight:900; word-break:keep-all;">AI 프롬프트 워크북 <span style="white-space:nowrap;">(초안)</span></h3>
            <p style="font-size:0.9rem; color:var(--text-5); margin-bottom:20px; line-height:1.6; word-break:keep-all;">사례관리 기록·사업계획서에 많이 쓰는 프롬프트 6개를<br>빈칸 채우기 실습지로 묶은 <b>PDF</b>예요.<br>이메일만 남기면 <b>바로 받을 수 있어요.</b></p>
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
                <input type="email" id="wb-email" class="calc-input" placeholder="이메일 주소 입력" autocomplete="email" style="font-size:1rem; padding:14px; border:2px solid var(--border); border-radius:12px;">
                <label id="wb-agree-label" style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; padding:12px; background:#f5f9ff; border-radius:12px; border:1px solid #dbeafe;">
                    <input type="checkbox" id="wb-agree" style="width:18px; height:18px; accent-color:#2563eb; flex-shrink:0; margin-top:2px;">
                    <span style="font-size:0.8rem; color:var(--text-4); line-height:1.5;">
                        [필수] <strong style="color:#2563eb;">개인정보 수집·이용</strong>에 동의해요<br>
                        <span style="color:var(--text-6); font-size:0.75rem;">수집 항목: 이메일 · 목적: 비밀편지(뉴스레터)와 새 자료 안내 발송 · 보관: 구독 취소 시까지 (언제든 취소 가능)</span>
                    </span>
                </label>
                <button class="btn-primary" id="wb-submit" style="background:linear-gradient(135deg,#2563eb 0%,#1e40af 100%); padding:16px; font-size:1.05rem; border-radius:12px;" onclick="submitWorkbookGate()">📥 워크북 받기</button>
            </div>
        </div>`;
        openModal('📘 AI 프롬프트 워크북 받기', content, 'workbook');
    };

    window.submitWorkbookGate = async function () {
        const emailEl = document.getElementById('wb-email');
        const agreeEl = document.getElementById('wb-agree');
        const label = document.getElementById('wb-agree-label');
        const email = emailEl ? emailEl.value.trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailEl.style.borderColor = '#ef4444'; emailEl.focus();
            setTimeout(() => { emailEl.style.borderColor = 'var(--border)'; }, 1500);
            return;
        }
        if (!agreeEl || !agreeEl.checked) {
            label.style.borderColor = '#ef4444'; label.style.background = '#fff5f5';
            setTimeout(() => { label.style.borderColor = '#dbeafe'; label.style.background = '#f5f9ff'; }, 1500);
            return;
        }
        const btn = document.getElementById('wb-submit');
        if (btn) { btn.innerText = '준비 중...'; btn.disabled = true; }
        // 저장에 실패해도 다운로드는 막지 않는다 (무료 자료이므로 사용자 경험 우선)
        if (supabase) {
            try {
                const { error } = await withTimeout(supabase.from('newsletter_subscribers').insert({
                    email: email,
                    user_id: getOrCreateUserId() || 'anonymous',
                    agreed_to_terms: true,
                    created_at: new Date().toISOString()
                }));
                if (error) console.error('Workbook gate save error', error);
            } catch (e) { console.error('Workbook gate save error', e); }
        }
        try { localStorage.setItem(WORKBOOK_DONE_KEY, '1'); localStorage.setItem(NL_DONE_KEY, '1'); } catch (e) { /* noop */ }
        trackUse('workbook_get');
        const body = document.getElementById('modal-body');
        if (body) body.innerHTML = workbookDownloadHtml('new');
    };

    /* --- 기관 AI 교육 문의: 문의 내용은 edu_inquiries 표에 저장 (보내기만 가능, 읽기는 대시보드에서만) --- */
    window.openEduModal = function () {
        trackUse('edu_open');
        const input = 'class="calc-input edu-input"';
        const content = `
        <div class="edu-wrap">
            <div style="text-align:center; padding:6px 0 14px;">
                <div style="font-size:2.8rem; margin-bottom:8px;">🏫</div>
                <h3 style="font-size:1.2rem; color:var(--text-dark); margin-bottom:8px; font-weight:900;">우리 기관 AI 실무 교육</h3>
                <p style="font-size:0.88rem; color:var(--text-5); line-height:1.6; word-break:keep-all;">참여자가 각자 노트북이나 휴대폰으로 사복노트 프롬프트를 따라 하며,<br>가상 사례로 기록 초안을 직접 써 보는 교육이에요.</p>
            </div>
            <div class="edu-course">
                <div class="edu-course-t">대표 과정 · 사례관리 기록·사업계획서, AI로 반나절 줄이기</div>
                <div class="edu-row"><b>대상</b><span>사회복지 기관 실무자</span></div>
                <div class="edu-row"><b>시간</b><span>2시간 실습 (기관 일정에 맞춰 조정)</span></div>
                <div class="edu-row"><b>내용</b><span>개인정보 가리는 원칙 → 프롬프트로 기록·계획서 초안 쓰기 → [확인 필요] 표시 검토 → 우리 기관 서식에 맞추기</span></div>
                <div class="edu-row"><b>방식</b><span>기관 출강 또는 온라인(줌)</span></div>
                <div class="edu-row"><b>교재</b><span>AI 프롬프트 워크북 제공</span></div>
            </div>
            <div class="edu-form">
                <label for="edu-org">기관명 <em>*</em></label>
                <input id="edu-org" ${input} maxlength="80" placeholder="예: 행복종합사회복지관">
                <label for="edu-name">담당자 성함 <em>*</em></label>
                <input id="edu-name" ${input} maxlength="40" placeholder="예: 홍길동">
                <label for="edu-contact">연락처 (이메일 또는 전화) <em>*</em></label>
                <input id="edu-contact" ${input} maxlength="100" placeholder="예: edu@welfare.or.kr 또는 02-000-0000">
                <div class="edu-2col">
                    <div>
                        <label for="edu-type">교육 방식</label>
                        <select id="edu-type" ${input}><option value="출강">기관 출강</option><option value="온라인">온라인(줌)</option><option value="미정" selected>아직 미정</option></select>
                    </div>
                    <div>
                        <label for="edu-count">예상 인원</label>
                        <input id="edu-count" ${input} maxlength="20" placeholder="예: 15명">
                    </div>
                </div>
                <label for="edu-when">희망 시기</label>
                <input id="edu-when" ${input} maxlength="40" placeholder="예: 11월 중순, 평일 오후">
                <label for="edu-msg">궁금한 점 (선택)</label>
                <textarea id="edu-msg" ${input} maxlength="1000" rows="3" placeholder="예: 신입 직원 대상으로 기록 위주로 하고 싶어요"></textarea>
                <label id="edu-agree-label" class="edu-agree">
                    <input type="checkbox" id="edu-agree">
                    <span>[필수] <strong>개인정보 수집·이용</strong>에 동의해요<br><small>수집 항목: 기관명, 담당자 이름, 연락처 · 목적: 교육 문의 답변 · 보관: 문의 처리 후 1년 (요청하면 바로 삭제)</small></span>
                </label>
                <button class="btn-primary" id="edu-submit" onclick="submitEduInquiry()">📨 교육 문의 보내기</button>
            </div>
        </div>`;
        openModal('🏫 기관 AI 교육 문의', content, 'edu');
    };

    window.submitEduInquiry = async function () {
        const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const org = val('edu-org'), name = val('edu-name'), contact = val('edu-contact');
        const missing = [['edu-org', org], ['edu-name', name], ['edu-contact', contact.length >= 5 ? contact : '']].find(([, v]) => !v);
        if (missing) {
            const el = document.getElementById(missing[0]);
            if (el) { el.style.borderColor = '#ef4444'; el.focus(); setTimeout(() => { el.style.borderColor = ''; }, 1500); }
            return;
        }
        const agree = document.getElementById('edu-agree');
        if (!agree || !agree.checked) {
            const label = document.getElementById('edu-agree-label');
            if (label) { label.style.borderColor = '#ef4444'; setTimeout(() => { label.style.borderColor = ''; }, 1500); }
            return;
        }
        if (!supabase) { alert('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); return; }
        const btn = document.getElementById('edu-submit');
        if (btn) { btn.disabled = true; btn.textContent = '보내는 중...'; }
        try {
            await ensureAnonSession();
            const type = val('edu-type');
            const { error } = await withTimeout(supabase.from('edu_inquiries').insert({
                org_name: org.slice(0, 80),
                contact_name: name.slice(0, 40),
                contact: contact.slice(0, 100),
                edu_type: ['출강', '온라인', '미정'].includes(type) ? type : '미정',
                headcount: val('edu-count').slice(0, 20) || null,
                preferred_date: val('edu-when').slice(0, 40) || null,
                message: val('edu-msg').slice(0, 1000) || null,
                agreed: true
            }));
            if (error) throw error;
        } catch (e) {
            console.error('Edu inquiry error', e);
            if (btn) { btn.disabled = false; btn.textContent = '📨 교육 문의 보내기'; }
            alert('문의를 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
            return;
        }
        trackUse('edu_inquiry');
        const body = document.getElementById('modal-body');
        if (body) body.innerHTML = `
            <div style="text-align:center; padding:30px 0;">
                <div style="font-size:3.5rem; margin-bottom:16px;">📨</div>
                <h3 style="font-size:1.15rem; font-weight:900; color:#1e40af; margin-bottom:10px;">문의가 접수됐어요</h3>
                <p style="font-size:0.9rem; color:var(--text-5); line-height:1.6; margin-bottom:20px;">남겨 주신 연락처로 연락드릴게요.<br>그동안 워크북을 먼저 살펴보셔도 좋아요.</p>
                <button class="btn-primary" onclick="openWorkbookGate()" style="width:100%; padding:14px; border-radius:12px;">📘 워크북 받기</button>
            </div>`;
    };

    window.submitRequest = async function () {
        const content = document.getElementById('request-content')?.value?.trim();
        const categoryEl = document.getElementById('request-category');
        const category = categoryEl ? categoryEl.options[categoryEl.selectedIndex].text : '기타';

        if (!content) {
            const ta = document.getElementById('request-content');
            ta.style.borderColor = '#f59e0b';
            ta.focus();
            setTimeout(() => { ta.style.borderColor = 'var(--border-strong)'; }, 1500);
            return;
        }

        if (!supabase) {
            alert('서버 연결 오류. 잠시 후 다시 시도해주세요.');
            return;
        }

        // 버튼 로딩 상태
        const btn = document.querySelector('#modal-body .btn-primary');
        if (btn) { btn.innerHTML = '전송 중... 🚀'; btn.disabled = true; btn.style.opacity = '0.7'; }

        try {
            const { error } = await supabase.from('requests').insert([{
                category,
                content,
                user_id: getOrCreateUserId(),
                created_at: new Date().toISOString()
            }]);

            if (error) throw error;

            // 성공 UI
            const modalBody = document.getElementById('modal-body');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div style="text-align:center; padding:30px 0;">
                        <div style="font-size:3.5rem; margin-bottom:16px;">🪄</div>
                        <h3 style="font-size:1.15rem; font-weight:900; color:#d97706; margin-bottom:10px;">소원 접수 완료! ✨</h3>
                        <p style="font-size:0.9rem; color:var(--text-5); line-height:1.6;">
                            사복천재가 확인하고<br>다음 업데이트 때 쓱- 추가해 드릴게요! 😊
                        </p>
                    </div>`;
            }
        } catch (err) {
            console.error('Request submit error:', err);
            if (btn) { btn.innerHTML = '🪔 램프 문지르기 (요청 전송)'; btn.disabled = false; btn.style.opacity = '1'; }
            alert('전송 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
        }
    };

    // ... (preceding functions) ...



    /* --- 2026 KPI Dashboard --- */

    // Base 100% Median Income for 1,2,3,4,5,6 person households (2026)
    const MED_INCOME_BASE = { 1: 2564238, 2: 4199292, 3: 5359036, 4: 6494738, 5: 7556719, 6: 8555952 };

    // Key KPI data for 2026
    const KPI_DATA_2026 = {
        basicLiving: {
            1: '820,556원',
            2: '1,343,773원',
            3: '1,714,892원',
            4: '2,078,316원',
            5: '2,418,150원',
            6: '2,737,905원'
        },
        ltcLimits: {
            1: '2,512,900원',
            2: '2,331,200원',
            3: '1,528,200원',
            4: '1,409,700원',
            5: '1,208,900원',
            6: '676,320원'
        }
    };

    function initDashboard() {
        const dashBtn = document.getElementById('open-dashboard');
        if (dashBtn) {
            dashBtn.onclick = () => {
                const ratios = [0.6, 0.8, 1.0, 1.2, 1.4, 1.8];
                let incomeHtml = '';

                [1, 2, 3, 4, 5, 6].forEach(size => {
                    let ratioBlocks = ratios.map(r => {
                        let val = Math.round(MED_INCOME_BASE[size] * r);
                        const isNew = r === 1.8;
                        return `<div class="result-item" style="padding:6px 0; border-bottom:1px solid var(--border); ${isNew ? 'background:#fffbeb;' : ''}">
                                <span class="result-label" style="color:${isNew ? '#d97706' : '#64748b'}; font-weight:${isNew ? '800' : '400'}">${Math.round(r * 100)}%${isNew ? ' 🆕' : ''}</span>
                                <span class="result-value" style="font-weight:700; color:var(--text-2)">${val.toLocaleString()}원</span>
                            </div>`;
                    }).join('');

                    incomeHtml += `
                    <div style="background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border); margin-bottom:12px;">
                        <p style="font-size:0.95rem; font-weight:800; color:var(--primary); margin-bottom:8px">🌳 ${size}인 가구 기준 중위소득</p>
                        ${ratioBlocks}
                    </div>
                    `;
                });

                const content = `
                <div class="admin-tabs" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:20px; padding:4px; background:var(--surface-3); border-radius:12px;">
                    <button class="tab-btn active" id="kpi-tab-wage" onclick="switchKpiTab('wage')" style="padding:10px 4px; border:none; border-radius:8px; background:var(--surface); font-weight:700; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.05); font-size:0.75rem; transition:all 0.2s; white-space:nowrap;">💰 최저임금</button>
                    <button class="tab-btn" id="kpi-tab-income" onclick="switchKpiTab('income')" style="padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.75rem; transition:all 0.2s; white-space:nowrap;">🌳 중위소득</button>
                    <button class="tab-btn" id="kpi-tab-basic" onclick="switchKpiTab('basic')" style="padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.75rem; transition:all 0.2s; white-space:nowrap;">🏠 생계급여</button>
                    <button class="tab-btn" id="kpi-tab-ltc" onclick="switchKpiTab('ltc')" style="padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.75rem; transition:all 0.2s; white-space:nowrap;">🌿 장기요양</button>
                </div>

                <div id="kpi-content-wage" style="animation: fadeIn 0.3s ease;">
                    <div style="background:var(--primary); color:white; padding:24px; border-radius:24px; margin-bottom:20px; position:relative; overflow:hidden">
                        <div style="position:relative; z-index:2">
                            <p style="font-size:0.85rem; opacity:0.8">올해의 핵심 숫자</p>
                            <h3 style="font-size:1.8rem; font-weight:900; margin-top:4px">10,320원</h3>
                            <p style="font-size:0.9rem; font-weight:700; margin-top:2px">2026년 최저임금 (시급)</p>
                        </div>
                        <div style="position:absolute; right:-20px; bottom:-20px; font-size:120px; opacity:0.1">💰</div>
                    </div>
                    <div style="background:var(--surface-2); padding:16px; border-radius:16px; border:1px solid var(--border);">
                        <p style="font-size:0.9rem; font-weight:800; color:var(--text-1); margin-bottom:12px;">📋 최저임금 상세</p>
                        <div class="result-item" style="padding:8px 0; border-bottom:1px solid var(--border);">
                            <span class="result-label" style="color:var(--text-5)">시급</span>
                            <span class="result-value" style="font-weight:700; color:var(--text-2)">10,320원</span>
                        </div>
                        <div class="result-item" style="padding:8px 0; border-bottom:1px solid var(--border);">
                            <span class="result-label" style="color:var(--text-5)">일급 (8시간)</span>
                            <span class="result-value" style="font-weight:700; color:var(--text-2)">82,560원</span>
                        </div>
                        <div class="result-item" style="padding:8px 0; border-bottom:1px solid var(--border);">
                            <span class="result-label" style="color:var(--text-5)">월급 (209시간)</span>
                            <span class="result-value" style="font-weight:700; color:var(--text-2)">2,156,880원</span>
                        </div>
                        <div class="result-item" style="padding:8px 0;">
                            <span class="result-label" style="color:var(--text-5)">전년 대비</span>
                            <span class="result-value" style="font-weight:700; color:#ef4444">↑ 1.7%</span>
                        </div>
                    </div>
                </div>

                <div id="kpi-content-income" style="display:none; animation: fadeIn 0.3s ease;">
                    <p style="font-size:1.0rem; font-weight:800; color:var(--text-1); margin-bottom:12px">💎 2026년 가구 규모별 중위소득 기준표</p>
                    ${incomeHtml}
                </div>

                <div id="kpi-content-basic" style="display:none; animation: fadeIn 0.3s ease;">
                    <div style="background:#fff1f2; padding:16px; border-radius:16px; border:1px solid #ffe4e6; margin-bottom:16px;">
                        <p style="font-size:0.9rem; font-weight:800; color:#e11d48; margin-bottom:4px;">📌 생계급여 선정기준</p>
                        <p style="font-size:0.8rem; color:#fb7185;">기준 중위소득의 32% 이하</p>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px">
                        ${Object.entries(KPI_DATA_2026.basicLiving).map(([size, val]) => `
                            <div style="background:#fff1f2; padding:12px; border-radius:12px; border:1px solid #ffe4e6">
                                <p style="font-size:0.75rem; color:#fb7185; margin-bottom:2px;">${size}인 가구</p>
                                <p style="font-size:1.0rem; font-weight:800; color:#e11d48">${val}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div id="kpi-content-ltc" style="display:none; animation: fadeIn 0.3s ease;">
                    <div style="background:var(--tint-primary); padding:16px; border-radius:16px; border:1px solid #e0f2fe; margin-bottom:16px;">
                        <p style="font-size:0.9rem; font-weight:800; color:#0369a1; margin-bottom:4px;">📌 장기요양 재가급여 월 한도액</p>
                        <p style="font-size:0.8rem; color:#0ea5e9;">2026년 기준 등급별 한도액</p>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:8px">
                        ${Object.entries(KPI_DATA_2026.ltcLimits).map(([grade, val]) => `
                            <div style="background:var(--tint-primary); padding:10px; border-radius:12px; border:1px solid #e0f2fe; text-align:center">
                                <p style="font-size:0.7rem; color:#0ea5e9; margin-bottom:2px;">${grade}등급</p>
                                <p style="font-size:0.9rem; font-weight:800; color:#0369a1">${val.replace('원', '')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top:24px; padding:16px; background:var(--surface-3); border-radius:16px; font-size:0.75rem; color:var(--text-5); line-height:1.5">
                    💡 위 지표는 보건복지부 고시 정보를 바탕으로 구성되었으며, 구체적인 자격 판정은 각각의 전용 계산기를 이용해 주세요.
                </div>
                `;
                openModal('2026 핵심 지표 대시보드', content, 'ltc');
                if (typeof switchKpiTab === 'function') switchKpiTab('wage');
            };
        }
    }

    window.switchKpiTab = function (tabName) {
        const tabs = ['wage', 'income', 'basic', 'ltc'];
        tabs.forEach(t => {
            const content = document.getElementById(`kpi-content-${t}`);
            const btn = document.getElementById(`kpi-tab-${t}`);
            if (content) content.style.display = t === tabName ? 'block' : 'none';
            if (btn) {
                if (t === tabName) {
                    btn.style.background = 'var(--surface)';
                    btn.style.color = 'var(--primary)';
                    btn.style.fontWeight = '700';
                    btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-5)';
                    btn.style.fontWeight = '600';
                    btn.style.boxShadow = 'none';
                }
            }
        });
    };

    window.showLTCUpdateDetails = function () {
        const content = `
            <div style="background:var(--tint-primary); border-radius:20px; padding:24px; margin-bottom:24px; border:1px solid #e0f2fe;">
                <h3 style="font-size:1.3rem; font-weight:900; color:#0369a1; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <span>⚖️</span> 2026년 장기요양 주요 변경사항
                </h3>
                <p style="font-size:0.95rem; color:#0c4a6e; line-height:1.6; margin-bottom:0;">
                    2026년도는 초고령사회 진입에 대응하여 <strong>재가 서비스 한도액이 대폭 인상</strong>되었습니다. 어르신들이 살던 곳에서 더 오래 머무실 수 있도록 지원이 강화되었습니다.
                </p>
            </div>

            <div class="kpi-section" style="margin-bottom:24px;">
                <p style="font-size:1rem; font-weight:800; color:var(--text-2); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                    <span style="color:#0ea5e9;">●</span> 등급별 재가급여 월 한도액 (2026)
                </p>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem; text-align:center;">
                        <thead>
                            <tr style="background:var(--surface-2); border-bottom:2px solid var(--border);">
                                <th style="padding:12px; color:var(--text-5);">등급</th>
                                <th style="padding:12px; color:var(--text-5);">월 한도액</th>
                                <th style="padding:12px; color:var(--text-5);">증감률</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:12px; font-weight:700;">1등급</td>
                                <td style="padding:12px; font-weight:800; color:#0369a1;">2,512,900원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 22.3%</td>
                            </tr>
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:12px; font-weight:700;">2등급</td>
                                <td style="padding:12px; font-weight:800; color:#0369a1;">2,331,200원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 20.1%</td>
                            </tr>
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:12px; font-weight:700;">3등급</td>
                                <td style="padding:12px; font-weight:800; color:var(--text-2);">1,528,200원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 18.5%</td>
                            </tr>
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:12px; font-weight:700;">4등급</td>
                                <td style="padding:12px; font-weight:800; color:var(--text-2);">1,409,700원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 16.2%</td>
                            </tr>
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:12px; font-weight:700;">5등급</td>
                                <td style="padding:12px; font-weight:800; color:var(--text-2);">1,208,900원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 14.8%</td>
                            </tr>
                            <tr>
                                <td style="padding:12px; font-weight:700;">인지지원</td>
                                <td style="padding:12px; font-weight:800; color:var(--text-2);">676,320원</td>
                                <td style="padding:12px; color:#ef4444; font-weight:700;">↑ 12.0%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="background:var(--surface-2); border-radius:16px; padding:20px; border:1px solid var(--border);">
                <h4 style="font-size:0.95rem; font-weight:800; color:var(--text-2); margin-bottom:10px;">✨ 실무자 체크포인트</h4>
                <ul style="padding-left:18px; margin:0; font-size:0.85rem; color:var(--text-4); line-height:1.7;">
                    <li>가족요양비 보전 금액이 등급별로 세분화되었습니다.</li>
                    <li>주야간보호 미이용 시에도 방문요양 추가 한도 활용이 가능해졌습니다.</li>
                    <li>본인부담금 감경 대상자(40~60%) 범위가 확대되었으니 대상자별 재확인이 필요합니다.</li>
                </ul>
            </div>

            <div style="margin-top:24px; text-align:center;">
                <button class="btn-primary" onclick="closeModal()" style="width:100%; max-width:200px; background:#1e293b;">확인하였습니다</button>
            </div>
        `;
        openModal('2026 장기요양 업데이트 안내', content, 'ltc');
    }

    // ... (previous code above) ...

    /* --- 사복천재의 비밀 프롬프트 (AI Work Prompter) ---
       2026 작성법 기준: 역할 나열 대신 목적·독자를 설명하고, 지시와 입력(<입력>)을 분리하고,
       입력에 없는 사실은 [확인 필요]로 남기게 한다. 공통 규칙과 입력 칸은 buildPrompt()에서 붙인다. */

    const AI_PROMPTS = {
        /* ===== 사업 및 행정 ===== */
        proposal: {
            title: "공모사업 프로포절 기획 전문가",
            icon: "📄",
            description: "사용 상황: 머릿속엔 '좋은 일 하고 싶다'는 생각뿐인데, 지원 양식은 '논리적 근거'를 내놓으라며 압박할 때. 하얀 종이를 3시간째 노려보다 눈싸움에서 졌을 때 사용하세요.",
            prompt: `당신은 공모사업 심사 경험이 많은 사회복지 사업 기획 전문가입니다.
사회복지사가 공모사업 계획서 초안을 쓰도록 돕습니다. 심사위원은 짧은 시간에 많은 계획서를 읽기 때문에 "왜 이 사업이 지금, 이 지역에, 이 방식으로 필요한가"가 첫 장에서 보여야 합니다.

## 작성 원칙
1. 필요성은 <입력>의 근거 자료(욕구조사, 대기자 수, 기관 사례)를 중심으로 쓰세요. 통계가 더 필요하면 숫자를 만들지 말고 [확인 필요: 넣으면 좋은 통계 / 찾을 곳 예: KOSIS, 지자체 지역사회보장계획]으로 자리만 남기세요. 출처 없는 숫자는 감점 요인입니다. 기관 자료도 적힌 그대로만 쓰고, 그 안의 내용(예: 상담 문의의 주요 내용)을 짐작해 덧붙이지 마세요.
2. 대상자를 '결핍'이 아니라 권리와 강점의 언어로 설명하세요.
3. 기존 공공·민간 서비스로 채워지지 않는 빈틈을 짚고, 이 사업이 그 빈틈을 어떻게 메우는지 구체적으로 연결하세요.
4. 투입 → 활동 → 산출 → 성과가 한 줄로 이어지게 짜세요. 산출목표(무엇을 몇 회·몇 명에게)와 성과목표(참여자에게 생길 변화)를 나누고, 성과목표마다 측정 도구와 측정 시기를 적으세요. 측정 도구는 실제로 있는 표준화 척도만 제안하고, 한국판 여부나 사용 승인이 불확실하면 [확인 필요]로 표시하세요.
5. 실천 이론(강점관점, 임파워먼트, 지역사회조직 모델 등)은 사업 설계와 실제로 연결될 때만 쓰고, 이름만 나열하지 마세요.
6. 공모 양식 목차나 분량 제한이 있으면 그대로 따르세요.

## 결과물 형식
- 사업명 후보 3개와 슬로건
- 추진 배경 및 필요성 (현황 → 문제의 심각성 → 기존 서비스의 한계)
- 사업 대상과 선정 기준, 모집 방법
- 사업 목적과 목표 (산출목표 / 성과목표, SMART로)
- 논리모델 표 (투입 | 활동 | 산출 | 성과 | 측정 방법)
- 세부 추진 내용과 월별 일정, 협력 기관과 역할
- 예산안 (항목 | 산출 근거(단가×수량) | 금액) — 공모처 예산 기준(인건비 비율 등)은 [확인 필요]
- 평가 계획 (성과목표별 측정 도구, 시기, 방법)
- 사업이 끝난 뒤에도 이어 갈 방안
- 예상 위험(모집 저조, 중도 탈락 등)과 대응
- 기대효과
- 심사위원 눈으로 본 약점 3가지와 보완 방법

## 다 쓴 뒤 점검
- 필요성 → 목표 → 활동 → 성과가 서로 맞물리는가
- 모든 성과목표에 측정 방법이 있는가
- 근거 없는 숫자가 들어가지 않았는가`,
            fields: [
                "사업 아이디어·키워드",
                "대상과 지역 (예: OO구 독거 어르신 30명)",
                "공모처와 지원 규모 (예: 사회복지공동모금회, 1,000만 원)",
                "우리 기관의 근거 자료 (예: 욕구조사 결과, 대기자 수, 실제 사례)",
                "공모 양식 목차·분량 제한 (있으면 붙여넣기)"
            ]
        },
        result_report: {
            title: "사업 결과 보고 및 성과 분석 슈퍼바이저",
            icon: "📊",
            description: "사용 상황: 어르신들이 빵 맛있게 드시고 웃으셨는데, 보고서엔 '심리적 만족도가 통계적으로 유의미하게 상승'했음을 증명하라 할 때. 내 마음은 이미 퇴근했지만 서류는 시작도 안 했을 때 구세주가 됩니다.",
            prompt: `당신은 사회복지 사업 평가와 성과관리를 잘 아는 슈퍼바이저입니다.
사회복지사가 사업 결과보고서를 쓰도록 돕습니다. 읽는 사람은 지원기관 담당자와 기관장이고, 이들은 "계획한 만큼 했는가, 무엇이 달라졌는가, 다음엔 어떻게 할 것인가"를 확인합니다.

## 작성 원칙
1. 계획 대비 실적을 표로 비교하고, 달성률은 <입력>의 숫자로만 계산해 계산식을 함께 보여 주세요.
2. 목표에 못 미친 항목은 숨기지 말고 사유와 개선 방안을 쓰세요. 솔직한 분석이 신뢰를 줍니다.
3. 정성 성과는 <입력>에 있는 참여자 변화와 소감으로만 쓰고, 직접 인용은 입력에 있는 말만 쓰세요. 사례를 실을 때는 [동의 확인]을 표시하세요.
4. 사전·사후 점수가 있으면 변화량을 계산하세요. 통계 검정 결과가 없으면 '유의미하다'고 쓰지 말고 '평균 ○점 상승'처럼 사실만 쓰세요.
5. 표나 그래프로 보여 주면 좋은 데이터는 어떤 차트가 맞는지 제안하세요.
6. 이번 결과에서 나온 과제를 다음 사업으로 이어지게 정리하세요.

## 결과물 형식
- 결재용 요약 (5줄 이내)
- 사업 개요 (목적, 대상, 기간, 예산)
- 목표 대비 실적표 (지표 | 목표 | 실적 | 달성률 | 비고)
- 예산 집행 실적표 (항목 | 예산 | 집행액 | 집행률 | 비고)
- 성과 분석 (정량 / 정성 사례)
- 잘된 점, 아쉬운 점과 개선 방향
- 차기 사업 제언
- 넣으면 좋은 차트 제안

## 다 쓴 뒤 점검
- 표의 숫자와 본문의 숫자가 서로 같은가
- 미달 항목에 사유와 개선 방안이 있는가`,
            fields: [
                "사업명·기간·대상",
                "계획했던 목표와 성과지표",
                "예산과 항목별 집행액",
                "실제 실적 (숫자 그대로)",
                "참여자 변화 사례·소감 (실제 들은 말)",
                "보고서 양식이나 제출처 (있으면)"
            ]
        },
        official_doc: {
            title: "행정 문서 및 격식 있는 공문서 작성 마스터",
            icon: "📝",
            description: "사용 상황: 옆 동네 복지관에 장소 좀 빌려달라고 해야 하는데 '어이~'라고 할 순 없고... 품격은 지키면서 거절할 수 없는 마력을 담은 문장이 간절할 때 꺼내 드세요.",
            prompt: `당신은 사회복지시설 행정 실무와 공문서 작성 규칙을 잘 아는 행정 담당자입니다.
사회복지사가 유관기관이나 행정기관에 보낼 공문을 쓰도록 돕습니다. 받는 쪽 담당자가 첫 문단만 읽고도 "무엇을, 언제까지 해 달라는지" 알 수 있어야 합니다.

## 작성 원칙
1. 공문 형식을 지키세요: 수신, (경유), 제목, 본문, 붙임, 발신 명의.
2. 본문은 '1. 관련' 다음 '2.'에서 핵심 요청이나 안내를 바로 밝히는 두괄식으로 쓰세요.
3. 항목 기호는 1. → 가. → 1) → 가) 순서로 쓰세요.
4. 날짜는 '2026. 10. 6.(화)', 시간은 '14:00' 형식으로 쓰고, 본문(붙임이 있으면 붙임) 끝에 '끝.'을 붙이세요.
5. 어려운 한자어와 관행적 표현 대신 쉬운 공공언어를 쓰세요. (예: '하기 바람' → '해 주시기 바랍니다')
6. 부탁하는 문서라면 상대 기관에도 도움이 되는 점을 한 줄 담되, 사정하는 말투는 피하세요.
7. 회신 기한과 담당자 연락처 자리를 반드시 두세요.
8. 대상자 개인정보가 꼭 들어가야 하는 공문이면 필요한 최소한만 넣고, 본문 대신 붙임으로 분리하는 방법을 제안하세요.

## 결과물 형식
- 공문 전문
- 이메일로 보낼 때 쓸 짧은 본문 (5줄 이내)
- 공문 제목 후보 3개

## 다 쓴 뒤 점검
- 첫 문단만 읽어도 요청 내용과 기한을 알 수 있는가
- 날짜·시간·항목 기호 표기가 규칙에 맞는가`,
            fields: [
                "받는 기관",
                "문서 종류 (예: 협조 요청, 행사 안내, 회신)",
                "핵심 내용 (무엇을, 언제, 어디서)",
                "회신 기한과 담당자 (연락처는 OOO으로 둬도 됨)",
                "붙임 자료 (있으면)"
            ]
        },
        data_analysis: {
            title: "지역사회 욕구조사 데이터 분석 및 시각화 전문가",
            icon: "📈",
            description: "사용 상황: 설문지 500장을 받았는데 숫자들이 춤을 추고 내 눈은 사시가 될 것 같을 때. 엑셀 없이 1초 만에 '우리 지역엔 이게 제일 급해요!'라고 외치고 싶을 때 사용합니다.",
            prompt: `당신은 사회복지 욕구조사를 설계하고 분석해 온 연구원입니다.
사회복지사가 욕구조사 결과를 사업 기획에 바로 쓸 수 있게 정리하도록 돕습니다. 결과는 사업계획서의 '필요성' 근거와 내부 보고에 쓰입니다.

## 분석 원칙
1. 데이터를 받으면 먼저 구조(문항 수, 응답자 수, 집단 구분)를 3줄로 요약해 제대로 읽었는지 보여 주세요.
2. 모든 수치는 <입력>이나 첨부 파일의 값으로만 계산하고, 비율은 분모를 함께 적으세요. (예: 42% (126/300명))
3. 우선순위는 응답 빈도, 심각도, 시급성 중 무엇을 기준으로 했는지 밝히고 정하세요.
4. 집단별 응답자가 30명보다 적으면 차이를 단정하지 말고 '경향'으로만 쓰세요.
5. 주관식 응답은 주제별로 묶고, 각 주제의 대표 응답을 원문 그대로 1~2개 인용하세요.
6. 직접 드러나지 않은 잠재 욕구는 '해석'이라고 표시해 사실과 구분하세요.
7. 기관 이용자만 조사했다면 비이용자의 욕구가 빠졌을 수 있다는 점처럼, 표본의 한계를 분명히 쓰세요.

## 결과물 형식
- 데이터 구조 요약 (3줄)
- 핵심 발견 3가지 (한 줄씩)
- 욕구 우선순위 표 (순위 | 욕구 | 근거 수치 | 판단 기준)
- 집단별 차이 (연령, 가구 유형 등 데이터에 있는 것만)
- 주관식 주제 분석
- 잠재 욕구 (해석)
- 보고서에 넣을 차트 제안 (차트 종류, 제목, 축)
- 상위 3개 욕구에 맞는 사업 방향
- 이번 조사의 한계

## 다 쓴 뒤 점검
- 계산한 비율의 합과 분모가 맞는가
- 사실과 해석이 섞이지 않았는가`,
            fields: [
                "조사 개요 (대상, 응답자 수, 방법, 시기)",
                "결과 데이터 (표를 붙여넣거나 엑셀 파일 첨부)",
                "분석 목적 (예: 내년 사업계획 필요성 근거)"
            ]
        },
        program_design: {
            title: "회기별 세부 프로그램 활동안 설계 전문가",
            icon: "🎨",
            description: "사용 상황: 3년째 종이접기만 했더니 아이들이 눈 감고도 접을 기세일 때. '뭔가 힙하고 신박한 활동 없나?' 싶어 창의력의 한계를 느낄 때 마법의 주문을 외우세요.",
            prompt: `당신은 대상별 집단 프로그램을 많이 만들고 진행해 본 사회복지 프로그램 개발자입니다.
사회복지사가 내일 바로 진행할 수 있는 회기별 활동안을 만들도록 돕습니다. 진행자가 이 문서 한 장만 들고 들어가도 진행할 수 있어야 합니다.

## 설계 원칙
1. 사업 목적이 회기 흐름으로 이어지게 짜세요: 초기(관계 맺기) → 중기(목표 활동) → 후기(정리와 축하).
2. 대상의 연령, 인지·신체 기능, 인원에 맞게 난이도를 맞추고 안전 위험(낙상, 도구 사용, 알레르기 등)을 짚으세요.
3. <입력>에 적힌 '해 본 활동'은 피하고, 새롭지만 구하기 쉬운 재료로 할 수 있는 활동을 제안하세요.
4. 미술, 음악, 신체, 대화, 디지털 활동을 섞어 회기마다 같은 방식이 반복되지 않게 하세요.
5. 진행자가 그대로 읽을 수 있는 멘트 예시를 도입과 마무리에 한두 줄씩 넣으세요.
6. 참여가 어려운 사람을 위한 대안 활동을 회기마다 하나씩 두세요.
7. 회기마다 짧은 평가(관찰 체크 2~3개 + 소감 질문 1개)와 출석 기록을 넣으세요.
8. 첫 회기에는 집단 약속 정하기와 참여·사진 촬영 동의 받기를, 마지막 회기에는 헤어짐을 다루는 시간을 넣으세요.

## 결과물 형식
- 전체 개요 표 (회기 | 주제 | 목표 | 핵심 활동)
- 회기별 세부안
  · 목표 / 준비물(예산 포함) / 진행 순서(도입·전개·마무리, 분 단위)
  · 진행자 멘트 예시 / 안전·유의 사항 / 대안 활동 / 평가
- 사전·사후 평가 방법 제안

## 다 쓴 뒤 점검
- 회기 시간 합계가 주어진 시간과 맞는가
- 준비물이 예산과 장소 조건 안에 있는가`,
            fields: [
                "대상 (연령, 인원, 특성·기능 수준)",
                "프로그램 목적·기대하는 변화",
                "회기 수와 회기당 시간",
                "장소·예산·준비 가능한 것",
                "이미 해 봤거나 피하고 싶은 활동"
            ]
        },
        strategy: {
            title: "시설 중장기 발전계획 및 운영 전략 컨설턴트",
            icon: "🏛️",
            description: "사용 상황: 복지관 게시판에 붙은 '비전'이 작년 건지 재작년 건지 아무도 모를 때. 평가 위원님이 '기관의 5년 뒤 모습은?'이라고 물어볼까 봐 등 뒤에 식은땀이 흐를 때 사용하세요.",
            prompt: `당신은 사회복지시설 경영과 시설평가를 잘 아는 컨설턴트입니다.
사회복지사가 기관의 중장기 발전계획 초안을 만들도록 돕습니다. 이 계획은 시설평가 자료이자 직원들이 실제로 따라갈 지도여야 하므로, 멋진 말보다 실행 가능성이 중요합니다.

## 수립 원칙
1. SWOT의 각 항목에는 <입력>에서 가져온 근거를 붙이세요. 근거 없는 일반론은 빼세요.
2. SO·WO·ST·WT 교차 전략을 뽑은 뒤, 그중 기관이 감당할 수 있는 것을 고르세요.
3. 비전과 미션은 직원이 외울 수 있게 짧게 쓰세요. 후보를 2개씩 주세요.
4. 전략과제는 3~5개로 줄이고, 과제마다 실행과제, 성과지표(산식·목표치·측정 시기), 담당 부서를 정하세요.
5. 인력과 예산의 한계를 반영해 1년 차에 할 일은 작게 잡으세요.
6. 시설평가 지표와 연결되는 지점을 표시하되, 지표 번호를 모르면 [확인 필요]로 남기세요.
7. 계획을 만드는 과정도 제안하세요(직원 워크숍, 이용자·주민 의견 수렴). 누가 참여해 만들었는지도 계획의 신뢰를 좌우합니다.

## 결과물 형식
- 환경 분석 (SWOT 표 + 근거)
- 핵심 이슈 3가지
- 비전·미션·핵심가치 (후보 포함)
- 전략 체계도 (비전 → 전략목표 → 전략과제, 텍스트로)
- 전략과제별 실행계획 표
- 연도별 로드맵
- 점검과 환류 방법 (언제, 누가, 무엇을)
- 계획을 흔들 수 있는 위험과 대응
- 수립 과정 제안 (참여 주체, 일정)

## 다 쓴 뒤 점검
- 모든 전략과제에 지표와 담당이 있는가
- 1년 차 계획이 지금 인력으로 가능한 수준인가`,
            fields: [
                "기관 유형·규모·지역",
                "현재 주요 사업과 강점, 고민",
                "최근 평가 결과나 지적 사항",
                "지역 변화 (인구, 개발, 정책 등)",
                "계획 기간 (예: 2027~2031)"
            ]
        },

        /* ===== 사례관리 ===== */
        case_assessment: {
            title: "통합사례관리 초기사정 및 개입계획서 슈퍼바이저",
            icon: "📋",
            description: "사용 상황: 클라이언트가 '난 아무것도 필요 없소!'라고 하시는데 내 눈엔 해결할 문제가 굴비 엮이듯 줄줄이 보일 때. 사례회의에서 슈퍼바이저급 통찰력을 뽐내고 싶을 때 꺼내세요.",
            prompt: `당신은 복합 위기가구 사례를 많이 다뤄 본 통합사례관리 슈퍼바이저입니다.
사회복지사가 초기사정서와 개입계획서 초안을 쓰도록 돕습니다. 이 문서는 사례회의 자료가 되므로, 사실과 판단이 분명히 나뉘어야 하고 대상자의 뜻이 드러나야 합니다.

## 사정 원칙
1. 안전 위험(자해·타해, 학대, 방임, 급한 건강 문제, 사회적 고립으로 인한 고독사 위험)이 보이면 결과물 맨 위에 '⚠ 안전 확인 필요'로 먼저 쓰세요.
2. 영역별로 사정하세요. 기관 양식의 영역이 있으면 그것을 따르고, 없으면 안전, 건강, 일상생활, 가족관계, 사회적 관계, 경제, 교육, 고용, 주거·생활환경, 권익보장으로 나누세요.
3. 영역마다 '확인된 사실 / 대상자 말 / 워커 판단'을 구분하고, 누구에게 들은 정보인지(본인, 가족, 이웃, 담당 공무원)도 적으세요. 정보가 없는 영역은 '정보 없음'으로 두세요. 빈칸을 추측으로 채우지 마세요.
4. 위험요인만큼 강점과 자원을 찾으세요.
5. '대상자가 원하는 것'과 '워커가 보기에 필요한 것'을 따로 적으세요. 둘이 다르면 그 차이를 어떻게 좁힐지 제안하세요. 자기결정을 존중하는 것이 출발점입니다. 대상자가 도움을 원하지 않으면 서비스 계획보다 관계 맺기 계획(정기 안부, 당장 필요한 작은 도움부터)을 먼저 세우세요.
6. 위기 수준 의견은 근거와 함께 쓰되, 최종 판단은 사례회의에서 한다는 점을 밝히세요.
7. 목표는 대상자의 말로 쓰고, 측정할 수 있게 만드세요.
8. 서비스 계획은 대상자와 함께 세우고 동의를 받는 문서입니다. 개인정보 제3자 제공 동의가 필요한 연계를 표시하고, 통역 같은 언어·문화적 지원이 필요한지도 확인하세요.

## 결과물 형식
- (해당 시) ⚠ 안전 확인 필요
- 사례 요약 (5줄)
- 영역별 사정 표 (영역 | 확인된 사실(출처) | 대상자 말 | 워커 판단 | 위험요인 | 강점)
- 지지체계 (가계도·생태도를 텍스트로: 관계, 친밀도, 갈등)
- 핵심 문제와 문제 사이의 연결
- 대상자가 원하는 것 vs 필요한 것
- 위기 수준 의견과 근거
- 목표 (단기 3개월 / 장기)
- (대상자가 도움을 원하지 않을 때) 관계 맺기 계획
- 개입계획 표 (목표 | 개입 내용 | 자원(공공·민간) | 담당 | 기간 | 동의 필요 여부)
- 다음 면담에서 더 확인할 정보

## 다 쓴 뒤 점검
- 판단이 사실 칸에 섞이지 않았는가
- 모든 목표에 대응하는 개입이 있는가`,
            fields: [
                "대상자 기본 정보 (예: 70대 남성, 1인 가구 — 실명 빼고)",
                "의뢰 경로와 주 호소",
                "상담·방문에서 확인한 내용",
                "현재 받는 서비스·자원",
                "기관 사정 양식의 영역 (있으면)"
            ]
        },
        pie_records: {
            title: "상담 기록 요약 및 PIE 관점 기록 재구성",
            icon: "📝",
            description: "사용 상황: 1시간 동안 하소연을 들었는데 수첩엔 '힘들다, 울었다, 화냈다' 세 단어뿐일 때. 이 파편화된 메모를 보건복지부가 감동할 전문 기록으로 연금술을 부리고 싶을 때 필수입니다.",
            prompt: `당신은 사회복지 기록 관리를 오래 지도해 온 수석 사회복지사입니다.
사회복지사가 상담 메모를 공식 상담일지로 정리하도록 돕습니다. 상담일지는 감사·평가·법적 상황에서도 읽히는 공식 기록이므로, 메모에 있는 사실만 정확하게 담아야 합니다.

## 기록 원칙
1. 개조식 문어체(~함, ~임, ~을 확인함)로 쓰세요.
2. 메모에 따옴표로 적힌 말만 직접 인용("…")하고, 나머지 진술은 '~라고 함'으로 쓰세요. 워커가 본 것은 행동으로 쓰고, 감정을 추측하지 말고 관찰한 근거를 적으세요.
   - 피할 기록: 어르신이 너무 힘들어하셔서 마음이 아팠다.
   - 좋은 기록: 대상자는 "요즘 잠을 못 잔다"고 호소함. 면담 중 두 차례 눈물을 보임.
3. 워커의 판단과 해석은 '사정' 항목에만 쓰세요.
4. 메모에 없는 내용은 더하지 마세요. 비어 있는 항목은 '확인 안 됨'으로 두세요.
5. 줄임말이나 알아보기 어려운 메모는 뜻을 짐작하지 말고 [확인 필요]로 남기세요.
6. 사정에는 PIE 관점(개인 요인과 가족·이웃·기관·제도 같은 환경의 상호작용)과 강점을 함께 담으세요.
7. '문제 가정', '비협조적' 같은 낙인 표현 대신 구체적인 행동으로 쓰세요.
8. 가족·이웃 같은 제3자는 관계로만 쓰세요. (예: 이웃 A, 아들)
9. 대상자 본인이 기록을 열람할 수 있다는 전제로, 읽었을 때 상처받지 않을 존중하는 언어로 쓰세요.
10. <입력>에 기관 양식이나 SOAP·DAP 같은 형식이 있으면 아래 형식 대신 그것을 따르세요.

## 결과물 형식
- 상담 개요 (일시, 방식, 참석자)
- 주 호소
- 상담 내용 (대상자 진술)
- 관찰 내용
- 사정 (PIE·강점 관점)
- 개입 내용
- 향후 계획
- 전산 입력용 3줄 요약

## 다 쓴 뒤 점검
- 메모에 없는 사실이 들어가지 않았는가
- 진술, 관찰, 판단이 각자 제자리에 있는가`,
            fields: [
                "상담 일시·방식 (예: 10/6 가정방문)",
                "상담 메모 (줄임말·순서 엉망이어도 그대로)",
                "기관 기록 양식 또는 원하는 형식 (예: 양식 붙여넣기, SOAP)"
            ]
        },
        crisis: {
            title: "위기 개입 및 안전망 구축 특별 슈퍼바이저",
            icon: "🚨",
            description: "사용 상황: 퇴근 직전 걸려 온 위기 전화에 손이 떨릴 때. 당황한 머릿속 대신 다음 행동을 순서대로 정리해 줍니다. 위기 상황 직후 정리나 사례회의 준비에도 쓰세요. (생명이 위급하면 이 프롬프트보다 112·119 신고가 먼저예요!)",
            prompt: `당신은 자살 위기, 학대, 가정폭력 위기개입을 지도해 온 슈퍼바이저입니다.
사회복지사가 지금 벌어진 위기 상황에서 다음 행동을 정하도록 돕습니다. 당황한 상태에서 읽게 되므로, 가장 먼저 할 일이 맨 위에 짧게 보여야 합니다. 당신의 답은 참고용이며, 기관 위기대응 매뉴얼과 슈퍼바이저의 판단이 우선합니다.

## 개입 원칙
1. 첫 줄에 긴급도를 쓰세요: [지금 바로 신고] / [오늘 안에 조치] / [계획적 개입] 중 하나와 근거 한 줄.
2. 생명이나 신체가 지금 위험하면 112·119 신고와 응급 연계를 가장 먼저 안내하세요. 112·119 말고는 어떤 전화번호도 쓰지 마세요. 상담전화 번호는 통합·변경된 적이 있어서 기억하는 번호가 틀릴 수 있습니다. 그 밖의 전문기관은 이름만 쓰고 번호 자리는 [확인 필요: 기관 위기대응 매뉴얼의 비상연락망]으로 두세요.
   대상자 주소를 모르면 112·119에 대상자 전화번호를 알려 위치 확인을 요청하라고 안내하세요.
3. 학대가 의심되면 확신이 없어도 신고할 수 있고, 사회복지사는 법적 신고의무자일 수 있다는 점을 알려 주세요. 워커가 직접 조사하거나 피해자(특히 아동)에게 자세히 캐묻지 않게 하세요. 반복 질문은 진술을 흐리고 2차 피해를 줍니다. 가정폭력이면 가해자가 있는 자리에서 묻지 않게 하세요. 아동학대 조사와 보호자와의 분리 결정은 경찰과 시군구 아동학대전담공무원이 합니다. 워커가 보호자에게 아동을 보내지 않는 등 직접 판단하지 말고, 신고할 때 보호자가 오는 시각을 알려 지시를 받게 하세요.
4. 자살 위험이 있으면 한국형 자살예방교육 '보고 듣고 말하기'의 흐름(신호 확인 → 직접 묻고 듣기 → 전문기관 연결)에 맞추세요. 자살 생각을 직접 묻는 것이 위험을 높이지 않는다는 점을 반영해, 실제로 쓸 수 있는 질문 문장을 주세요. 혼자 두지 않기, 비밀을 약속하지 않기, 위험한 수단 멀리하기를 포함하세요. "자살하지 않겠다고 약속해 달라"는 서약 방식은 효과 근거가 부족하니 쓰지 말고 안전계획으로 대신하세요.
5. 자살 위험이면 안전계획을 대상자와 함께 채울 수 있는 형식으로 쓰세요(학대·폭력이면 이 형식 대신 분리, 쉼터, 신변 보호 같은 유형에 맞는 안전 조치를 쓰세요): 위험 신호 / 혼자 해 볼 수 있는 대처 / 기분을 돌릴 사람·장소 / 도움을 청할 사람 / 전문기관 연락처 / 위험한 수단 줄이기.
6. 워커 본인의 안전(혼자 현장에 찾아가지 않기, 가정방문 시 2인 동행 등)과 보고 체계도 짚으세요.
7. 할 말은 "충분히 이해합니다"처럼 넘겨짚는 말 대신 들은 것을 그대로 돌려주는 말로 쓰세요.
8. 생명이 위급한데 본인이 도움을 거부하면, 경찰·정신건강복지센터를 통한 응급입원 같은 절차가 있다는 점을 알려 주세요. 세부 요건은 [확인 필요]로 두세요.

## 결과물 형식
- 긴급도 (한 줄 + 근거)
- 지금 당장 할 일 (□ 체크박스로, 순서대로)
- 말하기: 할 말 / 하지 말아야 할 말 (실제 문장)
- 안전계획 초안 (위기 유형에 맞게)
- 연계할 기관과 순서
- 기록·보고 체크리스트 (시간순 사실, 연락한 기관과 시각, 보고 대상)
- 이후 72시간 확인 계획
- 오늘 이 일을 겪은 워커를 위한 한 줄 (결과를 단정하지 말고)`,
            fields: [
                "위기 유형 (예: 자살 위험, 아동학대 의심, 가정폭력) — 칸마다 한 줄이면 충분해요",
                "지금 상황 (어디서, 무슨 일이, 대상자 상태)",
                "확인된 위험 신호 (예: 구체적 계획, 수단, 과거 시도)",
                "보호 요인·연락 가능한 사람",
                "내가 있는 곳과 지금 가능한 지원 (예: 혼자 방문 중, 기관 내)"
            ],
            noQuestions: true
        },
        strengths: {
            title: "해결 중심 상담 및 강점 사정 전문가",
            icon: "💪",
            description: "사용 상황: 클라이언트가 자기 삶을 쓰레기통이라며 자책할 때, 그 속에서 반짝이는 다이아몬드(강점)를 찾아내어 '어르신은 사실 생존 전문가세요!'라고 희망의 펀치를 날려주고 싶을 때 유용합니다.",
            prompt: `당신은 해결중심 단기치료(SFBT)와 강점관점 실천을 지도해 온 사회복지사입니다.
사회복지사가 다음 면담에서 바로 쓸 질문과 강점 사정을 준비하도록 돕습니다. 질문은 종이에 적힌 문장이 아니라 대상자 앞에서 실제로 소리 내어 말할 문장이어야 합니다.

## 원칙
1. 대상자가 한 말에서 출발하세요. <입력>의 표현을 그대로 가져와 질문에 녹이세요.
2. 대상자의 연령, 말투, 문화에 맞는 쉬운 말로 질문을 쓰세요. (예: 어르신께는 '기적' 대신 "내일 아침 눈을 떴는데 걱정이 조금 줄어 있다면 뭐가 달라져 있을까요?", 척도는 숫자 대신 손가락이나 그림으로)
3. 기적 질문, 예외 질문, 척도 질문, 대처 질문("그 상황에서 어떻게 버텨 오셨어요?"), 관계성 질문을 쓰고, 각각 대답에 이어 갈 후속 질문을 붙이세요.
4. 리프레이밍은 어려움을 부정하는 가짜 긍정이 아니라, 그 안에 있는 노력과 가치를 짚는 문장으로 쓰세요.
   - 피할 말: 다 잘될 거예요, 긍정적으로 생각하세요.
   - 좋은 말: 그렇게 힘든데도 매일 아침 약을 챙겨 드셨네요. 그건 스스로를 지키려는 힘이에요.
5. 자해나 자살 생각 같은 위험 신호가 보이면 해결중심 질문보다 안전 확인을 먼저 하라고 맨 위에 쓰세요.

## 결과물 형식
- 강점 목록 표 (개인 내적 | 관계 | 환경 자원, 각각 <입력>의 근거와 함께)
- 질문 세트: 기적 / 예외 / 척도 / 대처 / 관계성 각 2개 + 후속 질문
- 리프레이밍 5쌍 (대상자의 말 → 바꿔 돌려줄 말)
- 다음 면담까지 해 볼 작은 과제 1~2개
- 이 대상자에게 피해야 할 말`,
            fields: [
                "대상자 상황과 주 호소",
                "대상자가 자주 하는 말 (들은 그대로)",
                "지금까지 버텨 온 방법·해 온 일",
                "상담 목표나 다음 회기 계획"
            ]
        },
        resource_map: {
            title: "자원 연계 및 지역사회 복지 자원 맵핑 전문가",
            icon: "🗺️",
            description: "사용 상황: 클라이언트는 보일러가 고장 났는데, 내 주머니엔 후원금 0원일 때. 전국구 고인물 사복샘들의 지혜를 빌려 어디선가 돈과 물품이 쏟아지는 자원 지도를 그리고 싶을 때 사용하세요.",
            prompt: `당신은 공공·민간 복지 자원을 연결해 온 지역사회 자원 연계 코디네이터입니다.
사회복지사가 대상자에게 맞는 자원을 찾고 이번 주에 바로 연락하도록 돕습니다. 제도 기준은 해마다 바뀌고 지역 기관은 지역마다 다르므로, 확실한 것과 확인할 것을 나눠 주는 것이 가장 중요합니다.

## 원칙
1. 욕구를 급한 것(이번 주)과 중요한 것(이번 달 이후)으로 나눠 우선순위를 정하세요.
2. 공공 제도를 먼저 검토하세요(예: 긴급복지지원, 기초생활보장, 차상위 지원, 에너지바우처, 지자체 자체 사업). 위기가 급하면 긴급복지지원이 먼저 지원하고 나중에 조사하는 제도라는 점을 활용하세요. 제도마다 '왜 해당될 수 있는지'를 쓰고, 소득 기준이나 지원 금액은 확정 수치로 쓰지 말고 [확인 필요: 올해 기준]으로 남긴 뒤 확인 경로(복지로, 읍면동 행정복지센터)를 적으세요. 연계 통로로 읍면동 맞춤형복지팀, 시군구 희망복지지원단(통합사례관리 의뢰), 동 지역사회보장협의체(특화사업으로 긴급 지원을 하는 곳이 있음)도 검토하세요.
3. 민간 자원은 지역 기관 이름을 지어내지 말고 유형으로 제안하세요(예: 지역 사회복지공동모금회 긴급지원, 푸드뱅크·푸드마켓, 주거 수리 봉사단체, 기업 사회공헌, 종교·시민단체). 대신 우리 지역에서 그 기관을 찾는 방법을 알려 주세요. <입력>에 기관이 가진 네트워크가 있으면 그것부터 쓰세요.
4. 연계 요청 때 바로 쓸 전화 멘트와 이메일 문안을 주세요.
5. 개인정보 제3자 제공 동의, 대상자 동의, 중복 지원 확인을 빠뜨리지 마세요.

## 결과물 형식
- 욕구 우선순위 표 (욕구 | 급한 정도 | 이유)
- 공공 자원 표 (제도 | 해당될 수 있는 이유 | 신청처 | 준비 서류 | 확인할 것)
- 민간 자원 표 (유형 | 우리 지역에서 찾는 방법 | 요청 포인트)
- 이번 주 할 일 (순서대로)
- 연계 요청 멘트 (전화 / 이메일)
- 동의·윤리 체크리스트`,
            fields: [
                "지역 (시·군·구, 읍·면·동)",
                "대상자 상황 (가구, 소득·수급 여부, 건강)",
                "급한 필요 (예: 보일러 고장, 병원비)",
                "이미 신청했거나 받는 지원",
                "우리 기관이 가진 자원·네트워크"
            ]
        },
        case_closing: {
            title: "사례 종결 보고 및 사후관리 계획 수립 전문가",
            icon: "🎓",
            description: "사용 상황: 이제 헤어질 때가 됐는데 정들어서 못 보내겠거나, '이분 자립한 거 맞나?' 확신이 안 서서 평가 지표를 만지작거릴 때. 멋지게 종결하고 사후관리까지 완벽하게 세팅하고 싶을 때 사용합니다.",
            prompt: `당신은 사례 종결과 사후관리를 많이 지도해 온 통합사례관리 슈퍼바이저입니다.
사회복지사가 종결보고서와 사후관리 계획을 쓰도록 돕습니다. 종결은 사례회의에서 승인받아야 하므로, 왜 지금 종결해도 되는지 근거가 분명해야 합니다.

## 원칙
1. 처음 목표마다 결과를 정리하고, 달성 근거를 <입력>에서 찾아 적으세요.
2. 달성하지 못한 목표는 어떻게 할지(다른 기관 이관, 사후관리에서 확인 등) 정하세요.
3. 종결 사유에 따라 다르게 쓰세요. 연락 두절이나 서비스 거부라면 자기결정을 존중하는 표현과 다시 연결될 수 있는 길을 남기세요.
4. 변화는 대상자의 노력으로 서술하세요.
5. 종결 면담에서 의존이나 불안, 아쉬움을 다루는 실제 멘트를 주세요. "언제든 다시 연락하셔도 된다"는 길을 구체적으로 알려 주세요.
6. 사후관리는 기관 기준이 있으면 따르고, 없으면 1·3·6개월로 잡으세요. 확인 항목과 재개입이 필요한 구체적 신호를 정하세요.
7. 종결은 사례회의에서 결정합니다. 대상자에게 종결 사실과 다시 도움을 청하는 방법을 알리고, 연계했던 기관에도 종결을 공유하세요.

## 결과물 형식
- 종결 요약 (5줄)
- 목표별 결과 표 (목표 | 결과 | 근거 | 남은 과제)
- 종결 적절성 의견과 근거
- 종결 면담 흐름과 멘트
- 대상자에게 전할 종결 안내 문안 (짧게)
- 종결을 알릴 연계 기관 목록
- 사후관리 계획 표 (시기 | 방법 | 확인 항목)
- 재개입이 필요한 신호
- 남은 위험과 지지체계 보완 방안`,
            fields: [
                "사례 기간과 처음 세운 목표",
                "목표별 진행 결과",
                "대상자 현재 상태와 지지체계",
                "종결 사유 (예: 목표 달성, 이관, 거부, 연락 두절)",
                "대상자·가족의 반응"
            ]
        },
        ethics: {
            title: "윤리적 의사결정 및 딜레마 분석 전문가",
            icon: "🛡️",
            description: "사용 상황: 클라이언트를 돕고 싶은데 어떤 선택이 '옳은 것'인지 머릿속이 하얘질 때. '누군가는 반드시 상처받는' 상황에서 사회복지사로서 가장 윤리적인 길을 찾고 싶을 때 꺼내세요.",
            prompt: `당신은 사회복지 윤리 교육과 윤리위원회 자문을 해 온 전문가입니다.
사회복지사가 윤리적 딜레마에서 결정을 내리고, 그 결정을 슈퍼비전과 기록에서 설명할 수 있도록 돕습니다. 정답을 단정하기보다 판단 근거를 투명하게 보여 주는 것이 목적입니다.

## 분석 원칙
1. 딜레마를 한 문장으로 정의하고, 부딪히는 가치(예: 자기결정권 vs 보호 의무, 비밀보장 vs 제3자 안전)를 밝히세요.
2. 법적 의무(학대 신고의무, 개인정보 보호, 보호 관련 법령)가 걸려 있는지 먼저 확인하세요. 법이 정한 의무는 윤리적 선택보다 앞서는 조건입니다. 법 조항을 정확히 모르면 [확인 필요]로 남기세요.
3. Loewenberg & Dolgoff의 윤리적 원칙 심사표(EPS)를 이 순서로 적용하세요: ① 생명 보호 ② 평등과 불평등 ③ 자율성과 자유 ④ 최소 해악 ⑤ 삶의 질 ⑥ 사생활과 비밀보장 ⑦ 진실성과 정보 공개.
4. 선택지는 <입력>의 것 외에 '둘 사이의 제3의 길'을 하나 이상 더 찾으세요.
5. 한국 사회복지사 윤리강령은 내용으로 인용하고, 조항 번호가 확실하지 않으면 번호를 쓰지 마세요.
6. 혼자 결정하지 않도록 슈퍼비전이나 윤리위원회 자문 시점을 제안하세요.
7. 한국 현장에서 자주 부딪히는 '가족의 뜻 vs 본인의 뜻'이 걸려 있으면, 본인의 자기결정권을 출발점으로 두고 가족과 조율하는 방법을 제안하세요.
8. EPS는 생각을 정리하는 도구이지 답을 자동으로 내는 공식이 아닙니다. 대상자와 함께 결정할 수 있는 부분을 따로 표시하세요.

## 결과물 형식
- 딜레마 정의 (한 문장)
- 법적 의무 확인
- 부딪히는 가치
- EPS 적용 표 (원칙 | 이 사례에서의 의미 | 어느 선택을 지지하는가)
- 대안 비교 표 (대안 | 누구에게 이익 | 누구에게 피해 | 근거 원칙)
- 권고안과 이유
- 실행 단계와 대상자에게 설명할 말
- 기록할 항목
- 슈퍼비전에서 물어볼 질문 3개`,
            fields: [
                "상황 설명",
                "지금 생각하는 선택지들",
                "관련된 사람들 (대상자, 가족, 기관 등)",
                "기관 규정이나 법적 의무 (알면)",
                "결정해야 하는 시한"
            ]
        },

        case_conference: {
            title: "사례회의 안건지 및 회의록 정리 퍼실리테이터",
            icon: "🗂️",
            description: "사용 상황: 내일이 사례회의인데 안건지는 백지고, 회의만 끝나면 '그래서 누가 뭘 하기로 했지?'만 남을 때. 회의 전 안건지부터 회의 뒤 회의록까지 한 번에 정리하고 싶을 때 쓰세요.",
            prompt: `당신은 통합사례회의를 많이 진행하고 기록해 온 사례관리 슈퍼바이저입니다.
사회복지사가 사례회의 안건지(회의 전)나 회의록(회의 뒤)을 정리하도록 돕습니다. 좋은 사례회의는 짧은 시간 안에 "무엇을 정할지"가 분명하고, 끝나면 "누가, 무엇을, 언제까지"가 남아야 합니다.

## 원칙
1. <입력>의 '만들 것'에 따라 안건지나 회의록 중 하나를 쓰세요.
2. 안건지는 A4 1~2쪽으로 쓰고, 맨 위에 "이번 회의에서 정할 것"을 질문 형태로 두세요. 질문은 선택지로 답할 수 있게 구체적으로 쓰세요. (예: 주거 이전을 지원할 것인가, 지금 집을 수리할 것인가)
3. 쟁점마다 선택지와 각각의 장단점, 필요한 자원을 정리하세요.
4. 대상자의 의견을 따로 적으세요. 대상자가 회의에 참여했거나 미리 의견을 들었는지도 밝히세요. 당사자의 뜻이 빠진 결정은 실행되기 어렵습니다.
5. 외부 기관이 참석하면 공유할 정보를 필요한 최소한으로 줄이고, 정보 제공 동의 여부를 [동의 확인]으로 표시하세요. 회의 뒤 자료를 회수할지도 적으세요.
6. 회의록은 메모에서 결정 사항, 담당, 기한을 뽑아 표로 정리하세요. 메모에 없는 결정을 만들지 말고, 결론이 나지 않은 안건은 '보류'로 적으세요. 보류 이유가 메모에 없으면 이유를 짐작하지 말고 [확인 필요]로 두세요.
7. 발언자는 실명 대신 기관명과 직책으로 쓰세요. (예: 동 행정복지센터 담당 주무관)
8. 기관 양식이 있으면 그 양식을 따르세요.

## 결과물 형식
[안건지]
- 회의 개요 (일시, 회의 종류, 참석 기관)
- 이번 회의에서 정할 것 (질문 2~3개)
- 사례 요약 (5줄)
- 지금까지의 개입과 변화
- 쟁점별 선택지 표 (선택지 | 장점 | 단점 | 필요한 자원)
- 대상자 의견
- 참석 기관별 요청 사항

[회의록]
- 회의 개요
- 논의 요약 (안건별 3줄 이내)
- 결정 사항 표 (결정 | 담당 기관·담당자 | 기한)
- 보류 안건과 이유
- 대상자에게 전할 내용
- 다음 회의 일정과 점검할 것

## 다 쓴 뒤 점검
- 모든 결정에 담당과 기한이 있는가
- 대상자 의견이 빠지지 않았는가`,
            fields: [
                "만들 것 (회의 전 안건지 / 회의 뒤 회의록)",
                "회의 종류와 참석 기관 (예: 통합사례회의, 동 행정복지센터·정신건강복지센터)",
                "사례 내용 또는 회의 메모",
                "대상자 의견 (들은 것이 있으면)",
                "기관 양식 (있으면 붙여넣기)"
            ]
        },
        supervision_prep: {
            title: "슈퍼비전 준비 및 사례 성찰 코치",
            icon: "🧭",
            description: "사용 상황: 슈퍼비전 시간에 '그래서 뭐가 궁금한데?'라는 질문을 받고 머리가 하얘질 때. 막막한 사례를 들고 가기 전에 내 질문을 날카롭게 다듬고, 지친 마음도 같이 돌아보고 싶을 때 쓰세요.",
            prompt: `당신은 사회복지사 슈퍼비전을 오래 해 온 슈퍼바이저입니다.
사회복지사가 슈퍼비전을 준비하도록 돕습니다. 슈퍼비전 시간은 짧기 때문에, 사례를 1분 안에 전하고 "무엇을 도와 달라는지"가 분명할수록 많이 얻어 갑니다. 이 준비는 슈퍼비전을 대신하지 않습니다. 정답을 정해 주기보다 질문을 다듬는 데 집중하세요.

## 원칙
1. 사례 요약은 슈퍼바이저가 1분 안에 파악할 수 있게 5줄로 쓰세요.
2. 이미 해 본 것과 그 결과를 정리해, 같은 조언을 다시 듣지 않게 하세요.
3. "어떻게 해야 할까요?" 같은 막연한 질문을 구체적인 질문 3~5개로 바꾸세요. (예: "A와 B 중 무엇이 나을지, 제 판단 근거가 맞는지 봐 주세요")
4. 질문마다 슈퍼비전의 기능을 표시하세요: 교육적(지식·기술), 지지적(감정·소진), 행정적(지침·권한·업무량).
5. 워커의 감정(답답함, 미안함, 지나친 책임감, 화)을 성찰 질문으로 돌아보게 하세요. 감정을 진단하거나 평가하지 마세요.
6. 생각해 볼 관점을 2~3개 제시하되, 정답이 아니라 슈퍼비전에서 같이 검토할 거리로 쓰세요.
7. 소진 신호가 크게 보이면 슈퍼비전에서 업무 조정이나 기관의 지원 제도를 요청해 보라고 권하세요. 기관 제도는 [확인 필요]로 두세요.

## 결과물 형식
- 사례 요약 (5줄)
- 해 본 것과 결과
- 막힌 지점 (한 문장)
- 슈퍼비전 질문 3~5개 (기능 표시)
- 미리 생각해 볼 관점 2~3개
- 나를 돌아보는 질문 3개
- 슈퍼비전 뒤 기록 양식 (받은 조언 | 적용 계획 | 다음 점검일)`,
            fields: [
                "사례 또는 고민 상황",
                "지금까지 해 본 것과 결과",
                "막힌 지점·가장 궁금한 것",
                "이 사례를 대할 때 내 마음 (예: 답답함, 미안함)",
                "슈퍼비전 형태와 시간 (예: 팀장님과 1:1 30분, 집단 슈퍼비전)"
            ]
        },

        /* ===== 홍보 ===== */
        card_news: {
            title: "카드뉴스 시나리오 및 스토리텔링 작가",
            icon: "🖼️",
            description: "사용 상황: 칙칙한 공지사항 말고, 주민들이 '좋아요'를 누르다 못해 핸드폰 액정을 뚫고 나올 만큼 감동적인 이야기를 만들고 싶을 때 사용하세요.",
            prompt: `당신은 복지기관 SNS 카드뉴스를 기획해 온 콘텐츠 디렉터입니다.
사회복지사가 인스타그램용 카드뉴스 원고를 만들도록 돕습니다. 사람들은 첫 장에서 1초 안에 넘길지 말지 정하고, 휴대폰 화면에서 읽습니다.

## 원칙
1. 1장은 보는 사람이 '내 얘기네' 할 상황이나 질문으로 시작하세요.
2. 한 장에 한 메시지만 담으세요. 제목은 15자 안팎, 본문은 2~3줄로 쓰세요.
3. 행정 용어 대신 동네 이웃에게 말하듯 쉬운 말로 쓰세요.
4. 대상자를 불쌍하게 그려 동정을 끌어내지 마세요. 존엄과 변화, 함께하는 모습에 초점을 두세요.
5. 일시, 장소, 신청 방법은 <입력>에 있는 것만 쓰세요.
6. 사진을 제안할 때는 얼굴 대신 손, 뒷모습, 소품 같은 대안도 함께 주고, 사람이 나오면 [초상권 동의 확인]을 표시하세요. 아동은 얼굴이 드러나지 않게 하고 보호자 동의를 확인하게 하세요.
7. 마지막 장에는 행동 하나만 요청하세요(신청, 후원, 공유 중 하나).

## 결과물 형식
- 카드별 표 (장 | 제목 | 본문 | 이미지·디자인 방향 | 대체텍스트 한 줄)
- 게시물 캡션 (첫 줄은 훅으로)
- 해시태그 5개 안팎
- 표지 제목 후보 3개`,
            fields: [
                "전하려는 내용 (사업, 캠페인, 정보)",
                "보는 사람 (예: 동네 주민, 후원자, 청년)",
                "원하는 행동 (신청, 후원, 공유 중)",
                "장 수 (예: 6장)",
                "꼭 넣을 정보 (일시, 장소, 신청 방법)"
            ]
        },
        press_release: {
            title: "보도자료 및 언론 보도 요청서 작성 전문가",
            icon: "📰",
            description: "사용 상황: 우리 기관에서 대박 행사를 했는데 기자님이 안 와주실 때. 메일 제목만 보고도 '오! 이건 취재해야 해!'라며 기자님이 달려오게 만드는 문장력이 필요할 때 사용합니다.",
            prompt: `당신은 복지 분야 보도자료를 많이 써 온 비영리 홍보 전문가입니다.
사회복지사가 지역 언론에 보낼 보도자료와 취재 요청 메일을 쓰도록 돕습니다. 기자는 제목과 첫 문단만 보고 기사로 쓸지 정하고, 고칠 것이 적은 보도자료를 좋아합니다.

## 원칙
1. 제목과 부제에 뉴스 가치(시의성, 지역 의미, 처음이거나 특별한 점)를 담으세요.
2. 첫 문단에 누가·언제·어디서·무엇을·왜·어떻게를 담고, 그다음은 중요한 순서로 쓰세요(역피라미드).
3. 기사체 평서문(~했다, ~밝혔다)으로, A4 1장 분량으로 쓰세요.
4. 숫자는 <입력>에 있는 것만 쓰세요.
5. 인용문은 <입력>에 실제로 들은 말이 있을 때만 다듬어 쓰세요. 없으면 예시를 쓰되 [인용문 예시 — 본인 확인 후 사용]이라고 표시하세요. 지어낸 발언이 기사에 실리면 큰 문제가 됩니다.
6. 참여자 실명과 사진은 동의를 받은 경우에만 쓰도록 [동의 확인]을 표시하세요.

## 결과물 형식
- 제목 / 부제
- 본문
- 사진 설명 (캡션)
- 문의처
- 기자에게 보낼 메일 (제목 후보 3개 + 본문 5줄 이내)`,
            fields: [
                "행사·사업 개요 (무엇을, 언제, 어디서, 누가)",
                "지금 이 소식이 의미 있는 이유",
                "숫자 (참여 인원, 기간, 금액 등)",
                "인용할 말 (기관장·참여자가 실제로 한 말)",
                "보낼 매체와 담당자 (연락처는 OOO으로 둬도 됨)"
            ]
        },
        naming: {
            title: "심사위원의 시선을 사로잡는 사업명 및 슬로건 전문가",
            icon: "✨",
            description: "사용 상황: 사업명이 '제10회 어르신 나들이'라서 심사위원이 제목만 보고 졸고 있을 때. 단숨에 눈이 번쩍 뜨이는 세련된 네이밍이 간절할 때 쓰세요.",
            prompt: `당신은 공공·비영리 사업 이름을 많이 지어 온 네이밍 전문가입니다.
사회복지사가 사업명과 슬로건을 정하도록 돕습니다. 이름은 심사위원이 한 번에 사업을 떠올리고, 주민이 한 번 듣고 기억할 수 있어야 합니다.

## 원칙
1. 후보를 10개 내되 스타일을 섞으세요: 직관형, 감성형, 말맛형(라임·언어유희), 짧고 강한형.
2. 사업명은 15자 안쪽으로 짓고, 공모 신청서용은 '이름: 대상 + 사업 내용' 형식의 부제를 붙이세요.
3. 대상자를 낮추거나 낙인찍는 말('불우', '결손', '소외계층' 등)은 쓰지 마세요.
4. '행복', '희망', '동행', '함께'처럼 너무 흔한 단어는 꼭 필요할 때만 쓰고, 썼다면 이유를 적으세요.
5. 소리 내어 읽기 쉬운지, 현수막과 SNS 프로필에 넣었을 때 어떨지 생각하세요.
6. 같은 이름의 사업이 이미 있을 수 있으니 최종안에는 [중복 검색 확인]을 표시하세요.

## 결과물 형식
- 후보 표 (이름 | 부제 | 스타일 | 왜 효과적인가)
- 슬로건 5개
- 최종 추천 3개와 쓰임별 조합 (신청서용 / 현수막용 / SNS용)
- 피한 표현과 이유`,
            fields: [
                "사업 내용",
                "대상",
                "쓰일 곳 (공모 신청서, 현수막, SNS 등)",
                "원하는 느낌·피하고 싶은 느낌",
                "기존 사업명 (있으면)"
            ]
        },
        sns_content: {
            title: "블로그 및 SNS 지역사회 소통 콘텐츠 매니저",
            icon: "💬",
            description: "사용 상황: 복지관 블로그가 '행정공고 게시판'처럼 딱딱해져서 조회수가 0에 수렴할 때. 동네 이웃처럼 친근하게 주민들과 수다 떨고 싶을 때 사용하세요.",
            prompt: `당신은 복지기관 SNS를 운영해 온 지역 커뮤니케이션 매니저입니다.
사회복지사가 같은 소식을 채널마다 맞는 글로 바꾸도록 돕습니다. 채널마다 사람들이 글을 읽는 방식이 다르므로 한 글을 복사해 붙이지 않습니다.

## 원칙
1. <입력>에서 고른 채널만 쓰세요. 채널별 기준:
   - 블로그: 검색될 키워드를 넣은 제목, 소제목, 정보 정리 (1,000자 안팎)
   - 인스타그램: 첫 줄에 훅, 짧은 문단, 해시태그 3~5개
   - 페이스북: 사람 이야기 + 댓글을 부르는 질문
   - 스레드: 대화하듯 짧게, 3~5문장
   - 카카오톡 채널: 3줄 요약 + 버튼 문구
2. 공문 말투 대신 이웃에게 말하듯 쓰세요. 상투적인 표현('~를 통해', '뜻깊은 시간', '다양한 프로그램')은 구체적인 장면으로 바꾸세요.
3. 사람 이야기를 쓸 때 실명과 얼굴은 동의가 있을 때만 쓰도록 [동의 확인]을 표시하세요. 아동은 얼굴이 드러나지 않게 하세요.
4. 날짜, 장소, 신청 방법은 <입력>에 있는 것만 쓰세요.

## 결과물 형식
- 고른 채널별 완성 글
- 숏폼(릴스·쇼츠) 아이디어 1개 (첫 3초 훅, 장면 3~5컷, 자막)
- 사진 촬영 제안 3가지`,
            fields: [
                "알릴 소식",
                "올릴 채널 (블로그, 인스타그램, 페이스북, 스레드, 카카오톡 채널 중)",
                "기관 말투 (예: 친근한 반말 섞기, 단정한 존댓말)",
                "사진·영상 유무",
                "날짜·신청 방법 등 정보"
            ]
        },
        donation: {
            title: "후원 개발 캠페인 및 민간 자원 제안서 기획 전문가",
            icon: "💎",
            description: "사용 상황: 기업 CSR 담당자를 만나야 하는데 '도와주세요'라고 구걸하는 느낌이 들어 망설여질 때. '우리와 함께하면 당신 기업의 가치가 이만큼 올라갑니다!'라고 당당하게 파트너십을 제안하고 싶을 때 사용하세요.",
            prompt: `당신은 기업 파트너십 모금을 해 온 비영리 모금 전문가입니다.
사회복지사가 기업에 보낼 후원 제안서와 첫 연락 메일을 쓰도록 돕습니다. 기업 담당자는 "우리 회사가 왜 이 사업과 함께해야 하는가"와 "돈이 어떻게 쓰이고 어떻게 보고되는가"를 봅니다.

## 원칙
1. '도와 달라'가 아니라 '함께 만들 변화'로 제안하세요. 기업이 얻는 것(직원 참여, 지역 상생, ESG 사회(S) 영역 성과 스토리)을 구체적으로 쓰세요.
2. 기업의 사회공헌 방향은 <입력>에 있는 것만 쓰세요. 모르면 [확인 필요: 지속가능경영보고서·사회공헌 페이지]로 남기세요.
3. 후원 패키지는 금액별 3단계로 만들고, 단계마다 '이 금액이면 무엇이 몇 개 생기는지'를 쓰세요.
4. 집행 보고 주기와 방식(사진, 숫자, 사례)을 약속하세요. 투명성이 재후원을 만듭니다.
5. 성과나 효과를 부풀리지 마세요. 숫자는 <입력>의 실적 근거로만 쓰세요.
6. 기부금영수증 같은 혜택은 우리 기관의 기부금단체 유형을 [확인 필요]로 표시하세요.
7. 후원금을 규정에 따라 관리하고 사용 결과를 알린다는 점을 신뢰 근거로 쓰되, 세부 규정은 [확인 필요]로 두세요. 불특정 다수에게 공개 모금을 한다면 기부금품 모집 등록 대상인지도 [확인 필요]로 표시하세요.

## 결과물 형식
- 제안서: 한 줄 제안 / 우리가 풀려는 문제 / 해법 / 기업과 맞닿는 지점 / 후원 패키지 표 / 성과 보고 방식 / 다음 단계
- 첫 연락 메일 (제목 3개 + 본문, 첫 문단 3줄 안에 핵심)
- 미팅에서 나올 질문 5개와 답변`,
            fields: [
                "사업 내용과 필요한 금액·물품",
                "타깃 기업 (업종, 지역, 알고 있는 사회공헌 방향)",
                "우리 기관 소개와 실적",
                "제안 방식 (예: 메일 먼저, 미팅 예정)",
                "줄 수 있는 혜택 (기부금영수증, 감사패, 홍보 등)"
            ]
        },
        complaint: {
            title: "민원 응대 및 상황별 커뮤니케이션 매뉴얼 전문가",
            icon: "🤝",
            description: "사용 상황: 강성 민원인이 복지관에 와서 소리를 지르는데 내 멘탈은 이미 안드로메다로 갔을 때. 감정 파쇄기에 넣기 전에 일단 평화롭게 상황을 종료시킬 우아하고 단호한 스크립트가 필요할 때 사용하세요.",
            prompt: `당신은 사회복지시설 민원 응대와 비폭력대화(NVC)를 가르쳐 온 코치입니다.
사회복지사가 민원인을 응대할 실제 말과 기준을 준비하도록 돕습니다. 목표는 민원인의 감정을 가라앉히고, 해 줄 수 있는 것과 없는 것을 분명히 하며, 직원도 지키는 것입니다.

## 원칙
1. 흐름은 공감 → 사실 확인 → 가능한 것과 불가능한 것 → 대안 → 마무리로 잡으세요.
2. 멘트는 실제로 입으로 말할 수 있는 짧은 구어체 문장으로 쓰세요.
3. 사과는 '불편을 겪으신 것'에 대해서 하고, 사실 확인 전에는 잘못을 인정하는 말을 하지 않게 하세요.
4. 지킬 수 없는 약속은 하지 않게 하세요.
5. 같은 요구가 반복되면 같은 답을 차분히 반복하는 문장을 주세요.
6. 폭언이나 위협이 있으면 단계별 기준을 주세요: 1차 경고 → 응대 중단 안내 → 관리자 교대 → 112 신고. 기관 매뉴얼이 있으면 그것이 우선입니다.
7. 직원 보호(산업안전보건법상 고객응대근로자 보호 조치 등)도 짚되, 세부 조항은 [확인 필요]로 두세요.
8. 기관이 바꿀 수 없는 결정(수급 탈락, 급여 변경 등)에 대한 민원이면, 공감한 뒤 이의신청 같은 공식 경로와 함께 찾아갈 곳을 안내하세요. 신청 기한은 [확인 필요]로 두세요.

## 결과물 형식
- 상황 분석 (겉으로 한 요구 / 속으로 바라는 것 / 확인이 필요한 사실)
- 단계별 응대 스크립트 (전화·대면 중 해당하는 것)
- 거절·경계 멘트 5개
- 하면 안 되는 말
- 에스컬레이션 기준 표 (상황 | 대응 | 보고 대상)
- 응대 기록 양식
- 응대를 마친 나를 위한 10분`,
            fields: [
                "민원 상황 (무엇을 요구하는지, 어떤 말과 행동을 했는지)",
                "민원 경로 (방문, 전화, 게시판, 문자)",
                "우리 기관이 해 줄 수 있는 것과 없는 것",
                "지금까지 응대한 내용",
                "폭언·위협이 있었는지"
            ]
        },
        thank_you_letter: {
            title: "후원자·봉사자 감사 편지 작가",
            icon: "💐",
            description: "사용 상황: 연말에 감사 편지 200통을 써야 하는데 '항상 감사드립니다'만 200번 복사하고 있을 때. 받는 분이 '내 얘기네' 하고 미소 짓는 진짜 편지를 쓰고 싶을 때 쓰세요.",
            prompt: `당신은 비영리기관에서 후원자·봉사자 감사 편지를 오래 써 온 카피라이터입니다.
사회복지사가 후원자나 봉사자에게 보낼 감사 편지를 쓰도록 돕습니다. 받는 분은 인쇄된 인사말보다 "나를 기억하고 쓴 편지"에 마음이 움직이고, 그런 편지가 오래 함께하는 관계를 만듭니다.

## 원칙
1. 첫 문단에서 받는 분의 기여를 구체적으로 짚으세요(언제부터, 무엇을). <입력>에 있는 내용만 쓰세요.
2. 그 기여로 생긴 변화 하나를 구체적으로 전하세요. 사례는 동의받은 것만 가명으로 쓰고, 사례가 없으면 숫자 하나로 전하세요.
   편지는 감정을 담는 글이라 장면을 지어내기 쉽습니다. <입력>에 없는 장면(표정, 미소, 대사)이나 연결(예: 봉사가 어디에 쓰였는지), 빈도('매일' 등)를 만들지 말고, 장면이 있으면 좋을 자리는 [사례 확인 필요: 예) 도시락을 받은 아이의 실제 반응]으로 남기세요.
3. 감사 편지에서 추가 후원을 요청하지 마세요. 감사와 요청을 섞으면 감사가 가볍게 느껴집니다.
4. 받는 분에 맞춰 말투를 바꾸세요: 오래 함께한 정기 후원자, 처음 후원한 분, 기업·단체, 봉사자, 어린이 후원자.
5. 여러 명에게 보낼 편지면 {이름}, {후원 기간}, {기여 내용}처럼 바꿔 넣을 칸을 두세요.
6. '항상 감사드립니다', '따뜻한 손길', '소중한 나눔', '든든한 버팀목' 같은 상투어는 쓰지 마세요.
7. 이름 없이 '님께서'라고 쓰지 말고 '{이름} 후원자님'처럼 쓰세요. 도움받은 분들을 '결식 아동'처럼 꼬리표로 부르지 말고 '도시락이 필요한 아이들'처럼 쓰세요.
8. 길이는 형태에 맞추세요: 손글씨 카드 3~5줄, 우편 편지 A4 반 장, 문자·카카오톡 3줄, 이메일 한 화면.
9. 기부금영수증이나 연말정산 안내가 필요하면 편지 본문과 분리해 짧게 덧붙이고, 발급 시기와 방법은 [확인 필요]로 두세요.

## 결과물 형식
- 편지 본문 (요청한 형태로)
- 문자·카카오톡용 짧은 버전
- 손글씨 카드용 3줄
- 바꿔 넣을 칸 목록 (여러 명에게 보낼 때)

## 다 쓴 뒤 점검
- 문장마다 <입력>의 사실로 뒷받침되는가. 따로 적힌 두 사실(예: 봉사와 도시락)을 멋대로 이어 붙이지 않았는가
- 날짜, 이름, 금액은 <입력>에 없으면 {날짜}처럼 칸으로 남겼는가`,
            fields: [
                "받는 분 (예: 10년 정기 후원자, 처음 후원한 분, 기업, 봉사자)",
                "이 분의 기여 (언제부터, 무엇을)",
                "그 덕분에 생긴 변화 (사례·숫자, 사례 사용 동의 여부)",
                "보낼 형태 (손글씨 카드, 우편 편지, 문자·카카오톡, 이메일)",
                "보내는 사람 (예: 기관장, 담당 사회복지사)"
            ]
        },
        newsletter: {
            title: "소식지 및 뉴스레터 감성 카피라이터",
            icon: "💌",
            description: "사용 상황: 소식지에 '3월에는 어르신 생신 잔치를 했습니다'라고 썼다가 스스로도 읽기 싫어서 지웠을 때. 후원자도 눈물짓고 기관장도 어깨 펴는 소식지로 탈바꿈하고 싶을 때 사용하세요.",
            prompt: `당신은 후원자 소통 글을 오래 써 온 비영리 카피라이터입니다.
사회복지사가 후원자에게 보낼 소식지나 뉴스레터를 쓰도록 돕습니다. 후원자는 "내 후원이 누군가의 삶을 어떻게 바꿨는가"를 알고 싶어 하고, 그 답을 들으면 다시 후원합니다.

## 원칙
1. 기관이 '한 일'보다 후원자 덕분에 '달라진 것'을 쓰세요.
2. 한 사람의 이야기와 숫자 하나를 짝지으세요. 사례는 동의받은 것만 가명으로 쓰세요.
3. 장면 묘사는 <입력>에 있는 사실로만 하세요. 그럴듯한 장면이나 대사를 지어내면 사실을 왜곡하게 됩니다.
4. '기적', '눈물' 같은 과한 표현과 신파는 피하세요. 대상자를 도움만 받는 사람이 아니라 스스로 변화를 만든 사람으로 그리세요.
5. 짧은 문장, 소제목, 넉넉한 문단 나눔으로 휴대폰에서도 읽기 쉽게 쓰세요.
6. 마지막에는 다음 행동 하나를 정중하게 요청하세요. 그 전에 후원금이 어디에 얼마나 쓰였는지 한눈에 보이게 쓰세요(숫자는 <입력>에 있는 것만).
7. 두 버전으로 쓰세요: 개인 후원자용(따뜻하고 가까운 말투), 기업·기관용(성과와 투명성 중심).

## 결과물 형식 (버전마다)
- 제목 후보 3개 + 이메일 미리보기 문구 한 줄
- 첫 문단
- 본문 (소제목 포함)
- 숫자로 보는 이번 호
- 마무리와 요청`,
            fields: [
                "이번 호 소식들 (사실 위주로 나열)",
                "받는 사람 (개인 후원자, 기업, 주민 등)",
                "꼭 넣을 숫자·감사 대상",
                "분량 (예: A4 2쪽, 이메일 한 화면)",
                "사례·사진 사용 동의 여부"
            ]
        }
    };

    // 모든 프롬프트에 공통 규칙과 입력 칸을 붙여 완성본을 만든다 (화면 표시와 복사가 같은 결과를 쓴다)
    function buildPrompt(data, values) {
        const askRule = data.noQuestions
            ? '- 질문을 먼저 하지 말고 바로 답하세요. 더 확인할 정보는 답 안에 \'추가로 확인할 것\'으로 넣어 주세요.'
            : '- 결과가 크게 달라질 만큼 중요한 정보가 빠졌을 때만, 작성 전에 질문을 3개 이내로 해 주세요. 그 밖에는 합리적으로 가정하고 바로 작성하세요.';
        const fields = data.fields.map((f, i) => `■ ${f}: ${values && values[i] ? String(values[i]).trim() : ''}`).join('\n');
        return `${data.prompt}

## 공통 규칙
- 통계·수치·법 조항 번호·지역 기관명·연락처·인용문 같은 구체적 사실은 <입력>, 첨부 파일, 이 지시문에 있는 것만 쓰세요. 없으면 지어내지 말고 [확인 필요: 무엇을 확인할지]로 표시하세요.
- 실천 이론이나 제도 이름 같은 일반 지식은 써도 됩니다. 다만 선정 기준·지원 금액·신청 요건처럼 해마다 바뀌는 정보는 [확인 필요]로 표시하세요.
- <입력>의 내용을 부풀리거나, 적히지 않은 세부(사례 내용, 비율, 대사, 장면)를 덧붙이지 마세요.
- 대상자와 제3자(가족, 이웃)의 이름·주민등록번호·주소·연락처가 보이면 가려서 쓰세요. (예: 대상자 김OO, 이웃 A)
${askRule}
- 괄호 속 '예:' 안내만 남아 있는 칸은 비어 있는 것으로 봐 주세요.
- 인사말이나 작업 설명 없이 결과물부터 바로 쓰세요.
- 맨 끝에 짧게 덧붙여 주세요: ① [확인 필요] 목록 ② 가정한 내용 ③ 이어서 요청하면 좋은 것 2가지

※ 입력 전 확인: 실명·주민등록번호·정확한 주소·연락처·사진·전산시스템 화면 캡처는 넣지 마세요. 가명, 연령대, 동 단위로 바꿔 넣으면 됩니다.
<입력>
${fields}
</입력>`;
    }

    function initAIPrompter() {
        const btn = document.getElementById('open-ai-prompter');
        const btn2 = document.getElementById('open-ai-prompter-2');

        const openPrompterModal = () => {
            const categories = [
                {
                    id: 'counsel',
                    name: '📋 사례관리 및 상담',
                    keys: ['case_assessment', 'pie_records', 'case_conference', 'crisis', 'strengths', 'resource_map', 'case_closing', 'ethics', 'supervision_prep']
                },
                {
                    id: 'admin',
                    name: '💡 사업기획 및 행정',
                    keys: ['proposal', 'result_report', 'official_doc', 'data_analysis', 'program_design', 'strategy', 'complaint']
                },
                {
                    id: 'marketing',
                    name: '💌 홍보 및 마케팅',
                    keys: ['card_news', 'press_release', 'naming', 'sns_content', 'donation', 'thank_you_letter', 'newsletter']
                }
            ];

            let tabsHtml = `
            <div class="prompter-tabs" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-bottom:24px; padding:4px; background:var(--surface-3); border-radius:12px;">
                <button class="tab-btn active" id="tab-prompter-counsel" onclick="switchPrompterTab('counsel')" style="padding:10px 4px; border:none; border-radius:8px; background:var(--surface); font-weight:700; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.05); font-size:0.8rem; transition:all 0.2s; white-space:nowrap; cursor:pointer;">사례관리/상담</button>
                <button class="tab-btn" id="tab-prompter-admin" onclick="switchPrompterTab('admin')" style="padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.8rem; transition:all 0.2s; white-space:nowrap; cursor:pointer;">사업기획/행정</button>
                <button class="tab-btn" id="tab-prompter-marketing" onclick="switchPrompterTab('marketing')" style="padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.8rem; transition:all 0.2s; white-space:nowrap; cursor:pointer;">홍보/마케팅</button>
            </div>
            `;

            let contentsHtml = '';
            
            categories.forEach((category, index) => {
                let optionsHtml = '';
                category.keys.forEach(key => {
                    const data = AI_PROMPTS[key];
                    if (data) {
                        optionsHtml += `
                        <div class="prompt-option-card" onclick="renderPromptDetail('${key}')" style="margin-bottom:10px;">
                            <div class="prompt-option-icon">${data.icon}</div>
                            <div class="prompt-option-info">
                                <div class="prompt-option-title">${data.title}</div>
                                <div class="prompt-option-desc">${data.description}</div>
                            </div>
                            <div class="prompt-option-arrow">→</div>
                        </div>
                        `;
                    }
                });
                
                const displayStyle = index === 0 ? 'block' : 'none';
                contentsHtml += `
                <div id="prompter-content-${category.id}" class="tab-content" style="display:${displayStyle}; animation: fadeIn 0.3s ease;">
                    <div style="margin-top:4px; margin-bottom:12px; font-weight:800; color:var(--primary); font-size:1.1rem; padding-bottom:8px; border-bottom:2px solid var(--border);">${category.name}</div>
                    ${optionsHtml}
                </div>
                `;
            });

            const content = `
            <div class="prompter-intro" >
                <div class="prompter-badge">BEST</div>
                <h3>사복천재의 비밀 프롬프트 🪄</h3>
                <p>현장 업무 흐름에 맞춰 최신 작성법으로 다시 짠 프롬프트예요. 빈칸만 채우면 되고, 입력에 없는 사실은 지어내지 않게 만들었어요.</p>
            </div>
            <div id="ps-box">${psBoxHtml()}</div>
            ${tabsHtml}
            <div class="prompt-options-list">
                ${contentsHtml}
            </div>
            <div class="ps-foot">
                <button onclick="openWorkbookGate()">📘 6개를 실습지로 묶은 워크북 받기</button>
                <button onclick="openEduModal()">🏫 기관 교육 문의</button>
            </div>
        `;
            openModal('사복천재의 비밀 프롬프트', content, 'prompt');
            psSyncFromServer().then(() => {
                const box = document.getElementById('ps-box');
                if (box) box.innerHTML = psBoxHtml();
            });
        };

        if (btn) btn.onclick = openPrompterModal;
        if (btn2) btn2.onclick = openPrompterModal;
    }

    window.switchPrompterTab = function(tabName) {
        const tabs = ['counsel', 'admin', 'marketing'];
        tabs.forEach(tab => {
            const contentEl = document.getElementById('prompter-content-' + tab);
            const btnEl = document.getElementById('tab-prompter-' + tab);
            
            if (contentEl) {
                contentEl.style.display = tab === tabName ? 'block' : 'none';
            }
            if (btnEl) {
                if (tab === tabName) {
                    btnEl.style.background = 'var(--surface)';
                    btnEl.style.color = 'var(--primary)';
                    btnEl.style.fontWeight = '700';
                    btnEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                    btnEl.classList.add('active');
                } else {
                    btnEl.style.background = 'transparent';
                    btnEl.style.color = 'var(--text-5)';
                    btnEl.style.fontWeight = '600';
                    btnEl.style.boxShadow = 'none';
                    btnEl.classList.remove('active');
                }
            }
        });
    }

    window.renderPromptDetail = function (type) {
        const data = AI_PROMPTS[type];
        const modalBody = document.getElementById('modal-body');
        const modalTitle = document.getElementById('modal-title');
        if (!data || !modalBody || !modalTitle) return;
        trackUse('prompt_open');
        psSyncFromServer();
        const saved = psGet(type);
        const savedFields = saved.fields || {};
        const fillHtml = data.fields.map((f, i) => `
                    <label class="ps-label" for="ps-in-${i}">${escapeHtml(f)}</label>
                    <textarea id="ps-in-${i}" class="calc-input ps-input" data-i="${i}" rows="2" oninput="psOnInput('${type}')">${escapeHtml(savedFields[i] || '')}</textarea>`).join('');

        modalTitle.innerText = data.title;
        modalBody.innerHTML = `
            <div class="prompt-detail-view" style = "animation: slideInRight 0.3s ease;" >
            <div style="margin-bottom:20px;">
                <button class="btn-primary btn-outline" onclick="document.getElementById('open-ai-prompter').click()" style="padding:6px 12px; font-size:0.85rem; width:auto">← 목록으로</button>
            </div>
            
            <div class="prompt-header-box">
                <span style="font-size:2.5rem; display:block; margin-bottom:12px;">${data.icon}</span>
                <h4 style="font-size:1.2rem; font-weight:800; color:var(--text-dark); margin-bottom:8px;">${data.title}</h4>
                <p style="font-size:0.9rem; color:var(--text-5); line-height:1.5;">${data.description}</p>
                <button id="ps-fav-btn" class="ps-fav${saved.fav ? ' on' : ''}" onclick="togglePromptFav('${type}')">${saved.fav ? '★ 보관함에 담겼어요' : '☆ 보관함에 담기'}</button>
            </div>

            <details class="ps-fill" id="ps-fill"${psHasFields(saved) ? ' open' : ''}>
                <summary>✏️ 빈칸 미리 채우기 <span>(선택)</span></summary>
                <p class="ps-note">채운 내용은 복사할 때 &lt;입력&gt; 칸에 같이 들어가요. 실명·연락처·주민번호는 쓰지 마세요. 기관명·사업명처럼 자주 쓰는 내용을 저장해 두면 편해요.</p>
                ${fillHtml}
                <div class="ps-row">
                    <button id="ps-save-btn" class="btn-primary" onclick="savePromptFields('${type}')">💾 내 입력 저장</button>
                    <button class="btn-primary btn-outline" onclick="clearPromptFields('${type}')">비우기</button>
                </div>
            </details>
            <div id="ps-status" class="ps-status"></div>

            <div class="prompt-content-box">
                <div class="prompt-content-label">복사할 프롬프트 내용</div>
                <div id="prompt-text" class="prompt-text-area">${escapeHtml(buildPrompt(data, savedFields))}</div>
                <button class="btn-primary" style="margin-top:16px; width:100%; height:54px; font-size:1.1rem;" onclick="copyPromptToClipboard('${type}')">🪄 프롬프트 복사하기</button>
                <div id="ps-after-copy"></div>
            </div>

            <div class="prompt-guide-box">
                <div style="font-weight:800; color:#1e40af; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <span>💡</span> 사용 방법
                </div>
                <ol style="padding-left:20px; font-size:0.85rem; color:var(--text-4); line-height:1.7;">
                    <li>위의 <b>[프롬프트 복사하기]</b> 버튼을 눌러요.</li>
                    <li>ChatGPT, Claude, Gemini 채팅창에 붙여넣어요.</li>
                    <li>맨 아래 <b>&lt;입력&gt;</b> 칸을 채워서 보내요. 위에서 빈칸을 미리 채웠다면 그대로 보내면 돼요. 모르는 칸은 비워 둬도 되고, 기관 양식은 파일로 첨부해도 돼요.</li>
                    <li>결과를 받은 뒤 "더 짧게", "표로 바꿔 줘"처럼 이어서 요청하면 더 좋아져요.</li>
                </ol>
                <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); font-size:0.82rem; color:var(--text-4); line-height:1.65;">
                    <b>⚠ 꼭 지켜 주세요</b><br>
                    · 실명·주민번호·주소·연락처는 지우고 넣어 주세요. 기관의 AI 사용 지침도 확인해 주세요.<br>
                    · AI 서비스 설정에서 '대화 내용으로 모델 학습'을 꺼 두면 더 안전해요.<br>
                    · AI 결과는 초안이에요. <b>[확인 필요]</b> 표시는 직접 확인한 뒤 써 주세요.<br>
                    <b>💡 팁</b> 자주 쓰는 프롬프트는 ChatGPT·Claude 프로젝트나 Gemini Gem 지침에 저장해 두면 매번 붙여넣지 않아도 돼요.
                </div>
            </div>
        </div>
            `;
        modalBody.scrollTop = 0;
    };

    window.copyPromptToClipboard = function (type) {
        const data = AI_PROMPTS[type];
        const values = psFieldsFromInputs();
        const pii = findPII(Object.values(values).join('\n'));
        if (pii && !confirm(`${pii}로 보이는 내용이 들어 있어요.\nAI에는 개인정보를 넣지 않는 게 안전해요.\n\n그래도 복사할까요?`)) return;
        const textToCopy = buildPrompt(data, values);

        // 화면 밖 임시 칸에 담아 복사 (안 되면 클립보드 API로 한 번 더)
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = textToCopy;
        tempTextArea.style.cssText = 'position:fixed; top:0; left:0; opacity:0; font-size:16px;';
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        tempTextArea.setSelectionRange(0, textToCopy.length);
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
        document.body.removeChild(tempTextArea);

        const done = () => { trackUse('prompt_copy'); psRenderAfterCopy(); };
        const fail = () => alert('복사하지 못했어요. 위 프롬프트 내용을 길게 눌러 직접 복사해 주세요.');
        if (copied) { done(); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textToCopy).then(done).catch(fail);
        else fail();
    };

    /* ===== 프롬프트 보관함 · 빈칸 미리 채우기 =====
       ⭐ 담기와 내가 채운 빈칸을 저장한다. 익명 계정에도 저장되고(이 기기),
       카카오·구글을 연결하면 같은 계정이라 사무실 PC·휴대폰에서 이어 쓴다.
       서버 표(prompt_saves)가 없거나 오프라인이면 이 기기(localStorage)에만 둔다. */
    let psCache = null;
    let psSynced = false;

    function psAll() {
        if (!psCache) {
            try { psCache = JSON.parse(localStorage.getItem(PS_KEY) || '{}') || {}; } catch (e) { psCache = {}; }
        }
        return psCache;
    }
    function psPersist() { try { localStorage.setItem(PS_KEY, JSON.stringify(psAll())); } catch (e) { /* noop */ } }
    function psGet(key) { return psAll()[key] || { fav: false, fields: {} }; }
    function psHasFields(entry) { return !!entry && Object.keys(entry.fields || {}).some(k => String(entry.fields[k] || '').trim()); }
    async function psSession() {
        const session = await ensureAnonSession();
        return session && session.user ? session : null;
    }
    function psIsLinked(session) {
        const u = session && session.user;
        return !!(u && (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google'));
    }

    async function psUpload(key, entry, session) {
        const uid = session.user.id;
        const query = (!entry.fav && !psHasFields(entry))
            ? supabase.from('prompt_saves').delete().eq('user_id', uid).eq('prompt_key', key)
            : supabase.from('prompt_saves').upsert({
                user_id: uid, prompt_key: key, fav: !!entry.fav, fields: entry.fields || {},
                updated_at: new Date(entry.t || Date.now()).toISOString()
            }, { onConflict: 'user_id,prompt_key' });
        const { error } = await withTimeout(query, 8000);
        if (error) throw error;
    }

    // 서버 → 이 기기: 더 최근 것을 남기고, 이 기기에만 있던 것은 서버에 올린다
    async function psSyncFromServer() {
        if (psSynced || !supabase) return;
        try {
            const session = await psSession();
            if (!session) return;
            const { data, error } = await withTimeout(supabase.from('prompt_saves').select('prompt_key, fav, fields, updated_at'), 8000);
            if (error || !data) return;
            psSynced = true;
            const all = psAll();
            const onServer = {};
            data.forEach(r => {
                onServer[r.prompt_key] = true;
                const t = Date.parse(r.updated_at) || 0;
                const cur = all[r.prompt_key];
                if (!cur || (cur.t || 0) < t) all[r.prompt_key] = { fav: !!r.fav, fields: r.fields || {}, t };
            });
            psPersist();
            Object.keys(all).forEach(k => {
                if (!onServer[k] && AI_PROMPTS[k]) psUpload(k, all[k], session).catch(() => { /* 다음에 다시 */ });
            });
        } catch (e) { /* 오프라인이면 이 기기 저장만 쓴다 */ }
    }

    // 결과: 'cloud' = 카카오·구글 계정에 저장(다른 기기에서도 보임), 'device' = 이 기기에서만 보임
    async function psPut(key, entry) {
        const all = psAll();
        const next = { fav: !!entry.fav, fields: entry.fields || {}, t: Date.now() };
        if (!next.fav && !psHasFields(next)) delete all[key]; else all[key] = next;
        psPersist();
        if (!supabase) return 'device';
        try {
            const session = await psSession();
            if (!session) return 'device';
            await psUpload(key, next, session);
            return psIsLinked(session) ? 'cloud' : 'device';
        } catch (e) {
            console.warn('prompt save:', e && e.message ? e.message : e);
            return 'device';
        }
    }

    function psBoxHtml() {
        const all = psAll();
        const keys = Object.keys(all).filter(k => AI_PROMPTS[k] && (all[k].fav || psHasFields(all[k])));
        if (!keys.length) return '<div class="ps-box ps-empty">⭐ 자주 쓰는 프롬프트는 보관함에 담아 두세요. 빈칸을 미리 채워 저장할 수도 있어요.</div>';
        const chips = keys.map(k => `<button class="ps-chip" onclick="renderPromptDetail('${k}')">${AI_PROMPTS[k].icon} ${escapeHtml(AI_PROMPTS[k].title)}${psHasFields(all[k]) ? ' <span class="ps-chip-tag">입력 저장됨</span>' : ''}</button>`).join('');
        return `<div class="ps-box"><div class="ps-box-t">⭐ 내 보관함</div><div class="ps-chips">${chips}</div></div>`;
    }

    // 저장·복사 전에 개인정보로 보이는 패턴을 찾는다 (완벽하진 않아서 안내 문구도 함께 둔다)
    const PII_PATTERNS = [
        [/\d{6}\s*-\s*[1-4]\d{6}/, '주민등록번호'],
        [/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/, '휴대폰 번호'],
        [/(^|[^\d])0\d{1,2}[-.)]\s?\d{3,4}[-.]\d{4}(?!\d)/, '전화번호'],
        [/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i, '이메일 주소'],
    ];
    function findPII(text) {
        for (const [re, name] of PII_PATTERNS) if (re.test(text)) return name;
        return null;
    }

    function psFieldsFromInputs() {
        const out = {};
        document.querySelectorAll('#ps-fill .ps-input').forEach(el => {
            if (el.value.trim()) out[el.dataset.i] = el.value;
        });
        return out;
    }
    // 빈칸을 채우면 아래 프롬프트 미리보기도 바로 바뀐다
    window.psOnInput = function (type) {
        const pre = document.getElementById('prompt-text');
        if (pre && AI_PROMPTS[type]) pre.textContent = buildPrompt(AI_PROMPTS[type], psFieldsFromInputs());
    };

    function psLoginButtons() {
        return '<div class="ps-login-row"><button class="ps-kakao" onclick="socialLogin(\'kakao\')">카카오로 연결</button><button class="ps-google" onclick="socialLogin(\'google\')">구글로 연결</button></div>';
    }
    function psShowSaveStatus(where, what) {
        const el = document.getElementById('ps-status');
        if (!el) return;
        if (what === 'unfav') { el.innerHTML = '보관함에서 뺐어요.'; return; }
        if (what === 'cleared') { el.innerHTML = '저장해 둔 입력을 지웠어요.'; return; }
        if (where === 'cloud') { el.innerHTML = '☁️ 계정에 저장했어요. 다른 기기에서도 보여요.'; return; }
        el.innerHTML = '💾 이 기기에 저장했어요. 카카오·구글을 연결하면 사무실 PC·휴대폰에서도 보여요.' + psLoginButtons();
    }

    window.togglePromptFav = async function (type) {
        if (!AI_PROMPTS[type]) return;
        const cur = psGet(type);
        const fav = !cur.fav;
        const b = document.getElementById('ps-fav-btn');
        if (b) { b.textContent = fav ? '★ 보관함에 담겼어요' : '☆ 보관함에 담기'; b.classList.toggle('on', fav); }
        if (fav) trackUse('prompt_save');
        const where = await psPut(type, { fav, fields: cur.fields });
        psShowSaveStatus(where, fav ? 'fav' : 'unfav');
    };

    window.savePromptFields = async function (type) {
        if (!AI_PROMPTS[type]) return;
        const fields = psFieldsFromInputs();
        const pii = findPII(Object.values(fields).join('\n'));
        if (pii && !confirm(`${pii}로 보이는 내용이 있어요.\n대상자 개인정보라면 지우고 저장해 주세요.\n(기관 대표번호처럼 공개된 정보면 그대로 저장해도 돼요)\n\n그대로 저장할까요?`)) return;
        const btn = document.getElementById('ps-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
        const where = await psPut(type, { fav: psGet(type).fav, fields });
        if (btn) { btn.disabled = false; btn.textContent = '💾 내 입력 저장'; }
        if (Object.keys(fields).length) { trackUse('prompt_save'); psShowSaveStatus(where, 'fields'); }
        else psShowSaveStatus(where, 'cleared');
    };

    window.clearPromptFields = async function (type) {
        document.querySelectorAll('#ps-fill .ps-input').forEach(el => { el.value = ''; });
        window.psOnInput(type);
        const cur = psGet(type);
        if (psHasFields(cur)) {
            const where = await psPut(type, { fav: cur.fav, fields: {} });
            psShowSaveStatus(where, 'cleared');
        }
    };

    // 복사 직후: 완료 안내 + (아직이면) 비밀편지 구독 + (3번째 복사부터, 연결 전이면) 로그인 권유
    async function psRenderAfterCopy() {
        const box = document.getElementById('ps-after-copy');
        if (!box) return;
        let copies = 1, subscribed = false;
        try {
            copies = (parseInt(localStorage.getItem(COPY_COUNT_KEY) || '0', 10) || 0) + 1;
            localStorage.setItem(COPY_COUNT_KEY, String(copies));
            subscribed = localStorage.getItem(NL_DONE_KEY) === '1';
        } catch (e) { /* noop */ }
        let html = '<div class="ps-done">✅ 복사했어요. AI 채팅창에 붙여넣으세요.</div>';
        if (!subscribed) html += `
            <div class="ps-card" id="ps-sub-card">
                <div class="ps-card-t">📬 새 프롬프트가 나오면 먼저 받아 볼래요?</div>
                <div class="ps-card-d">사복노트 비밀편지로 보내 드려요. 언제든 구독을 취소할 수 있어요.</div>
                <div class="ps-sub-row">
                    <input type="email" id="ps-sub-email" class="calc-input" placeholder="이메일 주소" autocomplete="email">
                    <button class="btn-primary" onclick="submitInlineSub()">구독</button>
                </div>
                <label class="ps-agree"><input type="checkbox" id="ps-sub-agree"> <span>[필수] 개인정보 수집·이용 동의 · 이메일 · 비밀편지 발송용 · 구독 취소 시까지 보관</span></label>
            </div>`;
        box.innerHTML = html;
        if (copies < 3) return;
        const session = await psSession().catch(() => null);
        if (session && !psIsLinked(session) && document.getElementById('ps-after-copy') === box && !box.querySelector('.ps-login')) {
            box.insertAdjacentHTML('beforeend', `
            <div class="ps-card ps-login">
                <div class="ps-card-t">☁️ 보관함을 사무실 PC·휴대폰에서 이어 쓰기</div>
                <div class="ps-card-d">카카오나 구글을 연결하면 담아 둔 프롬프트와 입력이 다른 기기에서도 그대로 보여요.</div>
                ${psLoginButtons()}
            </div>`);
        }
    }

    window.submitInlineSub = async function () {
        const emailEl = document.getElementById('ps-sub-email');
        const agreeEl = document.getElementById('ps-sub-agree');
        const email = emailEl ? emailEl.value.trim() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (emailEl) { emailEl.style.borderColor = '#ef4444'; emailEl.focus(); setTimeout(() => { emailEl.style.borderColor = ''; }, 1500); }
            return;
        }
        if (!agreeEl || !agreeEl.checked) {
            const label = agreeEl && agreeEl.closest('label');
            if (label) { label.style.color = '#ef4444'; setTimeout(() => { label.style.color = ''; }, 1500); }
            return;
        }
        if (supabase) {
            try {
                const { error } = await withTimeout(supabase.from('newsletter_subscribers').insert({
                    email: email,
                    user_id: getOrCreateUserId() || 'anonymous',
                    agreed_to_terms: true,
                    created_at: new Date().toISOString()
                }));
                if (error && error.code !== '23505') throw error;   // 이미 구독한 이메일이면 그대로 완료
            } catch (e) {
                console.error('Inline subscribe error', e);
                alert('앗, 구독 등록 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
                return;
            }
        }
        try { localStorage.setItem(NL_DONE_KEY, '1'); } catch (e) { /* noop */ }
        trackUse('newsletter_sub');
        const card = document.getElementById('ps-sub-card');
        if (card) card.innerHTML = '<div class="ps-card-t">💌 구독했어요! 새 소식이 생기면 보내 드릴게요.</div>';
    };

    function initModal() {
        const modalContainer = document.getElementById('modal-container');
        const closeBtn = document.getElementById('close-modal');

        if (closeBtn) {
            closeBtn.onclick = () => closeModal();
        }

        window.addEventListener('click', (event) => {
            const overlay = document.getElementById('modal-overlay');
            if (overlay && event.target === overlay) {
                closeModal();
            }
        });
    }

    function openModal(title, contentHtml, modalId) {
        const modalOverlay = document.getElementById('modal-overlay');
        const modalContainer = document.getElementById('modal-container');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');

        if (modalTitle && modalBody) {
            const wasOpen = modalOverlay && modalOverlay.classList.contains('active');

            modalTitle.innerText = title;
            modalBody.innerHTML = contentHtml;
            if (modalOverlay) {
                modalOverlay.classList.remove('hidden');
                modalOverlay.classList.add('active');
            }
            if (modalContainer) {
                modalContainer.classList.remove('hidden');
                modalContainer.classList.add('active');
            }
            if (modalBody) modalBody.scrollTop = 0;
            // Background scroll lock
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';

            /* 히스토리 연동: 모달을 열 때 히스토리 항목을 하나 쌓아서
               뒤로가기가 사이트 이탈이 아니라 "모달 닫기"가 되게 한다. */
            const currentView = window._currentView || 'home';
            const newHash = modalId
                ? '#' + currentView + '/' + modalId
                : (window.location.hash || window.location.pathname);

            if (wasOpen) {
                // 모달 → 모달 전환은 항목을 더 쌓지 않고 주소만 교체
                if (modalId && window.location.hash !== newHash) {
                    history.replaceState({ sabokModal: true }, '', newHash);
                }
            } else if (window._suppressModalPush) {
                // 뒤로/앞으로 가기(popstate)로 다시 열리는 경우 — 항목이 이미 존재
                window._modalHistoryPushed = true;
            } else {
                history.pushState({ sabokModal: true }, '', newHash);
                window._modalHistoryPushed = true;
            }
        }
    }

    // 실제 닫기 동작 (히스토리는 건드리지 않음 — popstate 핸들러와 closeModal이 호출)
    function closeModalNow() {
        window._modalHistoryPushed = false;
        const modalOverlay = document.getElementById('modal-overlay');
        const modalContainer = document.getElementById('modal-container');
        if (modalOverlay) modalOverlay.classList.remove('active');
        if (modalContainer) modalContainer.classList.remove('active');
        setTimeout(() => {
            if (modalOverlay) modalOverlay.classList.add('hidden');
            if (modalContainer) modalContainer.classList.add('hidden');
            // Background scroll unlock
            document.body.style.overflow = '';
            document.body.style.touchAction = '';

            // URL 해시를 모달 없는 상태(탭만)로 복원
            const currentView = window._currentView || 'home';
            const tabHash = currentView === 'home' ? window.location.pathname : '#' + currentView;
            history.replaceState(null, '', tabHash);
        }, 350);
    }

    function closeModal() {
        // X 버튼·오버레이 클릭으로 닫을 때: 모달이 쌓은 히스토리 항목도 함께 걷어낸다
        // (안 걷어내면 나중에 뒤로가기를 두 번 눌러야 하는 어긋난 상태가 됨)
        if (window._modalHistoryPushed) {
            history.back(); // → popstate 핸들러가 closeModalNow() 실행
            return;
        }
        closeModalNow();
    }

    /* --- Official Eligibility Gateway (Bokjiro) --- */

    function initEligibilityCalculator() {
        const calcBtn = document.getElementById('calc-eligibility');
        if (calcBtn) {
            calcBtn.onclick = () => {
                const content = `
            <div style = "background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding:24px; border-radius:24px; border:1px solid #bae6fd; margin-bottom:24px" >
                    <h3 style="color:#1e40af; font-size:1.2rem; font-weight:900">🛡️ 안전한 판정을 위한 공식 연결</h3>
                    <p style="font-size:0.9rem; color:#1e40af; line-height:1.6; margin-top:10px">
                        자체 계산기의 오차 리스크를 방지하고 정확한 상담을 위해 <strong>보건복지부 공식 시뮬레이터</strong>로 연결합니다.
                    </p>
                </div>

                <div class="kpi-section">
                    <p style="font-size:0.85rem; font-weight:800; color:var(--text-4); margin-bottom:12px">✅ 상담 전 필수 체크리스트</p>
                    <div style="display:flex; flex-direction:column; gap:12px">
                        ${CHECKLIST_2026.map(item => `
                            <label style="display:flex; gap:12px; background:var(--surface); padding:14px; border-radius:14px; border:1px solid var(--border); cursor:pointer; font-size:0.9rem">
                                <input type="checkbox" style="width:18px; height:18px"> 
                                <span style="line-height:1.4; color:var(--text-3)">${item}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top:32px">
                    <a href="${BOKJIRO_SIMULATOR_URL}" target="_blank" class="btn-primary" 
                       style="display:block; text-align:center; text-decoration:none; background:#2563eb; padding:18px; font-size:1.1rem">
                       🌐 보건복지부 복지로 연결하기
                    </a>
                    <p style="text-align:center; font-size:0.75rem; color:var(--text-6); margin-top:10px">
                        ※ 외부 브라우저(복지로)에서 판정 완료 후 비밀노트로 돌아와 주세요.
                    </p>
                </div>
        `;
                openModal('수급 자격 판정 가이드', content, 'eligibility');
            };
        }
    }

    /* --- Administrative/Accounting Calculators (Includes LTC) --- */

    function initAdminCalculator() {
        const btn = document.getElementById('open-admin-calc');
        const btn2 = document.getElementById('open-admin-calc-2');

        const openAdminModal = () => {
            trackUse('admin_open');
            const content = `
            <div class="admin-tabs" style="display:flex; flex-direction:column; gap:8px; margin-bottom:24px;">
                <div class="admin-cats">
                    <button class="admin-cat active" data-cat="acct" onclick="switchAdminCat('acct')">💰 회계·급여</button>
                    <button class="admin-cat" data-cat="biz" onclick="switchAdminCat('biz')">📊 사업·통계</button>
                    <button class="admin-cat" data-cat="file" onclick="switchAdminCat('file')">🗂️ 사진·문서</button>
                </div>
                <div class="admin-group" data-cat="acct" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; padding:4px; background:var(--surface-3); border-radius:10px;">
                    <button class="tab-btn active" id="tab-vat" onclick="switchAdminTab('vat')" style="padding:10px 4px; border:none; border-radius:6px; background:var(--surface); font-weight:700; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.05); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">부가세</button>
                    <button class="tab-btn" id="tab-tax" onclick="switchAdminTab('tax')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">강사료 세금</button>
                    <button class="tab-btn" id="tab-payroll" onclick="switchAdminTab('payroll')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">급여 정산</button>
                    <button class="tab-btn" id="tab-budget" onclick="switchAdminTab('budget')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">단가 계산</button>
                </div>
                <div class="admin-group" data-cat="biz" style="display:none; grid-template-columns: repeat(4, 1fr); gap:6px; padding:4px; background:var(--surface-3); border-radius:10px;">
                    <button class="tab-btn" id="tab-percent" onclick="switchAdminTab('percent')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">퍼센트</button>
                    <button class="tab-btn" id="tab-target" onclick="switchAdminTab('target')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">목표 달성률</button>
                    <button class="tab-btn" id="tab-youth" onclick="switchAdminTab('youth')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">자립청년</button>
                    <button class="tab-btn" id="tab-ltc" onclick="switchAdminTab('ltc')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">장기요양</button>
                </div>
                <div class="admin-group" data-cat="file" style="display:none; grid-template-columns: repeat(4, 1fr); gap:6px; padding:4px; background:var(--surface-3); border-radius:10px;">
                    <button class="tab-btn" id="tab-mosaic" onclick="switchAdminTab('mosaic')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">사진 가리기</button>
                    <button class="tab-btn" id="tab-compressor" onclick="switchAdminTab('compressor')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">사진 압축</button>
                    <button class="tab-btn" id="tab-converter" onclick="switchAdminTab('converter')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">포맷 변환</button>
                    <button class="tab-btn" id="tab-pdf" onclick="switchAdminTab('pdf')" style="padding:10px 4px; border:none; border-radius:6px; background:transparent; font-weight:600; color:var(--text-5); font-size:0.72rem; transition:all 0.2s; white-space:nowrap;">PDF 압축</button>
                </div>
            </div>
            </div>

                <div id="admin-content-vat" class="tab-content" style="animation: fadeIn 0.3s ease;">
                    
                    <!-- 부가세 역산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px;">
                        <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:16px;">🧾 부가세/공급가액 역산기</h4>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600;">총 결제금액 입력 (원)</label>
                            <input type="number" id="vat-input" class="calc-input" placeholder="예: 55000" oninput="calcVAT()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                <span style="color:var(--text-5); font-size:0.9rem;">공급가액</span>
                                <span id="vat-supply" style="font-weight:700; color:var(--text-1); font-size:1rem;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding-bottom:12px; border-bottom:1px solid var(--border);">
                                <span style="color:var(--text-5); font-size:0.9rem;">부가세 (10%)</span>
                                <span id="vat-tax" style="font-weight:700; color:var(--text-1); font-size:1rem;">0원</span>
                            </div>
                            <div style="display:none; justify-content:space-between; margin-top:12px;">
                                <span style="font-weight:800; color:var(--primary); font-size:0.95rem;">W4C 복사용 서식</span>
                                <button onclick="navigator.clipboard.writeText(document.getElementById('vat-copy-text').innerText); alert('복사되었습니다.')" style="background:#dbeafe; color:var(--primary); border:none; border-radius:6px; padding:6px 12px; font-size:0.8rem; font-weight:800; cursor:pointer;">복사하기</button>
                            </div>
                            <div id="vat-copy-text" style="display:none; font-size:0.85rem; color:var(--text-4); margin-top:8px;">공급가액 0원 / 부가세 0원</div>
                        </div>
                    </div>

                </div>

                <div id="admin-content-tax" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    
                    <!-- 강사료 세금 계산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px; border-color:#dbeafe;">
                        <h4 style="color:#2563eb; font-weight:800; font-size:1.1rem; margin-bottom:8px;">🔬 강사료 세금 계산기</h4>
                        <p style="font-size:0.8rem; color:#1d4ed8; margin-bottom:16px;">강사에게 지급하기로 한 총액(Gross) 입력 시 세금 및 실수령액 자동 정산</p>
                        <div style="display:flex; gap:10px; margin-bottom:16px;">
                            <button id="btn-tax-business" onclick="setTaxType('business')" class="btn-primary" style="flex:1; background:var(--primary); padding:10px 0; font-size:0.9rem;">사업소득 (3.3%)</button>
                            <button id="btn-tax-other" onclick="setTaxType('other')" class="btn-primary btn-outline" style="flex:1; padding:10px 0; font-size:0.9rem;">기타소득 (8.8%)</button>
                        </div>
                        <p id="tax-desc" style="font-size:0.75rem; color:var(--text-5); margin-bottom:16px; background:var(--surface-3); padding:10px; border-radius:8px;">💡 <strong>사업소득(3.3%)</strong>: 직업적, 계속적, 반복적으로 강의를 하는 전문 강사 등</p>

                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600;">강사비 총액(Gross) (원)</label>
                            <input type="number" id="instructor-input" class="calc-input" placeholder="예: 240000" oninput="calcInstructorTax()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        
                        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #bfdbfe;">
                                <span id="inst-tax-label" style="font-weight:600; color:#2563eb; font-size:0.9rem;">사업소득세 (3.3%)</span>
                                <span id="inst-tax-total" style="font-weight:700; color:#1e40af;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="font-weight:800; color:#1e3a8a; font-size:1rem;">💰 강사 실수령액</span>
                                <span id="inst-net" style="font-weight:900; color:#e11d48; font-size:1.2rem;">0원</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="admin-content-ltc" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    
                    <div class="step-card beautiful-card" style="padding:20px;">
                        <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:16px;">🌿 방문요양 장기요양 계산기</h4>
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600;">장기요양 등급</label>
                            <select id="ltc-grade" class="calc-input">
                                <option value="1">1등급</option>
                                <option value="2">2등급</option>
                                <option value="3" selected>3등급</option>
                                <option value="4">4등급</option>
                                <option value="5">5등급</option>
                                <option value="6">인지지원등급</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-top:12px;">
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600;">본인부담 율 (%)</label>
                            <select id="ltc-rate" class="calc-input">
                                <option value="0.15">일반 (15%)</option>
                                <option value="0.09">감경 (9%)</option>
                                <option value="0.06">감경 (6%)</option>
                                <option value="0">기초 (0%)</option>
                            </select>
                        </div>
                        <div class="form-group" style="background:var(--surface-2); padding:16px; border-radius:12px; margin-top:20px; border:1px solid var(--border);">
                            <label style="color:var(--primary); font-weight:800; font-size:0.9rem;">방문요양 서비스 설정</label>
                            <div style="display:flex; gap:10px; margin-top:12px;">
                                <div style="flex:1;">
                                    <label style="font-size:0.8rem; color:var(--text-5);">1회 이용시간</label>
                                    <select id="ltc-time" class="calc-input">
                                        <option value="30">30분</option>
                                        <option value="60">60분</option>
                                        <option value="90">90분</option>
                                        <option value="120">120분</option>
                                        <option value="150">150분</option>
                                        <option value="180" selected>180분 (3시간)</option>
                                        <option value="210">210분</option>
                                        <option value="240">240분 (4시간)</option>
                                    </select>
                                </div>
                                <div style="flex:1;">
                                    <label style="font-size:0.8rem; color:var(--text-5);">월 이용일수</label>
                                    <input type="number" id="ltc-days" value="20" min="1" max="31" class="calc-input">
                                </div>
                            </div>
                        </div>
                        
                        <!-- ➕ 장기요양 가산 선택 -->
                        <div class="form-group" style="margin-top:20px;">
                            <label style="font-size:0.8rem; color:var(--text-2); font-weight:800; display:block; margin-bottom:8px;">가산 선택</label>
                            <div style="display:flex; gap:6px;">
                                <button id="ltc-calc-gasan-0" onclick="setLtcCalcGasan(0)" style="flex:1; padding:10px 0; border-radius:8px; border:1px solid var(--border); background:#5cb85c; color:white; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.2s; white-space:nowrap; letter-spacing:-0.5px;">기본(0%)</button>
                                <button id="ltc-calc-gasan-30" onclick="setLtcCalcGasan(30)" style="flex:1.5; padding:10px 0; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.2s; white-space:nowrap; letter-spacing:-0.5px;">심야, 휴일(30%)</button>
                                <button id="ltc-calc-gasan-50" onclick="setLtcCalcGasan(50)" style="flex:1.5; padding:10px 0; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.2s; white-space:nowrap; letter-spacing:-0.5px;">유급휴일(50%)</button>
                            </div>
                            <input type="hidden" id="ltc-calc-gasan-value" value="0">
                        </div>
                        
                        <button class="btn-primary" id="run-ltc-calc" style="width:100%; margin-top:20px; padding:14px; font-size:1.05rem;">정밀 계산하기</button>
                        <div id="ltc-result" class="hidden" style="margin-top:20px;"></div>
                    </div>
                </div>

                <div id="admin-content-payroll" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    <div class="step-card beautiful-card" style="padding:20px; border-color:#e0f2fe;">
                        <div style="background:#fffbeb; border:1px solid #fde68a; padding:12px; border-radius:10px; margin-bottom:16px; font-size:0.85rem; color:#92400e;">
                            ⚠️ <strong>2026년 3월 개정 기준 적용됨</strong><br>
                            최저임금 10,320원 및 인상된 4대보험 요율이 적용되었습니다.
                        </div>

                        <!-- ============================================
                             📅 일할 계산 토글 UI
                             - 중도 입사/퇴사 시 달력일수 기준으로 급여 일할 계산
                             - 체크 시 입사/퇴사 선택 + 날짜 입력 폼 표시
                             - 계산 결과는 payroll-prorate-result div에 표시
                             - calcPayrollTax() 에서 prorateRatio 로 급여 항목에 반영
                             ============================================ -->
                        <div style="margin-bottom:16px;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:var(--tint-primary); padding:12px 14px; border-radius:12px; border:1px solid #bae6fd;">
                                <input type="checkbox" id="payroll-prorate-check" onchange="toggleProrateInput()" style="width:18px; height:18px; accent-color:#2563eb;">
                                <strong style="font-size:0.85rem; color:#0369a1;">📅 중도 입사/퇴사 일할 계산 적용</strong>
                            </label>
                            <!-- 체크 시 펼쳐지는 일할 계산 입력 폼 -->
                            <div id="payroll-prorate-input" style="display:none; margin-top:10px; background:var(--tint-primary); padding:16px; border-radius:12px; border:1px dashed #bfdbfe;">
                                <!-- 달력일수 기준 안내 문구 -->
                                <p style="font-size:0.75rem; color:#1d4ed8; margin-bottom:12px; line-height:1.5;">
                                    💡 <strong>달력일수 기준</strong> 일할 계산<br>
                                    일할 급여 = 월급 × (근무일수 / 해당 월 총 일수)
                                </p>
                                <!-- 입사/퇴사 타입 선택 버튼 -->
                                <div style="display:flex; gap:8px; margin-bottom:12px;">
                                    <button id="btn-prorate-join" onclick="setProrateType('join')" style="flex:1; padding:10px 0; border-radius:8px; border:none; background:#2563eb; color:white; font-size:0.8rem; font-weight:700; cursor:pointer; transition:all 0.2s;">입사 (시작일)</button>
                                    <button id="btn-prorate-leave" onclick="setProrateType('leave')" style="flex:1; padding:10px 0; border-radius:8px; border:1px solid #bfdbfe; background:var(--surface); color:#2563eb; font-size:0.8rem; font-weight:700; cursor:pointer; transition:all 0.2s;">퇴사 (마지막일)</button>
                                </div>
                                <!-- 현재 선택된 타입 (join/leave) 저장용 hidden input -->
                                <input type="hidden" id="payroll-prorate-type" value="join">
                                <!-- 날짜 선택 (입사일 또는 퇴사일) -->
                                <div>
                                    <label id="prorate-date-label" style="display:block; font-size:0.8rem; color:#1e40af; font-weight:700; margin-bottom:4px;">입사일 선택</label>
                                    <input type="date" id="payroll-prorate-date" class="calc-input" onchange="calcPayrollTax()" style="font-size:1rem; padding:10px; width:100%; box-sizing:border-box;">
                                </div>
                                <!-- 일할 계산 결과 표시 영역 (JS에서 동적으로 채움) -->
                                <div id="payroll-prorate-result" style="display:none; margin-top:12px; padding:12px; background:var(--surface); border-radius:10px; border:1px solid #93c5fd; font-size:0.82rem; color:#1e40af; line-height:1.6;"></div>
                            </div>
                        </div>

                        <!-- Modern Input Section -->
                        <div style="background:rgba(255,255,255,0.7); backdrop-filter:blur(10px); border-radius:20px; padding:20px; margin-bottom:24px; border:1px solid rgba(226,232,240,0.8); box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
                                <span style="background:var(--primary); color:white; padding:6px; border-radius:8px; font-size:1.1rem;">⌨️</span>
                                <h5 style="color:var(--text-2); font-weight:800; font-size:1rem; margin:0;">근로 기준 입력</h5>
                            </div>
                            
                            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; margin-bottom:16px;">
                                <div style="background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
                                    <label style="font-size:0.7rem; color:var(--text-5); font-weight:700; display:block; margin-bottom:4px; white-space:nowrap; letter-spacing:-0.5px;">기본급 (세전)</label>
                                    <input type="number" id="payroll-input" value="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; font-size:1.1rem; font-weight:800; color:var(--text-2); outline:none;" placeholder="0">
                                </div>
                                <div style="background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
                                    <label style="font-size:0.7rem; color:var(--text-5); font-weight:700; display:block; margin-bottom:4px; white-space:nowrap; letter-spacing:-0.5px;">가족수당</label>
                                    <input type="number" id="payroll-family" value="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; font-size:1.1rem; font-weight:800; color:var(--text-2); outline:none;" placeholder="0">
                                </div>
                                <div style="background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
                                    <label style="font-size:0.7rem; color:var(--text-5); font-weight:700; display:block; margin-bottom:4px; white-space:nowrap; letter-spacing:-0.5px;">정액급식비</label>
                                    <input type="number" id="payroll-meal" value="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; font-size:1.1rem; font-weight:800; color:var(--text-2); outline:none;" placeholder="0">
                                </div>
                                <div style="background:var(--tint-primary); padding:12px; border-radius:12px; border:1px solid #bae6fd;">
                                    <label style="font-size:0.7rem; color:#0369a1; font-weight:700; display:block; margin-bottom:4px; white-space:nowrap; letter-spacing:-0.5px;">통상시급 <span style="font-size:0.6rem; color:#93c5fd;">(자동계산)</span></label>
                                    <input type="number" id="payroll-hourly-wage" value="0" oninput="this.dataset.autoFilled='false'; calcPayrollTax()" style="width:100%; border:none; background:transparent; font-size:1.1rem; font-weight:800; color:#0369a1; outline:none;" placeholder="자동계산">
                                    <div style="font-size:0.6rem; color:#93c5fd; margin-top:2px;">※ (기본급+식대)÷209h · 직접 수정 가능</div>
                                </div>
                            </div>
                            
                            <div style="display:flex; gap:8px;">
                                <div style="flex:1; background:var(--surface-3); padding:8px 4px; border-radius:10px; text-align:center;">
                                    <label style="font-size:0.65rem; color:var(--text-5); font-weight:700; display:block; white-space:nowrap; letter-spacing:-0.5px;">연장시간</label>
                                    <input type="number" id="payroll-ot-hours" value="0" min="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; text-align:center; font-weight:700; color:var(--text-4);">
                                </div>
                                <div style="flex:1; background:var(--surface-3); padding:8px 4px; border-radius:10px; text-align:center;">
                                    <label style="font-size:0.65rem; color:var(--text-5); font-weight:700; display:block; white-space:nowrap; letter-spacing:-0.5px;">야간시간</label>
                                    <input type="number" id="payroll-night-hours" value="0" min="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; text-align:center; font-weight:700; color:var(--text-4);">
                                </div>
                                <div style="flex:1; background:var(--surface-3); padding:8px 4px; border-radius:10px; text-align:center;">
                                    <label style="font-size:0.65rem; color:var(--text-5); font-weight:700; display:block; white-space:nowrap; letter-spacing:-0.5px;">휴일시간</label>
                                    <input type="number" id="payroll-holiday-hours" value="0" min="0" oninput="calcPayrollTax()" style="width:100%; border:none; background:transparent; text-align:center; font-weight:700; color:var(--text-4);">
                                </div>
                            </div>
                            
                        </div>

                        <!-- Results Dashboard -->
                        <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
                            <!-- Payment Card -->
                            <div style="background:linear-gradient(135deg, #ffffff 0%, #fffbeb 100%); border-radius:24px; padding:24px; border:1px solid #fde68a; box-shadow:0 10px 20px -5px rgba(251,191,36,0.1);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                                    <h6 style="color:#92400e; font-weight:800; font-size:0.95rem; margin:0; display:flex; align-items:center; gap:8px;">
                                        <span style="background:#fef3c7; padding:4px; border-radius:6px;">💰</span> 지급 내역
                                    </h6>
                                    <span id="payroll-gross-display" style="font-weight:900; color:#b45309; font-size:1.2rem;">0원</span>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:10px;">
                                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#92400e;">
                                        <span>기본급</span><span id="disp-base">0</span>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#92400e;">
                                        <span>가족수당</span><span id="disp-family">0</span>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#92400e;">
                                        <span>연장근무수당</span><span id="payroll-ot-amount">0</span>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#92400e;">
                                        <span>정액급식비</span><span id="disp-meal">0</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Deduction Card -->
                            <div style="background:linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%); border-radius:24px; padding:24px; border:1px solid #bae6fd; box-shadow:0 10px 20px -5px rgba(14,165,233,0.1);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                                    <h6 style="color:#0369a1; font-weight:800; font-size:0.95rem; margin:0; display:flex; align-items:center; gap:8px;">
                                        <span style="background:#e0f2fe; padding:4px; border-radius:6px;">🛡️</span> 공제 내역
                                    </h6>
                                    <span id="pr-ee-totalDeduct" style="font-weight:900; color:#0369a1; font-size:1.2rem;">0원</span>
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:0.8rem;">
                                    <div style="color:var(--text-5);">국민연금 <span style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">4.5%</span> <span id="pr-ee-pension" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                    <div style="color:var(--text-5);">건강보험 <span style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">3.54%</span> <span id="pr-ee-health" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                    <div style="color:var(--text-5);">고용보험 <span style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">0.9%</span> <span id="pr-ee-emp" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                    <div style="color:var(--text-5);">장기요양 <span id="pr-rate-care" style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">12.9%</span> <span id="pr-ee-care" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                    <div style="color:var(--text-5);">소득세 <span id="pr-rate-inc" style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">-</span> <span id="pr-ee-incTax" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                    <div style="color:var(--text-5);">지방소득세 <span style="font-size:0.65rem; color:var(--text-6); margin-left:4px;">10%</span> <span id="pr-ee-locTax" style="float:right; color:var(--text-1); font-weight:700;">0</span></div>
                                </div>
                            </div>

                            <!-- Final Summary Card -->
                            <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius:24px; padding:28px; color:white; position:relative; overflow:hidden; box-shadow:0 20px 25px -5px rgba(15,23,42,0.2);">
                                <div style="position:absolute; right:-20px; top:-20px; font-size:8rem; opacity:0.1; transform:rotate(15deg);">💎</div>
                                <div style="position:relative; z-index:1;">
                                    <p style="font-size:0.85rem; font-weight:600; color:var(--text-6); margin-bottom:4px;">최종 실수령액</p>
                                    <h2 id="pr-ee-net" style="font-size:2.2rem; font-weight:900; margin:0; letter-spacing:-1px;">0원</h2>
                                    
                                    <!-- Breakdown Bar -->
                                    <div style="margin-top:20px;">
                                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-6); margin-bottom:8px;">
                                            <span>세전 대비 득률</span>
                                            <span id="net-ratio">0%</span>
                                        </div>
                                        <div style="height:8px; background:rgba(255,255,255,0.1); border-radius:10px; overflow:hidden;">
                                            <div id="net-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #ec4899, #3b82f6); transition:width 0.5s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                        <!-- 🤓 신입을 위한 급여 계산 설명 토글 -->
                        <div style="margin-top:20px; text-align:center;">
                            <button onclick="togglePayrollGuide()" id="btn-payroll-guide" style="background:linear-gradient(135deg, #f0abfc 0%, #60a5fa 100%); color:white; border:none; border-radius:12px; padding:12px 24px; font-size:0.9rem; font-weight:800; cursor:pointer; transition:all 0.3s; box-shadow:0 4px 12px rgba(129,140,248,0.3);">
                                🤓 이게 뭔 소리야? (설명 보기)
                            </button>
                        </div>
                        <div id="payroll-guide-panel" style="display:none; margin-top:16px; animation: fadeIn 0.3s ease;">
                            <div style="background:linear-gradient(135deg, #faf5ff 0%, #eff6ff 100%); border-radius:20px; padding:24px; border:1px solid #e9d5ff;">
                                <div style="font-size:1.1rem; font-weight:900; color:#2563eb; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                                    📚 신입 사복이를 위한 급여명세서 해설서
                                </div>

                                <div style="display:flex; flex-direction:column; gap:14px;">
                                    <!-- 기본급 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #f59e0b;">
                                        <div style="font-weight:800; color:#92400e; font-size:0.9rem; margin-bottom:4px;">💰 기본급</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            근로계약서에 적힌 그 금액! 매달 고정으로 받는 월급이에요.<br>
                                            "내 월급이 얼마라고요?" 할 때 그 금액이 바로 이거 😎
                                        </div>
                                    </div>

                                    <!-- 통상시급 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #3b82f6;">
                                        <div style="font-weight:800; color:#1e40af; font-size:0.9rem; margin-bottom:4px;">⏰ 통상시급 = (기본급+식대) ÷ 209</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            "209가 뭐야?" → 한 달에 일하기로 약속한 시간이에요!<br>
                                            주 40시간 × 4.345주(12개월÷52주) = <strong>약 209시간</strong><br>
                                            이 시급이 있어야 연장수당을 계산할 수 있어요 💡
                                        </div>
                                    </div>

                                    <!-- 연장수당 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #3b82f6;">
                                        <div style="font-weight:800; color:#1e40af; font-size:0.9rem; margin-bottom:4px;">🌙 연장근무수당 = 통상시급 × 1.5배 × 시간</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            야근하면 시급의 <strong>1.5배</strong>를 받아요! (50% 가산)<br>
                                            "야근비가 왜 이것밖에 안 돼?" → 시급 기준이라 그래요… 😢<br>
                                            야간(밤10시~새벽6시)·휴일도 마찬가지로 1.5배!
                                        </div>
                                    </div>

                                    <!-- 정액급식비 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #10b981;">
                                        <div style="font-weight:800; color:#065f46; font-size:0.9rem; margin-bottom:4px;">🍱 정액급식비 (비과세 20만원)</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            밥값! 월 20만원까지는 세금을 안 매겨요 (비과세).<br>
                                            그래서 기본급에서 일부를 급식비로 빼놓으면 세금이 줄어드는 마법 ✨<br>
                                            "왜 급여가 쪼개져 있지?" → 이런 이유예요!
                                        </div>
                                    </div>

                                    <!-- 4대보험 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #ef4444;">
                                        <div style="font-weight:800; color:#991b1b; font-size:0.9rem; margin-bottom:8px;">🛡️ 4대보험 (내 월급에서 빠지는 것들)</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            <div style="margin-bottom:8px;">
                                                <strong style="color:#dc2626;">① 국민연금 (~4.5%)</strong><br>
                                                나중에 은퇴하면 돌려받는 저축 같은 것! 회사도 반반 내요 🤝
                                            </div>
                                            <div style="margin-bottom:8px;">
                                                <strong style="color:#2563eb;">② 건강보험 (~3.54%)</strong><br>
                                                병원 갈 때 30%만 내는 이유가 바로 이거! 매달 내는 건보료 덕분이에요 🏥
                                            </div>
                                            <div style="margin-bottom:8px;">
                                                <strong style="color:#16a34a;">③ 장기요양 (건보료의 ~12.95%)</strong><br>
                                                어르신들 요양 서비스 비용! 건강보험에 덧붙여서 나가요 👴
                                            </div>
                                            <div>
                                                <strong style="color:#2563eb;">④ 고용보험 (~0.9%)</strong><br>
                                                실직하면 실업급여 받을 수 있는 보험! 미래의 안전망이에요 🪂
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 소득세 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #f97316;">
                                        <div style="font-weight:800; color:#9a3412; font-size:0.9rem; margin-bottom:4px;">💸 소득세 + 지방소득세</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            돈 벌면 나라에 내는 세금! 소득세의 10%가 지방소득세예요.<br>
                                            "왜 두 개야?" → 하나는 국가, 하나는 우리 동네에 내는 거예요 🏛️<br>
                                            연말정산 때 돌려받을 수도 있으니 영수증 모아두세요! 🧾
                                        </div>
                                    </div>

                                    <!-- 실수령액 -->
                                    <div style="background:linear-gradient(135deg, #1e293b, #0f172a); border-radius:14px; padding:14px; color:white;">
                                        <div style="font-weight:800; font-size:0.9rem; margin-bottom:4px;">💎 실수령액 = 총 지급액 - 총 공제액</div>
                                        <div style="font-size:0.8rem; color:var(--text-6); line-height:1.6;">
                                            드디어! 내 통장에 꽂히는 금액! 🎉<br>
                                            "생각보다 적은데…?" → 4대보험이 미래의 나를 지켜주는 거예요.<br>
                                            세전 대비 약 85~90% 정도가 실수령액이에요 👛
                                        </div>
                                    </div>

                                    <!-- 일할 계산 -->
                                    <div style="background:var(--surface); border-radius:14px; padding:14px; border-left:4px solid #06b6d4;">
                                        <div style="font-weight:800; color:#0e7490; font-size:0.9rem; margin-bottom:4px;">📅 일할 계산 (중도 입사/퇴사)</div>
                                        <div style="font-size:0.8rem; color:#78716c; line-height:1.6;">
                                            한 달 중간에 들어왔거나 나갔으면?<br>
                                            → <strong>월급 × (근무일수 ÷ 그 달 총 일수)</strong> 로 딱 일한 만큼!<br>
                                            5월 15일 입사면? 월급 × (17일/31일) = 약 54.8% 💪<br>
                                            4대보험도 이 금액 기준으로 다시 계산돼요!
                                        </div>
                                    </div>
                                </div>

                                <div style="margin-top:16px; padding:12px; background:#fef3c7; border-radius:10px; font-size:0.75rem; color:#92400e; line-height:1.5;">
                                    💬 <strong>선배 사복이의 한마디:</strong> 처음엔 복잡해 보이지만, 한두 번 해보면 금방 익숙해져요! 모르는 건 부끄러운 게 아니라 배우는 중인 거예요 😊
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div id="admin-content-budget" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    <div class="step-card beautiful-card" id="budget-checker-card" style="padding:20px; transition:all 0.3s; border:2px solid transparent;">
                        <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:8px;">🍽️ 단가 계산기 (식대 등 1인당 단가 검증)</h4>
                        
                        <div style="display:flex; gap:12px; margin-bottom:16px; margin-top:16px;">
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:var(--text-5); font-weight:600;">총 영수증 금액</label>
                                <input type="number" id="budget-total" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:var(--text-5); font-weight:600;">참석 인원 (명)</label>
                                <input type="number" id="budget-people" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; background:var(--surface-2); padding:12px; border-radius:12px;">
                            <label style="font-size:0.8rem; color:var(--text-4); font-weight:800; flex:1;">기준 한도액</label>
                            <input type="number" id="budget-limit" value="8000" class="calc-input" style="width:100px; padding:8px; text-align:right" oninput="checkBudget()">
                            <span style="font-size:0.8rem; color:var(--text-5);">원</span>
                        </div>

                        <div id="budget-feedback" style="padding:16px; border-radius:12px; text-align:center; background:var(--surface-3); font-weight:700; color:var(--text-5); transition:all 0.3s ease;">
                            금액과 인원을 입력해주세요.
                        </div>
                    </div>
                </div>

                <!-- 자립준비청년 연수 계산기 -->
                <div id="admin-content-youth" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px;">
                        <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:8px;">🎒 자립준비청년 보호종료 연수 계산</h4>
                        <p style="font-size:0.8rem; color:var(--text-5); margin-bottom:20px; line-height:1.5;">
                            자립수당 등 핵심 지원 혜택의 기준이 되는 <strong>'보호종료일 기준 5년 이내'</strong> 여부를 군 복무 기간을 반영하여 정확하게 계산합니다.
                        </p>

                        <!-- Input Dates -->
                        <div style="background:var(--surface-2); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
                            <div style="display:flex; flex-direction:column; gap:16px;">
                                <div>
                                    <label style="display:block; font-size:0.85rem; color:var(--text-4); font-weight:700; margin-bottom:6px;">보호종료일 (퇴소일) <span style="color:#ef4444">*</span></label>
                                    <input type="date" id="youth-end-date" class="calc-input" onchange="calcYouthIndependence()" oninput="calcYouthIndependence()" style="font-size:1.1rem; padding:12px; width:100%; box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block; font-size:0.85rem; color:var(--text-4); font-weight:700; margin-bottom:6px;">기준일 (미입력 시 '오늘')</label>
                                    <input type="date" id="youth-base-date" class="calc-input" onchange="calcYouthIndependence()" oninput="calcYouthIndependence()" style="font-size:1.1rem; padding:12px; width:100%; box-sizing:border-box;">
                                </div>
                            </div>
                        </div>

                        <!-- Military Option -->
                        <div style="margin-bottom:20px;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="youth-military-check" onchange="toggleMilitaryInput()" oninput="toggleMilitaryInput()" style="width:18px; height:18px; accent-color:#2563eb;">
                                <strong style="font-size:0.9rem; color:var(--text-2);">🎖️ 병역 의무(군 복무)를 이행했거나 이행 중인가요?</strong>
                            </label>
                            
                            <!-- Toggle Form -->
                            <div id="youth-military-input" style="display:none; margin-top:12px; background:var(--tint-primary); padding:16px; border-radius:12px; border:1px dashed #bfdbfe;">
                                <p style="font-size:0.8rem; color:#1d4ed8; margin-bottom:12px; line-height:1.4;">
                                    관련 법령에 따라 <strong>군 복무 기간은 보호종료 기간 산정에서 제외(연장)</strong> 처리됩니다. 입대일과 전역(예정)일을 입력해주세요.
                                </p>
                                <div style="display:flex; flex-direction:column; gap:12px;">
                                    <div style="flex:1;">
                                        <label style="display:block; font-size:0.8rem; color:#1e40af; font-weight:700; margin-bottom:4px;">입대일</label>
                                        <input type="date" id="youth-mil-start" class="calc-input" onchange="calcYouthIndependence()" oninput="calcYouthIndependence()" style="font-size:1.1rem; padding:12px; width:100%; box-sizing:border-box;">
                                    </div>
                                    <div style="flex:1;">
                                        <label style="display:block; font-size:0.8rem; color:#1e40af; font-weight:700; margin-bottom:4px;">전역(예정)일</label>
                                        <input type="date" id="youth-mil-end" class="calc-input" onchange="calcYouthIndependence()" oninput="calcYouthIndependence()" style="font-size:1.1rem; padding:12px; width:100%; box-sizing:border-box;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Result Area -->
                        <div id="youth-result-card" style="display:none; margin-top:24px;">
                            <h4 style="font-size:1rem; font-weight:800; color:#3b82f6; margin-bottom:12px;">📈 계산 결과</h4>
                            <div id="youth-result-content" style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:20px;">
                                <!-- Dynamically injected via JS -->
                            </div>
                            <div style="margin-top:24px; padding:16px; background:#fff1f2; border-radius:12px; border:1px solid #ffe4e6; display:block; visibility:visible; opacity:1;">
                                <div style="display:flex; align-items:flex-start; gap:8px;">
                                    <span style="font-size:1.2rem; flex-shrink:0;">⚠️</span>
                                    <div>
                                        <div style="font-size:0.8rem; font-weight:800; color:#e11d48; margin-bottom:4px;">법적 책임 한계 안내</div>
                                        <div style="font-size:0.75rem; color:#be123c; line-height:1.5;">
                                            본 계산기의 결과는 사용자가 입력한 값을 바탕으로 산출된 <b>참고용 추정치</b>입니다. 본 결과값은 어떠한 법적 증빙 효력도 갖지 못하며, 해당 계산 결과를 근거로 한 사용자의 결정이나 계약에 대해 <b>본 서비스는 일체의 법적 책임을 지지 않습니다.</b> 정확한 혜택 대상자 여부 및 자격 기준은 관할 지자체 및 자립지원전담기관을 통해 반드시 최종 확인하시기 바랍니다.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 사업 목표값 계산기 -->
            <div id="admin-content-target" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px;">
                    <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:16px;">🎯 사업 목표 달성률 계산</h4>

                    <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:20px;">
                        <div>
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600; margin-bottom:6px; display:block;">목표값 (Target)</label>
                            <input type="number" id="target-goal-input" class="calc-input" placeholder="예: 100" oninput="calcTargetRate()" style="font-size:1.1rem; padding:12px; width:100%;">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; color:var(--text-4); font-weight:600; margin-bottom:6px; display:block;">실적값 (Actual)</label>
                            <input type="number" id="target-actual-input" class="calc-input" placeholder="예: 85" oninput="calcTargetRate()" style="font-size:1.1rem; padding:12px; width:100%;">
                        </div>
                    </div>

                    <button class="btn-primary" onclick="calcTargetRate()" style="width:100%; margin-bottom:20px; padding:14px; font-size:1rem;">📊 달성률 계산하기</button>

                    <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:20px; text-align:center;">
                        <div style="font-size:0.85rem; color:var(--text-5); font-weight:700; margin-bottom:12px;">현재 달성률</div>
                        <div id="target-rate-result" style="font-size:2.8rem; font-weight:900; color:#3b82f6; margin-bottom:16px;">0%</div>
                        
                        <!-- Progress Bar for Target -->
                        <div style="height:12px; background:var(--surface-4); border-radius:10px; overflow:hidden; margin-bottom:16px;">
                            <div id="target-rate-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #3b82f6, #10b981); transition:width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
                        </div>

                    <div id="target-rate-msg" style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-strong); font-size:0.95rem; color:var(--text-4); font-weight:600; line-height:1.4;">목표값과 실적값을 입력해주세요.</div>
                    </div>
                </div>
            </div>

            <!-- 사진 압축기 -->
            <div id="admin-content-compressor" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <style>
                    #admin-content-compressor .compressor-container { position: relative; z-index: 1; width: 100%; color: var(--text-3); }
                    #admin-content-compressor .compressor-subtitle { text-align: center; color: var(--text-5); font-size: 0.85rem; font-weight: 300; margin-bottom: 25px; }
                    #admin-content-compressor .drop-zone {
                        border: 2px dashed var(--border); border-radius: 20px; padding: 3rem 2rem;
                        text-align: center; cursor: pointer; background: var(--surface-2);
                        transition: all 0.3s ease; position: relative; overflow: hidden;
                    }
                    #admin-content-compressor .drop-zone:hover, #admin-content-compressor .drop-zone.dragover { border-color: #7b61ff; background: var(--surface-3); }
                    #admin-content-compressor .drop-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
                    #admin-content-compressor .drop-text { font-size: 1rem; font-weight: 700; color: var(--text-2); margin-bottom: 0.4rem; }
                    #admin-content-compressor .drop-sub { font-size: 0.78rem; color: var(--text-5); font-weight: 400; }
                    #admin-content-compressor input[type="file"] { display: none; }
                    #admin-content-compressor .settings {
                        background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px;
                        padding: 1.4rem 1.6rem; margin-top: 1.2rem; display: none;
                    }
                    #admin-content-compressor .settings.visible { display: block; }
                    #admin-content-compressor .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
                    #admin-content-compressor .setting-label { font-size: 0.85rem; color: var(--text-5); font-weight: 700; }
                    #admin-content-compressor .target-display { font-size: 1.1rem; font-weight: 800; color: #7b61ff; }
                    #admin-content-compressor .slider-wrap { flex: 1; margin: 0 0.5rem; }
                    #admin-content-compressor input[type="range"] {
                        -webkit-appearance: none; width: 100%; height: 6px; border-radius: 4px;
                        background: var(--surface-4); outline: none; cursor: pointer;
                    }
                    #admin-content-compressor input[type="range"]::-webkit-slider-thumb {
                        -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
                        background: #7b61ff; cursor: pointer; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    #admin-content-compressor img { border-radius: 12px; border: 1px solid var(--border); }
                    #admin-content-compressor .compress-btn {
                        width: 100%; margin-top: 1.2rem; padding: 1rem; border: none; border-radius: 14px;
                        background: linear-gradient(135deg, #7b61ff, #ff6b9d); color: #fff;
                        font-family: inherit; font-size: 1rem; font-weight: 800;
                        cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(123,97,255,0.3); display: none;
                    }
                    #admin-content-compressor .compress-btn.visible { display: block; }
                    #admin-content-compressor .compress-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(123,97,255,0.4); }
                    #admin-content-compressor .result-card {
                        background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
                        padding: 1.6rem; margin-top: 1.2rem; display: none;
                    }
                    #admin-content-compressor .result-card.visible { display: block; }
                    #admin-content-compressor .preview-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.4rem; }
                    #admin-content-compressor .preview-item { text-align: center; }
                    #admin-content-compressor .preview-item img {
                        width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px;
                        border: 1px solid var(--border); background: var(--surface-2);
                    }
                    #admin-content-compressor .preview-label { font-size: 0.72rem; color: var(--text-5); margin-top: 0.5rem; font-weight: 700; }
                    #admin-content-compressor .preview-size { font-size: 0.9rem; font-weight: 800; margin-top: 0.2rem; }
                    #admin-content-compressor .size-before { color: #f43f5e; }
                    #admin-content-compressor .size-after { color: #10b981; }
                    #admin-content-compressor .stats-row {
                        display: flex; justify-content: center; align-items: center; gap: 0.5rem;
                        margin-bottom: 1.4rem; font-size: 0.85rem; color: var(--text-5); font-weight: 700;
                    }
                    #admin-content-compressor .reduction-badge {
                        background: linear-gradient(135deg, #10b981, #3dd6f5); color: #fff;
                        font-weight: 800; font-size: 0.85rem; padding: 0.25rem 0.7rem; border-radius: 99px;
                    }
                    #admin-content-compressor .download-btn {
                        display: block; width: 100%; padding: 0.9rem;
                        border: 2px solid #7b61ff; border-radius: 12px; background: transparent;
                        color: #7b61ff; font-family: inherit;
                        font-size: 0.95rem; font-weight: 800; cursor: pointer; transition: all 0.2s ease;
                    }
                    #admin-content-compressor .download-btn:hover { background: #7b61ff; color: #fff; box-shadow: 0 4px 16px rgba(123,97,255,0.3); }
                    #admin-content-compressor .progress-wrap { margin-top: 1rem; display: none; }
                    #admin-content-compressor .progress-wrap.visible { display: block; }
                    #admin-content-compressor .progress-bar-bg { height: 6px; background: var(--surface-4); border-radius: 99px; overflow: hidden; }
                    #admin-content-compressor .progress-bar-fill {
                        height: 100%; background: linear-gradient(90deg, #7b61ff, #ff6b9d);
                        border-radius: 99px; width: 0%; transition: width 0.3s ease;
                    }
                    #admin-content-compressor .progress-text { text-align: center; font-size: 0.8rem; color: var(--text-5); margin-top: 0.5rem; font-weight: 400; }
                    #admin-content-compressor .warning-badge {
                        background: #fffbeb; border: 1px solid #fde68a;
                        color: #b45309; font-size: 0.78rem; padding: 0.5rem 0.8rem;
                        border-radius: 10px; margin-top: 0.8rem; font-weight: 400; display: none;
                    }
                    #admin-content-compressor .privacy-note {
                        text-align: center; margin-top: 1.5rem; font-size: 0.75rem;
                        color: var(--text-5); font-weight: 400; line-height: 1.6;
                    }
                    #admin-content-compressor .privacy-note span { color: #10b981; font-weight: 700; }
                </style>
                <div class="compressor-container">
                    <h4 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:8px; text-align:center;">📦 사진 압축기</h4>
                    <p class="compressor-subtitle">업로드하면 목표 용량 이하로 자동 압축돼요</p>

                    <div class="drop-zone" id="dropZoneComp">
                        <span class="drop-icon">🖼️</span>
                        <p class="drop-text">여기에 사진을 드래그하거나 클릭하세요</p>
                        <p class="drop-sub">JPG, PNG, WebP 지원 · 여러 장도 OK</p>
                        <input type="file" id="fileInputComp" accept="image/*" multiple>
                    </div>

                    <div class="settings" id="settingsComp">
                        <div class="setting-row">
                            <span class="setting-label">목표 용량</span>
                            <div class="slider-wrap">
                                <input type="range" id="targetSliderComp" min="100" max="2000" step="50" value="500">
                            </div>
                            <span class="target-display" id="targetDisplayComp">500 KB</span>
                        </div>
                    </div>

                    <div class="progress-wrap" id="progressWrapComp">
                        <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressFillComp"></div></div>
                        <p class="progress-text" id="progressTextComp">압축 중...</p>
                    </div>

                    <button class="compress-btn" id="compressBtnComp">✨ 압축 시작</button>

                    <div class="result-card" id="resultCardComp">
                        <div class="preview-row" id="previewRowComp"></div>
                        <div class="stats-row" id="statsRowComp"></div>
                        <div class="warning-badge" id="warningBadgeComp"></div>
                        <button class="download-btn" id="downloadBtnComp">⬇️ 압축된 파일 다운로드</button>
                    </div>

                    <p class="privacy-note">🔒 <span>사진은 서버로 전송되지 않아요.</span><br>모든 압축은 내 브라우저 안에서만 처리됩니다.</p>
                </div>
            </div>

            <!-- 퍼센트 계산기 탭 내용 -->
            <div id="admin-content-percent" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <style>
                    .percent-mode-card { background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:16px; transition:all 0.2s; }
                    .percent-mode-card:hover { border-color:#93c5fd; box-shadow:0 4px 12px rgba(59,130,246,0.1); }
                    .percent-title { font-size:0.95rem; font-weight:800; color:#1e3a8a; margin-bottom:12px; display:flex; align-items:flex-start; gap:8px; line-height:1.4; word-break:keep-all; }
                    .percent-title span { white-space:nowrap; flex:none; }
                    /* 폰에서도 값이 다 보이게: 입력칸은 줄마다 넓게, 결과는 맨 아래 한 줄 전체 */
                    .percent-inputs { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 10px; align-items:center; }
                    .percent-inputs > span { font-size:0.9rem !important; }
                    .percent-inputs input { width:100%; min-width:0; padding:12px; border-radius:10px; border:1px solid var(--border-strong); font-size:16px; outline:none; text-align:right; color:var(--text-2); font-weight:700; }
                    .percent-inputs input:focus { border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,0.2); }
                    .percent-result { grid-column:1 / -1; font-weight:900; color:#2563eb; font-size:1.3rem; text-align:right; background:#eff6ff; border-radius:10px; padding:10px 14px; overflow-wrap:anywhere; }
                </style>
                <div class="step-card beautiful-card" style="padding:20px; border-color:#bfdbfe;">
                    <h4 style="color:#1e40af; font-weight:800; font-size:1.1rem; margin-bottom:8px; text-align:center;">📊 만능 퍼센트 계산기</h4>
                    <p style="text-align:center; color:var(--text-5); font-size:0.85rem; margin-bottom:20px;">사업 실적, 예산 집행률을 쉽게 계산하세요 (네이버 스타일)</p>
                    
                    <div class="percent-mode-card">
                        <div class="percent-title"><span style="background:#dbeafe; padding:4px 6px; border-radius:6px; font-size:0.8rem;">1. 비율값</span> A의 B%는 얼마?</div>
                        <div class="percent-inputs">
                            <input type="number" id="pc-1-a" placeholder="10000" oninput="calcPercent(1)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">의</span>
                            <input type="number" id="pc-1-b" placeholder="20" oninput="calcPercent(1)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">%는</span>
                            <div class="percent-result" id="pc-1-res">?</div>
                        </div>
                    </div>

                    <div class="percent-mode-card">
                        <div class="percent-title"><span style="background:#dbeafe; padding:4px 6px; border-radius:6px; font-size:0.8rem;">2. 일부값</span> A의 B는 몇 %?</div>
                        <div class="percent-inputs">
                            <input type="number" id="pc-2-a" placeholder="10000" oninput="calcPercent(2)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">의</span>
                            <input type="number" id="pc-2-b" placeholder="2000" oninput="calcPercent(2)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">은(는)</span>
                            <div class="percent-result" id="pc-2-res">?</div>
                        </div>
                    </div>

                    <div class="percent-mode-card">
                        <div class="percent-title"><span style="background:#dbeafe; padding:4px 6px; border-radius:6px; font-size:0.8rem;">3. 증감률</span> A에서 B로 변하면 몇 % 증감?</div>
                        <div class="percent-inputs">
                            <input type="number" id="pc-3-a" placeholder="10000" oninput="calcPercent(3)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">에서</span>
                            <input type="number" id="pc-3-b" placeholder="15000" oninput="calcPercent(3)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">(으)로</span>
                            <div class="percent-result" id="pc-3-res">?</div>
                        </div>
                    </div>

                    <div class="percent-mode-card">
                        <div class="percent-title"><span style="background:#dbeafe; padding:4px 6px; border-radius:6px; font-size:0.8rem;">4. 증감값</span> A가 B% 증가하면 얼마?</div>
                        <div class="percent-inputs">
                            <input type="number" id="pc-4-a" placeholder="10000" oninput="calcPercent(4)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">이(가)</span>
                            <input type="number" id="pc-4-b" placeholder="20" oninput="calcPercent(4)"> <span style="font-size:0.85rem; color:var(--text-5); white-space:nowrap;">% 증가하면</span>
                            <div class="percent-result" id="pc-4-res">?</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PDF 용량 줄이기 탭 내용 -->
            <div id="admin-content-pdf" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <style>
                    .pdf-drop-zone { border:2px dashed var(--border-strong); border-radius:16px; padding:30px 20px; text-align:center; background:var(--surface); cursor:pointer; transition:all 0.2s; margin-bottom:20px; }
                    .pdf-drop-zone:hover { border-color:#ef4444; background:#fef2f2; }
                    .pdf-settings { display:none; background:var(--surface-2); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px; }
                    .pdf-settings.visible { display:block; }
                </style>
                <div class="compressor-container step-card beautiful-card" style="padding:20px; border-color:#fca5a5;">
                    <h4 style="color:#b91c1c; font-weight:800; font-size:1.1rem; margin-bottom:8px; text-align:center;">📄 PDF 용량 줄이기</h4>
                    <p style="text-align:center; color:var(--text-5); font-size:0.85rem; margin-bottom:20px;">서버 전송 없이 내 기기에서 안전하게 압축</p>

                    <div class="pdf-drop-zone" id="pdfDropZone" onclick="document.getElementById('pdfFileInput').click()">
                        <span style="font-size:3rem; margin-bottom:1rem; display:block;">📉</span>
                        <p style="font-size:1rem; font-weight:700; color:var(--text-2); margin-bottom:0.4rem;">PDF 파일을 여기에 클릭하여 선택하세요</p>
                        <p style="font-size:0.78rem; color:var(--text-5);">텍스트가 캡처 이미지로 변환되며 용량이 대폭 줄어듭니다</p>
                        <input type="file" id="pdfFileInput" accept="application/pdf" style="display:none;" onchange="handlePdfSelect(event)">
                    </div>

                    <div class="pdf-settings" id="pdfSettings">
                        <div style="font-size:0.9rem; font-weight:700; color:var(--text-2); margin-bottom:8px;">선택된 파일: <span id="pdfFileName" style="color:#ef4444;"></span> (<span id="pdfFileSize"></span>)</div>
                        
                        <div style="margin-top:16px; margin-bottom:8px; font-size:0.85rem; color:var(--text-4); font-weight:700;">압축 품질 선택</div>
                        <select id="pdfQualitySelect" class="calc-input" style="width:100%; margin-bottom:16px;">
                            <option value="0.9">고품질 (용량 조금 감소)</option>
                            <option value="0.7" selected>표준 (권장)</option>
                            <option value="0.5">저품질 (용량 대폭 감소)</option>
                        </select>

                        <button class="compress-btn visible" id="pdfCompressBtn" onclick="startPdfCompression()" style="width:100%; padding:14px; background:#ef4444; color:white; border:none; border-radius:12px; font-weight:800; font-size:1.05rem; cursor:pointer;">✨ PDF 압축 시작</button>
                    </div>

                    <div id="pdfProgressWrap" style="display:none; margin-top:20px;">
                        <div style="height:6px; background:var(--surface-4); border-radius:99px; overflow:hidden;">
                            <div id="pdfProgressFill" style="height:100%; width:0%; background:#ef4444; transition:width 0.2s;"></div>
                        </div>
                        <p id="pdfProgressText" style="text-align:center; font-size:0.8rem; color:var(--text-5); margin-top:0.5rem;">압축 준비 중...</p>
                    </div>

                    <div id="pdfResultWrap" style="display:none; margin-top:20px; background:#ecfdf5; border:1px solid #a7f3d0; padding:16px; border-radius:12px; text-align:center;">
                        <div style="font-size:1.2rem; font-weight:800; color:#059669; margin-bottom:8px;">🎉 압축 완료!</div>
                        <div style="font-size:0.9rem; color:#065f46; margin-bottom:16px;">
                            <span id="pdfResultBefore" style="text-decoration:line-through; color:var(--text-6);"></span> ➡️ 
                            <span id="pdfResultAfter" style="font-weight:800;"></span>
                        </div>
                        <button id="pdfDownloadBtn" onclick="downloadCompressedPdf()" class="btn-primary" style="background:#10b981; width:100%; border:none;">⬇️ 압축된 PDF 다운로드</button>
                    </div>

                    <p style="text-align:center; font-size:0.75rem; color:var(--text-6); margin-top:20px;">🔒 파일은 절대 외부 서버로 전송되지 않으며 안전하게 기기에서만 처리됩니다.</p>
                </div>
            </div>

            <!-- 이미지 포맷 변환기 탭 내용 -->
            <div id="admin-content-converter" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <style>
                    .conv-drop-zone { border:2px dashed var(--border-strong); border-radius:16px; padding:30px 20px; text-align:center; background:var(--surface); cursor:pointer; transition:all 0.2s; margin-bottom:20px; }
                    .conv-drop-zone:hover, .conv-drop-zone.dragover { border-color:#eab308; background:#fefce8; }
                    .conv-settings { display:none; background:var(--surface-2); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px; }
                    .conv-settings.visible { display:block; }
                    .conv-file-list { margin-top:12px; max-height:150px; overflow-y:auto; font-size:0.85rem; color:var(--text-4); background:var(--surface); border-radius:8px; border:1px solid var(--border); padding:8px; }
                    .conv-file-item { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border); }
                    .conv-file-item:last-child { border-bottom:none; }
                    .conv-result-wrap { display:none; margin-top:20px; background:#fefce8; border:1px solid #fef08a; padding:16px; border-radius:12px; text-align:center; }
                </style>
                <div class="compressor-container step-card beautiful-card" style="padding:20px; border-color:#fde047;">
                    <h4 style="color:#ca8a04; font-weight:800; font-size:1.1rem; margin-bottom:8px; text-align:center;">🔄 이미지 포맷 변환기</h4>
                    <p style="text-align:center; color:var(--text-5); font-size:0.85rem; margin-bottom:20px;">여러 장의 사진을 원하는 포맷(JPG, PNG 등)으로 일괄 변환하세요</p>

                    <div class="conv-drop-zone" id="convDropZone">
                        <span style="font-size:3rem; margin-bottom:1rem; display:block;">🪄</span>
                        <p style="font-size:1rem; font-weight:700; color:var(--text-2); margin-bottom:0.4rem;">사진을 여기에 드래그하거나 클릭하세요</p>
                        <p style="font-size:0.78rem; color:var(--text-5);">WebP, HEIC, PNG 등 모두 변환 가능 · 여러 장 동시 처리</p>
                        <input type="file" id="convFileInput" accept="image/*" multiple style="display:none;">
                    </div>

                    <div class="conv-settings" id="convSettings">
                        <div style="font-size:0.9rem; font-weight:700; color:var(--text-2); margin-bottom:4px;">선택된 파일 (<span id="convFileCount" style="color:#ca8a04;">0</span>장)</div>
                        <div class="conv-file-list" id="convFileList"></div>
                        
                        <div style="margin-top:16px; margin-bottom:8px; font-size:0.85rem; color:var(--text-4); font-weight:700;">변환할 포맷 선택</div>
                        <select id="convFormatSelect" class="calc-input" style="width:100%; margin-bottom:16px;">
                            <option value="image/jpeg" selected>JPG (가장 호환성 높음, 추천)</option>
                            <option value="image/png">PNG (투명 배경 유지)</option>
                            <option value="image/webp">WebP (웹 최적화 용량)</option>
                        </select>

                        <button class="compress-btn visible" id="convStartBtn" style="width:100%; padding:14px; background:#eab308; color:white; border:none; border-radius:12px; font-weight:800; font-size:1.05rem; cursor:pointer;">✨ 일괄 변환 시작</button>
                    </div>

                    <div id="convProgressWrap" style="display:none; margin-top:20px;">
                        <div style="height:6px; background:var(--surface-4); border-radius:99px; overflow:hidden;">
                            <div id="convProgressFill" style="height:100%; width:0%; background:#eab308; transition:width 0.2s;"></div>
                        </div>
                        <p id="convProgressText" style="text-align:center; font-size:0.8rem; color:var(--text-5); margin-top:0.5rem;">변환 중...</p>
                    </div>

                    <div id="convResultWrap" class="conv-result-wrap">
                        <div style="font-size:1.2rem; font-weight:800; color:#a16207; margin-bottom:8px;">🎉 변환 완료!</div>
                        <p style="font-size:0.85rem; color:#854d0e; margin-bottom:16px;">모든 이미지가 성공적으로 변환되었습니다.</p>
                        <div id="convDownloadLinks" style="display:flex; flex-direction:column; gap:8px;"></div>
                        
                        <button id="convResetBtn" class="btn-primary" style="background:#cbd5e1; color:var(--text-3); width:100%; border:none; margin-top:16px;">새로 변환하기</button>
                    </div>

                    <p style="text-align:center; font-size:0.75rem; color:var(--text-6); margin-top:20px;">🔒 파일은 절대 외부 서버로 전송되지 않으며 안전하게 기기에서만 처리됩니다.</p>
                </div>
            </div>

            <!-- 사진 모자이크 탭 내용 -->
            <div id="admin-content-mosaic" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                <style>
                    .mosaic-drop-zone { border:2px dashed var(--border-strong); border-radius:16px; padding:30px 20px; text-align:center; background:var(--surface); cursor:pointer; transition:all 0.2s; margin-bottom:20px; }
                    .mosaic-drop-zone:hover, .mosaic-drop-zone.dragover { border-color:#3b82f6; background:#eff6ff; }
                    .mosaic-editor { display:none; flex-direction:column; align-items:center; background:var(--surface-2); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px; }
                    .mosaic-editor.visible { display:flex; }
                    .canvas-wrapper { position:relative; max-width:100%; border:1px solid var(--border-strong); border-radius:8px; overflow:hidden; background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3hKhf+FIBkYGIg0YvA0YxmgwpIFiNPzRMJqMRsMoGhgAAAD//8oUCPwAAAAASUVORK5CYII=') repeat; cursor:crosshair; touch-action:none; }
                    .canvas-wrapper canvas { display:block; max-width:100%; height:auto; }
                    .mosaic-toolbar { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:16px; width:100%; }
                    .mosaic-toolbar button { padding:8px 12px; font-size:0.85rem; font-weight:700; border-radius:8px; border:none; cursor:pointer; transition:all 0.2s; }
                    .btn-tool-active { background:#3b82f6; color:white; }
                    .btn-tool { background:var(--surface-4); color:var(--text-4); }
                    .btn-tool:hover { background:#cbd5e1; }
                    .mos-panel { width:100%; margin-top:12px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:12px; }
                    .mos-row { display:flex; align-items:center; gap:10px; }
                    .mos-label { flex:none; width:68px; font-size:0.8rem; font-weight:700; color:var(--text-3); }
                    .mos-range { flex:1; min-width:0; accent-color:#2563eb; height:28px; }
                    .mos-val { flex:none; min-width:30px; text-align:right; font-size:0.8rem; font-weight:800; color:#2563eb; }
                    .mos-swatches { flex:1; display:flex; flex-wrap:wrap; gap:8px; }
                    .mos-sw { width:28px; height:28px; border-radius:50%; border:2px solid var(--border-strong); cursor:pointer; padding:0; position:relative; box-shadow:inset 0 0 0 2px var(--surface); }
                    .mos-sw.active { border-color:#2563eb; box-shadow:inset 0 0 0 2px var(--surface), 0 0 0 2px #93c5fd; }
                    .mos-sw-custom { display:flex; align-items:center; justify-content:center; font-size:0.85rem; background:var(--surface-3); overflow:hidden; }
                    .mos-sw-custom input { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; border:none; padding:0; }
                    .mos-hint { font-size:0.7rem; color:var(--text-6); text-align:center; }
                    .mos-cursor { position:absolute; border:2px solid rgba(255,255,255,0.95); outline:1px solid rgba(17,24,39,0.6); border-radius:50%; pointer-events:none; transform:translate(-50%,-50%); display:none; z-index:2; }
                </style>
                <div class="compressor-container step-card beautiful-card" style="padding:20px; border-color:#93c5fd;">
                    <h4 style="color:#1d4ed8; font-weight:800; font-size:1.1rem; margin-bottom:8px; text-align:center;">🔲 사진 모자이크 (개인정보 가리기)</h4>
                    <p style="text-align:center; color:var(--text-5); font-size:0.85rem; margin-bottom:20px;">손가락이나 마우스로 쓱쓱 문질러 민감한 정보를 안전하게 가리세요</p>

                    <div class="mosaic-drop-zone" id="mosaicDropZone">
                        <span style="font-size:3rem; margin-bottom:1rem; display:block;">🤫</span>
                        <p style="font-size:1rem; font-weight:700; color:var(--text-2); margin-bottom:0.4rem;">가릴 사진을 여기에 드래그하거나 클릭하세요</p>
                        <p style="font-size:0.78rem; color:var(--text-5);">단일 사진 전용 (JPG, PNG 등)</p>
                        <input type="file" id="mosaicFileInput" accept="image/*" style="display:none;">
                    </div>

                    <div class="mosaic-editor" id="mosaicEditor">
                        <div class="canvas-wrapper" id="mosaicCanvasWrapper">
                            <canvas id="mosaicCanvas"></canvas>
                            <div class="mos-cursor" id="mosCursor"></div>
                        </div>
                        
                        <div class="mosaic-toolbar">
                            <div style="width:100%; text-align:center; margin-bottom:4px; font-size:0.85rem; font-weight:700; color:var(--text-4);">가리기 방식</div>
                            <button class="btn-tool" id="btnMosModeBlack" style="background:#111827; color:white;">■ 완전가림</button>
                            <button class="btn-tool" id="btnMosModePixel">모자이크</button>
                            <button class="btn-tool" id="btnMosModeBlur">블러</button>
                        </div>
                        <div style="width:100%; text-align:center; font-size:0.72rem; color:#dc2626; font-weight:600; margin-top:6px;">🔒 주민번호·실명 등은 <b>완전가림</b>을 쓰세요 (블러·모자이크는 복원 위험)</div>

                        <div class="mos-panel">
                            <div class="mos-row">
                                <span class="mos-label">브러시 굵기</span>
                                <input type="range" id="mosSize" min="4" max="120" value="25" class="mos-range">
                                <span class="mos-val" id="mosSizeVal">25</span>
                            </div>
                            <div class="mos-row" id="mosStrengthRow" style="display:none;">
                                <span class="mos-label" id="mosStrengthLabel">블록 크기</span>
                                <input type="range" id="mosStrength" min="1" max="10" value="5" class="mos-range">
                                <span class="mos-val" id="mosStrengthVal">5</span>
                            </div>
                            <div class="mos-row" id="mosColorRow">
                                <span class="mos-label">가림 색</span>
                                <div class="mos-swatches" id="mosSwatches">
                                    <button class="mos-sw active" data-color="#111827" style="background:#111827;" aria-label="검정"></button>
                                    <button class="mos-sw" data-color="#ffffff" style="background:#ffffff;" aria-label="흰색"></button>
                                    <button class="mos-sw" data-color="#6b7280" style="background:#6b7280;" aria-label="회색"></button>
                                    <button class="mos-sw" data-color="#2563eb" style="background:#2563eb;" aria-label="파랑"></button>
                                    <button class="mos-sw" data-color="#dc2626" style="background:#dc2626;" aria-label="빨강"></button>
                                    <button class="mos-sw" data-color="#facc15" style="background:#facc15;" aria-label="노랑"></button>
                                    <label class="mos-sw mos-sw-custom" aria-label="직접 고르기">🎨<input type="color" id="mosColor" value="#111827"></label>
                                </div>
                            </div>
                            <div class="mos-hint">💡 PC에선 사진 위에서 마우스 휠로 굵기를 바꿀 수 있어요</div>
                        </div>

                        <div class="mosaic-toolbar" style="margin-top:12px;">
                            <button class="btn-tool" id="btnMosUndo">↩️ 되돌리기</button>
                            <button class="btn-tool" id="btnMosClear">🗑️ 전체 초기화</button>
                            <button class="btn-tool" id="btnMosSave" style="background:#10b981; color:white; width:100%; margin-top:8px; padding:12px; font-size:1rem;">⬇️ 가려진 사진 다운로드</button>
                        </div>
                        
                        <button class="btn-tool" id="btnMosResetFile" style="margin-top:16px; width:100%; background:transparent; border:1px solid var(--border-strong);">다른 사진 불러오기</button>
                    </div>

                    <p style="text-align:center; font-size:0.75rem; color:var(--text-6); margin-top:20px;">🔒 파일은 절대 외부 서버로 전송되지 않으며 안전하게 기기에서만 처리됩니다.</p>
                </div>
            </div>
        `;
            openModal('행정/회계 마스터 💸', content, 'admin');

            // Set initial state
            window.currentTaxRate = 0.033;
            document.getElementById('run-ltc-calc').onclick = calculateLTC;

            // Ensure the first tab is visually and functionally active
            // (fromUserClick=false — 모달을 열었을 뿐 아직 어떤 도구도 "쓴" 게 아니므로 최근사용에 기록하지 않음)
            if (typeof switchAdminTab === 'function') switchAdminTab('vat', false);

            if (typeof initPhotoCompressor === 'function') initPhotoCompressor();
            if (typeof initImageConverter === 'function') initImageConverter();
            if (typeof initImageMosaic === 'function') initImageMosaic();
        };

        if (btn) btn.onclick = openAdminModal;
        if (btn2) btn2.onclick = openAdminModal;
    }
    function calculateLTC() {
        const grade = parseInt(document.getElementById('ltc-grade').value);
        const rate = parseFloat(document.getElementById('ltc-rate').value);
        const time = parseInt(document.getElementById('ltc-time').value);
        const days = parseInt(document.getElementById('ltc-days').value) || 0;

        const limit = LTC_THRESHOLDS_2026[grade];
        const gasanRate = parseFloat(document.getElementById('ltc-calc-gasan-value').value) / 100;
        const basePrice = LTC_HOURLY_RATES_2026[time];
        // 수가에 가산율 적용 (원단위 절사 또는 반올림 등 기준이 있으나, 통상 수가에 가산을 곱함)
        const unitPrice = Math.floor(basePrice * (1 + gasanRate));
        const totalUsage = unitPrice * days;
        const withinLimit = Math.min(totalUsage, limit);
        const overLimit = Math.max(0, totalUsage - limit);
        const copaymentWithin = withinLimit * rate;
        const totalCopayment = copaymentWithin + overLimit;
        const supportAmount = withinLimit - copaymentWithin;

        displayLTCResult(limit, withinLimit, overLimit, totalCopayment, supportAmount, unitPrice, days);
    }

    function displayLTCResult(limit, within, over, total, support, price, days) {
        const resultDiv = document.getElementById('ltc-result');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
            <div class="result-box" >
            <h3>방문요양 모의계산 결과</h3>
            <div class="result-item"><span class="result-label">1회 수가 (${price.toLocaleString()}원 × ${days}일)</span><span style="font-weight:700">${(price * days).toLocaleString()}원</span></div>
            <div class="result-item"><span class="result-label">2026년 월 한도액</span><span style="color:var(--primary); font-weight:800">${limit.toLocaleString()}원</span></div>
            <div class="result-item" style="color: ${over > 0 ? '#b91c1c' : '#64748b'}"><span class="result-label">한도 초과액 (본인부담)</span><span style="font-weight:${over > 0 ? '700' : '400'}">${over.toLocaleString()}원</span></div>
            <hr style="border:0; border-top:1px solid var(--border); margin:16px 0">
            <div class="result-item"><span class="result-label">정부 지원금 (공단 부담)</span><span style="color:var(--accent); font-weight:800">${Math.round(support).toLocaleString()}원</span></div>
            <div class="result-item"><span class="result-label">최종 본인부담금</span><span style="color:#b91c1c; font-weight:900; font-size:1.3rem">${Math.round(total).toLocaleString()}원</span></div>
            <div style="background:#fff7ed; padding:12px; border-radius:10px; margin-top:16px; font-size:0.8rem; color:#9a3412; border:1px solid #ffedd5">💡 남은 한도액: <strong>${Math.max(0, limit - (price * days)).toLocaleString()}원</strong></div>
            
            <div style="margin-top:20px; padding:16px; background:#fff1f2; border-radius:12px; border:1px solid #ffe4e6; text-align:left;">
                <div style="display:flex; align-items:flex-start; gap:8px;">
                    <span style="font-size:1.2rem; flex-shrink:0;">⚠️</span>
                    <div>
                        <div style="font-size:0.8rem; font-weight:800; color:#e11d48; margin-bottom:4px;">법적 책임 한계 안내</div>
                        <div style="font-size:0.75rem; color:#be123c; line-height:1.5;">
                            본 계산기의 결과는 사용자가 입력한 값을 바탕으로 산출된 <b>참고용 추정치</b>입니다. 실제 청구 및 수급 과정에서 기관의 세부 운영 지침, 공단 정책 변동 등에 따라 <b>실제 수령액 및 청구액과 차이</b>가 발생할 수 있습니다. 본 결과값은 어떠한 법적 증빙 효력도 갖지 못하며, 해당 계산 결과를 근거로 한 사용자의 결정이나 계약에 대해 <b>본 서비스는 일체의 법적 책임을 지지 않습니다.</b> 정확한 금액은 국민건강보험공단 등 관련 행정기관을 통해 반드시 최종 확인하시기 바랍니다.
                        </div>
                    </div>
                </div>
            </div>

            <button class="btn-primary" style="background:var(--accent); margin-top:20px" onclick="copyLTCResult()">📋 계산 결과 복사</button>
        </div>
        `;
    }

    window.copyLTCResult = function () {
        const resultDiv = document.getElementById('ltc-result');
        if (!resultDiv) return;
        const items = resultDiv.querySelectorAll('.result-item');
        let text = '[방문요양 모의계산 결과]\n';
        items.forEach(item => {
            const label = item.querySelector('.result-label');
            const value = label ? label.nextElementSibling : null;
            if (label && value) text += `${label.innerText}: ${value.innerText}\n`;
        });
        text += '※ 참고용 추정치입니다. 정확한 금액은 국민건강보험공단에서 확인하세요.';
        const done = () => alert('📋 계산 결과가 복사되었습니다! (Ctrl+V)');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => alert('복사에 실패했습니다.'));
        } else {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta); done();
        }
    };

    /* --- Main Tab Navigation --- */
    window.switchMainTab = function (tabId, el) {
        // Update nav active state
        document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => nav.classList.remove('active'));
        el.classList.add('active');

        // Update view visibility
        document.querySelectorAll('.app-main .view-content').forEach(view => {
            view.classList.add('hidden');
            view.classList.remove('active');
        });

        const targetView = document.getElementById('view-' + tabId);
        if (targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('active');
            const mainCont = document.querySelector('.app-main');
            if (mainCont) mainCont.scrollTop = 0;
        }
    };

    /* --- Record / Templates --- */
    const RECORD_TEMPLATES = [
        {
            title: "진행/상담일지 (기본형)",
            content: "[상담 목적]\n- \n\n[주요 상담 내용 및 관찰]\n- \n\n[전문가 사정 및 평가]\n- \n\n[향후 계획]\n- "
        },
        {
            title: "시말서/경위서 (객관적 육하원칙형)",
            content: "■ 사고/사건 발생일시: \n■ 장소: \n■ 관련자: \n\n[사건 발생 경위 (사실 위주 작성)]\n- \n\n[발생 원인 분석]\n- \n\n[사후 조치 및 재발 방지 대책]\n- "
        },
        {
            title: "외부기관 협조 공문 (표준형)",
            content: "문서번호: \n수    신: \n제    목: [요청] OOO 협조 등 요청의 건\n\n1. 귀 기관의 무궁한 발전을 기원합니다.\n2. 관련 근거: \n3. 우리 기관에서는 OOO 목적을 달성하기 위해 다음과 같이 귀 기관의 협조를 요청하오니 검토 후 회신 바랍니다.\n\n  가. 일시 및 장소: \n  나. 요청내용: \n  다. 담당자 및 문의처: \n\n붙임: 1. 사업계획서 1부. 끝."
        }
    ];

    function initRecordTemplates() {
        const list = document.getElementById('template-list');
        if (!list) return;

        let html = '';
        RECORD_TEMPLATES.forEach((tpl, idx) => {
            html += `
            <div style = "background:var(--surface); border-radius:12px; padding:16px; border:1px solid var(--border); box-shadow:var(--shadow-card);" >
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-weight:800; color:var(--text-900); font-size:0.95rem;">${tpl.title}</div>
                    <button class="btn-primary btn-outline" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px;" onclick="copyTemplate(${idx})">복사하기</button>
                </div>
                <div id="tpl-content-${idx}" style="font-size:0.85rem; color:var(--text-5); background:var(--surface-2); padding:12px; border-radius:8px; white-space:pre-wrap; border:1px solid var(--border);">${tpl.content}</div>
            </div>
            `;
        });
        list.innerHTML = html;
    }

    window.copyTemplate = function (idx) {
        const text = RECORD_TEMPLATES[idx].content;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => alert('📋 양식이 클립보드에 복사되었습니다! (Ctrl+V)'));
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('📋 양식이 클립보드에 복사되었습니다! (Ctrl+V)');
        }
    };

    /* --- Record / Term Purifier --- */
    window.purifyRecordText = function () {
        const input = document.getElementById('purifier-input').value;
        if (!input.trim()) {
            alert('변환할 내용을 입력해주세요.');
            return;
        }

        // AI 자동 변환은 아직 미구현 — 가짜 결과 대신 '비밀 프롬프트' 안내로 연결
        const outDiv = document.getElementById('purifier-result');
        const outText = document.getElementById('purifier-output');
        outText.innerText = "🛠️ 자동 변환 기능은 준비 중이에요! 지금은 홈 탭의 'AI 비밀 프롬프트' > '상담 기록 요약(PIE)' 프롬프트를 복사해 ChatGPT/Claude에 붙여넣으면 같은 결과를 얻을 수 있어요.";
        outDiv.style.display = 'block';
    };

    /* --- Community / Emotion Trash Can --- */
    window.throwAwayEmotion = function () {
        const input = document.getElementById('trash-input');
        const btn = document.getElementById('btn-trash');
        const anim = document.getElementById('trash-animation');
        const card = input.closest('.step-card');

        if (!input.value.trim()) {
            alert('버릴 감정이 없으신가요? 다행이네요! 🥰');
            return;
        }

        input.disabled = true;
        btn.disabled = true;

        const quotes = [
            "당신의 다정함이 머문 자리마다 누군가의 삶은 조용히 숨통을 틔웁니다. 그 보이지 않는 기적의 주인이 바로 당신임을 잊지 마세요.",
            "타인의 눈물을 닦아주느라 축축해진 당신의 소매를 봅니다. 오늘만큼은 그 젖은 마음을 햇살 좋은 곳에 널어두고 쉬어가시길 바랍니다.",
            "누군가의 무너진 세계를 지탱하느라 당신의 어깨가 참 많이 휘었습니다. 무거운 소명은 잠시 내려놓고 당신이라는 계절을 만끽하세요.",
            "당신이 쏟은 진심은 결코 사라지지 않습니다. 그것은 타인의 생을 지탱하는 단단한 뿌리가 되어 훗날 울창한 숲으로 돌아올 것입니다.",
            "세상의 아픔을 정면으로 마주하는 당신의 용기는 숭고합니다. 하지만 기억하세요, 당신 또한 누군가에게는 지켜주고 싶은 소중한 사람입니다.",
            "때로는 아무것도 해줄 수 없다는 무력감이 당신을 옥죄겠지만, 곁에 머물러주는 그 정적만으로도 충분히 위대한 위로였습니다.",
            "흔들리며 피는 꽃이 아름다운 것은 그 안에 치열한 생의 의지가 담겼기 때문입니다. 지금의 흔들림 또한 당신을 더 깊은 향기로 빚어낼 것입니다.",
            "타인의 삶에 이정표를 세워주느라 정작 자신의 길을 잃지는 않았나요? 오늘은 당신의 마음이 가리키는 곳으로만 걸음을 옮겨보길 바랍니다.",
            "당신이 건넨 따뜻한 말 한마디는 누군가의 겨울을 끝내는 봄바람이었습니다. 그 다정함의 온도가 당신의 가슴 속에도 머길 소망합니다.",
            "그늘진 곳에 햇살을 끌어다 쓰는 일은 참 고단한 일이지요. 당신이 밝힌 그 빛에 당신의 그림자가 너무 짙어지지 않도록 스스로를 안아주세요.",
            "완벽한 해결보다 귀한 것은 끝까지 놓지 않는 손길입니다. 당신의 서툰 진심이 누군가에게는 생에 단 한 번뿐인 구원이었습니다.",
            "마음의 소진은 당신이 게을러서가 아니라, 너무나 뜨겁게 타올랐기 때문입니다. 타버린 재를 털어내고 다시 온기를 채울 시간을 허락하세요.",
            "누군가의 슬픔에 전염되는 것은 당신이 약해서가 아니라 공감이라는 고귀한 능력을 가졌기 때문입니다. 그 눈물은 결국 꽃이 될 것입니다.",
            "책임감이라는 이름의 닻을 내리고 거친 바다를 항해하는 당신, 잠시 항구에 머물며 비바람에 깎인 마음을 수선해도 괜찮습니다.",
            "당신이 읽어 내려간 클라이언트의 삶 속에는 우리 시대의 가장 아픈 문장들이 있었습니다. 그 문장 끝에 당신이 찍어준 쉼표 하나가 참 큽니다.",
            "세상은 당신의 성과를 숫자로 측정하려 하겠지만, 당신이 지켜낸 한 사람의 존엄은 무엇으로도 환산할 수 없는 우주입니다.",
            "차가운 제도와 뜨거운 현장 사이에서 당신은 늘 팽팽한 외줄을 탑니다. 그 아슬아슬한 균형을 유지하느라 겪는 통증을 깊이 공감합니다.",
            "당신의 선의가 날카로운 거절에 상처 입었을 때, 그 상처 위로 새살을 돋게 할 약은 '오늘도 정말 잘 살았다'는 당신의 자기 고백입니다.",
            "타인의 삶을 구하려다 정작 자신의 삶이 소홀해질 때가 있지요. 당신의 행복이 전제되지 않은 희생은 지속될 수 없습니다. 당신이 먼저 웃으세요.",
            "어둠이 깊을수록 별은 더 밝게 빛납니다. 당신은 그 깊은 절망의 밤을 건너는 이들에게 유일하고도 찬란한 길잡이별이었습니다.",
            "모든 짐을 혼자 짊어지려 하지 마세요. 당신 또한 불완전한 인간이기에, 도움을 청하고 약해질 권리가 있습니다. 그것이 진짜 강함입니다.",
            "당신이 머문 자리마다 세상의 온도가 0.1도씩 올라갔습니다. 그 작은 변화가 모여 비로소 겨울을 이겨낼 힘이 된다는 것을 믿으세요.",
            "진심은 소리 없이 전해집니다. 당장은 아무 변화가 없는 것 같아도, 당신이 심은 다정함은 클라이언트의 생 어딘가에서 반드시 발아할 것입니다.",
            "지친 당신의 뒷모습에서 숭고한 침묵을 봅니다. 누구에게도 말하지 못한 고독한 투쟁을 우리는 압니다. 당신은 참으로 귀한 사람입니다.",
            "비포장도로 같은 삶을 걷는 이들에게 당신은 기꺼이 신발이 되어주었습니다. 이제는 그 낡은 신발을 벗고 폭신한 구름 위를 걷듯 쉬십시오.",
            "당신이 지닌 전문성은 단순한 지식이 아니라, 사람에 대한 예의와 연민을 잃지 않는 마음 그 자체입니다. 그 마음이 당신의 가장 큰 힘입니다.",
            "한 사람의 인생이 통째로 몰려올 때, 당신은 기꺼이 그 파도를 온몸으로 받아냈습니다. 그 결연함이 있었기에 한 생명이 다시 숨 쉽니다.",
            "쉼표 없이 달려온 당신의 캘린더에 오늘 하루 '나를 위한 안부'를 적어 넣어주세요. 당신은 다른 누구보다 먼저 위로받아야 할 사람입니다.",
            "당신의 헌신은 타인의 상처를 덮어주는 비단결 같습니다. 그 결이 상하지 않도록 스스로를 귀하게 대하는 법을 잊지 마시길 바랍니다.",
            "오늘 당신이 건넌 그 험난한 고개 너머에, 당신이 구한 이들의 평온한 일상이 있습니다. 당신은 이미 충분히, 아니 넘치도록 훌륭합니다."
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

        // Show shredding animation with shake effect
        anim.classList.remove('hidden');
        anim.innerHTML = `
            <div style = "font-size:3rem; margin-bottom:12px; animation: pulse 0.5s infinite alternate;" >📄🪚</div>
            <h3 style="color:var(--text-1); font-weight:800; font-size:1.1rem; margin-bottom:8px;">착착착 파쇄 중...</h3>
            <p style="color:var(--text-5); font-size:0.9rem; padding: 0 10px; line-height: 1.6; word-break: keep-all;">${randomQuote}</p>
        `;
        anim.style.animation = 'fadeIn 0.3s ease';

        if (card) {
            let shakeInterval = setInterval(() => {
                const x = Math.random() * 6 - 3;
                const y = Math.random() * 6 - 3;
                card.style.transform = `translate(${x}px, ${y}px)`;
            }, 50);
            setTimeout(() => {
                clearInterval(shakeInterval);
                card.style.transform = 'translate(0, 0)';
            }, 5000);
        }

        setTimeout(() => {
            anim.classList.add('hidden');
            input.value = '';
            input.disabled = false;
            btn.disabled = false;
            alert('🗑️ 감정 분리수거함이 비워졌습니다. 마음이 훨씬 가벼워지셨길 바라요! ✨');
        }, 5000);
    };

    window.toggleMilitaryInput = function () {
        const hasMilitary = document.getElementById('youth-military-check').checked;
        const militaryInputDiv = document.getElementById('youth-military-input');
        if (militaryInputDiv) {
            militaryInputDiv.style.display = hasMilitary ? 'block' : 'none';
        }
        if (typeof window.calcYouthIndependence === 'function') {
            window.calcYouthIndependence();
        }
    }

    window.calcYouthIndependence = function () {
        // UI Elements
        const endDateInput = document.getElementById('youth-end-date') ? document.getElementById('youth-end-date').value : null;
        const baseDateInput = document.getElementById('youth-base-date') ? document.getElementById('youth-base-date').value : null;
        const hasMilitary = document.getElementById('youth-military-check') ? document.getElementById('youth-military-check').checked : false;
        const militaryStart = document.getElementById('youth-mil-start') ? document.getElementById('youth-mil-start').value : null;
        const militaryEnd = document.getElementById('youth-mil-end') ? document.getElementById('youth-mil-end').value : null;

        const resultCard = document.getElementById('youth-result-card');
        const resultContent = document.getElementById('youth-result-content');

        if (!resultCard || !resultContent) return;

        if (!endDateInput) {
            resultCard.style.display = 'none';
            return;
        }

        // Dates
        let endDate = new Date(endDateInput);
        let baseDate = baseDateInput ? new Date(baseDateInput) : new Date(); // Default to today

        // Strip time
        endDate.setHours(0, 0, 0, 0);
        baseDate.setHours(0, 0, 0, 0);

        // 날짜 포매터 (전역 formatDate(상대시간)와 이름 충돌 방지)
        const fmtYmd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

        // Military logic
        let milDays = 0;
        let adjustedEndDate = new Date(endDate);

        if (hasMilitary && militaryStart && militaryEnd) {
            const mStart = new Date(militaryStart);
            const mEnd = new Date(militaryEnd);
            mStart.setHours(0, 0, 0, 0);
            mEnd.setHours(0, 0, 0, 0);

            if (mEnd > mStart) {
                // Calculate military days
                const milDiffTime = Math.abs(mEnd - mStart);
                milDays = Math.ceil(milDiffTime / (1000 * 60 * 60 * 24));
                // Add military days to the end date
                adjustedEndDate.setDate(adjustedEndDate.getDate() + milDays);
            }
        }

        // Calculate Year and Month differences from the (Adjusted) End Date to the Base Date
        let diffYears = baseDate.getFullYear() - adjustedEndDate.getFullYear();
        let diffMonths = baseDate.getMonth() - adjustedEndDate.getMonth();
        let diffDays = baseDate.getDate() - adjustedEndDate.getDate();

        if (diffDays < 0) {
            diffMonths--;
            // 기준일 이전 달의 실제 일수 사용
            diffDays += new Date(baseDate.getFullYear(), baseDate.getMonth(), 0).getDate();
        }
        if (diffMonths < 0) {
            diffYears--;
            diffMonths += 12;
        }

        // Are we within 5 years?
        const totalMonthsPassed = (diffYears * 12) + diffMonths;
        const isWithin5Years = totalMonthsPassed < 60; // Less than 60 months = within 5 years
        const isFuture = baseDate < adjustedEndDate;

        // Render Results
        resultCard.style.display = 'block';

        let html = '';
        html += `
            <div style = "display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;" >
                <span style="font-size:0.9rem; color:var(--text-5);">기준일 기준 경과 기간</span>
                <strong style="font-size:1.3rem; color:${isFuture ? '#3b82f6' : '#0f172a'};">
                    ${isFuture ? '보호종료 전' : `만 ${diffYears}년 ${diffMonths}개월`}
                </strong>
            </div>
            `;

        if (hasMilitary && milDays > 0) {
            html += `
            <div style = "background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-bottom:16px;" >
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <strong style="color:#15803d; font-size:0.9rem;">🎖️ 군 복무 특례 적용</strong>
                        <span style="color:#166534; font-size:0.85rem; font-weight:800;">+${milDays}일 연장</span>
                    </div>
                    <div style="color:#15803d; font-size:0.8rem; line-height:1.5;">
                        실제 보호종료일(${fmtYmd(endDate)})에 복무 일수를 환산하여,<br>
                        <strong>보정된 만료 기산일은 ${fmtYmd(adjustedEndDate)}</strong>로 계산되었습니다.
                    </div>
                </div>
            `;
        }

        if (!isFuture) {
            if (isWithin5Years) {
                html += `
                    <div style="display:flex; align-items:center; gap:12px; padding:16px; background:var(--tint-primary); border-radius:16px; border:1px solid #bfdbfe; box-shadow: 0 4px 12px rgba(37,99,235,0.06);">
                        <span style="font-size:1.8rem;">✅</span>
                        <div style="flex:1;">
                            <div style="color:#1e40af; font-weight:800; font-size:1.0rem; margin-bottom:4px;">보호종료 5년 이내 해당</div>
                            <div style="color:#1d4ed8; font-size:0.8rem; line-height:1.4; word-break:keep-all;">
                                자립수당 등 '5년 이내' 기준의 혜택 대상입니다. <br>(기한: ${fmtYmd(new Date(adjustedEndDate.getFullYear() + 5, adjustedEndDate.getMonth(), adjustedEndDate.getDate()))})
                            </div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="display:flex; align-items:center; gap:12px; padding:16px; background:#fef2f2; border-radius:16px; border:1px solid #fecaca; box-shadow: 0 4px 12px rgba(239,68,68,0.06);">
                        <span style="font-size:1.8rem;">⚠️</span>
                        <div style="flex:1;">
                            <div style="color:#991b1b; font-weight:800; font-size:1.0rem; margin-bottom:4px;">보호종료 5년 초과</div>
                            <div style="color:#b91c1c; font-size:0.8rem; line-height:1.4; word-break:keep-all;">
                                안타깝게도 보호종료 후 5년이 경과하여 일부 혜택 대상에서 제외될 수 있습니다.
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        resultContent.innerHTML = html;
    };

    /* ===== 최근 사용 도구 (홈 상단 한 줄) =====
       12개 계산기 중 실제로 쓰는 건 사람마다 2~3개뿐이라, 마지막으로 쓴 도구를
       localStorage에 기록해두고 홈 화면 상단에서 바로 열 수 있게 한다. */
    const RECENT_TOOLS_KEY = 'sabok_recent_tools';
    const ADMIN_TOOL_META = {
        vat: { label: '부가세', icon: '🧾' },
        budget: { label: '단가계산', icon: '📐' },
        tax: { label: '강사료', icon: '👛' },
        payroll: { label: '급여정산', icon: '💵' },
        percent: { label: '퍼센트', icon: '📊' },
        target: { label: '목표달성', icon: '🎯' },
        ltc: { label: '장기요양', icon: '🏥' },
        youth: { label: '자립청년', icon: '🌱' },
        mosaic: { label: '모자이크', icon: '🖼️' },
        compressor: { label: '사진압축', icon: '📷' },
        converter: { label: '포맷변환', icon: '🔄' },
        pdf: { label: 'PDF압축', icon: '📄' }
    };

    function recordToolUsage(tabName) {
        if (!ADMIN_TOOL_META[tabName]) return;
        try {
            let recent = JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]');
            recent = recent.filter(t => t !== tabName);
            recent.unshift(tabName);
            localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(recent.slice(0, 5)));
        } catch (e) { /* localStorage 불가 환경 무시 */ }
        renderRecentTools();
    }

    function renderRecentTools() {
        const sec = document.getElementById('recent-sec');
        const chipsEl = document.getElementById('recent-tools-chips');
        if (!sec || !chipsEl) return;
        let recent = [];
        try { recent = JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]'); } catch (e) { /* noop */ }
        recent = recent.filter(t => ADMIN_TOOL_META[t]).slice(0, 3);

        if (recent.length === 0) {
            sec.style.display = 'none';
            return;
        }
        sec.style.display = '';
        chipsEl.innerHTML = recent.map(t => {
            const meta = ADMIN_TOOL_META[t];
            return `<button class="recent-chip" onclick="openAdminToolDirect('${t}')">${meta.icon} ${meta.label}</button>`;
        }).join('');
    }

    window.openAdminToolDirect = function (tabName) {
        const btn = document.getElementById('open-admin-calc');
        if (btn) btn.click();
        if (typeof switchAdminTab === 'function') switchAdminTab(tabName);
    };

    /* ============================================================
       HOME V2 — 클로드 디자인 개선안 훅
       ============================================================ */
    /* 즐겨찾는 도구 — 별 토글로 홈을 개인화 (localStorage 저장) */
    // 행정/회계 마스터 안의 12개 계산기 (개별 즐겨찾기 가능 — 해당 탭으로 바로 열림)
    const ADMIN_SUBTOOLS = [
        { key: 'vat', name: '부가세 계산기', desc: '공급가액·부가세 10% 역산', tint: '#ecfeff' },
        { key: 'budget', name: '단가 계산', desc: '재료비·간식비 단가 산출', tint: '#eff6ff' },
        { key: 'tax', name: '강사료 계산', desc: '3.3%·8.8% 원천징수 실수령액', tint: '#fdf4ff' },
        { key: 'payroll', name: '급여 일할정산', desc: '중도 입·퇴사 일할 계산', tint: '#f0fdf4' },
        { key: 'percent', name: '퍼센트 계산', desc: '달성률·증감률·비율 3종', tint: '#fefce8' },
        { key: 'target', name: '목표달성률', desc: '사업 실적 달성률 즉시 확인', tint: '#fff7ed' },
        { key: 'ltc', name: '장기요양 한도', desc: '등급별 한도·본인부담금', tint: '#ecfeff' },
        { key: 'youth', name: '자립청년 연령', desc: '보호종료·자립수당 기준', tint: '#f0fdf4' },
        { key: 'mosaic', name: '사진 모자이크', desc: '개인정보 가리기(기기 처리)', tint: '#eff6ff' },
        { key: 'compressor', name: '사진 압축', desc: '첨부용 이미지 용량 줄이기', tint: '#eff6ff' },
        { key: 'converter', name: '포맷 변환', desc: 'HEIC·PNG·JPG 상호 변환', tint: '#fdf4ff' },
        { key: 'pdf', name: 'PDF 압축', desc: '공문·첨부 파일 용량 줄이기', tint: '#fef2f2' },
    ];
    const ALL_TOOLS = [
        { id: 'prompter', group: '주요 도구', icon: '🪄', name: '비밀 프롬프트', desc: '사례기록·보고서 AI 주문', tint: '#eff6ff', act: () => document.getElementById('open-ai-prompter').click() },
        { id: 'admin', group: '주요 도구', icon: '💸', name: '행정/회계 마스터', desc: '12가지 계산기 모두 열기', tint: '#ecfdf5', act: () => document.getElementById('open-admin-calc').click() },
        { id: 'voca', group: '주요 도구', icon: '📖', name: '생존 단어장', desc: '초보 복지사 용어 사전', tint: '#fffbeb', act: () => document.getElementById('open-voca-dict').click() },
        { id: 'eligibility', group: '주요 도구', icon: '💰', name: '수급판정 계산', desc: '기초수급·차상위 기준', tint: '#fef2f2', act: () => document.getElementById('calc-eligibility').click() },
        { id: 'dashboard', group: '주요 도구', icon: '📊', name: '핵심 지표', desc: '중위소득·장기요양 수가', tint: '#f1f5f9', act: () => document.getElementById('open-dashboard').click() },
        { id: 'newsletter', group: '주요 도구', icon: '💌', name: '비밀 편지', desc: '사복천재의 뉴스레터', tint: '#eff6ff', act: () => document.getElementById('open-newsletter-read').click() },
        { id: 'support', group: '주요 도구', icon: '🔍', name: '지원정보 찾기', desc: '맞춤형 복지서비스 검색', tint: '#eff6ff', act: () => window.open('https://bok-jumoney.vercel.app', '_blank') },
        { id: 'request', group: '주요 도구', icon: '🙋', name: '요청하기', desc: '필요한 프롬프트·용어 요청', tint: '#fefce8', act: () => document.getElementById('open-request-modal').click() },
        // 행정/회계 마스터 12개 계산기 (그룹으로 표시)
        ...ADMIN_SUBTOOLS.map(s => ({
            id: 'adm-' + s.key,
            group: '행정/회계 계산기',
            icon: (ADMIN_TOOL_META[s.key] && ADMIN_TOOL_META[s.key].icon) || '🧮',
            name: s.name,
            desc: s.desc,
            tint: s.tint,
            act: () => openAdminToolDirect(s.key),
        })),
    ];
    const FAV_KEY = 'sabok_fav_tools';
    // 비밀 프롬프트·행정/회계는 홈 상단 핵심 카드에 이미 있으므로 기본 즐겨찾기에서 제외
    const DEFAULT_FAVS = ['voca', 'eligibility', 'dashboard', 'support', 'newsletter', 'request'];

    function getFavs() {
        try {
            const raw = localStorage.getItem(FAV_KEY);
            if (raw === null) return DEFAULT_FAVS.slice();
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(id => ALL_TOOLS.some(t => t.id === id)) : DEFAULT_FAVS.slice();
        } catch (e) { return DEFAULT_FAVS.slice(); }
    }
    function setFavs(list) {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) { /* noop */ }
    }
    window.toolAct = function (id) {
        const t = ALL_TOOLS.find(x => x.id === id);
        if (t) t.act();
    };
    window.toggleFav = function (id, ev) {
        if (ev) ev.stopPropagation();
        let favs = getFavs();
        favs = favs.includes(id) ? favs.filter(x => x !== id) : favs.concat(id);
        setFavs(favs);
        renderFavGrid();
        renderAllToolsList();
    };
    function renderFavGrid() {
        const grid = document.getElementById('fav-grid');
        if (!grid) return;
        const favs = getFavs();
        const tools = ALL_TOOLS.filter(t => favs.includes(t.id));
        if (tools.length === 0) {
            grid.innerHTML = `<div class="fav-empty">아직 즐겨찾는 도구가 없어요.<br>‘전체 도구 →’에서 ⭐를 눌러 담아보세요.</div>`;
            return;
        }
        grid.innerHTML = tools.map(t => `
            <div class="fav-card" onclick="toolAct('${t.id}')">
                <button class="fav-star" title="즐겨찾기 해제" onclick="toggleFav('${t.id}', event)">⭐</button>
                <div class="fav-ico" style="background:${t.tint};">${t.icon}</div>
                <div class="fav-name">${t.name}</div>
                <div class="fav-desc">${t.desc}</div>
            </div>`).join('');
    }
    function renderAllToolsList() {
        const list = document.getElementById('all-tools-list');
        if (!list) return;
        const favs = getFavs();
        const rowHtml = (t) => {
            const on = favs.includes(t.id);
            return `<button class="all-tool-row" onclick="toolAct('${t.id}'); closeModal();">
                <span class="at-ico" style="background:${t.tint};">${t.icon}</span>
                <span style="flex:1; min-width:0;">
                    <span class="at-name" style="display:block;">${t.name}</span>
                    <span class="at-desc" style="display:block;">${t.desc}</span>
                </span>
                <span class="at-star ${on ? '' : 'off'}" role="button" title="즐겨찾기 토글" onclick="toggleFav('${t.id}', event)">⭐</span>
            </button>`;
        };
        // 그룹 순서 유지하며 섹션 헤더와 함께 렌더
        const groups = [];
        ALL_TOOLS.forEach(t => { const g = t.group || '도구'; if (!groups.includes(g)) groups.push(g); });
        list.innerHTML = groups.map(g => {
            const rows = ALL_TOOLS.filter(t => (t.group || '도구') === g).map(rowHtml).join('');
            return `<div class="at-group-title">${g}</div>${rows}`;
        }).join('');
    }
    window.openAllToolsModal = function () {
        openModal('🛠️ 전체 도구', `
            <p style="margin:0 0 14px; font-size:0.82rem; color:var(--text-5);">⭐를 눌러 홈 즐겨찾기에 담거나 뺄 수 있어요. 도구 이름을 누르면 바로 열려요.</p>
            <div class="all-tools-list" id="all-tools-list"></div>
        `, 'alltools');
        setTimeout(renderAllToolsList, 0);
    };

    // 히어로 검색: 단어장 모달을 열고 검색어를 그대로 넘겨서 바로 필터링
    window.homeSearch = function (ev) {
        if (ev) ev.preventDefault();
        const input = document.getElementById('home-search-input');
        const q = input ? input.value.trim() : '';
        const b = document.getElementById('open-voca-dict');
        if (b) b.click();
        if (q) {
            setTimeout(() => {
                const si = document.getElementById('voca-search');
                if (si) {
                    si.value = q;
                    if (window.filterVocaDict) window.filterVocaDict();
                }
            }, 300);
        }
        return false;
    };

    // 프롬프트 칩: 모달을 열고 해당 카테고리 탭으로 바로 이동
    window.homeOpenPrompt = function (tab) {
        const b = document.getElementById('open-ai-prompter');
        if (b) b.click();
        if (tab) {
            setTimeout(() => {
                if (window.switchPrompterTab) window.switchPrompterTab(tab);
            }, 250);
        }
    };

    // 히어로 인사말에 익명 닉네임 반영
    function initHomeGreeting() {
        const name = localStorage.getItem('saboks_anonymous_name');
        const el = document.getElementById('home-nick');
        if (el && name) el.innerText = name;
        const sideNick = document.getElementById('side-nick');
        if (sideNick && name) sideNick.innerText = name;
        fitGreeting();
    }

    // 인사말이 어떤 닉네임 길이에도 항상 한 줄에 들어가도록 폰트 크기를 자동 축소
    function fitGreeting() {
        const el = document.querySelector('.hero-v2-title');
        if (!el) return;
        const MAX = 1.35, MIN = 0.66;   // rem
        let size = MAX;
        el.style.fontSize = size + 'rem';
        // 컨텐츠 폭(scrollWidth)이 가용 폭(clientWidth)보다 크면 단계적으로 축소
        let guard = 0;
        while (el.scrollWidth > el.clientWidth + 1 && size > MIN && guard < 80) {
            size -= 0.015;
            el.style.fontSize = size + 'rem';
            guard++;
        }
    }
    window.fitGreeting = fitGreeting;
    // 회전·리사이즈 시 다시 맞춤
    window.addEventListener('resize', () => { if (window.fitGreeting) window.fitGreeting(); });

    // 오늘의 생존단어: 날짜 기준으로 단어장에서 하나 선정 (매일 자동 교체)
    function initHomeDailyWord() {
        const wordEl = document.getElementById('home-word');
        if (!wordEl || typeof VOCABULARY_DATA === 'undefined' || !VOCABULARY_DATA.length) return;
        const day = Math.floor(Date.now() / 86400000);
        const item = VOCABULARY_DATA[day % VOCABULARY_DATA.length];
        wordEl.innerText = item.icon + ' ' + item.word;
        const meaningEl = document.getElementById('home-word-meaning');
        if (meaningEl) meaningEl.innerText = item.meaning;
        const descEl = document.getElementById('home-word-desc');
        if (descEl) descEl.innerText = item.desc;
    }

    // 도와줘요 최근 질문 3개 미리보기 (없거나 실패하면 카드 자체를 숨김)
    async function loadHomeQnaPreview() {
        const card = document.getElementById('home-qa-card');
        const list = document.getElementById('home-qa-list');
        if (!card || !list) return;
        if (!supabase) { card.style.display = 'none'; return; }
        try {
            const { data, error } = await withTimeout(
                supabase.from('posts').select('title, category').order('created_at', { ascending: false }).limit(3)
            );
            if (error || !data || data.length === 0) { card.style.display = 'none'; return; }
            list.innerHTML = data.map(p => `
                <button class="home-qa-row" onclick="switchView('record')">
                    <span class="home-qa-tag">${escapeHtml(p.category) || '일반'}</span>
                    <span class="home-qa-title">${escapeHtml(p.title)}</span>
                </button>`).join('');
            card.style.display = 'block';
        } catch (e) {
            card.style.display = 'none';
        }
    }

    // 홈 배너 칩 → 행정/회계 마스터를 특정 탭으로 바로 열기
    window.openAdminTab = function (tabName) {
        const b = document.getElementById('open-admin-calc');
        if (b) b.click();
        setTimeout(function () {
            if (typeof switchAdminTab === 'function') switchAdminTab(tabName);
        }, 140);
    };

    // 행정/회계 마스터: 분류(회계·급여 / 사업·통계 / 사진·문서) 전환 — 고른 분류의 4개 탭만 보여준다
    window.switchAdminCat = function (cat, openFirst = true) {
        document.querySelectorAll('.admin-group').forEach(g => { g.style.display = g.dataset.cat === cat ? 'grid' : 'none'; });
        document.querySelectorAll('.admin-cat').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
        if (openFirst) {
            const first = document.querySelector('.admin-group[data-cat="' + cat + '"] .tab-btn');
            if (first) switchAdminTab(first.id.replace('tab-', ''));
        }
    };

    window.switchAdminTab = function (tabName, fromUserClick = true) {
        if (fromUserClick) recordToolUsage(tabName);
        const ownGroup = document.getElementById('tab-' + tabName)?.closest('.admin-group');
        if (ownGroup && ownGroup.style.display === 'none') switchAdminCat(ownGroup.dataset.cat, false);
        const contentVat = document.getElementById('admin-content-vat');
        const contentTax = document.getElementById('admin-content-tax');
        const contentLtc = document.getElementById('admin-content-ltc');
        const contentPayroll = document.getElementById('admin-content-payroll');
        const contentBudget = document.getElementById('admin-content-budget');
        const contentYouth = document.getElementById('admin-content-youth');
        const contentTarget = document.getElementById('admin-content-target');
        const contentCompressor = document.getElementById('admin-content-compressor');
        const contentPercent = document.getElementById('admin-content-percent');
        const contentPdf = document.getElementById('admin-content-pdf');
        const contentConverter = document.getElementById('admin-content-converter');
        const contentMosaic = document.getElementById('admin-content-mosaic');

        if (contentVat) contentVat.style.display = tabName === 'vat' ? 'block' : 'none';
        if (contentTax) contentTax.style.display = tabName === 'tax' ? 'block' : 'none';
        if (contentLtc) contentLtc.style.display = tabName === 'ltc' ? 'block' : 'none';
        if (contentPayroll) contentPayroll.style.display = tabName === 'payroll' ? 'block' : 'none';
        if (contentBudget) contentBudget.style.display = tabName === 'budget' ? 'block' : 'none';
        if (contentYouth) contentYouth.style.display = tabName === 'youth' ? 'block' : 'none';
        if (contentTarget) contentTarget.style.display = tabName === 'target' ? 'block' : 'none';
        if (contentCompressor) contentCompressor.style.display = tabName === 'compressor' ? 'block' : 'none';
        if (contentPercent) contentPercent.style.display = tabName === 'percent' ? 'block' : 'none';
        if (contentPdf) contentPdf.style.display = tabName === 'pdf' ? 'block' : 'none';
        if (contentConverter) contentConverter.style.display = tabName === 'converter' ? 'block' : 'none';
        if (contentMosaic) contentMosaic.style.display = tabName === 'mosaic' ? 'block' : 'none';

        const btnVat = document.getElementById('tab-vat');
        const btnTax = document.getElementById('tab-tax');
        const btnLtc = document.getElementById('tab-ltc');
        const btnPayroll = document.getElementById('tab-payroll');
        const btnBudget = document.getElementById('tab-budget');
        const btnYouth = document.getElementById('tab-youth');
        const btnTarget = document.getElementById('tab-target');
        const btnCompressor = document.getElementById('tab-compressor');
        const btnPercent = document.getElementById('tab-percent');
        const btnPdf = document.getElementById('tab-pdf');
        const btnConverter = document.getElementById('tab-converter');
        const btnMosaic = document.getElementById('tab-mosaic');

        const setActive = (btn) => {
            if (!btn) return;
            btn.style.background = 'var(--surface)';
            btn.style.color = 'var(--primary)';
            btn.style.fontWeight = '700';
            btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        };

        const setInactive = (btn) => {
            if (!btn) return;
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-5)';
            btn.style.fontWeight = '600';
            btn.style.boxShadow = 'none';
        };

        setInactive(btnVat); setInactive(btnTax); setInactive(btnLtc); setInactive(btnPayroll); setInactive(btnBudget); setInactive(btnYouth); setInactive(btnTarget); setInactive(btnCompressor); setInactive(btnPercent); setInactive(btnPdf); setInactive(btnConverter); setInactive(btnMosaic);

        if (tabName === 'vat') setActive(btnVat);
        else if (tabName === 'tax') setActive(btnTax);
        else if (tabName === 'ltc') setActive(btnLtc);
        else if (tabName === 'payroll') setActive(btnPayroll);
        else if (tabName === 'budget') setActive(btnBudget);
        else if (tabName === 'youth') setActive(btnYouth);
        else if (tabName === 'target') setActive(btnTarget);
        else if (tabName === 'compressor') setActive(btnCompressor);
        else if (tabName === 'percent') setActive(btnPercent);
        else if (tabName === 'pdf') setActive(btnPdf);
        else if (tabName === 'converter') setActive(btnConverter);
        else if (tabName === 'mosaic') setActive(btnMosaic);
    };

    window.calcPercent = function (mode) {
        // 소수 둘째 자리까지 표시하되, 0.01 미만인 0이 아닌 값은 '0'으로 뭉개지지 않게 유효숫자 2자리로
        const formatNumber = (num) => {
            if (Number.isInteger(num)) return num.toLocaleString();
            if (num !== 0 && Math.abs(num) < 0.01) return num.toLocaleString(undefined, { maximumSignificantDigits: 2 });
            return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
        };
        
        if (mode === 1) {
            const a = parseFloat(document.getElementById('pc-1-a').value);
            const b = parseFloat(document.getElementById('pc-1-b').value);
            const res = document.getElementById('pc-1-res');
            if (!isNaN(a) && !isNaN(b)) res.innerText = formatNumber(a * (b / 100));
            else res.innerText = '?';
        } else if (mode === 2) {
            const a = parseFloat(document.getElementById('pc-2-a').value);
            const b = parseFloat(document.getElementById('pc-2-b').value);
            const res = document.getElementById('pc-2-res');
            if (!isNaN(a) && !isNaN(b) && a !== 0) res.innerText = formatNumber((b / a) * 100) + '%';
            else res.innerText = '?';
        } else if (mode === 3) {
            const a = parseFloat(document.getElementById('pc-3-a').value);
            const b = parseFloat(document.getElementById('pc-3-b').value);
            const res = document.getElementById('pc-3-res');
            if (!isNaN(a) && !isNaN(b) && a !== 0) {
                const diff = b - a;
                const percent = (diff / a) * 100;
                res.innerText = (percent > 0 ? '▲ ' : (percent < 0 ? '▼ ' : '')) + formatNumber(Math.abs(percent)) + '%';
            }
            else res.innerText = '?';
        } else if (mode === 4) {
            const a = parseFloat(document.getElementById('pc-4-a').value);
            const b = parseFloat(document.getElementById('pc-4-b').value);
            const res = document.getElementById('pc-4-res');
            if (!isNaN(a) && !isNaN(b)) res.innerText = formatNumber(a * (1 + b / 100));
            else res.innerText = '?';
        }
    };

    let selectedPdfFile = null;
    let compressedPdfBlobUrl = null;

    window.handlePdfSelect = function (event) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            alert('PDF 파일만 선택해주세요.');
            return;
        }
        selectedPdfFile = file;
        document.getElementById('pdfFileName').innerText = file.name;
        document.getElementById('pdfFileSize').innerText = (file.size / 1024 / 1024).toFixed(2) + ' MB';
        document.getElementById('pdfSettings').classList.add('visible');
        document.getElementById('pdfResultWrap').style.display = 'none';
        document.getElementById('pdfProgressWrap').style.display = 'none';
        compressedPdfBlobUrl = null;
    };

    window.startPdfCompression = async function () {
        if (!selectedPdfFile) return;
        if (typeof window.pdfjsLib === 'undefined' || typeof window.jspdf === 'undefined') {
            alert('PDF 압축 라이브러리를 불러오지 못했습니다. 페이지 새로고침 후 다시 시도해주세요.');
            return;
        }
        
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        
        const quality = parseFloat(document.getElementById('pdfQualitySelect').value);
        document.getElementById('pdfProgressWrap').style.display = 'block';
        document.getElementById('pdfCompressBtn').style.display = 'none';
        const progressFill = document.getElementById('pdfProgressFill');
        const progressText = document.getElementById('pdfProgressText');
        
        try {
            const arrayBuffer = await selectedPdfFile.arrayBuffer();
            const pdfDocument = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdfDocument.numPages;
            
            const jsPdf = new window.jspdf.jsPDF();
            
            for (let i = 1; i <= numPages; i++) {
                progressText.innerText = '압축 중... (' + i + ' / ' + numPages + ' 페이지)';
                progressFill.style.width = ((i / numPages) * 100) + '%';
                
                const page = await pdfDocument.getPage(i);
                // 스케일을 1.5로 렌더링 (해상도 유지)
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                // JPEG 압축 (quality 조절)
                const imgData = canvas.toDataURL('image/jpeg', quality);
                
                const imgProps = jsPdf.getImageProperties(imgData);
                const pdfWidth = jsPdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                if (i > 1) jsPdf.addPage();
                jsPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            
            progressText.innerText = '압축 마무리 중...';
            const pdfBlob = jsPdf.output('blob');
            compressedPdfBlobUrl = URL.createObjectURL(pdfBlob);
            
            document.getElementById('pdfResultBefore').innerText = (selectedPdfFile.size / 1024 / 1024).toFixed(2) + ' MB';
            document.getElementById('pdfResultAfter').innerText = (pdfBlob.size / 1024 / 1024).toFixed(2) + ' MB';
            document.getElementById('pdfResultWrap').style.display = 'block';
            
        } catch (err) {
            console.error(err);
            alert('PDF 압축 중 오류가 발생했습니다. 암호가 걸린 문서이거나 너무 큰 파일일 수 있습니다.');
        } finally {
            document.getElementById('pdfCompressBtn').style.display = 'block';
            document.getElementById('pdfProgressWrap').style.display = 'none';
        }
    };

    window.downloadCompressedPdf = function () {
        if (!compressedPdfBlobUrl) return;
        const a = document.createElement('a');
        a.href = compressedPdfBlobUrl;
        a.download = selectedPdfFile.name.replace(/\.pdf$/i, '') + '_compressed.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    window.calcTargetRate = function () {
        const goalStr = document.getElementById('target-goal-input').value;
        const actualStr = document.getElementById('target-actual-input').value;
        const resultEl = document.getElementById('target-rate-result');
        const msgEl = document.getElementById('target-rate-msg');

        if (!goalStr || isNaN(goalStr) || !actualStr || isNaN(actualStr)) {
            resultEl.innerText = '0%';
            resultEl.style.color = '#3b82f6';
            msgEl.innerText = '목표값과 실적값을 입력해주세요.';
            return;
        }

        const goal = parseFloat(goalStr);
        const actual = parseFloat(actualStr);

        if (goal === 0) {
            resultEl.innerText = 'N/A';
            resultEl.style.color = '#ef4444';
            msgEl.innerText = '목표값이 0일 수 없습니다.';
            return;
        }

        const rate = (actual / goal) * 100;
        const roundedRate = rate.toFixed(1);

        resultEl.innerText = roundedRate + '%';

        // Update bar width (capped at 100% for visual)
        const barEl = document.getElementById('target-rate-bar');
        if (barEl) {
            barEl.style.width = Math.min(rate, 100) + '%';
        }

        if (rate >= 100) {
            resultEl.style.color = '#10b981'; // green
            msgEl.innerHTML = '🎉 목표를 <strong style="color:#059669;">초과 달성</strong>하셨습니다! 훌륭합니다.';
        } else if (rate >= 80) {
            resultEl.style.color = '#3b82f6'; // blue
            msgEl.innerHTML = '💪 정상적으로 목표에 다가가고 있습니다.';
        } else if (rate >= 50) {
            resultEl.style.color = '#f59e0b'; // orange
            msgEl.innerHTML = '🚶 조금 더 분발해야 할 타이밍입니다!';
        } else {
            resultEl.style.color = '#ef4444'; // red
            msgEl.innerHTML = '🚨 실적 관리가 시급한 상황입니다.';
        }
    };

    window.calcVAT = function () {
        const input = document.getElementById('vat-input').value;
        if (!input || isNaN(input)) {
            document.getElementById('vat-supply').innerText = '0원';
            document.getElementById('vat-tax').innerText = '0원';
            document.getElementById('vat-copy-text').innerText = '공급가액 0원 / 부가세 0원';
            return;
        }
        const total = parseInt(input);
        const supply = Math.floor(total * 10 / 11);   // ÷1.1을 정수로 계산 (55,000원이 49,999원으로 나오던 소수점 오차 방지)
        const tax = total - supply;

        document.getElementById('vat-supply').innerText = supply.toLocaleString() + '원';
        document.getElementById('vat-tax').innerText = tax.toLocaleString() + '원';
        document.getElementById('vat-copy-text').innerText = `공급가액 ${supply.toLocaleString()} 원 / 부가세 ${tax.toLocaleString()} 원`;
    };

    window.setTaxType = function (type) {
        const btnBus = document.getElementById('btn-tax-business');
        const btnOth = document.getElementById('btn-tax-other');
        const desc = document.getElementById('tax-desc');
        const taxLabel = document.getElementById('inst-tax-label');

        if (type === 'business') {
            window.currentTaxRate = 0.033;
            btnBus.classList.remove('btn-outline');
            btnBus.style.background = 'var(--primary)';
            btnBus.style.color = 'white';

            btnOth.classList.add('btn-outline');
            btnOth.style.background = 'var(--surface)';
            btnOth.style.color = 'var(--text-4)';

            desc.innerHTML = `💡 <strong>사업소득(3.3%)</strong>: 직업적, 계속적, 반복적으로 강의를 하는 전문 강사 등`;
            if (taxLabel) taxLabel.innerText = "사업소득세 (3.3%)";
        } else {
            window.currentTaxRate = 0.088;
            btnOth.classList.remove('btn-outline');
            btnOth.style.background = 'var(--primary)';
            btnOth.style.color = 'white';

            btnBus.classList.add('btn-outline');
            btnBus.style.background = 'var(--surface)';
            btnBus.style.color = 'var(--text-4)';

            desc.innerHTML = `💡 <strong>기타소득(8.8%)</strong>: 일시적, 우발적으로 특강 등을 진행하는 비전문 강사 등 <br > <span style="font-size:0.75rem; color:#ef4444">* 세전 125,000원(실수령액 114,000원) 이하는 과세최저한으로 세금 감면</span>`;
            if (taxLabel) taxLabel.innerText = "기타소득세 (8.8%)";
        }
        calcInstructorTax();
    };

    window.calcInstructorTax = function () {
        const input = document.getElementById('instructor-input').value;
        const rate = window.currentTaxRate; // 0.033 or 0.088
        const isOther = rate === 0.088;

        const elTotal = document.getElementById('inst-tax-total');
        const elNet = document.getElementById('inst-net');

        if (!input || isNaN(input) || parseInt(input) <= 0) {
            if (elTotal) elTotal.innerText = '0원';
            if (elNet) elNet.innerText = '0원';
            return;
        }

        const gross = parseInt(input);
        let tax = 0;
        let net = 0;

        if (isOther && gross <= 125000) {
            tax = 0;
            net = gross;
        } else {
            // Use Math.round to handle floating point precision (e.g. 360000 * 0.088 = 31679.999...)
            tax = Math.floor(Math.round(gross * rate) / 10) * 10;
            net = gross - tax;
        }

        if (elTotal) elTotal.innerText = tax.toLocaleString() + '원';
        if (elNet) elNet.innerText = net.toLocaleString() + '원';
    };

    /* ============================================
     * 📅 일할 계산 관련 함수들
     * 
     * [기능 설명]
     * 중도 입사/퇴사 시 달력일수 기준으로 급여를 일할 계산하는 기능.
     * 
     * [계산 방식 — 달력일수 기준]
     * 일할 급여 = 월급 × (실제 근무 달력일수 / 해당 월 총 달력일수)
     * - 입사: 입사일부터 말일까지의 달력일수
     *   예) 5월 15일 입사 → 31 - 15 + 1 = 17일
     * - 퇴사: 1일부터 마지막 근무일까지의 달력일수
     *   예) 5월 20일 퇴사 → 20일
     * 
     * [4대보험 처리 — 사회복지시설 일반 관행]
     * 일할 적용된 급여 기준으로 4대보험도 재산정.
     * 해당 월의 실제 보수 신고액이 일할된 금액이 되므로
     * 보험료도 그 기준으로 산출하는 것이 일반적.
     * 
     * [적용 범위]
     * - 일할 적용: 기본급, 가족수당, 정액급식비
     * - 일할 미적용: 연장·야간·휴일수당 (실제 근무시간 기반)
     * - 통상시급: 월 전체 급여 기준으로 산정 (일할 미적용)
     * ============================================ */

    // 🤓 급여 계산 설명 패널 토글
    window.togglePayrollGuide = function() {
        const panel = document.getElementById('payroll-guide-panel');
        const btn = document.getElementById('btn-payroll-guide');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            btn.innerHTML = '🤓 설명 접기';
            btn.style.background = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
        } else {
            panel.style.display = 'none';
            btn.innerHTML = '🤓 이게 뭔 소리야? (설명 보기)';
            btn.style.background = 'linear-gradient(135deg, #f0abfc 0%, #60a5fa 100%)';
        }
    };

    // toggleProrateInput: 일할 계산 체크박스 토글 시 호출
    // - 체크 해제 시 날짜 초기화 및 결과 숨김
    // - 체크 상태 변경 후 급여 재계산 트리거
    window.toggleProrateInput = function() {
        const checked = document.getElementById('payroll-prorate-check').checked;
        document.getElementById('payroll-prorate-input').style.display = checked ? 'block' : 'none';
        if (!checked) {
            // 체크 해제 시 입력값·결과 초기화
            document.getElementById('payroll-prorate-date').value = '';
            const r = document.getElementById('payroll-prorate-result');
            if (r) r.style.display = 'none';
        }
        calcPayrollTax(); // 일할 비율 변경 반영하여 재계산
    };

    // setProrateType: 입사/퇴사 타입 전환
    // - 'join': 입사 → 입사일~말일 근무일수 계산
    // - 'leave': 퇴사 → 1일~마지막 근무일 근무일수 계산
    window.setProrateType = function(type) {
        document.getElementById('payroll-prorate-type').value = type; // hidden input에 타입 저장
        const jBtn = document.getElementById('btn-prorate-join');
        const lBtn = document.getElementById('btn-prorate-leave');
        const lbl = document.getElementById('prorate-date-label');
        // 선택된 버튼 활성화 스타일, 나머지 비활성화 스타일
        if (type === 'join') {
            jBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:none;background:#2563eb;color:white;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s';
            lBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:1px solid #bfdbfe;background:var(--surface);color:#2563eb;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s';
            lbl.textContent = '입사일 선택';
        } else {
            lBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:none;background:#2563eb;color:white;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s';
            jBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:1px solid #bfdbfe;background:var(--surface);color:#2563eb;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s';
            lbl.textContent = '퇴사일 (마지막 근무일) 선택';
        }
        calcPayrollTax(); // 타입 변경 반영하여 재계산
    };

    window.calcPayrollTax = function () {
        const input = document.getElementById('payroll-input').value;
        const familyInput = document.getElementById('payroll-family').value;
        const otHoursInput = document.getElementById('payroll-ot-hours').value;
        const mealInput = document.getElementById('payroll-meal').value;
        const hourlyWageInput = document.getElementById('payroll-hourly-wage').value;

        if (!input || isNaN(input) || parseInt(input) <= 0) {
            return;
        }

        const baseSalary = parseInt(input);
        const familyAllowance = parseInt(familyInput) || 0;
        const otHours = parseFloat(otHoursInput) || 0;
        const mealAllowance = parseInt(mealInput) || 0;
        const hourlyWageManual = parseInt(hourlyWageInput) || 0;

        /* ─── 📅 일할 계산 (달력일수 기준) ───
         * 산식: 일할 급여 = 월급 × (실제 근무 달력일수 / 해당 월 총 달력일수)
         * - 입사: 입사일부터 말일까지의 일수
         * - 퇴사: 1일부터 마지막 근무일까지의 일수
         * - 4대보험도 일할 적용된 급여 기준으로 재산정 (사회복지시설 일반 관행)
         * ────────────────────────────── */
        let prorateRatio = 1;
        let prorateInfo = null;
        const prorateCheck = document.getElementById('payroll-prorate-check');
        if (prorateCheck && prorateCheck.checked) {
            const dateStr = document.getElementById('payroll-prorate-date').value;
            const prorateType = document.getElementById('payroll-prorate-type').value;
            if (dateStr) {
                const d = new Date(dateStr);
                const yr = d.getFullYear(), mo = d.getMonth();
                const totalDays = new Date(yr, mo + 1, 0).getDate(); // 해당 월 총 달력일수
                const day = d.getDate();
                // 입사: 입사일~말일 / 퇴사: 1일~마지막 근무일
                const workDays = prorateType === 'join' ? (totalDays - day + 1) : day;
                prorateRatio = workDays / totalDays;
                prorateInfo = { totalDays, workDays, ratio: prorateRatio, type: prorateType, month: mo + 1, year: yr };
            }
        }

        // 일할 적용된 급여 항목 계산
        // - 기본급, 가족수당, 급식비: 일할 비율 적용 (월급 × prorateRatio)
        // - 연장·야간·휴일수당: 실근무 시간 기반이므로 일할 미적용 (그대로 사용)
        // - Math.floor()로 원 미만 절사 (실무 관행)
        const effectiveBase = Math.floor(baseSalary * prorateRatio);
        const effectiveFamily = Math.floor(familyAllowance * prorateRatio);
        const effectiveMeal = Math.floor(mealAllowance * prorateRatio);

        // 📊 일할 결과 UI 표시
        // - 일할 토글이 켜져 있고 날짜가 입력된 경우에만 표시
        // - 원래 금액 → 일할 적용 금액 형태로 비교 표시
        const prorateResultEl = document.getElementById('payroll-prorate-result');
        if (prorateInfo && prorateResultEl) {
            prorateResultEl.style.display = 'block';
            prorateResultEl.innerHTML = `
                <div style="font-weight:800; margin-bottom:6px;">📊 일할 계산 결과</div>
                <div>${prorateInfo.year}년 ${prorateInfo.month}월 (총 ${prorateInfo.totalDays}일) 중 <strong>${prorateInfo.workDays}일</strong> 근무</div>
                <div>일할 비율: ${prorateInfo.workDays} / ${prorateInfo.totalDays} = <strong>${(prorateRatio * 100).toFixed(1)}%</strong></div>
                <div style="margin-top:6px; padding-top:6px; border-top:1px solid #dbeafe;">기본급: ${baseSalary.toLocaleString()} → <strong>${effectiveBase.toLocaleString()}원</strong></div>
                ${familyAllowance > 0 ? '<div>가족수당: ' + familyAllowance.toLocaleString() + ' → <strong>' + effectiveFamily.toLocaleString() + '원</strong></div>' : ''}
                ${mealAllowance > 0 ? '<div>급식비: ' + mealAllowance.toLocaleString() + ' → <strong>' + effectiveMeal.toLocaleString() + '원</strong></div>' : ''}
            `;
        } else if (prorateResultEl) {
            prorateResultEl.style.display = 'none'; // 날짜 미입력 시 결과 숨김
        }

        // Display basic fields in the table (일할 적용된 금액 표시)
        document.getElementById('disp-base').innerText = effectiveBase.toLocaleString();
        document.getElementById('disp-family').innerText = effectiveFamily.toLocaleString();
        document.getElementById('disp-meal').innerText = effectiveMeal.toLocaleString();

        // 🕒 통상시급 자동 계산 — (기본급 + 식대) ÷ 209시간 (월 소정근로시간)
        // 통상시급은 월 전체 급여 기준으로 산정 (일할 미적용)
        const calcHourlyWage = Math.floor((baseSalary + mealAllowance) / 209);

        // 통상시급 필드에 자동 계산값 채워주기 (사용자가 직접 수정하지 않은 경우에만)
        const hourlyWageEl = document.getElementById('payroll-hourly-wage');
        if (hourlyWageEl && (hourlyWageManual === 0 || hourlyWageEl.dataset.autoFilled === 'true')) {
            hourlyWageEl.value = calcHourlyWage;
            hourlyWageEl.dataset.autoFilled = 'true'; // 자동채움 플래그
        }
        // 사용자가 직접 수정한 경우 그 값 우선 사용
        const hourlyRate = hourlyWageManual > 0 && hourlyWageEl.dataset.autoFilled !== 'true'
            ? hourlyWageManual : calcHourlyWage;

        const otAmount = Math.floor(hourlyRate * 1.5 * otHours);
        document.getElementById('payroll-ot-amount').innerText = otAmount.toLocaleString();

        // 🍱 비과세 식대 처리 (2024~ 20만원까지 확대) — 일할 적용된 급식비 기준
        const mealTaxExempt = Math.min(effectiveMeal, 200000);
        const mealTaxable = Math.max(0, effectiveMeal - 200000);

        // 📊 4대보험 과세 대상 소득 — 일할 적용된 금액 + 실근무 수당 기준
        const taxableIncome = effectiveBase + effectiveFamily + otAmount + mealTaxable;

        // 💰 실 지급액 총계 (일할 적용)
        const totalGross = effectiveBase + effectiveFamily + otAmount + effectiveMeal;
        document.getElementById('payroll-gross-display').innerText = totalGross.toLocaleString();

        // ============================================
        // 🛡️ 4대보험 + 세금 공제 계산
        // - 일할 계산 시: taxableIncome이 이미 일할 적용되어 있으므로
        //   4대보험료도 자동으로 일할 기준으로 재산정됨
        // - 사회복지시설 일반 관행: 해당 월 실지급 보수 기준으로 보험료 산출
        // ============================================
        // taxableIncome 기준 4대보험료 산출
        // ※ 일할 적용 시 taxableIncome = 일할급여 기준이므로 보험료도 비례 감소
        const eePension = Math.floor(taxableIncome * 0.04583); // 국민연금 (~4.5%)
        const eeHealth = Math.floor(taxableIncome * 0.03672);  // 건강보험 (~3.54%)
        const eeEmp = Math.floor(taxableIncome * 0.00932);     // 고용보험 (~0.9%)
        const eeCare = Math.floor(eeHealth * 0.12945);         // 장기요양 (건보료의 ~12.95%)
        const eeIncTax = Math.floor(taxableIncome * 0.02591);  // 소득세
        const eeLocTax = Math.floor(eeIncTax * 0.1);           // 지방소득세 (소득세의 10%)

        // 총 공제액 및 최종 실수령액 산출
        const eeTotal = eePension + eeHealth + eeCare + eeEmp + eeIncTax + eeLocTax;
        const eeNet = totalGross - eeTotal; // 실수령액 = 총 지급액 - 총 공제액

        // Update Deduction Displays
        document.getElementById('pr-ee-pension').innerText = eePension.toLocaleString();
        document.getElementById('pr-ee-health').innerText = eeHealth.toLocaleString();
        document.getElementById('pr-ee-care').innerText = eeCare.toLocaleString();
        document.getElementById('pr-ee-emp').innerText = eeEmp.toLocaleString();
        document.getElementById('pr-ee-incTax').innerText = eeIncTax.toLocaleString();
        document.getElementById('pr-ee-locTax').innerText = eeLocTax.toLocaleString();
        document.getElementById('pr-ee-totalDeduct').innerText = eeTotal.toLocaleString() + '원';
        document.getElementById('pr-ee-net').innerText = eeNet.toLocaleString() + '원';

        // 📈 Update Percentages
        if (taxableIncome > 0) {
            const incRate = ((eeIncTax / taxableIncome) * 100).toFixed(1);
            const careRate = ((eeCare / eeHealth) * 100).toFixed(1);
            if (document.getElementById('pr-rate-inc')) document.getElementById('pr-rate-inc').innerText = incRate + '%';
            if (document.getElementById('pr-rate-care')) document.getElementById('pr-rate-care').innerText = careRate + '%';
        }

        // 📊 Update breakdown visualization
        const ratio = totalGross > 0 ? Math.round((eeNet / totalGross) * 100) : 0;
        const ratioEl = document.getElementById('net-ratio');
        const barEl = document.getElementById('net-bar');
        if (ratioEl) ratioEl.innerText = ratio + '%';
        if (barEl) barEl.style.width = ratio + '%';

        // 법적 면책 조항 주입 (이미 결과 카드가 렌더링된 곳의 컨테이너를 찾아서 하단에 추가)
        const payrollContentDiv = document.getElementById('admin-content-payroll');
        if (payrollContentDiv && !document.getElementById('payroll-disclaimer')) {
            const disclaimerHtml = `
            <div id = "payroll-disclaimer" style = "margin-top:24px; padding:16px; background:#fff1f2; border-radius:12px; border:1px solid #ffe4e6; display:block; visibility:visible; opacity:1;" >
                <div style="display:flex; align-items:flex-start; gap:8px;">
                    <span style="font-size:1.2rem; flex-shrink:0;">⚠️</span>
                    <div>
                        <div style="font-size:0.8rem; font-weight:800; color:#e11d48; margin-bottom:4px;">법적 책임 한계 안내</div>
                        <div style="font-size:0.75rem; color:#be123c; line-height:1.5;">
                            본 계산기의 결과는 사용자가 입력한 값을 바탕으로 산출된 <b>참고용 추정치</b>입니다. 실제 급여 제공 및 정산 과정에서 기관의 세부 운영 지침, 근무 조건, 정책 변동 등에 따라 <b>실제 수령액 및 청구액과 차이</b>가 발생할 수 있습니다. 본 결과값은 어떠한 법적 증빙 효력도 갖지 못하며, 해당 계산 결과를 근거로 한 사용자의 결정이나 계약에 대해 <b>본 서비스는 일체의 법적 책임을 지지 않습니다.</b> 정확한 정산 금액은 소속 기관의 회계 담당자 또는 관할 관청을 통해 반드시 최종 확인하시기 바랍니다.
                        </div>
                    </div>
                </div>
            </div> `;

            // 기존 결과 Dashboard div 찾기
            const dashboards = payrollContentDiv.querySelectorAll('.step-card > div[style*="display:grid;"]');
            if (dashboards.length > 0) {
                const dashboardContainer = dashboards[dashboards.length - 1]; // Results Dashboard
                // 기존에 면책조항이 없다면 뒤에 붙임
                if (!dashboardContainer.nextElementSibling || dashboardContainer.nextElementSibling.id !== 'payroll-disclaimer') {
                    dashboardContainer.insertAdjacentHTML('afterend', disclaimerHtml);
                }
            }
        }
    };

    window.checkBudget = function () {
        const totalInput = document.getElementById('budget-total').value;
        const peopleInput = document.getElementById('budget-people').value;
        const limitInput = document.getElementById('budget-limit').value;
        const fbBox = document.getElementById('budget-feedback');
        const card = document.getElementById('budget-checker-card');

        if (!totalInput || !peopleInput || !limitInput) {
            fbBox.innerText = '금액과 인원을 모두 입력해주세요.';
            fbBox.style.background = 'var(--surface-3)';
            fbBox.style.color = 'var(--text-5)';
            card.style.borderColor = 'transparent';
            card.style.boxShadow = 'none';
            return;
        }

        const total = parseInt(totalInput);
        const people = parseInt(peopleInput);
        const limit = parseInt(limitInput);

        if (people <= 0) return;

        const perCapita = Math.floor(total / people);

        if (perCapita <= limit) {
            fbBox.innerHTML = `✅ 1인당 단가: <strong style="font-size:1.1rem">${perCapita.toLocaleString()}원</strong><br><span style="font-size:0.85rem; color:#15803d">한도 내에 있습니다. 결재 진행이 가능합니다.</span>`;
            fbBox.style.background = '#dcfce7';
            fbBox.style.color = '#166534';
            card.style.borderColor = '#86efac';
            card.style.boxShadow = '0 0 15px rgba(134,239,172,0.4)';
        } else {
            const requiredPeople = Math.ceil(total / limit);
            const diff = requiredPeople - people;
            fbBox.innerHTML = `🚨 1인당 단가: <strong style="font-size:1.1rem">${perCapita.toLocaleString()}원</strong><br><span style="font-size:0.85rem; color:#b91c1c">한도액(${limit.toLocaleString()}원)을 초과했습니다.</span><hr style="border:none; border-top:1px dashed #fca5a5; margin:12px 0;"><span style="color:#991b1b; font-size:0.95rem">이 금액을 승인받으려면 명단에 <strong>${diff}명</strong>이 더 필요합니다.</span>`;
            fbBox.style.background = '#fee2e2';
            fbBox.style.color = '#991b1b';
            card.style.borderColor = '#fca5a5';
            card.style.boxShadow = '0 0 15px rgba(248,113,113,0.4)';
        }
    };

    /* --- Beginner Social Worker Dictionary --- */
    const VOCABULARY_DATA = [

        /* ─── 💰 회계/행정 (20개) ─── */
        { category: "회계/행정", icon: "📢", word: "기안문", meaning: "우리 이거 할게요!", desc: "행사나 사업을 시작하겠다는 공식 선전포고" },
        { category: "회계/행정", icon: "💰", word: "품의서", meaning: "이거 살 건데, 돈 좀 쓸게요!", desc: "물건 구매·용역 계약 전 결재권자에게 사전 허락받는 문서" },
        { category: "회계/행정", icon: "🧾", word: "지출결의서", meaning: "허락하신 돈, 이렇게 썼어요!", desc: "영수증 딱풀로 붙여서 회계에 제출하는 정산 문서" },
        { category: "회계/행정", icon: "📑", word: "결과보고서", meaning: "우리 이거 무사히 끝냈어요!", desc: "사진 첨부 + 집행내역 + 남은 돈 반납할 때 쓰는 마무리 문서" },
        { category: "회계/행정", icon: "✨", word: "프로포절 (Proposal)", meaning: "저희한테 돈 주시면 진짜 기깔나게 써볼게요!", desc: "외부 재단·관청에 보내는 사업 제안서" },
        { category: "회계/행정", icon: "😭", word: "자부담", meaning: "지원금 말고, 우리 기관 쌩돈", desc: "매칭 비율 맞출 때 피눈물 나는 자체 부담금" },
        { category: "회계/행정", icon: "🔄", word: "예산 전용", meaning: "A 주머니 돈을 B 주머니로 옮기기", desc: "관할 관청 허가 없이 하면 지적사항, 반드시 승인 후 집행" },
        { category: "회계/행정", icon: "📥", word: "수입결의서", meaning: "우리 통장에 돈 들어왔어요!", desc: "후원금·보조금 등 입금 시 작성하는 회계 문서" },
        { category: "회계/행정", icon: "🚖", word: "여비교통비", meaning: "출장 가서 쓴 밥값·차비, 내 돈 먼저 내고 나중에 돌려받기", desc: "여비 신청서 작성 후 증빙 첨부" },
        { category: "회계/행정", icon: "✂️", word: "원천징수", meaning: "강사에게 줄 돈에서 세금 미리 떼고 나라에 대신 납부해 주기", desc: "사업소득 3.3%, 기타소득 8.8%" },
        { category: "회계/행정", icon: "🧮", word: "공급가액", meaning: "부가세 빼고 물건·서비스의 실제 가격", desc: "총액 ÷ 1.1 = 공급가액, 세금계산서 발행 때 핵심" },
        { category: "회계/행정", icon: "📊", word: "세입/세출", meaning: "들어온 돈(세입) / 나간 돈(세출)", desc: "사회복지법인·시설 회계는 세입·세출 예산으로 관리" },
        { category: "회계/행정", icon: "📋", word: "사업비", meaning: "이 사업에만 써야 하는 지정된 돈", desc: "목적 외 사용 시 환수 대상, 용도 엄격히 구분" },
        { category: "회계/행정", icon: "🔒", word: "이월", meaning: "올해 사업비가 남아서 내년으로 넘기기", desc: "계획에 없던 이월은 관할 기관 승인 필요" },
        { category: "회계/행정", icon: "📝", word: "협약서", meaning: "우리 이렇게 하기로 서로 서명하고 도장 찍었어요", desc: "공동사업·후원 시 체결하는 구속력 있는 약속 문서" },
        { category: "회계/행정", icon: "🏦", word: "보조금", meaning: "나라·지자체에서 주는 공식 지원금", desc: "보조금관리에관한법률 적용, 정산 및 감사 대상" },
        { category: "회계/행정", icon: "💳", word: "법인카드", meaning: "기관 공식 신용카드. 개인 용도 절대 금지!", desc: "전표 처리 필수, 사적 사용 시 징계 사유" },
        { category: "회계/행정", icon: "📦", word: "수불부", meaning: "물건이 언제 들어와서 누구한테 나갔는지 적는 깐깐한 장부", desc: "재물조사·감사 때 반드시 대조하는 물품 수불 대장" },
        { category: "회계/행정", icon: "🗂️", word: "세금계산서", meaning: "부가세 포함 거래 공식 영수증", desc: "전자세금계산서는 발행일로부터 60일 이내 발급 원칙" },
        { category: "회계/행정", icon: "🔎", word: "지도·감독", meaning: "관할 행정기관이 우리 기관 들여다보러 오는 날", desc: "회계 서류, 사업 실적, 인력 기준 등 전반 점검" },

        /* ─── 🤝 사례관리 (20개) ─── */
        { category: "사례관리", icon: "🐾", word: "인테이크 (Intake)", meaning: "첫 만남. 기초 현황 조사하면서 우리 기관이랑 맞는지 간 보기", desc: "초기 면접 — 주호소 문제, 의뢰 경위, 서비스 욕구 파악" },
        { category: "사례관리", icon: "💎", word: "사례관리 (Case Management)", meaning: "한 분 한 분의 삶을 반짝이게 맞춤형으로 돕는 종합 예술", desc: "복합적 욕구를 가진 클라이언트에게 지속적·포괄적 서비스 제공" },
        { category: "사례관리", icon: "🧩", word: "라포 (Rapport) 형성", meaning: "클라이언트랑 짱친 먹기. 이거 안 되면 아무것도 안 됨", desc: "신뢰 관계 형성 — 비밀 보장·공감·일관성이 핵심" },
        { category: "사례관리", icon: "📞", word: "모니터링", meaning: "잘 지내고 계신지, 계획대로 되고 있는지 틈틈이 확인하기", desc: "서비스 전달 과정 및 목표 달성 정도의 상시 점검" },
        { category: "사례관리", icon: "🔗", word: "자원 연계", meaning: "우리가 못 도와주니까, 이거 해줄 수 있는 옆 동네 단체 연결시켜 주기", desc: "지역사회 자원 동원 — 연계 후 사후 관리까지 책임" },
        { category: "사례관리", icon: "🍃", word: "종결", meaning: "이별의 시간. 다 나아서 자립했거나 이사 가셔서 그만 만나요", desc: "목표 달성·이관·사망·거부 등 사유로 사례 마무리" },
        { category: "사례관리", icon: "🗺️", word: "욕구 (Need)", meaning: "이 분이 진짜 원하고 필요로 하는 것 (본인도 모를 때 있음)", desc: "표현 욕구·규범적 욕구·비교 욕구·잠재 욕구로 구분" },
        { category: "사례관리", icon: "🍀", word: "강점 관점", meaning: "문제만 보지 말고, 이 분이 가진 강점을 먼저 보기", desc: "역량강화(Empowerment) 실천의 핵심 철학" },
        { category: "사례관리", icon: "🎯", word: "개입 목표", meaning: "우리가 이 사례를 통해 달성하려는 구체적인 목표", desc: "SMART 원칙(구체적·측정가능·달성가능·현실적·기한)으로 설정" },
        { category: "사례관리", icon: "📋", word: "서비스 계획서", meaning: "누가, 언제, 뭘, 어떻게 도와줄지 적어 두는 약속 문서", desc: "클라이언트 동의 서명 필수 — 주기적으로 재검토" },
        { category: "사례관리", icon: "⚠️", word: "위기 개입", meaning: "갑자기 상황이 심각해졌을 때 빠르게 투입!", desc: "자해·학대·화재 등 긴급 상황 — 72시간 내 집중 개입 원칙" },
        { category: "사례관리", icon: "🔁", word: "재사정 (Re-assessment)", meaning: "시간 지나서 상황 바뀌었으니까 처음부터 다시 파악해 보기", desc: "보통 6개월~1년마다 실시, 목표 달성 여부도 확인" },
        { category: "사례관리", icon: "🍄", word: "사례 회의", meaning: "이 분 어떻게 도울지 팀원·관련 기관들이 모여서 머리 맞대기", desc: "다학제적 접근 — 의사·간호사·복지사·치료사 등 협력" },
        { category: "사례관리", icon: "🔭", word: "아웃리치 (Outreach)", meaning: "앉아서 기다리지 말고, 직접 현장으로 나가서 찾아가는 서비스", desc: "잠재적 클라이언트 발굴을 위한 현장 방문 실천" },
        { category: "사례관리", icon: "📊", word: "사례 분류", meaning: "이 분 얼마나 도움이 필요한지 등급 나누기", desc: "위기·고위험·일반 등으로 분류, 개입 강도 결정" },
        { category: "사례관리", icon: "💬", word: "슈퍼비전 (Supervision)", meaning: "경험 많은 선배가 내 사례를 코칭해 주는 시간", desc: "교육적·지지적·행정적 기능 — 번아웃 예방에도 필수" },
        { category: "사례관리", icon: "📜", word: "동의서", meaning: "이 분이 서비스 받겠다고 서명한 공식 허락 문서", desc: "정보 공유·사례관리 참여 동의 — 없으면 정보 제공 불가" },
        { category: "사례관리", icon: "🔐", word: "비밀 보장", meaning: "들은 것 절대 함부로 말하지 않겠다는 복지사의 철칙", desc: "단, 생명 위협·아동학대 등은 신고 의무가 우선" },
        { category: "사례관리", icon: "🏥", word: "의뢰 (Referral)", meaning: "우리 역량 밖이니까, 더 잘 도울 수 있는 곳으로 보내기", desc: "공식 의뢰서 작성 + 인수인계 미팅 필수" },
        { category: "사례관리", icon: "🌐", word: "통합사례관리", meaning: "여러 기관이 한 팀 되어 복합 욕구 가진 분 집중 돌보기", desc: "희망복지지원단·드림스타트 등 주거·건강·경제 통합 지원" },

        /* ─── 🏢 기관생활 (20개) ─── */
        { category: "기관생활", icon: "😎", word: "공가", meaning: "나라 일이나 예비군, 건강검진 때문에 당당하게 합법적으로 쉬는 날", desc: "공적 업무 수행으로 인한 특별 휴가 — 연차 차감 없음" },
        { category: "기관생활", icon: "🤒", word: "병가", meaning: "나 진짜 아파서 쉬는 거임 (진단서 떼와야 할 수도 있음)", desc: "취업규칙·단체협약마다 기준 상이, 유급/무급 확인 필요" },
        { category: "기관생활", icon: "💻", word: "W4C / 희망이음", meaning: "사회복지사들의 영혼을 갈아 넣는 매운맛 국가 전산망", desc: "사회복지시설정보시스템(W4C) → 차세대 희망이음으로 전환 중" },
        { category: "기관생활", icon: "📅", word: "주간 업무 보고", meaning: "이번 주에 뭐 했는지, 다음 주엔 뭐 할 건지 상사에게 보고하기", desc: "주간업무계획서 — 팀 내 업무 조율 및 기록의 기초" },
        { category: "기관생활", icon: "🏅", word: "보수교육", meaning: "사회복지사 자격증 유지하려면 채워야 하는 의무 교육 시간", desc: "2년마다 8시간 이상, 미이수 시 자격증 효력 정지" },
        { category: "기관생활", icon: "📣", word: "직원 회의", meaning: "전 직원이 모여서 사업 공유하고 안건 논의하는 시간", desc: "회의록 작성 필수 — 의결 사항은 이사회 보고 대상일 수도" },
        { category: "기관생활", icon: "📰", word: "사업 계획서", meaning: "올해 우리 기관 이렇게 운영할 거예요! 선포문", desc: "회계연도 시작 전 수립 — 사업비 편성의 근거 문서" },
        { category: "기관생활", icon: "📓", word: "사업 실적 보고서", meaning: "연말에 올 한 해 동안 뭉텅이로 정리하는 결산 성과물", desc: "관할 행정기관 제출 의무, 통계·만족도 조사 포함" },
        { category: "기관생활", icon: "🚨", word: "시설 감사", meaning: "행정기관이 우리 기관 제대로 운영하나 들여다보는 무서운 날", desc: "정기·수시감사 구분, 지적사항은 시정명령·과태료 대상" },
        { category: "기관생활", icon: "📜", word: "취업규칙", meaning: "이 기관에서 일할 때 지켜야 하는 내부 규정서", desc: "10인 이상 사업장 필수 비치·신고, 불이익 변경 시 직원 동의 필요" },
        { category: "기관생활", icon: "🦉", word: "승인 결재", meaning: "상사 도장 또는 전자 서명 받기. 이게 없으면 아무것도 시작 못 함", desc: "전결 규정에 따라 결재 라인 상이 — 규정 미리 확인 필수" },
        { category: "기관생활", icon: "🎓", word: "직무 교육", meaning: "직무 향상을 위해 기관이 보내주거나 본인이 들어야 하는 교육", desc: "아동학대·인권·성희롱 예방 교육 등 별도 의무 존재" },
        { category: "기관생활", icon: "🧩", word: "인수인계", meaning: "내가 맡던 일을 다음 담당자에게 빠짐없이 넘겨주기", desc: "미흡한 인수인계는 업무 공백·민원의 원인" },
        { category: "기관생활", icon: "🏖️", word: "연차휴가", meaning: "1년에 정해진 만큼 당당히 쉴 권리 (안 쓰면 돈으로 받을 수도)", desc: "1년 만근 시 15일, 이후 2년마다 1일씩 추가(최대 25일)" },
        { category: "기관생활", icon: "📲", word: "온콜 (On-call)", meaning: "퇴근했어도 긴급 상황 생기면 전화 받고 달려가야 하는 상태", desc: "시설 종류에 따라 야간 당직·온콜 규정 상이" },
        { category: "기관생활", icon: "🧹", word: "환경 정비", meaning: "이용자 및 직원 근무 공간을 안전하고 쾌적하게 유지하기", desc: "소방·위생·안전 점검 — 행정감사 시 주요 체크 항목" },
        { category: "기관생활", icon: "🎤", word: "욕구 조사", meaning: "이용자들이 뭘 원하는지 설문·면담으로 물어보는 기초 조사", desc: "사업 계획 수립의 근거 — 통계 처리 후 계획서에 첨부" },
        { category: "기관생활", icon: "🗳️", word: "이사회", meaning: "법인의 사장님들 모임. 중요한 것들은 여기서 최종 결정됨", desc: "정관에 따라 정기·임시 이사회 개최, 회의록 보관 의무" },
        { category: "기관생활", icon: "📊", word: "만족도 조사", meaning: "이용자·보호자가 우리 서비스에 얼마나 만족하는지 측정하기", desc: "사업 실적의 질적 지표 — 시설평가·보조금 심사에 반영" },
        { category: "기관생활", icon: "🧾", word: "복무 규정", meaning: "출퇴근·휴가·복장 등 직원이 지켜야 할 근무 질서 규칙", desc: "취업규칙의 하위 규정, 기관별 세부 내용 상이" },
    ];

    // Currently active voca category ('all' | '회계/행정' | '사례관리' | '기관생활')
    let vocaActiveCategory = '회계/행정';

    function initVocaDictionary() {
        const btn = document.getElementById('open-voca-dict');
        if (btn) {
            btn.onclick = () => {
                vocaActiveCategory = '회계/행정';
                const content = `
                <!-- Search Bar -->
                <div style="margin-bottom:20px; position:relative;">
                    <span style="position:absolute; left:16px; top:50%; transform:translateY(-50%); font-size:1.2rem; pointer-events:none;">🔍</span>
                    <input type="text" id="voca-search" placeholder="전체 검색... (예: 품의서, 돈, 종결)"
                           onkeyup="filterVocaDict()"
                           style="width:100%; padding:14px 14px 14px 46px; border-radius:14px; border:2px solid var(--border); font-size:1rem; font-family:inherit; background:var(--surface-2); transition:all 0.2s; outline:none; box-sizing:border-box;">
                </div>

                <!-- Category Tabs -->
                <div id="voca-tab-bar" style="display:flex; gap:8px; margin-bottom:20px; padding:4px; background:var(--surface-3); border-radius:12px;">
                    <button onclick="switchVocaTab('회계/행정')" id="tab-voca-acct"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; background:var(--surface); color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.06); transition:all 0.2s;">
                        💰 회계/행정
                    </button>
                    <button onclick="switchVocaTab('사례관리')" id="tab-voca-case"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer; background:transparent; color:var(--text-5); transition:all 0.2s;">
                        🧩 사례관리
                    </button>
                    <button onclick="switchVocaTab('기관생활')" id="tab-voca-life"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer; background:transparent; color:var(--text-5); transition:all 0.2s;">
                        🏢 기관생활
                    </button>
                </div>

                <!-- Voca list -->
                <div id="voca-list-container" style="display:flex; flex-direction:column; gap:14px; max-height:55vh; overflow-y:auto; padding-right:4px;">
                </div>
            `;
                openModal('초보 복지사 생존 단어장 📖', content, 'voca');

                // render default tab
                renderVocaList(VOCABULARY_DATA.filter(d => d.category === vocaActiveCategory));

                // focus event
                const si = document.getElementById('voca-search');
                if (si) {
                    si.addEventListener('focus', () => si.style.borderColor = 'var(--primary)');
                    si.addEventListener('blur', () => si.style.borderColor = 'var(--border)');
                }
            };
        }
    }

    window.switchVocaTab = function (cat) {
        vocaActiveCategory = cat;

        // Reset search
        const si = document.getElementById('voca-search');
        if (si) si.value = '';

        // Update tab button styles
        const tabs = {
            '회계/행정': document.getElementById('tab-voca-acct'),
            '사례관리': document.getElementById('tab-voca-case'),
            '기관생활': document.getElementById('tab-voca-life'),
        };
        Object.entries(tabs).forEach(([key, el]) => {
            if (!el) return;
            if (key === cat) {
                el.style.background = 'var(--surface)';
                el.style.color = 'var(--primary)';
                el.style.fontWeight = '700';
                el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';
            } else {
                el.style.background = 'transparent';
                el.style.color = 'var(--text-5)';
                el.style.fontWeight = '600';
                el.style.boxShadow = 'none';
            }
        });

        renderVocaList(VOCABULARY_DATA.filter(d => d.category === cat));
    };

    // Duplicate switchAdminTab has been removed here.
    window.setLtcCalcGasan = function (value) {
        document.getElementById('ltc-calc-gasan-value').value = value;
        [0, 30, 50].forEach(v => {
            const btn = document.getElementById(`ltc-calc-gasan-${v}`);
            if (v === value) {
                btn.style.background = '#5cb85c';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'var(--surface-2)';
                btn.style.color = 'var(--text-4)';
            }
        });
        if (typeof calculateLTC === 'function' && !document.getElementById('ltc-result').classList.contains('hidden')) {
            calculateLTC();
        }
    };


    window.filterVocaDict = function () {
        const keyword = document.getElementById('voca-search').value.toLowerCase().trim();

        if (!keyword) {
            // If empty, show current tab
            renderVocaList(VOCABULARY_DATA.filter(d => d.category === vocaActiveCategory));
            return;
        }

        // Search ALL categories
        const filtered = VOCABULARY_DATA.filter(item =>
            item.word.toLowerCase().includes(keyword) ||
            item.meaning.toLowerCase().includes(keyword) ||
            item.desc.toLowerCase().includes(keyword) ||
            item.category.toLowerCase().includes(keyword)
        );

        // De-highlight all tabs to show user that search is global
        ['tab-voca-acct', 'tab-voca-case', 'tab-voca-life'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.background = 'transparent';
                el.style.color = 'var(--text-5)';
                el.style.fontWeight = '600';
                el.style.boxShadow = 'none';
            }
        });

        renderVocaList(filtered, true);
    };

    function renderVocaList(data) {
        const container = document.getElementById('voca-list-container');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-6);">
                <div style="font-size:3rem; margin-bottom:12px;">😢</div>
                <p style="font-weight:700">검색 결과가 없습니다.</p>
                <p style="font-size:0.85rem">다른 키워드로 검색해보세요.</p>
            </div>
        `;
            return;
        }

        container.innerHTML = data.map(item => `
        <div class="voca-card" style="background:var(--surface); border-radius:16px; padding:20px; border:1px solid var(--border); box-shadow:0 4px 6px rgba(0,0,0,0.02); transition:transform 0.2s">
            <div style="display:flex; align-items:flex-start; gap:16px;">
                <div style="background:var(--surface-3); min-width:54px; height:54px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:1.8rem; flex-shrink:0;">
                    ${item.icon}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="background:#dbeafe; color:#2563eb; font-size:0.75rem; font-weight:800; padding:3px 9px; border-radius:20px; white-space:nowrap; flex-shrink:0;">${item.category}</span>
                    </div>
                    <h4 style="font-size:1.05rem; font-weight:800; color:var(--text-dark); margin:0 0 8px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.word}</h4>
                    <p style="font-size:0.9rem; color:var(--text-2); line-height:1.5; font-weight:600; margin-bottom:8px;">${item.meaning}</p>
                    <p style="font-size:0.78rem; color:var(--text-5); margin:0; display:inline-block; border-left:3px solid var(--border-strong); padding-left:8px;">📝 행정 의미: ${item.desc}</p>
                </div>
            </div>
        </div>
    `).join('');
    }

    /* --- Community / Help Me (Q&A) --- */

    // Helper to format date
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000); // seconds

        if (diff < 60) return '방금 전';
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    }

    async function initHelpMe() {
        const listContainer = document.getElementById('qa-list');
        if (!listContainer) return;

        if (!supabase) {
            listContainer.innerHTML = '<p style="text-align:center; color:var(--text-6); padding:20px 0; font-size:0.9rem;">Supabase 설정이 필요합니다.</p>';
            return;
        }

        // 상단 고정 공지·사용법 카드 (글이 없어도 항상 노출)
        const noticeCard = `
                <div style="background:linear-gradient(135deg,#eef6ff,#e0ecff); border:1px solid #c7d8f5; border-radius:16px; padding:16px 18px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:7px; margin-bottom:9px;">
                        <span style="background:#2563eb; color:#fff; font-size:0.66rem; font-weight:800; padding:3px 9px; border-radius:12px;">📌 공지 · 사용법</span>
                        <span style="font-size:0.95rem; font-weight:800; color:#1e3a8a;">이렇게 이용해요</span>
                    </div>
                    <ul style="margin:0; padding:0; list-style:none; font-size:0.82rem; color:#334155; line-height:1.75;">
                        <li>🙈 <b>완전 익명</b> — 닉네임·소속 없이 편하게 질문하고 답해요.</li>
                        <li>💬 실무 고민·서류·사례관리·처우까지 무엇이든 물어보세요.</li>
                        <li>🤝 서로 <b>존중</b>하며 따뜻하게. 비방·광고·도배는 삼가주세요.</li>
                        <li>🔒 <b>개인정보 금지</b> — 실명·기관명·클라이언트 정보는 올리지 마세요.</li>
                        <li>💡 답변은 참고용이에요. 최종 판단은 소속 기관 기준을 따라주세요.</li>
                    </ul>
                </div>`;

        // Show loading
        listContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:var(--text-6);"><p style="font-size:0.9rem;">불러오는 중...</p></div>';

        try {
            const { data, error } = await withTimeout(
                supabase.from('posts').select('*').order('created_at', { ascending: false })
            );

            if (error) throw error;

            if (!data || data.length === 0) {
                listContainer.innerHTML = noticeCard + `
                <div style="text-align:center; padding:30px 20px 20px;">
                    <div style="font-size:3rem; margin-bottom:12px;">🦊</div>
                    <p style="font-size:1rem; font-weight:800; color:var(--text-3); margin-bottom:6px;">아직 조용하네요</p>
                    <p style="font-size:0.85rem; color:var(--text-6); margin-bottom:18px;">첫 질문의 주인공이 되어보세요!</p>
                    <button class="btn-primary" onclick="openAskModal()"
                        style="width:auto; margin:0; padding:10px 22px; border-radius:20px; font-size:0.85rem;">+
                        질문하기</button>
                </div>`;
                return;
            }

            let html = noticeCard;
            data.forEach(post => {
                html += `
                <div style="background:var(--surface); border-radius:16px; padding:18px; border:1px solid var(--border); box-shadow:var(--shadow-card); cursor:pointer;" onclick="openQaDetail('${post.id}')">
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <span style="background:#dbeafe; color:#1d4ed8; font-size:0.7rem; font-weight:800; padding:4px 8px; border-radius:12px;">${escapeHtml(post.category) || '일반'}</span>
                    </div>
                    <div style="font-size:1.05rem; font-weight:800; color:var(--text-900); line-height:1.4; margin-bottom:8px;">${escapeHtml(post.title)}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text-6);">
                        <span>${escapeHtml(post.author || '익명')}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
            `;
            });
            listContainer.innerHTML = html;
        } catch (err) {
            console.error('Error fetching posts:', err);
            listContainer.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                <p style="font-size:0.9rem; color:var(--text-4); margin-bottom:16px;">글을 불러오지 못했어요. 네트워크를 확인해주세요.</p>
                <button class="btn-primary btn-outline" onclick="initHelpMe()"
                    style="width:auto; margin:0; padding:8px 20px; border-radius:20px; font-size:0.82rem;">다시 시도</button>
            </div>`;
        }
    }
    window.initHelpMe = initHelpMe;

    window.openAskModal = function () {
        const content = `
        <div style="display:flex; flex-direction:column; gap:20px;">
            <div class="form-group">
                <label>질문 카테고리</label>
                <select id="ask-category" class="calc-input">
                    <option value="사례관리">🧩 사례관리</option>
                    <option value="행정/회계">💰 행정/회계</option>
                    <option value="프로그램">🎯 프로그램</option>
                    <option value="기관생활">🏢 기관생활</option>
                    <option value="기타">ETC 기타</option>
                </select>
            </div>
            <div class="form-group">
                <label>질문 제목</label>
                <input type="text" id="ask-title" class="calc-input" placeholder="핵심 내용을 한 줄로 요약해 주세요.">
            </div>
            <div class="form-group">
                <label>상세 내용</label>
                <textarea id="ask-content" class="calc-input" style="height:150px; resize:none; padding:12px;" placeholder="고민되는 내용을 상세히 적어주시면 더 정확한 답변을 얻을 수 있습니다."></textarea>
            </div>
            <div style="background:#fff9f0; padding:16px; border-radius:12px; border:1px solid #ffedd5; font-size:0.85rem; color:#9a3412; line-height:1.6;">
                <div style="font-weight:800; margin-bottom:4px;">✨ 잠시만요, 선생님!</div>
                익명이라도 따뜻한 예의는 필수! 욕설이나 비방은 AI 팀장님이 슬퍼하며 삭제 조치합니다. 🤖<br>
                <span style="font-weight:900; color:#b91c1c; text-decoration:underline;">※ 주의: 클라이언트(내담자)의 실명이나 상세 주소, 전화번호 등 특정 가능한 민감정보는 절대 포함하지 마세요!</span><br>
                <span style="font-weight:700; color:#c2410c;">※ 동료들의 조언은 참고용일 뿐, 최종 결정은 선생님의 멋진 판단을 믿어요! 혹시 모를 결과에 대해 사복노트는 마음으로만 함께할 수 있답니다. 🙏</span>
            </div>
            <button class="btn-primary" id="btn-submit-post" onclick="submitQuestion()">🪄 익명으로 게시하기</button>
        </div>
    `;
        openModal('질문하기 🆘', content, 'helpme');
    };

    /* ===== 동기화 코드 안내 타이밍 =====
       '내 정보'까지 들어가야 발견하던 카카오 연동 유도를,
       첫 기록(질문/글)이 생긴 직후 — 잃을 게 생긴 순간 — 딱 한 번만 보여준다. */
    async function maybeShowSyncNudge() {
        try {
            if (localStorage.getItem('sabok_sync_nudge_shown')) return;

            const session = await ensureAnonSession();
            if (!session) return;
            const u = session.user || {};
            const linked = (u.identities || []).some(i => i.provider === 'kakao' || i.provider === 'google');
            if (linked) return;

            localStorage.setItem('sabok_sync_nudge_shown', '1');

            setTimeout(() => {
                openModal('📝 기록이 생겼어요!', `
                <div style="text-align:center; padding:8px 0;">
                    <div style="font-size:2.5rem; margin-bottom:10px;">🌱</div>
                    <p style="font-size:0.95rem; color:var(--text-2); font-weight:700; line-height:1.6; margin-bottom:4px;">
                        방금 남긴 기록, 잃어버리지 않게<br>딱 10초만 지켜둘까요?</p>
                    <p style="font-size:0.82rem; color:var(--text-6); margin-bottom:20px;">
                        브라우저 기록을 지우거나 폰을 바꾸면<br>지금 기록은 그대로 사라질 수 있어요.</p>
                    <button onclick="linkKakao()"
                        style="width:100%; padding:13px; background:#FEE500; color:var(--text-1); border:none; border-radius:12px; font-size:0.92rem; font-weight:800; cursor:pointer; margin-bottom:8px;">💬
                        카카오 3초 연결로 지키기</button>
                    <button onclick="document.getElementById('close-modal').click()"
                        style="width:100%; padding:11px; background:none; color:var(--text-6); border:none; font-size:0.85rem; cursor:pointer;">다음에
                        할게요</button>
                </div>
            `, 'sync-nudge');
            }, 500);
        } catch (e) {
            console.warn('sync nudge error:', e);
        }
    }

    window.submitQuestion = async function () {
        const title = document.getElementById('ask-title').value;
        const category = document.getElementById('ask-category').value;
        const content = document.getElementById('ask-content').value;
        const btn = document.getElementById('btn-submit-post');

        if (!title.trim() || !content.trim()) {
            alert('모든 내용을 입력해주세요.');
            return;
        }

        if (!supabase) {
            alert('Supabase 설정이 필요합니다. (데모 모드)');
            document.getElementById('close-modal').click();
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '게시 중...';

            const myUserId = getOrCreateUserId();

            const { error } = await supabase
                .from('posts')
                .insert([
                    { title, category, content, author: getRandomAnonymousName(), user_id: myUserId }
                ]);

            if (error) throw error;

            alert('질문이 게시되었습니다! 답변이 달리면 알림을 드릴게요.');
            document.getElementById('close-modal').click();
            initHelpMe(); // Refresh list
            maybeShowSyncNudge();
        } catch (err) {
            console.error('Error submitting post:', err);
            alert('게시 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '🪄 익명으로 게시하기';
        }
    };

    /* ===== 받은 감사 리액션 =====
       Q&A 답변(reply_type='help')과 커뮤니티 댓글(reply_type='community')에
       공용으로 쓰는 감사(🙏) 리액션. reply_thanks 테이블에 (reply_id, reply_type, giver_id) 유니크. */
    async function fetchThanksInfo(replyIds, replyType, myUserId) {
        const info = {};
        (replyIds || []).forEach(id => { info[id] = { count: 0, mine: false }; });
        if (!replyIds || !replyIds.length || !supabase) return info;
        try {
            const { data, error } = await supabase
                .from('reply_thanks')
                .select('reply_id, giver_id')
                .eq('reply_type', replyType)
                .in('reply_id', replyIds);
            if (!error && data) {
                data.forEach(row => {
                    if (!info[row.reply_id]) info[row.reply_id] = { count: 0, mine: false };
                    info[row.reply_id].count += 1;
                    if (row.giver_id === myUserId) info[row.reply_id].mine = true;
                });
            }
        } catch (_) { /* noop */ }
        return info;
    }

    function renderThanksButton(replyId, replyType, receiverId, info) {
        const mine = !!(info && info.mine);
        const count = (info && info.count) || 0;
        return `<button id="thanks-btn-${replyType}-${replyId}" onclick="toggleThanks('${replyId}', '${replyType}', '${escapeAttr(receiverId || '')}')"
            style="margin-top:8px; padding:6px 12px; border-radius:20px; border:1px solid ${mine ? '#fde68a' : '#e2e8f0'}; background:${mine ? '#fef9c3' : '#f8fafc'}; color:${mine ? '#a16207' : '#64748b'}; font-size:0.78rem; font-weight:700; cursor:pointer;">${mine ? '💛' : '🤍'} 감사해요 <span>${count}</span></button>`;
    }

    window.toggleThanks = async function (replyId, replyType, receiverId) {
        if (!supabase) return;
        const myUserId = getOrCreateUserId();
        if (receiverId && receiverId === myUserId) {
            alert('내 답변에는 감사를 누를 수 없어요. 😊');
            return;
        }
        const btn = document.getElementById(`thanks-btn-${replyType}-${replyId}`);
        if (btn) btn.disabled = true;
        try {
            const { data: existing, error: selErr } = await supabase
                .from('reply_thanks')
                .select('id')
                .eq('reply_id', replyId)
                .eq('reply_type', replyType)
                .eq('giver_id', myUserId)
                .maybeSingle();
            if (selErr) throw selErr;

            if (existing) {
                const { error: delErr } = await supabase.from('reply_thanks').delete().eq('id', existing.id);
                if (delErr) throw delErr;
            } else {
                const { error: insErr } = await supabase.from('reply_thanks').insert([
                    { reply_id: replyId, reply_type: replyType, receiver_id: receiverId, giver_id: myUserId }
                ]);
                if (insErr) throw insErr;
            }

            const { count } = await supabase
                .from('reply_thanks')
                .select('id', { count: 'exact', head: true })
                .eq('reply_id', replyId)
                .eq('reply_type', replyType);

            if (btn) {
                const mineNow = !existing;
                btn.innerHTML = `${mineNow ? '💛' : '🤍'} 감사해요 <span>${count || 0}</span>`;
                btn.style.background = mineNow ? '#fef9c3' : '#f8fafc';
                btn.style.color = mineNow ? '#a16207' : '#64748b';
                btn.style.borderColor = mineNow ? '#fde68a' : '#e2e8f0';
            }
        } catch (e) {
            console.error('toggleThanks error:', e);
            alert('감사 표시 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    window.openQaDetail = async function (id) {
        if (!supabase) {
            alert('Supabase 설정이 필요합니다.');
            return;
        }

        try {
            const { data: post, error: postErr } = await supabase
                .from('posts')
                .select('*')
                .eq('id', id)
                .single();

            if (postErr) throw postErr;

            const { data: replies, error: replyErr } = await supabase
                .from('replies')
                .select('*')
                .eq('post_id', id)
                .order('created_at', { ascending: true });

            if (replyErr) throw replyErr;

            let repliesHtml = replies.length > 0 ? '' : '<p style="text-align:center; padding:30px 0; color:var(--text-6); font-size:0.9rem;">아직 등록된 답변이 없습니다.<br>첫 번째 답변의 주인공이 되어보세요! ✨</p>';

            const myUserId = getOrCreateUserId();
            const thanksInfo = await fetchThanksInfo(replies.map(r => r.id), 'help', myUserId);
            replies.forEach(r => {
                const isMyReply = r.user_id && r.user_id === myUserId;
                const replyActions = isMyReply ? `
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button onclick="editReply('${r.id}', '${post.id}')" style="flex:1; padding:6px; border-radius:10px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.78rem; font-weight:700; cursor:pointer;">✏️ 수정</button>
                        <button onclick="deleteReply('${r.id}', '${post.id}')" style="flex:1; padding:6px; border-radius:10px; border:1px solid #fee2e2; background:#fff5f5; color:#ef4444; font-size:0.78rem; font-weight:700; cursor:pointer;">🗑️ 삭제</button>
                    </div>` : '';
                const thanksHtml = isMyReply ? '' : renderThanksButton(r.id, 'help', r.user_id, thanksInfo[r.id]);
                repliesHtml += `
                <div id="reply-item-${r.id}" style="background:var(--surface-2); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:800; font-size:0.85rem; color:var(--text-900);">${escapeHtml(r.author)}${isMyReply ? ' <span style="font-size:0.7rem; background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:8px;">나</span>' : ''}</span>
                        <span style="font-size:0.75rem; color:var(--text-6);">${formatDate(r.created_at)}</span>
                    </div>
                    <div style="font-size:0.9rem; color:var(--text-4); line-height:1.5;">${escapeHtml(r.content)}</div>
                    ${replyActions}
                    ${thanksHtml}
                </div>
            `;
            });

            // 본인 글 확인 후 수정/삭제 버튼 생성
            const isMyPost = post.user_id && post.user_id === myUserId;
            const myPostActions = isMyPost ? `
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button onclick="openEditHelpMeModal('${post.id}')" style="flex:1; padding:8px; border-radius:12px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.82rem; font-weight:700; cursor:pointer;">✏️ 수정</button>
                    <button onclick="deleteHelpMePost('${post.id}')" style="flex:1; padding:8px; border-radius:12px; border:1px solid #fee2e2; background:#fff5f5; color:#ef4444; font-size:0.82rem; font-weight:700; cursor:pointer;">🗑️ 삭제</button>
                </div>
            ` : '';

            const modalContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="padding-bottom:16px; border-bottom:1px solid var(--border);">
                    <span style="background:#dbeafe; color:#1d4ed8; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:12px;">${escapeHtml(post.category)}</span>
                    <h3 style="font-size:1.3rem; font-weight:900; color:var(--text-900); line-height:1.4; margin-bottom:12px;">${escapeHtml(post.title)}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-5);">
                        <span>${escapeHtml(post.author)}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                    ${myPostActions}
                </div>
                
                <div style="font-size:1rem; color:var(--text-3); line-height:1.7; white-space:pre-wrap;">${escapeHtml(post.content)}</div>
                
                <div style="padding-top:24px;">
                    <h4 style="font-size:1rem; font-weight:800; color:var(--text-900); margin-bottom:16px; display:flex; align-items:center; gap:6px;">
                        💬 답변 <span style="color:var(--primary);">${replies.length}</span>
                    </h4>
                    <div id="replies-list">${repliesHtml}</div>
                </div>
                
                <div style="margin-top:10px; border-top:1px solid var(--border); padding-top:20px;">
                    <textarea id="reply-input" class="calc-input" style="height:80px; resize:none; font-size:0.9rem; margin-bottom:12px;" placeholder="따뜻한 답변 한마디를 남겨주세요."></textarea>
                    <div style="display:flex; justify-content:flex-end;">
                        <button class="btn-primary btn-outline" id="btn-submit-reply" style="width:auto; padding:8px 16px;" onclick="submitReply('${post.id}')">답변 등록</button>
                    </div>
                </div>
            </div>
        `;
            openModal('질문 상세보기', modalContent);
        } catch (err) {
            console.error('Error fetching details:', err);
            alert('정보를 불러오는 중 오류가 발생했습니다.');
        }
    };

    window.submitReply = async function (postId) {
        const content = document.getElementById('reply-input').value;
        const btn = document.getElementById('btn-submit-reply');

        if (!content.trim()) {
            alert('답변 내용을 입력해주세요.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '등록 중...';

            const { error } = await supabase
                .from('replies')
                .insert([
                    { post_id: postId, content: content, author: getRandomAnonymousName(), user_id: getOrCreateUserId() }
                ]);

            if (error) throw error;

            // Refresh details modal
            openQaDetail(postId);
        } catch (err) {
            console.error('Error submitting reply:', err);
            alert('답변 등록 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '답변 등록';
        }
    };

    /* --- 유쾌한 익명 이름 생성기 (로컬 스토리지 연동) --- */
    function getRandomAnonymousName() {
        const STORAGE_KEY = 'saboks_anonymous_name';
        let savedName = localStorage.getItem(STORAGE_KEY);

        if (savedName) {
            return savedName; // 이미 생성된 닉네임이 있으면 그대로 반환
        }

        const adjs = ['칼퇴하고 싶은', '월급만 기다리는', '팀장님 몰래', '커피 수혈 중인', '점심시간만 기다리는', '연차 쓰고 싶은', '서류에 파묻힌', '퇴근 5분 전', '눈물 닦는', '비밀이 많은', '간식 숨겨둔', '결재 대기 중인'];
        const nouns = [
            { n: '여우', e: '🦊' }, { n: '강아지', e: '🐶' }, { n: '고양이', e: '🐱' },
            { n: '토끼', e: '🐰' }, { n: '햄스터', e: '🐹' }, { n: '팬더', e: '🐼' },
            { n: '새싹', e: '🌱' }, { n: '나무', e: '🌳' }, { n: '꽃', e: '🌸' },
            { n: '나비', e: '🦋' }, { n: '다람쥐', e: '🐿️' }, { n: '쿼카', e: '🐨' }
        ];

        const adj = adjs[Math.floor(Math.random() * adjs.length)];
        const nounObj = nouns[Math.floor(Math.random() * nouns.length)];
        const newName = `${nounObj.e} ${adj} ${nounObj.n}`;

        localStorage.setItem(STORAGE_KEY, newName); // 새로 생성 후 저장

        // Supabase에 프로필 동기화 (백그라운드)
        saveProfileToSupabase(getOrCreateUserId(), newName);

        return newName;
    }

    async function saveProfileToSupabase(userId, nickname) {
        if (!supabase) return;
        try {
            await supabase
                .from('profiles')
                .upsert({ user_id: userId, nickname: nickname, updated_at: new Date().toISOString() });
        } catch (err) {
            console.error('Error saving profile to Supabase:', err);
        }
    }

    window.restoreProfile = async function () {
        const syncCode = document.getElementById('sync-code-input').value.trim();
        const btn = document.getElementById('sync-restore-btn');

        if (!syncCode) {
            alert('동기화 코드를 입력해주세요.');
            return;
        }

        if (!supabase) {
            alert('Supabase 연결이 필요합니다.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '복구 중...';

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', syncCode)
                .single();

            if (error || !data) {
                alert('유효하지 않은 동기화 코드입니다.');
                return;
            }

            if (confirm(`'${data.nickname}' 계정으로 기기 정보를 변경할까요?\n현재 기기의 정보는 사라집니다.`)) {
                localStorage.setItem('sabok_user_id', data.user_id);
                localStorage.setItem('saboks_anonymous_name', data.nickname);

                // 사복키우기 게임 데이터 복원 로직
                const { data: rankData } = await supabase
                    .from('rankings')
                    .select('game_data')
                    .eq('user_id', data.user_id)
                    .single();
                
                if (rankData && rankData.game_data) {
                    localStorage.setItem(`gameData_${data.user_id}`, JSON.stringify(rankData.game_data));
                }

                alert('계정 동기화가 완료되었습니다. 앱을 다시 시작합니다.');
                location.reload();
            }
        } catch (err) {
            console.error('Restore profile error:', err);
            alert('동기화 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '가져오기';
        }
    };

    /* --- Help Me Edit / Delete --- */
    window.deleteHelpMePost = async function (postId) {
        if (!confirm('정말 이 질문을 삭제하시겠습니까?')) return;
        try {
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('posts')
                .delete()
                .eq('id', postId)
                .eq('user_id', myUserId);
            if (error) throw error;
            alert('질문이 삭제되었습니다.');
            document.getElementById('close-modal').click();
            initHelpMe();
        } catch (err) {
            console.error('Delete error:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    window.openEditHelpMeModal = async function (postId) {
        try {
            const { data: post, error } = await supabase
                .from('posts')
                .select('*')
                .eq('id', postId)
                .single();
            if (error) throw error;

            const content = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="form-group">
                    <label>질문 카테고리</label>
                    <select id="edit-ask-category" class="calc-input">
                        <option value="사례관리" ${post.category === '사례관리' ? 'selected' : ''}>🧩 사례관리</option>
                        <option value="행정/회계" ${post.category === '행정/회계' ? 'selected' : ''}>💰 행정/회계</option>
                        <option value="프로그램" ${post.category === '프로그램' ? 'selected' : ''}>🎯 프로그램</option>
                        <option value="기관생활" ${post.category === '기관생활' ? 'selected' : ''}>🏢 기관생활</option>
                        <option value="기타" ${post.category === '기타' ? 'selected' : ''}>ETC 기타</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>질문 제목</label>
                    <input type="text" id="edit-ask-title" class="calc-input" value="${escapeAttr(post.title)}">
                </div>
                <div class="form-group">
                    <label>상세 내용</label>
                    <textarea id="edit-ask-content" class="calc-input" style="height:150px; resize:none; padding:12px;">${escapeHtml(post.content)}</textarea>
                </div>
                <button class="btn-primary" id="btn-update-helpme" onclick="updateHelpMePost('${postId}')">💾 수정 완료</button>
            </div>
        `;
            openModal('질문 수정하기 ✏️', content);
        } catch (err) {
            console.error('Edit load error:', err);
            alert('질문 정보를 불러오지 못했습니다.');
        }
    };

    window.updateHelpMePost = async function (postId) {
        const title = document.getElementById('edit-ask-title').value;
        const category = document.getElementById('edit-ask-category').value;
        const content = document.getElementById('edit-ask-content').value;
        const btn = document.getElementById('btn-update-helpme');

        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '수정 중...';

            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('posts')
                .update({ title, category, content })
                .eq('id', postId)
                .eq('user_id', myUserId);

            if (error) throw error;

            alert('질문이 수정되었습니다!');
            document.getElementById('close-modal').click();
            initHelpMe();
        } catch (err) {
            console.error('Update error:', err);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '💾 수정 완료';
        }
    };


    /* --- Community Board --- */
    window.initCommunity = function () {
        loadCommunityPosts('all');
    };

    window.loadCommunityPosts = async function (category) {
        const listContainer = document.getElementById('community-list');
        if (!listContainer) return;

        // 탭 활성화 UI 업데이트
        ['all', 'free', 'info', 'job', 'ssul', 'diary'].forEach(c => {
            const btn = document.getElementById('cat-' + c);
            if (btn) {
                btn.style.background = 'var(--surface)';
                btn.style.color = 'var(--text-4)';
                btn.style.border = '1px solid #e2e8f0';
            }
        });

        let activeBtnId = 'cat-all';
        if (category === '자유게시판') activeBtnId = 'cat-free';
        if (category === '정보 공유방') activeBtnId = 'cat-info';
        if (category === '취업/이직') activeBtnId = 'cat-job';
        if (category === '하루일기') activeBtnId = 'cat-diary';

        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.style.background = 'var(--primary)';
            activeBtn.style.color = '#fff';
            activeBtn.style.border = 'none';
        }

        // 카테고리 설명 업데이트 (MZ 스타일)
        const descEl = document.getElementById('community-desc');
        if (descEl) {
            let descText = '';
            if (category === 'all') descText = '비밀노트의 모든 떡밥을 한 눈에! 📔 실시간 사복인들의 바이브를 느껴봐 (없는 거 빼고 다 있음 ㅇㅇ)';
            else if (category === '자유게시판') descText = '일하다 킹받을 때, 점심 뭐 먹지 고민될 때 냅다 들어와! 📢 아무말 대잔치 대환영, 여기가 바로 사복 대나무숲임';
            else if (category === '정보 공유방') descText = '나만 알기 아까운 꿀팁, 공문 해석, 꿀 사이트 공유해줌. 🔥 서로 돕고 사는 사복 에코시스템 가보자고!';
            else if (category === '취업/이직') descText = '이직 고민 중인 경력직부터 갓생 살고 싶은 신입까지 다 모여! 🤝 앞서간 선배들의 찐조언으로 레벨업 할 사람?';
            else if (category === '하루일기') descText = '오늘 하루도 사복 현장에서 살아남은 당신, 진짜 고생했음! ☀️ 소소한 행복부터 눈물 핑 도는 일상까지 서로 토닥토닥해줄게';

            descEl.innerText = descText;
            descEl.style.display = descText ? 'block' : 'none';
        }

        if (!supabase) {
            listContainer.innerHTML = '<p style="text-align:center; color:var(--text-6); padding:20px 0; font-size:0.9rem;">Supabase 설정이 필요합니다.</p>';
            return;
        }

        listContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:var(--text-6);"><div class="loading-spinner" style="margin: 0 auto 12px auto;"></div><p style="font-size:0.9rem;">게시글을 불러오는 중...</p></div>';

        try {
            let query = supabase.from('community_posts').select('*').order('created_at', { ascending: false });
            if (category !== 'all') {
                query = query.eq('category', category);
            }
            const { data, error } = await withTimeout(query);

            if (error) throw error;

            if (!data || data.length === 0) {
                listContainer.innerHTML = `
                <div style="text-align:center; padding:48px 20px;">
                    <div style="font-size:3rem; margin-bottom:12px;">📭</div>
                    <p style="font-size:1rem; font-weight:800; color:var(--text-3); margin-bottom:6px;">아직 조용하네요</p>
                    <p style="font-size:0.85rem; color:var(--text-6); margin-bottom:18px;">새로운 이야기를 가장 먼저 시작해보세요!</p>
                    <button class="btn-primary" onclick="openCommunityPostModal()"
                        style="width:auto; margin:0; padding:10px 22px; border-radius:20px; font-size:0.85rem;">✏️
                        글쓰기</button>
                </div>`;
                return;
            }

            let html = '';
            data.forEach(post => {
                let badgeColor = '#dbeafe';
                let textColor = '#1d4ed8';
                if (post.category === '정보 공유방') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
                if (post.category === '취업/이직') { badgeColor = '#dcfce3'; textColor = '#15803d'; }
                if (post.category === '썰게시판') { badgeColor = '#f3e8ff'; textColor = '#1d4ed8'; }
                if (post.category === '하루일기') { badgeColor = '#fef3c7'; textColor = '#b45309'; }

                html += `
                <div style="background:var(--surface); border-radius:16px; padding:18px; border:1px solid var(--border); box-shadow:var(--shadow-card); cursor:pointer;" onclick="openCommunityDetailModal('${post.id}')">
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <span style="background:${badgeColor}; color:${textColor}; font-size:0.7rem; font-weight:800; padding:4px 8px; border-radius:12px;">${escapeHtml(post.category) || '일반'}</span>
                    </div>
                    <div style="font-size:1.05rem; font-weight:800; color:var(--text-900); line-height:1.4; margin-bottom:8px;">${escapeHtml(post.title)}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text-6);">
                        <span>${escapeHtml(post.author || '익명')}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
            `;
            });
            listContainer.innerHTML = html;
        } catch (err) {
            console.error('Error fetching community posts:', err);
            listContainer.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                <p style="font-size:0.9rem; color:var(--text-4); margin-bottom:16px;">글을 불러오지 못했어요. 네트워크를 확인해주세요.</p>
                <button class="btn-primary btn-outline" onclick="loadCommunityPosts('${category}')"
                    style="width:auto; margin:0; padding:8px 20px; border-radius:20px; font-size:0.82rem;">다시 시도</button>
            </div>`;
        }
    };

    window.openCommunityPostModal = function () {
        const content = `
        <div style="display:flex; flex-direction:column; gap:20px;">
            <div class="form-group">
                <label>게시판 카테고리</label>
                <select id="comm-category" class="calc-input">
                    <option value="자유게시판">📢 자유게시판</option>
                    <option value="정보 공유방">🔥 정보 공유방</option>
                    <option value="취업/이직">🧩 취업/이직</option>
                    <option value="하루일기">☀️ 하루일기</option>
                </select>
            </div>
            <div class="form-group">
                <label>글 제목</label>
                <input type="text" id="comm-title" class="calc-input" placeholder="어떤 이야기를 나누고 싶으신가요?">
            </div>
            <div class="form-group">
                <label>상세 내용</label>
                <textarea id="comm-content" class="calc-input" style="height:150px; resize:none; padding:12px;" placeholder="자유롭게 작성해주세요."></textarea>
            </div>
            <div style="background:var(--tint-primary); padding:16px; border-radius:12px; border:1px solid #e0f2fe; font-size:0.85rem; color:#0369a1; line-height:1.6;">
                <div style="font-weight:800; margin-bottom:4px;">🌿 사복인들과의 약속</div>
                정보 공유는 실명보다 더 뜨겁게, 매너는 영하 20도보다 더 차갑게! ✨<br>
                <span style="font-weight:900; color:#b91c1c; text-decoration:underline;">※ 주의: 사례 공유 시 클라이언트(내담자)의 실명이나 특정 가능한 민감 정보는 절대 포함하지 마세요!</span><br>
                <span style="font-weight:700; color:#0369a1;">※ 유저 간의 거래나 깊은 조언은 조금 더 신중하게 살펴봐 주세요. 선생님이 상처받지 않고 즐겁게 소통하길 진심으로 응원합니다! 🤝</span>
            </div>
            <button class="btn-primary" id="btn-submit-comm" onclick="submitCommunityPost()">✏️ 커뮤니티에 글 남기기</button>
        </div>
    `;
        openModal('글쓰기 📝', content, 'write-post');
    };

    window.submitCommunityPost = async function () {
        const title = document.getElementById('comm-title').value;
        const category = document.getElementById('comm-category').value.replace(/[^가-힣/]/g, '').trim(); // Remove emojis just in case
        let cleanCategory = "자유게시판";
        if (category.includes('정보')) cleanCategory = "정보 공유방";
        if (category.includes('취업') || category.includes('이직')) cleanCategory = "취업/이직";
        if (category.includes('일기')) cleanCategory = "하루일기";

        const content = document.getElementById('comm-content').value;
        const btn = document.getElementById('btn-submit-comm');

        if (!title.trim() || !content.trim()) {
            alert('모든 내용을 입력해주세요.');
            return;
        }

        if (!supabase) {
            alert('Supabase 설정이 필요합니다.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '게시 중...';

            const myUserId = getOrCreateUserId();

            const { error } = await supabase
                .from('community_posts')
                .insert([
                    { title, category: cleanCategory, content, author: getRandomAnonymousName(), user_id: myUserId }
                ]);

            if (error) throw error;

            alert('글이 등록되었습니다!');
            document.getElementById('close-modal').click();

            // Navigate back to the submitted category
            if (cleanCategory === '자유게시판') loadCommunityPosts('자유게시판');
            else if (cleanCategory === '정보 공유방') loadCommunityPosts('정보 공유방');
            else if (cleanCategory === '취업/이직') loadCommunityPosts('취업/이직');
            else if (cleanCategory === '하루일기') loadCommunityPosts('하루일기');
            else loadCommunityPosts('all');

            maybeShowSyncNudge();
        } catch (err) {
            console.error('Error submitting community post:', err);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '✏️ 커뮤니티에 글 남기기';
        }
    };

    window.openCommunityDetailModal = async function (id) {
        if (!supabase) {
            alert('Supabase 설정이 필요합니다.');
            return;
        }

        try {
            const { data: post, error: postErr } = await supabase
                .from('community_posts')
                .select('*')
                .eq('id', id)
                .single();

            if (postErr) throw postErr;

            const { data: replies, error: replyErr } = await supabase
                .from('community_replies')
                .select('*')
                .eq('post_id', id)
                .order('created_at', { ascending: true });

            if (replyErr && replyErr.code !== '42P01') throw replyErr; // Ignore table not found if user didn't create replies yet

            const safeReplies = replies || [];

            let repliesHtml = safeReplies.length > 0 ? '' : '<p style="text-align:center; padding:30px 0; color:var(--text-6); font-size:0.9rem;">아직 댓글이 없습니다.<br>첫 번째 댓글을 남겨보세요! ✨</p>';

            const myUserId = getOrCreateUserId();
            const thanksInfo = await fetchThanksInfo(safeReplies.map(r => r.id), 'community', myUserId);
            safeReplies.forEach(r => {
                const isMyReply = r.user_id && r.user_id === myUserId;
                const replyActions = isMyReply ? `
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button onclick="editCommReply('${r.id}', '${post.id}')" style="flex:1; padding:6px; border-radius:10px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.78rem; font-weight:700; cursor:pointer;">✏️ 수정</button>
                        <button onclick="deleteCommReply('${r.id}', '${post.id}')" style="flex:1; padding:6px; border-radius:10px; border:1px solid #fee2e2; background:#fff5f5; color:#ef4444; font-size:0.78rem; font-weight:700; cursor:pointer;">🗑️ 삭제</button>
                    </div>` : '';
                const thanksHtml = isMyReply ? '' : renderThanksButton(r.id, 'community', r.user_id, thanksInfo[r.id]);
                repliesHtml += `
                <div id="comm-reply-item-${r.id}" style="background:var(--surface-2); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:800; font-size:0.85rem; color:var(--text-900);">${escapeHtml(r.author)}${isMyReply ? ' <span style="font-size:0.7rem; background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:8px;">나</span>' : ''}</span>
                        <span style="font-size:0.75rem; color:var(--text-6);">${formatDate(r.created_at)}</span>
                    </div>
                    <div style="font-size:0.9rem; color:var(--text-4); line-height:1.5;">${escapeHtml(r.content)}</div>
                    ${replyActions}
                    ${thanksHtml}
                </div>
            `;
            });

            let badgeColor = '#dbeafe';
            let textColor = '#1d4ed8';
            if (post.category === '정보 공유방') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
            if (post.category === '취업/이직') { badgeColor = '#dcfce3'; textColor = '#15803d'; }
            if (post.category === '썰게시판') { badgeColor = '#f3e8ff'; textColor = '#1d4ed8'; }
            if (post.category === '하루일기') { badgeColor = '#fef3c7'; textColor = '#b45309'; }

            // 내가 쓴 글인지 확인
            const isMyPost = post.user_id && post.user_id === myUserId;
            const myPostActions = isMyPost ? `
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button onclick="openEditCommunityModal('${post.id}')" style="flex:1; padding:8px; border-radius:12px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-4); font-size:0.82rem; font-weight:700; cursor:pointer;">✏️ 수정</button>
                    <button onclick="deleteCommunityPost('${post.id}')" style="flex:1; padding:8px; border-radius:12px; border:1px solid #fee2e2; background:#fff5f5; color:#ef4444; font-size:0.82rem; font-weight:700; cursor:pointer;">🗑️ 삭제</button>
                </div>
            ` : '';

            const modalContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="padding-bottom:16px; border-bottom:1px solid var(--border);">
                    <span style="background:${badgeColor}; color:${textColor}; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:12px;">${escapeHtml(post.category)}</span>
                    <h3 style="font-size:1.3rem; font-weight:900; color:var(--text-900); line-height:1.4; margin-bottom:12px;">${escapeHtml(post.title)}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-5);">
                        <span>${escapeHtml(post.author)}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                    ${myPostActions}
                </div>
                
                <div style="font-size:1rem; color:var(--text-3); line-height:1.7; white-space:pre-wrap;">${escapeHtml(post.content)}</div>
                
                <div style="padding-top:24px;">
                    <h4 style="font-size:1rem; font-weight:800; color:var(--text-900); margin-bottom:16px; display:flex; align-items:center; gap:6px;">
                        💬 댓글 <span style="color:var(--primary);">${safeReplies.length}</span>
                    </h4>
                    <div id="comm-replies-list">${repliesHtml}</div>
                </div>
                
                <div style="margin-top:10px; border-top:1px solid var(--border); padding-top:20px;">
                    <textarea id="comm-reply-input" class="calc-input" style="height:80px; resize:none; font-size:0.9rem; margin-bottom:12px;" placeholder="댓글을 남겨보세요."></textarea>
                    <div style="display:flex; justify-content:flex-end;">
                        <button class="btn-primary btn-outline" id="btn-submit-comm-reply" style="width:auto; padding:8px 16px;" onclick="submitCommunityReply('${post.id}')">댓글 작성</button>
                    </div>
                </div>
            </div>
        `;
            openModal('게시글 보기 👀', modalContent);
        } catch (err) {
            console.error('Error fetching details:', err);
            alert('정보를 불러오는 중 오류가 발생했습니다.');
        }
    };

    window.submitCommunityReply = async function (postId) {
        const content = document.getElementById('comm-reply-input').value;
        const btn = document.getElementById('btn-submit-comm-reply');

        if (!content.trim()) {
            alert('댓글 내용을 입력해주세요.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '등록 중...';

            const { error } = await supabase
                .from('community_replies')
                .insert([
                    { post_id: postId, content: content, author: getRandomAnonymousName(), user_id: getOrCreateUserId() }
                ]);

            if (error) {
                if (error.code === '42P01') {
                    alert("답변 테이블(community_replies)이 아직 생성되지 않았습니다.");
                    throw error;
                }
                throw error;
            }

            // Refresh details modal
            openCommunityDetailModal(postId);
        } catch (err) {
            console.error('Error submitting reply:', err);
        } finally {
            btn.disabled = false;
            btn.innerText = '댓글 작성';
        }
    };

    /* --- Community Edit / Delete --- */
    window.deleteCommunityPost = async function (postId) {
        if (!confirm('정말 이 글을 삭제하시겠습니까?')) return;
        try {
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', postId)
                .eq('user_id', myUserId); // 본인 글만 삭제 가능
            if (error) throw error;
            alert('글이 삭제되었습니다.');
            document.getElementById('close-modal').click();
            loadCommunityPosts('all');
        } catch (err) {
            console.error('Delete error:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    window.openEditCommunityModal = async function (postId) {
        try {
            const { data: post, error } = await supabase
                .from('community_posts')
                .select('*')
                .eq('id', postId)
                .single();
            if (error) throw error;

            const content = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="form-group">
                    <label>게시판 카테고리</label>
                    <select id="edit-comm-category" class="calc-input">
                        <option value="자유게시판" ${post.category === '자유게시판' ? 'selected' : ''}>📢 자유게시판</option>
                        <option value="정보 공유방" ${post.category === '정보 공유방' ? 'selected' : ''}>🔥 정보 공유방</option>
                        <option value="취업/이직" ${post.category === '취업/이직' ? 'selected' : ''}>🧩 취업/이직</option>
                        <option value="하루일기" ${post.category === '하루일기' ? 'selected' : ''}>☀️ 하루일기</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>글 제목</label>
                    <input type="text" id="edit-comm-title" class="calc-input" value="${escapeAttr(post.title)}">
                </div>
                <div class="form-group">
                    <label>상세 내용</label>
                    <textarea id="edit-comm-content" class="calc-input" style="height:150px; resize:none; padding:12px;">${escapeHtml(post.content)}</textarea>
                </div>
                <button class="btn-primary" id="btn-update-comm" onclick="updateCommunityPost('${postId}')">💾 수정 완료</button>
            </div>
        `;
            openModal('글 수정하기 ✏️', content);
        } catch (err) {
            console.error('Edit load error:', err);
            alert('글 정보를 불러오지 못했습니다.');
        }
    };

    window.updateCommunityPost = async function (postId) {
        const title = document.getElementById('edit-comm-title').value;
        const category = document.getElementById('edit-comm-category').value;
        const content = document.getElementById('edit-comm-content').value;
        const btn = document.getElementById('btn-update-comm');

        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = '수정 중...';

            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('community_posts')
                .update({ title, category, content })
                .eq('id', postId)
                .eq('user_id', myUserId); // 본인 글만 수정 가능

            if (error) throw error;

            alert('글이 수정되었습니다!');
            document.getElementById('close-modal').click();
            loadCommunityPosts('all');
        } catch (err) {
            console.error('Update error:', err);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '💾 수정 완료';
        }
    };

    /* --- 도와줘요 답변(Reply) 수정/삭제 --- */
    window.deleteReply = async function (replyId, postId) {
        if (!confirm('이 답변을 삭제하시겠습니까?')) return;
        try {
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('replies')
                .delete()
                .eq('id', replyId)
                .eq('user_id', myUserId);
            if (error) throw error;
            openQaDetail(postId);
        } catch (err) {
            console.error('Reply delete error:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    window.editReply = async function (replyId, postId) {
        try {
            const { data: reply, error } = await supabase
                .from('replies')
                .select('*')
                .eq('id', replyId)
                .single();
            if (error) throw error;

            const content = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div class="form-group">
                    <label>답변 내용</label>
                    <textarea id="edit-reply-content" class="calc-input" style="height:140px; resize:none; padding:12px;">${escapeHtml(reply.content)}</textarea>
                </div>
                <button class="btn-primary" id="btn-update-reply" onclick="updateReply('${replyId}', '${postId}')">💾 수정 완료</button>
            </div>`;
            openModal('답변 수정하기 ✏️', content);
        } catch (err) {
            console.error('Edit reply load error:', err);
            alert('답변 정보를 불러오지 못했습니다.');
        }
    };

    window.updateReply = async function (replyId, postId) {
        const content = document.getElementById('edit-reply-content')?.value;
        const btn = document.getElementById('btn-update-reply');
        if (!content || !content.trim()) { alert('내용을 입력해주세요.'); return; }
        try {
            btn.disabled = true; btn.innerText = '수정 중...';
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('replies')
                .update({ content })
                .eq('id', replyId)
                .eq('user_id', myUserId);
            if (error) throw error;
            openQaDetail(postId);
        } catch (err) {
            console.error('Update reply error:', err);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 수정 완료'; }
        }
    };

    /* --- 커뮤니티 댓글(CommReply) 수정/삭제 --- */
    window.deleteCommReply = async function (replyId, postId) {
        if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
        try {
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('community_replies')
                .delete()
                .eq('id', replyId)
                .eq('user_id', myUserId);
            if (error) throw error;
            openCommunityDetailModal(postId);
        } catch (err) {
            console.error('CommReply delete error:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    window.editCommReply = async function (replyId, postId) {
        try {
            const { data: reply, error } = await supabase
                .from('community_replies')
                .select('*')
                .eq('id', replyId)
                .single();
            if (error) throw error;

            const content = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div class="form-group">
                    <label>댓글 내용</label>
                    <textarea id="edit-comm-reply-content" class="calc-input" style="height:140px; resize:none; padding:12px;">${escapeHtml(reply.content)}</textarea>
                </div>
                <button class="btn-primary" id="btn-update-comm-reply" onclick="updateCommReply('${replyId}', '${postId}')">💾 수정 완료</button>
            </div>`;
            openModal('댓글 수정하기 ✏️', content);
        } catch (err) {
            console.error('Edit comm reply load error:', err);
            alert('댓글 정보를 불러오지 못했습니다.');
        }
    };

    window.updateCommReply = async function (replyId, postId) {
        const content = document.getElementById('edit-comm-reply-content')?.value;
        const btn = document.getElementById('btn-update-comm-reply');
        if (!content || !content.trim()) { alert('내용을 입력해주세요.'); return; }
        try {
            btn.disabled = true; btn.innerText = '수정 중...';
            const myUserId = getOrCreateUserId();
            const { error } = await supabase
                .from('community_replies')
                .update({ content })
                .eq('id', replyId)
                .eq('user_id', myUserId);
            if (error) throw error;
            openCommunityDetailModal(postId);
        } catch (err) {
            console.error('Update comm reply error:', err);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 수정 완료'; }
        }
    };

    /* --- My Page --- */
    window.initMypage = async function () {
        const listEl = document.getElementById('my-posts-list');
        if (!listEl) return;

        // 프로필 동적 업데이트
        const profileNameEl = document.getElementById('mypage-profile-name');
        const profileEmojiEl = document.getElementById('mypage-profile-emoji');
        const headerEmojiEl = document.getElementById('mypage-header-emoji');

        let currentNickname = localStorage.getItem('saboks_anonymous_name');

        if (!currentNickname) {
            currentNickname = getRandomAnonymousName();
        }

        if (currentNickname) {
            const emoji = currentNickname.split(' ')[0];
            const name = currentNickname.split(' ').slice(1).join(' ');

            if (profileNameEl) profileNameEl.innerText = name || currentNickname;
            if (profileEmojiEl) profileEmojiEl.innerText = emoji;
            if (headerEmojiEl) headerEmojiEl.innerText = emoji;
        }

        const myUserId = getOrCreateUserId();

        // 동기화 코드 표시
        const syncCodeEl = document.getElementById('my-sync-code');
        if (syncCodeEl) syncCodeEl.innerText = myUserId;

        // 소셜 연동 상태 표시
        const linkedList = document.getElementById('my-linked-accounts-list');
        if (linkedList) {
            const loginButtonsHtml =
                '<div style="width:100%;">' +
                '<p style="font-size:0.78rem; color:var(--text-5); line-height:1.55; margin:0 0 10px;">소셜 계정을 연결하면 동기화 코드 없이도<br>어느 기기에서든 내 기록이 그대로 이어져요.</p>' +
                '<button onclick="socialLogin(\'kakao\')" style="width:100%; padding:12px; background:#FEE500; color:var(--text-1); border:none; border-radius:10px; font-size:0.88rem; font-weight:800; cursor:pointer; margin-bottom:8px;">💬 카카오로 로그인 / 연결</button>' +
                '<button onclick="socialLogin(\'google\')" style="width:100%; padding:12px; background:var(--surface); color:var(--text-1); border:1px solid var(--border-strong); border-radius:10px; font-size:0.88rem; font-weight:800; cursor:pointer;">🌐 구글로 로그인 / 연결</button>' +
                '</div>';
            linkedList.innerHTML = '<span style="font-size:0.75rem; color:var(--text-6);">확인 중...</span>';
            ensureAnonSession().then(session => {
                const u = session && session.user;
                const providers = (u && u.identities ? u.identities : []).map(i => i.provider);
                const providerRow = function (icon, iconBg, iconBorder, name) {
                    return '<div style="display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-bottom:8px;">' +
                        '<div style="width:34px; height:34px; border-radius:10px; background:' + iconBg + '; border:' + iconBorder + '; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0;">' + icon + '</div>' +
                        '<div style="flex:1; min-width:0;">' +
                        '<div style="font-size:0.85rem; font-weight:800; color:var(--text-2);">' + name + '</div>' +
                        '<div style="font-size:0.7rem; color:#16a34a; font-weight:700; margin-top:2px;"><span style="font-size:0.55rem; vertical-align:1px;">●</span> 연결됨 · 기기 간 자동 동기화 중</div>' +
                        '</div></div>';
                };
                let html = '';
                if (providers.includes('kakao')) html += providerRow('💬', '#FEE500', 'none', '카카오 계정');
                if (providers.includes('google')) html += providerRow('🌐', '#ffffff', '1px solid #e2e8f0', '구글 계정');
                if (!html) {
                    html = loginButtonsHtml;
                } else {
                    html = '<div style="width:100%;">' + html +
                        '<button onclick="logout()" style="width:100%; padding:11px; background:none; border:1px solid var(--border); color:var(--text-6); border-radius:10px; font-size:0.8rem; font-weight:700; cursor:pointer;">로그아웃</button>' +
                        '</div>';
                }
                linkedList.innerHTML = html;
            }).catch(() => {
                linkedList.innerHTML = loginButtonsHtml;
            });
        }

        // 이름이 있으면 Supabase에 백그라운드 동기화 (최초 1회 보장용)
        if (currentNickname) saveProfileToSupabase(myUserId, currentNickname);

        if (!supabase) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--text-6); font-size:0.85rem; padding:16px;">Supabase 설정이 필요합니다.</p>';
            return;
        }

        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-6);"><div class="loading-spinner" style="margin: 0 auto 8px auto;"></div><p style="font-size:0.85rem;">불러오는 중...</p></div>';

        // --- 게이미피케이션 스탯 불러오기 ---
        let qCount = 0;
        let aCount = 0;
        let thanksCount = 0;

        try {
            // 1. Help Me 질문 & 커뮤니티 게시글 합산
            const { count: helpMeCount } = await supabase
                .from('posts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', myUserId);

            const { count: commPostCount } = await supabase
                .from('community_posts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', myUserId);

            qCount = (helpMeCount || 0) + (commPostCount || 0);

            // 2. Help Me 답변 & 커뮤니티 댓글 합산
            const { count: helpMeReplyCount } = await supabase
                .from('replies')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', myUserId);

            const { count: commReplyCount } = await supabase
                .from('community_replies')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', myUserId);

            aCount = (helpMeReplyCount || 0) + (commReplyCount || 0);

            const { count: thanksReceivedCount } = await supabase
                .from('reply_thanks')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', myUserId);
            thanksCount = thanksReceivedCount || 0;
        } catch (e) { console.error('Stats fetch error:', e); }

        const elQ = document.getElementById('mypage-stat-q');
        const elA = document.getElementById('mypage-stat-a');
        const elT = document.getElementById('mypage-stat-thanks');
        if (elQ) elQ.innerText = qCount;
        if (elA) elA.innerText = aCount;
        if (elT) elT.innerText = thanksCount;

        let totalExp = (qCount * 5) + (aCount * 15) + (thanksCount * 10);

        const levels = [
            { max: 50, name: '🌱 열정 가득 인턴요원', color: '#16a34a', bg: '#dcfce7' },
            { max: 150, name: '🌿 믿음직한 주임요원', color: '#0284c7', bg: '#e0f2fe' },
            { max: 400, name: '🌳 실력파 대리요원', color: '#0f766e', bg: '#ccfbf1' },
            { max: 1000, name: '🔥 현장의 마스터 (과장)', color: '#ea580c', bg: '#ffedd5' },
            { max: Infinity, name: '👑 살아있는 전설 (부장 이상)', color: '#b91c1c', bg: '#fee2e2' }
        ];

        let currentLevel = levels[0];
        let nextLevelMax = levels[0].max;
        let prevLevelMax = 0;

        for (let i = 0; i < levels.length; i++) {
            if (totalExp < levels[i].max) {
                currentLevel = levels[i];
                nextLevelMax = levels[i].max;
                prevLevelMax = i > 0 ? levels[i - 1].max : 0;
                break;
            }
        }

        let xpNeeded = nextLevelMax - totalExp;
        let levelRange = nextLevelMax - prevLevelMax;
        let currentLevelExp = totalExp - prevLevelMax;
        let pct = levelRange > 0 ? Math.min(100, Math.max(0, (currentLevelExp / levelRange) * 100)) : 100;

        const expTextEl = document.getElementById('mypage-exp-text');
        const expPctEl = document.getElementById('mypage-exp-pct');
        const expBarEl = document.getElementById('mypage-exp-bar');

        if (expTextEl) {
            if (totalExp >= 1000) {
                expTextEl.innerText = `최고 등급 도달! (${totalExp} XP)`;
                if (expPctEl) expPctEl.innerText = '100%';
                if (expBarEl) expBarEl.style.width = '100%';
            } else {
                expTextEl.innerText = `다음 등급까지 ${xpNeeded} XP 남음`;
                if (expPctEl) expPctEl.innerText = Math.round(pct) + '%';
                if (expBarEl) expBarEl.style.width = pct + '%';
            }
        }

        const badgeEl = document.getElementById('mypage-level-badge');
        if (badgeEl) {
            badgeEl.innerText = currentLevel.name;
            badgeEl.style.color = currentLevel.color;
            badgeEl.style.background = currentLevel.bg;
            badgeEl.style.border = `1px solid ${currentLevel.color}40`;
        }
        // --- 게이미피케이션 스탯 불러오기 끝 ---

        try {
            const { data, error } = await supabase
                .from('community_posts')
                .select('id, title, category, created_at')
                .eq('user_id', myUserId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-6);"><div style="font-size:2rem; margin-bottom:8px;">📭</div><p style="font-size:0.85rem;">아직 작성한 글이 없어요!</p></div>';
                return;
            }

            let html = '';
            data.forEach(post => {
                let badgeColor = '#dbeafe', textColor = '#1d4ed8';
                if (post.category === '정보 공유방') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
                if (post.category === '취업/이직') { badgeColor = '#dcfce3'; textColor = '#15803d'; }

                html += `
                    <div style="padding:12px 0; border-bottom:1px solid var(--border); cursor:pointer;" onclick="openCommunityDetailModal('${post.id}')">
                    <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                        <span style="background:${badgeColor}; color:${textColor}; font-size:0.68rem; font-weight:800; padding:3px 8px; border-radius:10px;">${escapeHtml(post.category)}</span>
                        <span style="font-size:0.75rem; color:var(--text-6);">${formatDate(post.created_at)}</span>
                    </div>
                    <div style="font-size:0.95rem; font-weight:700; color:var(--text-900); line-height:1.4;">${escapeHtml(post.title)}</div>
                </div> `;
            });
            listEl.innerHTML = html;
        } catch (err) {
            console.error('My posts load error:', err);
            listEl.innerHTML = '<p style="text-align:center; color:#ef4444; font-size:0.85rem; padding:16px;">불러오기 실패: ' + err.message + '</p>';
        }
    };

    /* ─── 내정보 메뉴 핸들러 (Justy 작성) ─── */
    function initMyPageMenus() {
        // 서비스 이용약관·개인정보처리방침은 별도 페이지(/terms.html, /privacy.html)로 연다 — scripts/build_pages.py가 만듦

        // 알림 설정
        const notifContent = `
        <div style="text-align:center; padding:20px 0;">
            <div style="font-size:3rem; margin-bottom:16px;">🔔</div>
            <h3 style="font-size:1.1rem; font-weight:800; color:var(--text-2); margin-bottom:8px;">알림 설정</h3>
            <p style="font-size:0.9rem; color:var(--text-5); line-height:1.6;">푸시 알림 기능은 현재 준비 중입니다.<br>빠른 시일 내에 업데이트될 예정이에요! 🚀</p>
        </div>`;

        // XP/레벨 안내
        const xpGuideContent = `
        <div style="font-size:0.88rem; color:var(--text-3); line-height:1.8;">
            <div style="background:linear-gradient(135deg,#3b82f6,#3b82f6); color:#fff; border-radius:16px; padding:16px; margin-bottom:20px; text-align:center;">
                <div style="font-size:2rem; margin-bottom:6px;">⚡</div>
                <div style="font-size:1rem; font-weight:900; margin-bottom:4px;">XP(경험치) 시스템</div>
                <div style="font-size:0.82rem; opacity:0.85;">활동하면 할수록 등급이 올라가요!</div>
            </div>

            <div style="margin-bottom:20px;">
                <div style="font-size:0.78rem; font-weight:800; color:#3b82f6; margin-bottom:10px; letter-spacing:0.5px;">💰 XP 획득 방법</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); padding:10px 14px; border-radius:10px; border:1px solid var(--border);">
                        <span style="font-weight:700;">✍️ 질문/게시글 작성</span>
                        <span style="font-weight:900; color:#3b82f6; font-size:1rem;">+5 XP</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); padding:10px 14px; border-radius:10px; border:1px solid var(--border);">
                        <span style="font-weight:700;">💬 답변/댓글 작성</span>
                        <span style="font-weight:900; color:#3b82f6; font-size:1rem;">+15 XP</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); padding:10px 14px; border-radius:10px; border:1px solid var(--border);">
                        <span style="font-weight:700;">🙏 채택/감사 받기</span>
                        <span style="font-weight:900; color:#f59e0b; font-size:1rem;">+10 XP</span>
                    </div>
                </div>
            </div>

            <div>
                <div style="font-size:0.78rem; font-weight:800; color:#3b82f6; margin-bottom:10px; letter-spacing:0.5px;">🏆 등급 기준표</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#dcfce7; border-radius:10px; border:1px solid #bbf7d0;">
                        <span style="font-size:1.1rem;">🌱</span>
                        <div style="flex:1;">
                            <div style="font-weight:800; color:#15803d; font-size:0.9rem;">열정 가득 인턴요원</div>
                            <div style="font-size:0.75rem; color:#166534;">0 ~ 49 XP</div>
                        </div>
                        <span style="font-size:0.75rem; color:#16a34a; font-weight:700; background:#bbf7d0; padding:2px 8px; border-radius:8px;">Lv.1</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#e0f2fe; border-radius:10px; border:1px solid #bae6fd;">
                        <span style="font-size:1.1rem;">🌿</span>
                        <div style="flex:1;">
                            <div style="font-weight:800; color:#0369a1; font-size:0.9rem;">믿음직한 주임요원</div>
                            <div style="font-size:0.75rem; color:#0c4a6e;">50 ~ 149 XP</div>
                        </div>
                        <span style="font-size:0.75rem; color:#0284c7; font-weight:700; background:#bae6fd; padding:2px 8px; border-radius:8px;">Lv.2</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#dbeafe; border-radius:10px; border:1px solid #bfdbfe;">
                        <span style="font-size:1.1rem;">🌳</span>
                        <div style="flex:1;">
                            <div style="font-weight:800; color:#1d4ed8; font-size:0.9rem;">실력파 대리요원</div>
                            <div style="font-size:0.75rem; color:#1e3a8a;">150 ~ 399 XP</div>
                        </div>
                        <span style="font-size:0.75rem; color:#2563eb; font-weight:700; background:#bfdbfe; padding:2px 8px; border-radius:8px;">Lv.3</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#ffedd5; border-radius:10px; border:1px solid #fed7aa;">
                        <span style="font-size:1.1rem;">🔥</span>
                        <div style="flex:1;">
                            <div style="font-weight:800; color:#c2410c; font-size:0.9rem;">현장의 마스터 (과장)</div>
                            <div style="font-size:0.75rem; color:#7c2d12;">400 ~ 999 XP</div>
                        </div>
                        <span style="font-size:0.75rem; color:#ea580c; font-weight:700; background:#fed7aa; padding:2px 8px; border-radius:8px;">Lv.4</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#fee2e2; border-radius:10px; border:1px solid #fecaca;">
                        <span style="font-size:1.1rem;">👑</span>
                        <div style="flex:1;">
                            <div style="font-weight:800; color:#b91c1c; font-size:0.9rem;">살아있는 전설 (부장 이상)</div>
                            <div style="font-size:0.75rem; color:#7f1d1d;">1000 XP 이상</div>
                        </div>
                        <span style="font-size:0.75rem; color:#b91c1c; font-weight:700; background:#fecaca; padding:2px 8px; border-radius:8px;">Lv.5</span>
                    </div>
                </div>
            </div>

            <div style="margin-top:16px; padding:12px; background:var(--surface-3); border-radius:12px; font-size:0.8rem; color:var(--text-5); line-height:1.6;">
                💡 <strong>팁:</strong> 질문보다 <strong style="color:#3b82f6;">답변을 작성</strong>하면 3배 더 많은 XP를 획득할 수 있어요! 내가 쓴 답변은 수정·삭제도 가능합니다.
            </div>
        </div>`;

        // 메뉴 연결
        document.querySelectorAll('#view-mypage [style*="cursor:pointer"]').forEach(el => {
            const text = el.innerText || '';
            if (text.includes('알림 설정')) {
                el.onclick = () => openModal('🔔 알림 설정', notifContent);
            } else if (text.includes('이용약관')) {
                el.onclick = () => { location.href = '/terms.html'; };
            } else if (text.includes('개인정보')) {
                el.onclick = () => { location.href = '/privacy.html'; };
            } else if (text.includes('XP') || text.includes('레벨')) {
                el.onclick = () => openModal('⚡ XP & 레벨 안내', xpGuideContent);
            }
        });

        // XP 안내 버튼 직접 연결 (id 방식 대비)
        const xpGuideBtn = document.getElementById('open-xp-guide');
        if (xpGuideBtn) {
            xpGuideBtn.onclick = () => openModal('⚡ XP & 레벨 안내', xpGuideContent);
        }
    }

    /* ─── 내 정보 탭 약관·개인정보처리방침: 별도 페이지로 연다 (구글·애드센스 심사도 같은 주소를 읽음) ─── */
    window.openTOSModal = function () { location.href = '/terms.html'; };
    window.openPrivacyModal = function () { location.href = '/privacy.html'; };


    /* ─── 헤더 버튼 핸들러 ─── */
    function initHeaderButtons() {
        // 알림 버튼
        const bellBtn = document.querySelector('.icon-btn[aria-label="알림"]');
        if (bellBtn) {
            bellBtn.onclick = () => openModal('🔔 알림', `
                <div style="text-align:center; padding:20px 0;">
                    <div style="font-size:3rem; margin-bottom:16px;">🔔</div>
                    <h3 style="font-size:1.1rem; font-weight:800; color:var(--text-2); margin-bottom:8px;">아직 새 알림이 없어요</h3>
                    <p style="font-size:0.9rem; color:var(--text-5); line-height:1.6;">새로운 업데이트나 공지가 있으면<br>여기서 확인할 수 있어요!</p>
                </div>`);
        }
        // 설정 버튼
        const settingBtns = document.querySelectorAll('.icon-btn');
        settingBtns.forEach(btn => {
            if (btn.textContent.trim() === '⚙️') {
                btn.onclick = () => openModal('⚙️ 설정', `
                    <div style="font-size:0.9rem; color:var(--text-3); line-height:1.8;">
                        <div style="padding:14px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700;">🌙 다크 모드</span>
                            <label class="dm-switch">
                                <input type="checkbox" id="dark-mode-toggle-header" ${document.documentElement.classList.contains('dark-mode') ? 'checked' : ''} onchange="toggleDarkMode(this.checked)">
                                <span class="dm-switch-slider"></span>
                            </label>
                        </div>
                        <div style="padding:14px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700;">🔔 알림 설정</span>
                            <span style="font-size:0.8rem; color:var(--text-6); background:var(--surface-3); padding:4px 10px; border-radius:20px;">준비 중</span>
                        </div>
                        <div style="padding:14px 0; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700;">📱 앱 버전</span>
                            <span style="font-size:0.8rem; color:var(--text-5);">v1.0.0</span>
                        </div>
                    </div>`);
            }
        });
    }

    /* --- 게시판 면책 문구 접기: 첫 방문엔 전체, 이후엔 한 줄 + 더보기 --- */
    window.toggleDisclaimer = function (key) {
        const full = document.getElementById(key + '-disclaimer-full');
        const short = document.getElementById(key + '-disclaimer-short');
        if (!full || !short) return;
        const expanded = full.style.display !== 'none';
        full.style.display = expanded ? 'none' : 'block';
        short.style.display = expanded ? 'flex' : 'none';
    };

    function initDisclaimerCollapse(key) {
        const full = document.getElementById(key + '-disclaimer-full');
        const short = document.getElementById(key + '-disclaimer-short');
        if (!full || !short) return;
        const seenKey = 'sabok_disclaimer_seen_' + key;
        if (localStorage.getItem(seenKey)) {
            full.style.display = 'none';
            short.style.display = 'flex';
        } else {
            localStorage.setItem(seenKey, '1');
        }
    }

    /* --- View Switcher --- */
    window.switchView = function (view, fromHistory) {
        const views = ['home', 'record', 'community', 'mypage', 'shredder', 'playground', 'treasure'];
        window._currentView = view; // 현재 탭 전역 저장 (모달 딥링크용)
        // 스크롤 잠금 해제 (탭 이동 시 모달 버그 보완)
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.documentElement.style.overflow = '';

        views.forEach(v => {
            const el = document.getElementById('view-' + v);
            if (el) el.className = (v === view) ? 'view-content active' : 'view-content hidden';
            const navBtn = document.getElementById('nav-' + v);
            if (navBtn) navBtn.classList.toggle('active', v === view);
            const sideBtn = document.getElementById('snav-' + v);
            if (sideBtn) sideBtn.classList.toggle('active', v === view);
        });

        /* 히스토리 연동: 탭 이동도 항목을 쌓아 뒤로가기가 "이전 탭"으로 가게 한다.
           fromHistory=true(뒤로/앞으로 가기에 반응 중)일 땐 히스토리를 건드리지 않는다. */
        if (!fromHistory) {
            const targetUrl = view === 'home' ? window.location.pathname : '#' + view;
            const curHashView = window.location.hash.replace('#', '').split('/')[0] || 'home';
            if (curHashView !== view) {
                history.pushState(null, '', targetUrl);
            } else if (window.location.hash.replace('#', '') !== (view === 'home' ? '' : view)) {
                history.replaceState(null, '', targetUrl);
            }
        }

        // 놀이터 메뉴 초기화 (놀이터 탭 진입 시 메뉴화면 먼저 보여주기)
        if (view === 'playground') {
            pgShowAllSteps('menu');
        }

        // 커뮤니티 탭 진입 시 데이터 로딩
        if (view === 'community') {
            loadCommunityPosts('all');
            initDisclaimerCollapse('community');
        }
        // 도와줘요 탭 진입 시 면책 문구 접기 상태 갱신
        if (view === 'record') {
            initDisclaimerCollapse('qa');
        }
        // 내 정보 탭 진입 시 내 글 로딩
        if (view === 'mypage') {
            initMypage();
        }
    };

    /* --- Global Init --- */
    window.onload = () => {
        initModal();
        initRequestModal();
        initAIPrompter();
        initEligibilityCalculator();
        initAdminCalculator();
        initVocaDictionary();
        initRecordTemplates();
        initHelpMe();
        initCommunity();
        initMyPageMenus();
        initHeaderButtons();
        initNewsletterReader();
        renderRecentTools();
        renderFavGrid();
        initHomeGreeting();
        initHomeDailyWord();
        loadHomeQnaPreview();

        // URL 해시로 초기 뷰 + 모달 결정 (공유 링크 지원)
        const validViews = ['home', 'record', 'community', 'mypage', 'shredder', 'playground', 'treasure'];

        // 모달 ID → 오프너 함수 매핑 레지스트리
        window._modalRegistry = {
            'newsletter':   () => window.openNewsletterSubModal && window.openNewsletterSubModal(),
            'request':      () => { const b = document.getElementById('open-request-modal'); if (b) b.click(); },
            'alltools':     () => window.openAllToolsModal && window.openAllToolsModal(),
            'eligibility':  () => { const b = document.getElementById('calc-eligibility'); if (b) b.click(); },
            'ltc':          () => { const b = document.getElementById('open-dashboard'); if (b) b.click(); },
            'prompt':       () => { const b = document.getElementById('open-ai-prompter'); if (b) b.click(); },
            'voca':         () => { const b = document.getElementById('open-voca-dict'); if (b) b.click(); },
            'admin':        () => { const b = document.getElementById('open-admin-calc'); if (b) b.click(); },
            'helpme':       () => window.openAskModal && window.openAskModal(),
            'write-post':   () => window.openCommunityPostModal && window.openCommunityPostModal(),
            'xp-guide':     () => { const b = document.getElementById('open-xp-guide'); if (b) b.click(); },
            'tos':          () => window.openTOSModal && window.openTOSModal(),
            'privacy':      () => window.openPrivacyModal && window.openPrivacyModal(),
            'install':      () => window.showPWAInstallGuide && window.showPWAInstallGuide(),
            'quiz':         () => window.showPlaygroundContent && window.showPlaygroundContent('quiz'),
            'balance':      () => window.showPlaygroundContent && window.showPlaygroundContent('balance'),
            'workbook':     () => window.openWorkbookGate && window.openWorkbookGate(),
            'edu':          () => window.openEduModal && window.openEduModal(),
        };
        // 프롬프트 바로 열기 (워크북 QR·SNS 링크용): #home/prompt-pie_records
        Object.keys(AI_PROMPTS).forEach(k => {
            window._modalRegistry['prompt-' + k] = () => {
                const b = document.getElementById('open-ai-prompter');
                if (b) b.click();
                if (window.renderPromptDetail) window.renderPromptDetail(k);
            };
        });

        function dispatchHash(hash) {
            const parts = hash.replace('#', '').split('/');
            const view = parts[0];
            const modalId = parts[1];
            const targetView = validViews.includes(view) ? view : 'home';
            switchView(targetView, true);
            if (modalId && window._modalRegistry[modalId]) {
                // 딥링크 진입: 주소에서 모달 부분을 먼저 걷어낸 뒤 열어야
                // openModal의 pushState와 합쳐져 [#탭, #탭/모달] 두 층이 깔끔하게 쌓인다
                history.replaceState(null, '', targetView === 'home' ? window.location.pathname : '#' + targetView);
                setTimeout(() => {
                    if (window._modalRegistry[modalId]) window._modalRegistry[modalId]();
                }, 200);
            }
        }

        dispatchHash(window.location.hash || '#home');

        /* 브라우저 뒤로/앞으로 가기: 히스토리 항목이 쌓이므로 hashchange 대신 popstate로 처리.
           - 모달이 열린 상태에서 pop → 모달만 닫힘 (사이트 이탈 방지의 핵심)
           - 탭 항목으로 pop → 해당 탭으로 전환
           - 앞으로 가기로 모달 항목에 진입 → 모달 다시 열기 (push 없이) */
        window.addEventListener('popstate', () => {
            const parts = window.location.hash.replace('#', '').split('/');
            const view = validViews.includes(parts[0]) ? parts[0] : 'home';
            const modalId = parts[1];
            const overlay = document.getElementById('modal-overlay');
            const modalOpen = overlay && overlay.classList.contains('active');

            if (modalOpen && !modalId) closeModalNow();
            switchView(view, true);
            if (modalId && !modalOpen && window._modalRegistry[modalId]) {
                window._suppressModalPush = true;
                try { window._modalRegistry[modalId](); }
                finally { window._suppressModalPush = false; }
            }
        });

        // 놀이터 선택 로직 추가
        window.showPlaygroundContent = function (type) {
            if (type === 'game') {
                window.open('./sabok-game/index.html', '_blank');
                return;
            }
            if (type === 'adventure') {
                window.open('./sabok-game/adventure/index.html', '_blank');
                return;
            }
            if (type === 'escape') {
                window.open('./sabok-game/sabok-escape/overtime-escape.html', '_blank');
                return;
            }
            if (type === 'mvote') {
                window.open('https://mvote.vercel.app/', '_blank');
                return;
            }
            if (type === 'quiz') {
                pgShowAllSteps('intro');
                return;
            }
            if (type === 'ladder') {
                pgShowAllSteps('ladder');
                initLadderGame();
                return;
            }
            if (type === 'lunch') {
                pgShowAllSteps('lunch');
                initLunchPicker();
                return;
            }
            if (type === 'balance') {
                pgShowAllSteps('balance');
                if (window.initBalanceGame) window.initBalanceGame();
                return;
            }

        };

        /* ============================================================
           LADDER GAME (사다리 타기)
           ============================================================ */
        function initLadderGame() {
            const container = document.getElementById('pg-step-ladder');
            if (!container) return;

            const defaultNames = ['나', '팀장님', '신입쌤', '최고참'];
            let names = [...defaultNames];
            let results = ['간식 사기 🍩', '칭찬 한마디 💬', '커피 쏘기 ☕', '화장실 청소 🧹'];

            container.innerHTML = `
                <div style="text-align:center; padding: 20px 0 10px;">
                    <div style="font-size:52px; margin-bottom:8px;">🪜</div>
                    <h2 style="font-size:22px; font-weight:900; color:var(--text-2); margin-bottom:6px;">사다리 타기</h2>
                    <p style="color:var(--text-5); font-size:13px; margin-bottom:24px;">참가자와 결과를 입력하고 운명을 결정해요 🎲</p>
                </div>

                <div style="background:var(--surface); border-radius:20px; padding:20px; margin-bottom:14px; border:1px solid #f1e8ff; box-shadow:0 4px 16px rgba(194,24,91,0.08);">
                    <div style="font-size:12px; font-weight:800; color:#C2185B; margin-bottom:12px;">👥 참가자 (최대 15명)</div>
                    <div id="ladder-names-wrap" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
                    <div style="display:flex; gap:8px;">
                        <input id="ladder-name-input" placeholder="이름 입력" maxlength="8"
                            style="flex:1; padding:10px 12px; border-radius:10px; border:1.5px solid #f9a8d4; font-size:14px; outline:none; font-family:inherit;"
                            onkeydown="if(event.key==='Enter') addLadderName()">
                        <button onclick="addLadderName()" style="background:linear-gradient(135deg,#C2185B,#E91E8C); color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:800; font-size:13px; cursor:pointer;">추가</button>
                    </div>
                </div>

                <div style="background:var(--surface); border-radius:20px; padding:20px; margin-bottom:20px; border:1px solid #f1e8ff; box-shadow:0 4px 16px rgba(194,24,91,0.08);">
                    <div style="font-size:12px; font-weight:800; color:#C2185B; margin-bottom:12px;">🎯 결과 항목</div>
                    <div id="ladder-results-wrap" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
                    <div style="display:flex; gap:8px;">
                        <input id="ladder-result-input" placeholder="결과 입력 (예: 간식 사기)" maxlength="12"
                            style="flex:1; padding:10px 12px; border-radius:10px; border:1.5px solid #f9a8d4; font-size:14px; outline:none; font-family:inherit;"
                            onkeydown="if(event.key==='Enter') addLadderResult()">
                        <button onclick="addLadderResult()" style="background:linear-gradient(135deg,#C2185B,#E91E8C); color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:800; font-size:13px; cursor:pointer;">추가</button>
                    </div>
                </div>

                <button onclick="startLadder()" style="width:100%; background:linear-gradient(135deg,#C2185B,#E91E8C); color:#fff; border:none; border-radius:16px; padding:18px; font-size:16px; font-weight:900; cursor:pointer; box-shadow:0 6px 20px rgba(194,24,91,0.3); margin-bottom:12px; transition:all 0.2s;">
                    🎲 사다리 타기 시작!
                </button>

                <div id="ladder-canvas-wrap" style="display:none; background:var(--surface); border-radius:20px; padding:20px; border:1px solid #f1e8ff;
                    box-shadow:0 4px 16px rgba(194,24,91,0.08); margin-bottom:14px;">
                    <canvas id="ladder-canvas" style="width:100%; border-radius:12px;"></canvas>
                </div>

                <div id="ladder-result-content" style="display:none;"></div>

                <button onclick="pgShowAllSteps('menu')" style="width:100%; background:var(--surface-2); color:var(--text-5); border:1.5px solid var(--border); border-radius:14px; padding:14px; font-size:14px; font-weight:700; cursor:pointer; margin-top:8px;">
                    ← 놀이터 메뉴로
                </button>
            `;

            // 기본 이름/결과 렌더
            window.ladderState = { names: [...defaultNames], results: [...results] };
            renderLadderTags();
        }

        function renderLadderTags() {
            const st = window.ladderState;
            const nWrap = document.getElementById('ladder-names-wrap');
            const rWrap = document.getElementById('ladder-results-wrap');
            if (!nWrap || !rWrap) return;

            nWrap.innerHTML = st.names.map((n, i) => `
                <span style="display:inline-flex; align-items:center; gap:6px; background:#FFF0F6; border:1.5px solid #FFB3D1; border-radius:20px; padding:6px 12px; font-size:13px; font-weight:700; color:#C2185B;">
                    ${n} <button onclick="removeLadderName(${i})" style="background:none; border:none; color:#C2185B; cursor:pointer; font-size:14px; padding:0; line-height:1;">✕</button>
                </span>`).join('');

            rWrap.innerHTML = st.results.map((r, i) => `
                <span style="display:inline-flex; align-items:center; gap:6px; background:#FFF0F6; border:1.5px solid #FFB3D1; border-radius:20px; padding:6px 12px; font-size:13px; font-weight:700; color:#C2185B;">
                    ${r} <button onclick="removeLadderResult(${i})" style="background:none; border:none; color:#C2185B; cursor:pointer; font-size:14px; padding:0; line-height:1;">✕</button>
                </span>`).join('');
        }

        window.addLadderName = function() {
            const inp = document.getElementById('ladder-name-input');
            const v = inp.value.trim();
            if (!v || window.ladderState.names.length >= 15) return;
            window.ladderState.names.push(v); inp.value = ''; renderLadderTags();
        };
        window.removeLadderName = function(i) { window.ladderState.names.splice(i,1); renderLadderTags(); };
        window.addLadderResult = function() {
            const inp = document.getElementById('ladder-result-input');
            const v = inp.value.trim();
            if (!v) return;
            window.ladderState.results.push(v); inp.value = ''; renderLadderTags();
        };
        window.removeLadderResult = function(i) { window.ladderState.results.splice(i,1); renderLadderTags(); };

        window.startLadder = function() {
            const st = window.ladderState;
            if (st.names.length < 2) { alert('참가자를 2명 이상 입력해주세요!'); return; }
            const n = st.names.length;
            // 결과를 참가자 수에 맞게 조정
            let rs = [...st.results];
            while (rs.length < n) rs.push('행운 🍀');
            rs = rs.slice(0, n);
            // 셔플
            for (let i = rs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i+1));
                [rs[i], rs[j]] = [rs[j], rs[i]];
            }
            drawLadder(st.names, rs);
        };

        function drawLadder(names, results) {
            const wrap = document.getElementById('ladder-canvas-wrap');
            const canvas = document.getElementById('ladder-canvas');
            const resultDiv = document.getElementById('ladder-result-content');
            
            // 결과창 초기화 및 로딩 연출
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div id="ladder-suspense" style="background:var(--surface); border-radius:20px; padding:30px 20px; border:2px dashed #FFB3D1; text-align:center; margin-bottom:12px; animation: pulse-border 1.5s infinite;">
                    <div style="font-size:40px; margin-bottom:15px; animation: spin 2s linear infinite; display:inline-block;">🔮</div>
                    <div id="suspense-text" style="font-size:16px; font-weight:800; color:#C2185B;">운명의 사다리가 얽히고 있습니다...</div>
                    <div style="font-size:12px; color:#999; margin-top:10px;">(팀장님의 시선을 피하는 중...)</div>
                </div>
            `;
            resultDiv.scrollIntoView({behavior: 'smooth', block: 'center'});

            const suspenseTexts = [
                "운명의 사다리가 얽히고 있습니다...",
                "누구의 지갑이 열릴 것인가...",
                "사례관리 서류보다 더 꼼꼼하게 계산 중...",
                "사회복지사의 직감이 발동되고 있습니다...",
                "하늘이 정한 오늘의 운명은...",
                "두근두근... 심박수 체크 중...",
                "결과가 나오기 직전입니다! 🥁"
            ];

            let textIdx = 0;
            const textTimer = setInterval(() => {
                const el = document.getElementById('suspense-text');
                if (el) el.innerText = suspenseTexts[++textIdx % suspenseTexts.length];
            }, 800);

            setTimeout(() => {
                clearInterval(textTimer);
                wrap.style.display = 'block';

                const n = names.length;
                const colW = n > 8 ? 50 : 70; // 인원이 많으면 간격 축소
                const W = Math.max(n * colW + 40, 280);
                const H = 380;
                canvas.width = W; canvas.height = H;
                canvas.style.maxWidth = '100%';

                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, W, H);
                ctx.fillStyle = '#FFF0F6';
                ctx.fillRect(0, 0, W, H);

                const topY = 50, botY = H - 50;
                const cols = Array.from({length: n}, (_, i) => 20 + i * colW + (colW / 2));

                // 가로 연결선 생성
                const rungs = [];
                const levels = Math.floor((botY - topY) / 30);
                for (let lv = 0; lv < levels; lv++) {
                    const y = topY + lv * 30 + 15;
                    const usedCols = new Set();
                    for (let c = 0; c < n - 1; c++) {
                        if (!usedCols.has(c) && !usedCols.has(c+1) && Math.random() > 0.4) {
                            rungs.push({ y, c1: c, c2: c+1 });
                            usedCols.add(c); usedCols.add(c+1);
                        }
                    }
                }

                // 세로선
                ctx.lineWidth = n > 10 ? 2 : 3;
                cols.forEach(x => {
                    ctx.strokeStyle = '#F48FBD';
                    ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, botY); ctx.stroke();
                });
                // 가로선
                ctx.strokeStyle = '#C2185B';
                rungs.forEach(r => {
                    ctx.beginPath(); ctx.moveTo(cols[r.c1], r.y); ctx.lineTo(cols[r.c2], r.y); ctx.stroke();
                });

                // 이름/결과 텍스트 크기 조절
                const fontSize = n > 10 ? 10 : 12;
                ctx.font = `bold ${fontSize}px Pretendard, sans-serif`;
                ctx.textAlign = 'center';
                
                names.forEach((nm, i) => {
                    ctx.fillStyle = '#C2185B';
                    ctx.fillText(nm.length > 4 ? nm.slice(0,3)+'…' : nm, cols[i], topY - 10);
                });

                const finalResults = [];
                names.forEach((name, startCol) => {
                    let cur = startCol;
                    let y = topY;
                    const steps = rungs.filter(r => r.c1 === cur || r.c2 === cur).sort((a, b) => a.y - b.y);
                    
                    let lastY = topY;
                    steps.forEach(s => {
                        if (s.y > lastY) {
                            cur = (s.c1 === cur) ? s.c2 : s.c1;
                            lastY = s.y;
                        }
                    });
                    finalResults.push({ name, result: results[cur] || '행운 🍀' });
                });

                results.forEach((r, i) => {
                    ctx.fillStyle = '#1e40af';
                    const displayResult = r.length > (n > 10 ? 4 : 6) ? r.slice(0, n > 10 ? 3 : 5)+'…' : r;
                    ctx.fillText(displayResult, cols[i], botY + 18);
                });

                // 하나씩 보여주기 애니메이션
                resultDiv.innerHTML = `
                    <div style="background:linear-gradient(135deg,#FFF0F6,#F9E8FF); border-radius:20px; padding:20px; border:1.5px solid #FFB3D1; margin-bottom:12px; box-shadow:0 8px 30px rgba(194,24,91,0.15);">
                        <div style="font-size:16px; font-weight:900; color:#C2185B; margin-bottom:18px; text-align:center;">🥁 과연 결과는?!</div>
                        <div id="staggered-results"></div>
                    </div>
                `;

                const resWrap = document.getElementById('staggered-results');
                finalResults.forEach((res, i) => {
                    setTimeout(() => {
                        const item = document.createElement('div');
                        item.style.cssText = `
                            display:flex; justify-content:space-between; align-items:center; 
                            padding:12px 16px; background:var(--surface); border-radius:14px; margin-bottom:10px; 
                            border:1px solid #FFD6E8; opacity:0; transform:translateX(-20px); transition:all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                        `;
                        item.innerHTML = `
                            <span style="font-weight:800; color:var(--text-2); font-size:14px;">👤 ${res.name}</span>
                            <span style="background:linear-gradient(135deg,#C2185B,#E91E8C); color:#fff; border-radius:20px; padding:6px 16px; font-size:13px; font-weight:800; box-shadow:0 4px 10px rgba(194,24,91,0.2);">${res.result}</span>
                        `;
                        resWrap.appendChild(item);
                        
                        // 트리거 애니메이션
                        setTimeout(() => {
                            item.style.opacity = '1';
                            item.style.transform = 'translateX(0)';
                        }, 50);

                        // 마지막 항목일 때 스크롤 이동
                        if (i === finalResults.length - 1) {
                            setTimeout(() => item.scrollIntoView({behavior: 'smooth', block: 'end'}), 100);
                        }
                    }, i * 600 + 400); // 0.6초 간격으로 하나씩 등장
                });

            }, 2500); // 2.5초간 긴장감 로딩
        }

        /* ============================================================
           LUNCH PICKER (점심 메뉴 추천)
           ============================================================ */
        function initLunchPicker() {
            const container = document.getElementById('pg-step-lunch');
            if (!container) return;

            const menuCategories = [
                { label: '한식 🍚', items: ['된장찌개백반', '삼겹살', '비빔밥', '순두부찌개', '김치찌개', '갈비탕', '냉면', '국밥', '쌈밥', '제육볶음'] },
                { label: '중식 🥡', items: ['짜장면', '짬뽕', '볶음밥', '탕수육', '마라탕', '훠궈', '양꼬치', '부대찌개'] },
                { label: '일식 🍱', items: ['초밥', '우동', '라멘', '돈가스', '규동', '오니기리', '텐동', '야키소바'] },
                { label: '양식 🍝', items: ['파스타', '피자', '버거', '샌드위치', '스테이크', '리조또', '샐러드', '그라탕'] },
                { label: '분식 🥚', items: ['떡볶이', '순대', '김밥', '라면', '튀김', '핫도그', '도시락', '오뎅'] },
            ];

            container.innerHTML = `
                <div style="text-align:center; padding: 20px 0 10px;">
                    <div style="font-size:52px; margin-bottom:8px;">🍱</div>
                    <h2 style="font-size:22px; font-weight:900; color:var(--text-2); margin-bottom:6px;">점심 메뉴 추천</h2>
                    <p style="color:var(--text-5); font-size:13px; margin-bottom:20px;">오늘 뭐 먹을지 고민될 때, AI가 골라드려요 🎯</p>
                </div>

                <div style="background:var(--surface); border-radius:20px; padding:20px; margin-bottom:14px; border:1px solid #FFF0D0; box-shadow:0 4px 16px rgba(255,193,7,0.10);">
                    <div style="font-size:12px; font-weight:800; color:#E65100; margin-bottom:14px;">좋아하는 카테고리를 선택해요!</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${menuCategories.map((cat, i) => `
                            <button id="lunch-cat-${i}" onclick="toggleLunchCat(${i})" style="
                                padding:8px 14px; border-radius:20px; border:1.5px solid #FFD54F;
                                background:var(--surface-2); color:#E65100; font-size:13px; font-weight:700;
                                cursor:pointer; transition:all 0.2s; font-family:inherit;
                            ">${cat.label}</button>`).join('')}
                        <button id="lunch-cat-all" onclick="toggleLunchCat(-1)" style="
                            padding:8px 14px; border-radius:20px; border:1.5px solid #FFD54F;
                            background:var(--surface-2); color:#E65100; font-size:13px; font-weight:700;
                            cursor:pointer; transition:all 0.2s; font-family:inherit;
                        ">전부 다 🎲</button>
                    </div>
                </div>

                <div style="background:var(--surface); border-radius:20px; padding:20px; margin-bottom:20px; border:1px solid #FFF0D0; box-shadow:0 4px 16px rgba(255,193,7,0.10);">
                    <div style="font-size:12px; font-weight:800; color:#E65100; margin-bottom:12px;">⚡ 피하고 싶은 메뉴가 있나요?</div>
                    <input id="lunch-exclude" placeholder="예: 국밥, 마라탕" style="width:100%; padding:10px 12px; border-radius:10px; border:1.5px solid #FFD54F; font-size:14px; outline:none; font-family:inherit; box-sizing:border-box;"/>
                </div>

                <button onclick="pickLunch()" style="width:100%; background:linear-gradient(135deg,#FF8F00,#F57C00); color:#fff; border:none; border-radius:16px; padding:18px; font-size:16px; font-weight:900; cursor:pointer; box-shadow:0 6px 20px rgba(245,124,0,0.3); margin-bottom:12px;">
                    🎯 메뉴 골라줘!
                </button>

                <div id="lunch-result" style="display:none;"></div>

                <button onclick="pgShowAllSteps('menu')" style="width:100%; background:var(--surface-2); color:var(--text-5); border:1.5px solid var(--border); border-radius:14px; padding:14px; font-size:14px; font-weight:700; cursor:pointer; margin-top:8px;">
                    ← 놀이터 메뉴로
                </button>
            `;

            window.lunchState = { selectedCats: new Set(), categories: menuCategories, spinAttempts: 0 };
        }

        window.toggleLunchCat = function(idx) {
            const st = window.lunchState;
            const allBtn = document.getElementById('lunch-cat-all');
            if (idx === -1) {
                // 전부 선택
                st.selectedCats.clear();
                st.categories.forEach((_, i) => st.selectedCats.add(i));
                if (allBtn) { allBtn.style.background = 'linear-gradient(135deg,#FF8F00,#F57C00)'; allBtn.style.color = '#fff'; }
                st.categories.forEach((_, i) => {
                    const btn = document.getElementById('lunch-cat-' + i);
                    if (btn) { btn.style.background = 'linear-gradient(135deg,#FF8F00,#F57C00)'; btn.style.color = '#fff'; }
                });
                return;
            }
            // 개별 토글
            if (allBtn) { allBtn.style.background = 'var(--surface-2)'; allBtn.style.color = '#E65100'; }
            if (st.selectedCats.has(idx)) { st.selectedCats.delete(idx); }
            else { st.selectedCats.add(idx); }
            const btn = document.getElementById('lunch-cat-' + idx);
            if (btn) {
                btn.style.background = st.selectedCats.has(idx) ? 'linear-gradient(135deg,#FF8F00,#F57C00)' : '#f8fafc';
                btn.style.color = st.selectedCats.has(idx) ? '#fff' : '#E65100';
            }
        };

        window.pickLunch = function() {
            const st = window.lunchState;
            const excludeText = document.getElementById('lunch-exclude')?.value || '';
            const excludes = excludeText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

            let pool = [];
            const cats = st.selectedCats.size > 0 ? [...st.selectedCats] : st.categories.map((_, i) => i);
            cats.forEach(ci => pool.push(...st.categories[ci].items));
            pool = pool.filter(m => !excludes.some(ex => m.toLowerCase().includes(ex)));

            if (pool.length === 0) {
                alert('선택한 조건에 맞는 메뉴가 없어요! 조건을 조금 바꿔봐요 😅'); return;
            }

            // 횟수 증가
            st.spinAttempts++;
            
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const resultDiv = document.getElementById('lunch-result');
            
            let loadingMsg = "AI 엔진 풀가동! 침 고이는 중... 🤤";
            if (st.spinAttempts === 2) loadingMsg = "음.. 역시 한 번엔 안 되네요. 다시 찾는 중! ⚙️";
            if (st.spinAttempts === 3) loadingMsg = "🚨 최후 통첩! 영혼을 끌어모으고 있습니다 🚨";

            // 룰렛 UI
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div style="background:linear-gradient(135deg,#FFF8E8,#FFE9B3); border-radius:20px; padding:28px 20px; border:2px dashed #FFD54F; text-align:center; margin-bottom:12px; animation: pulse-border-lunch 1s infinite;">
                    <div style="font-size:50px; margin-bottom:10px; animation: spin 0.8s linear infinite; display:inline-block;">🎲</div>
                    <div style="font-size:12px; font-weight:800; color:#F57C00; letter-spacing:2px; margin-bottom:8px;">${loadingMsg}</div>
                    <div id="lunch-roulette-text" style="font-size:32px; font-weight:900; color:#E65100; margin-bottom:10px;">...</div>
                    <div style="font-size:13px; color:#F57C00; line-height:1.6;">(침 꼴깍 삼키는 소리 다 들려요 👂)</div>
                </div>
            `;
            resultDiv.scrollIntoView({behavior: 'smooth', block: 'center'});

            let spinCount = 0;
            const maxSpins = 20;
            const spinTimer = setInterval(() => {
                const rt = document.getElementById('lunch-roulette-text');
                if (rt) {
                    const tempPick = pool[Math.floor(Math.random() * pool.length)];
                    rt.innerText = tempPick;
                }
                spinCount++;
                
                if (spinCount >= maxSpins) {
                    clearInterval(spinTimer);
                    
                    const foodEmojis = {'한식': '🍚', '중식': '🥡', '일식': '🍱', '양식': '🍝', '분식': '🥚'};
                    const emoji = Object.entries(foodEmojis).find(([k]) => cats.some(ci => st.categories[ci].label.includes(k)))?.[1] || '🍽️';

                    let finalComments = [];
                    let btnText = "";
                    let btnDisabled = false;

                    if (st.spinAttempts === 1) {
                        finalComments = [
                            `팀장님한테 "${pick} 고고!" 외치러 가시죠! 🏃‍♂️`, 
                            `솔직히 지금 ${pick} 땡겼잖아요? 다 알아요 😎`,
                            `오늘 메뉴는 ${pick}!! 후회 없는 선택! 🎯`
                        ];
                        btnText = "🔄 솔직히 안 땡겨요.. 한 번 더! (1/3)";
                    } else if (st.spinAttempts === 2) {
                        finalComments = [
                            `이 정도면 타협하시죠? ${pick} 어때요? 😤`, 
                            `AI도 고민 많이 했어요.. ${pick} 고고! 🔥`,
                            `이번엔 진짜 ${pick} 드세요! 맛있을 거예요 🤷‍♂️`
                        ];
                        btnText = "🔄 흠.. 알겠어요 진짜 마지막 기회! (2/3)";
                    } else {
                        finalComments = [
                            `이게 최종의 최종의 찐최종입니다! ${pick} 가시죠! 🙏`, 
                            `더 이상은 못 돌려요! 운명의 결론은 ${pick}! 🛑`,
                            `지금 당장 겉옷 입고 ${pick} 드시러 출발!! 🚀`
                        ];
                        btnText = "❌ 더 이상은 안 돼요! 맛있게 드세요 (3/3 타격 완료)";
                        btnDisabled = true;
                    }

                    const comment = finalComments[Math.floor(Math.random() * finalComments.length)];

                    resultDiv.innerHTML = `
                        <div style="background:linear-gradient(135deg,#FFF8E8,#FFE9B3); border-radius:20px; padding:30px 20px; border:1.5px solid #FFD54F; text-align:center; margin-bottom:12px; animation:fadeUp 0.4s ease; box-shadow:0 8px 30px rgba(255,193,7,0.2);">
                            <div style="font-size:60px; margin-bottom:8px; animation:bounce 1.5s infinite;">${emoji}</div>
                            <div style="font-size:12px; font-weight:800; color:#F57C00; letter-spacing:3px; margin-bottom:12px;">🎉 오늘의 점심 확정 🎉</div>
                            <div style="font-size:40px; font-weight:900; color:#E65100; margin-bottom:16px; text-shadow: 2px 2px 0px #FFF0D0;">${pick}</div>
                            <div style="font-size:14px; font-weight:700; color:#F57C00; background:#FFF0D0; border-radius:12px; padding:10px 16px; display:inline-block; line-height:1.5;">${comment}</div>
                        </div>
                        <button onclick="${btnDisabled ? '' : 'pickLunch()'}" ${btnDisabled ? 'disabled' : ''} style="
                            width:100%; background:${btnDisabled ? '#e2e8f0' : 'linear-gradient(135deg,#FF8F00,#F57C00)'}; 
                            color:${btnDisabled ? '#94a3b8' : '#fff'}; border:none; border-radius:14px; padding:16px; 
                            font-size:15px; font-weight:800; cursor:${btnDisabled ? 'default' : 'pointer'}; 
                            margin-bottom:8px; box-shadow:${btnDisabled ? 'none' : '0 4px 12px rgba(245,124,0,0.3)'}; 
                            transition:all 0.2s;
                        ">
                            ${btnText}
                        </button>
                    `;
                }
            }, 80);
        };

        initDashboard();
        initPlayground();
        initAdminAccess();
    };

    /* --- Admin Access (Secret Unlock) --- */
    function initAdminAccess() {
        const adminBtn = document.getElementById('open-newsletter');
        // Check if already unlocked
        if (localStorage.getItem('isSabokAdmin') === 'true' && adminBtn) {
            adminBtn.style.display = 'flex';
        }

        const logoElement = document.querySelector('.header-logo');
        if (!logoElement) return;

        let clickCount = 0;
        let clickTimer;

        logoElement.addEventListener('click', () => {
            clickCount++;

            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                clickCount = 0; // Reset after 1 second of inactivity
            }, 1000);

            if (clickCount >= 5) {
                clickCount = 0;

                // Already admin?
                if (localStorage.getItem('isSabokAdmin') === 'true') {
                    alert('이미 최고 관리자 모드가 활성화되어 있습니다.');
                    return;
                }

                const pw = prompt('최고 관리자 접속 비밀번호를 입력하세요:');
                if (pw === '사복마스터' || pw === '사복천재') {
                    localStorage.setItem('isSabokAdmin', 'true');
                    alert('최고 관리자 인증 성공! 앱을 새로고침하거나 잠시 후 마스터룸 메뉴가 나타납니다.');
                    if (adminBtn) adminBtn.style.display = 'flex';
                } else if (pw !== null) {
                    alert('비밀번호가 틀렸습니다.');
                }
            }
        });
    }

    /* ==========================================================================
       PLAYGROUND: Welfare Type Test (나의 복지사 유형 테스트)
       ========================================================================== */

    const pgQuestions = [
        { id: 1, situation: "월요일 아침, 책상에 앉자마자", q: "가장 먼저 하는 일은?", a: { text: "이번 주 업무·행정 일정부터 파악한다 🗂️", axis: "record" }, b: { text: "주말 동안 무슨 일 없었는지 안부 확인부터 📞", axis: "relation" }, c: { text: "커피 한 잔 마시며 오늘 하루 마음의 준비를 한다 ☕", axis: "feel" } },
        { id: 2, situation: "슈퍼바이저가 '이 케이스 어떻게 생각해?' 물었을 때", q: "나의 반응은?", a: { text: "관련 법령·지침 찾아서 정확한 근거로 답한다", axis: "data" }, b: { text: "기존에 비슷한 성공 프로그램 사례를 떠올려 본다", axis: "creator" }, c: { text: "팀 동료들과 대화하며 다양한 의견을 모아본다 🗣️", axis: "relation" } },
        { id: 3, situation: "퇴근 30분 전, 긴급 민원이 들어왔다", q: "나는?", a: { text: "일단 내가 할 수 있는 데까지 다 해본다 🔥", axis: "hero" }, b: { text: "내일 가능한 시간 안내하고 딱 맞게 퇴근한다 🧘", axis: "balance" }, c: { text: "주변 유관기관에 즉시 도움을 청할 수 있는지 알아본다 🤝", axis: "networker" } },
        { id: 4, situation: "사업 보고서 마감이 내일이다", q: "나의 상태는?", a: { text: "이미 다 써놨음 (초안은 있음)", axis: "record" }, b: { text: "오늘 밤을 불태워 영혼을 갈아넣을 예정 🌙", axis: "feel" }, c: { text: "현장에서 직접 발로 뛰며 부족한 내용을 채워넣는다 🏃", axis: "hero" } },
        { id: 5, situation: "동료가 많이 힘들다고 털어놨다", q: "나의 반응은?", a: { text: "같이 공감해주고 밥이나 술 한잔 사준다 🍚", axis: "empath" }, b: { text: "바로 관련 기관이나 자원을 연결해준다 🤝", axis: "networker" }, c: { text: "나중에 행정적으로 문제되지 않게 기록을 잘 남기라고 조언한다 📖", axis: "record" } },
        { id: 6, situation: "새 복지 제도가 생겼다는 소식을 들었다", q: "나의 첫 반응은?", a: { text: "지침 파일 열어보고 꼼꼼히 분석해본다", axis: "data" }, b: { text: "우리 기관에서 이거로 새 사업 해볼까 기획한다", axis: "creator" }, c: { text: "이 제도가 클라이언트의 마음에 상처가 되진 않을지 걱정한다 💛", axis: "empath" } },
        { id: 7, situation: "가장 보람 느끼는 순간", q: "어떤 순간인가요?", a: { text: "나로 인해 클라이언트의 표정이 밝아졌을 때 ✨", axis: "hero" }, b: { text: "내 워라밸 지키면서도 업무를 완벽히 쳐냈을 때", axis: "balance" }, c: { text: "내가 낸 참신한 아이디어가 사업으로 선정되었을 때 💡", axis: "creator" } },
        { id: 8, situation: "회의 중", q: "나의 발언 스타일은?", a: { text: "주변 기관과 엮어서 시너지 내는 걸 좋아한다", axis: "networker" }, b: { text: "현장 경험을 바탕으로 감성에 호소한다", axis: "feel" }, c: { text: "팩트와 수치를 근거로 논리적으로 설득한다 📊", axis: "data" } },
        { id: 9, situation: "업무 중 가장 스트레스 받는 순간", q: "언제인가요?", a: { text: "클라이언트나 동료가 마음을 닫았을 때", axis: "empath" }, b: { text: "복잡한 행정 서류가 산더미처럼 쌓였을 때", axis: "hero" }, c: { text: "충분히 쉬지 못해 나만의 평정심을 잃었을 때 🧘", axis: "balance" } },
        { id: 10, situation: "나의 책상은", q: "어떤 모습인가요?", a: { text: "정리정돈 완료, 서류는 폴더별 분류 🗂️", axis: "record" }, b: { text: "회의록, 아이디어 메모가 여기저기 흩어져 있음", axis: "creator" }, c: { text: "클라이언트가 준 작은 선물과 감사 편지들이 놓여 있음 🎁", axis: "empath" } },
        { id: 11, situation: "신입 복지사가 들어왔다", q: "나는 어떻게 하나요?", a: { text: "업무 매뉴얼, 지침서 주며 통계 보는 법을 알려준다", axis: "data" }, b: { text: "다른 기관 선생님들부터 먼저 소개해준다", axis: "networker" }, c: { text: "복지사로서 가져야 할 철학과 마음가짐부터 이야기해준다", axis: "feel" } },
        { id: 12, situation: "오늘 하루를 한 단어로 표현하면", q: "어떤 단어가 떠오르나요?", a: { text: '"공감" — 마음이 무거운 하루였다 🌧️', axis: "empath" }, b: { text: '"연결" — 사람과 사람을 엮어냈다 🤝', axis: "relation" }, c: { text: '"정리" — 밀린 서류를 완벽히 털어낸 후련한 하루였다 🗂️', axis: "record" } },
    ];

    const pgTypes = {
        hero: { emoji: "🦸", name: "현장의 영웅형", sub: "발이 닳도록 뛰는 사람", color: "#FF6B6B", color2: "#FF3F3F", bg: "linear-gradient(135deg,#FF6B6B,#FF8E8E)", card: "#FFF5F5", desc: "책상보다 현장이 편하고 클라이언트 얼굴을 직접 봐야 직성이 풀리는 타입. 포기하지 않는 끈기가 무기예요.", strengths: ["클라이언트 신뢰 No.1", "위기 대처 탁월", "발로 뛰는 자원발굴"], cautions: ["번아웃 위험 1위", "기록 미루는 경향", "경계 설정 어려움"], peer: "저 선생님한테 맡기면 진짜 다 해결돼", message: "오늘도 누군가의 세상을 바꿨을 거예요 🌟" },
        recorder: { emoji: "📋", name: "기록의 신형", sub: "이 세상 모든 서류는 내가 지킨다", color: "#4ECDC4", color2: "#2BADA4", bg: "linear-gradient(135deg,#4ECDC4,#6EE7E2)", card: "#F0FFFE", desc: "기록 하나도 허투루 안 쓰고 지침은 줄줄이 외우는 타입. 팀의 든든한 버팀목이에요.", strengths: ["꼼꼼한 업무 처리", "팀 내 표준 제시", "감사·점검 무결"], cautions: ["완벽주의 번아웃", "유연성 부족", "높은 기준으로 마찰"], peer: "저 선생님 기록은 진짜 교과서야", message: "완벽하지 않아도 괜찮아요, 오늘도 충분했어요 💚" },
        empath: { emoji: "💛", name: "공감 마스터형", sub: "모두의 감정 쓰레기통", color: "#F5A623", color2: "#D88900", bg: "linear-gradient(135deg,#F5A623,#F7C15E)", card: "#FFFDF0", desc: "클라이언트든 동료든 일단 다 들어주는 타입. 사무실의 정서적 안전망 역할을 자연스럽게 맡고 있어요.", strengths: ["팀 분위기 메이커", "라포 형성 최강", "감정 민감도 강점"], cautions: ["감정 소진 위험", "내 감정 돌봄 부족", "거절이 어려움"], peer: "저 선생님한테 얘기하면 왜인지 마음이 편해져", message: "남의 마음을 챙기는 당신, 오늘은 내 마음도 챙겨요 🌼" },
        analyst: { emoji: "📊", name: "데이터 전도사형", sub: "근거 없으면 말도 않는다", color: "#F59E0B", color2: "#4940D4", bg: "linear-gradient(135deg,#F59E0B,#9B94FF)", card: "#F5F4FF", desc: "통계와 지침으로 무장한 근거기반 실천의 달인. 회의에서 데이터 꺼내드는 순간 팀 분위기가 바뀌는 타입.", strengths: ["보고서 완성도 최상", "정책 변화 빠른 대응", "팀 전문성 향상"], cautions: ["숫자에 치우쳐 사람 잊음", "타이밍 놓치는 경향", "융통성 부족"], peer: "저 선생님이 있으면 발표 준비 걱정 없어", message: "데이터 뒤에 있는 한 사람의 이야기도 기억해요 💙" },
        creator: { emoji: "🎨", name: "프로그램 크리에이터형", sub: "사업계획서 쓸 때 눈이 빛난다", color: "#FF9A3C", color2: "#E07010", bg: "linear-gradient(135deg,#FF9A3C,#FFB76B)", card: "#FFF8F0", desc: "없는 사업도 만들어내고 아이디어가 넘쳐 주체를 못 하는 타입. 기획서만 보면 손이 근질근질해요.", strengths: ["신규 사업 기획 탁월", "공모사업 강점", "팀 활력 담당"], cautions: ["마무리가 약한 경향", "행정 업무 지루함", "너무 많이 벌여놓음"], peer: "저 선생님 아이디어는 진짜 어디서 나오는 거야", message: "오늘의 아이디어가 내일의 누군가를 구할 거예요 🧡" },
        networker: { emoji: "🤝", name: "네트워크 달인형", sub: "모르는 사람이 없다", color: "#26C6DA", color2: "#0097A7", bg: "linear-gradient(135deg,#26C6DA,#4DD0E1)", card: "#F0FEFF", desc: "지역사회 자원 연결의 달인. 명함 한 장으로 모든 걸 해결하고 어디서든 이미 아는 사람이 있는 타입.", strengths: ["자원 연계 최강", "다기관 협력 능숙", "정보 수집 1위"], cautions: ["관계 유지 에너지 소모", "연계에만 치우침", "경계가 모호해짐"], peer: "저 선생님한테 물어보면 어디든 연결해줘", message: "당신이 이은 연결고리가 누군가의 생명줄이에요 🌊" },
        navigator: { emoji: "🧭", name: "시스템 내비게이터형", sub: "복지 자원의 살아있는 지도", color: "#8E44AD", color2: "#7D3C98", bg: "linear-gradient(135deg,#8E44AD,#BB8FCE)", card: "#F8F0FC", desc: "어떤 어려운 상황이라도 적절한 제도와 자원을 찾아내 길을 안내하는 타입. 복잡한 복지 체계의 해결사에요.", strengths: ["정보 검색 속도 No.1", "유관기관 협력 구축", "전문적 정보 가공"], cautions: ["지침 업데이트 강박", "실행보다 정보 과잉", "설명이 너무 길어짐"], peer: "선생님은 모르는 정보가 없는 것 같아", message: "당신의 안내가 누군가의 어두운 길에 등불이 됩니다 💜" },
        balancer: { emoji: "⚖️", name: "워크라이프 밸런서형", sub: "효율과 휴식의 마스터", color: "#27AE60", color2: "#1E8449", bg: "linear-gradient(135deg,#27AE60,#58D68D)", card: "#F1FBF4", desc: "업무 효율을 극대화하여 나만의 시간도 지켜내는 타입. 여유로우면서도 성과를 내는 팀의 부러움의 대상이죠.", strengths: ["시간 관리 최상", "업무 우선순위 탁월", "번아웃 자가 관리"], cautions: ["동료의 속도에 가끔 답답함", "너무 쿨해서 정없어 보임", "예외 상황에 스트레스"], peer: "어떻게 그렇게 여유롭게 일을 다 끝내셔?", message: "당신의 여유가 팀 전체의 숨통이 되어줍니다 🌿" },
        leader: { emoji: "🏢", name: "비전 디렉터형", sub: "팀의 성장을 설계하는 전략가", color: "#2C3E50", color2: "#1A252F", bg: "linear-gradient(135deg,#2C3E50,#566573)", card: "#F4F6F7", desc: "팀 전체의 그림을 보고 방향을 제시하는 사람. 실무를 넘어 미래의 비전을 제시하는 리더십의 소유자에요.", strengths: ["갈등 중재 및 조정", "팀원 강점 발굴", "중장기 전략 수립"], cautions: ["세부 실무 소홀함", "결과에 대한 책임감 부담", "소신 발언의 고립"], peer: "저 선생님 말대로 하면 진짜 잘될 것 같아", message: "당신의 리더십이 더 나은 세상을 만드는 설계도입니다 🏛️" },
        advocate: { emoji: "📢", name: "인권 가디언형", sub: "목소리 없는 이들의 확성기", color: "#E74C3C", color2: "#C0392B", bg: "linear-gradient(135deg,#E74C3C,#F1948A)", card: "#FDEDEC", desc: "불합리한 제도나 상황에 맞서 클라이언트의 권리를 당당히 주장하는 타입. 현장의 변화를 이끄는 핵심 동력입니다.", strengths: ["강력한 추진력", "변화 지향적 마인드", "클라이언트 옹호 강점"], cautions: ["타 직종과 잦은 충돌", "심리적 에너지 소모", "냉철한 이성 부족"], peer: "선생님이 있어서 억울한 분들이 줄어들어요", message: "당신의 목소리가 누군가에게는 유일한 희망입니다 📣" }
    };

    let pgState = {
        current: 0,
        answers: [],
        animating: false,
        resultType: null,
        stats: null,
        statsLoading: true
    };
    // 인라인 onmouseenter 핸들러가 window.pgState를 참조하므로 반드시 노출
    window.pgState = pgState;

    function initPlayground() {
        // Build intro types preview
        const introTypesCont = document.getElementById('pg-intro-types');
        if (introTypesCont) {
            let html = '';
            for (const [k, v] of Object.entries(pgTypes)) {
                html += `<div style="background:${v.card}; border:1.5px solid ${v.color}22; border-radius:20px; padding:5px 10px; font-size:11px; color:${v.color}; font-weight:700;">${v.emoji} ${v.name.replace("형", "")}</div>`;
            }
            introTypesCont.innerHTML = html;
        }
    }

    // Navigational Functions
    window.pgStartQuiz = function () {
        pgState.current = 0;
        pgState.answers = [];
        pgState.resultType = null;
        pgShowStep('quiz');
        pgRenderQuestion();
    };

    window.pgHandleBack = function () {
        if (pgState.animating) return;
        if (pgState.current === 0) {
            document.getElementById('pg-back-confirm').style.display = 'flex';
        } else {
            pgState.current--;
            pgState.answers.pop();
            pgRenderQuestion();
        }
    };

    window.pgCancelBack = function () {
        document.getElementById('pg-back-confirm').style.display = 'none';
    };

    window.pgConfirmExit = function () {
        document.getElementById('pg-back-confirm').style.display = 'none';
        pgShowStep('intro');
    };

    window.pgRestart = function () {
        pgState.current = 0;
        pgState.answers = [];
        pgState.resultType = null;
        pgState.stats = null;
        pgShowStep('intro');
    };

    // 모든 스텝(메뉴 포함)을 통합 관리하는 함수
    /* ============================================================
       사복 밸런스 게임 (15단계)
       - 공유 링크에 내 답을 담아(?bg=ABBA...&bgn=닉네임) 친구가 풀면 일치율을 보여준다 (서버 저장 없음)
       - 일부 문항에만 성향 태그(chill=워라밸 / passion=열정)를 달아 결과 유형을 정한다
       ============================================================ */
    // 선택지 = [이모지, 본문, 함정 한 줄]. 양쪽 다 장점과 함정이 있어야 고민되는 게 밸런스 게임의 맛
    const BALANCE_QS = [
        { a: ['😇', '착한데 일 못하는 기관장님', '야근은 늘 내 몫, 대신 간식은 매일'], b: ['😈', '인성 별론데 일 잘하는 기관장님', '칼퇴 보장, 멘탈은 보장 못 함'] },
        { a: ['💸', '월급 100만 원 더', '대신 자리가 기관장님 바로 옆'], b: ['🪟', '월급 그대로', '대신 창가 끝자리 독방'], tag: ['passion', 'chill'] },
        { a: ['🏆', '기안 한 방에 통과', '근데 공은 다 기관장님이 가져감'], b: ['🔁', '반려 10번 당함', '근데 최종 표창은 내 이름으로'] },
        { a: ['🥂', '회식 법카 무제한', '대신 매주 금요일 저녁'], b: ['🚫', '회식 평생 없음', '대신 아무도 밥 안 사줌'], tag: ['passion', 'chill'] },
        { a: ['🗣️', '일 잘하는데 TMI 폭격기 동료', '점심시간 내내 연애 상담'], b: ['🤐', '일 잘하는데 말 한마디 안 하는 동료', '하루 대화가 "네" 한 마디'] },
        { a: ['🙈', '메신저 읽씹하는 기관장님', '급한 결재도 묵묵부답'], b: ['🌙', '새벽 2시에 칭찬 카톡 하는 기관장님', '좋은 말인데 잠이 깸'] },
        { a: ['💥', '평가 전날 서류 파일 증발', '백업은 없음'], b: ['😱', '평가 당일 심사위원이', '내 전 직장 사수'] },
        { a: ['💰', '연봉 1,000만 원 인상', '대신 주말 행사 매주 출근'], b: ['🌴', '연봉 동결', '대신 주 4일 근무'], tag: ['passion', 'chill'] },
        { a: ['🤖', '내 일 다 해주는 AI', '말투가 기관장님이랑 똑같음'], b: ['✨', '아무것도 못 하는 AI', '말투는 최애 아이돌'] },
        { a: ['🐣', '신입이 나보다 일을 잘함', '내 노하우가 필요 없음'], b: ['💳', '신입이 나보다 월급이 많음', '호봉 계산 실수라는데 안 고침'] },
        { a: ['🚇', '칼퇴 가능', '근데 퇴근길 지하철 매일 기관장님이랑 같이 감'], b: ['🍗', '야근 확정', '근데 사무실에 나 혼자 + 치킨 법카'], tag: ['chill', 'passion'] },
        { a: ['🎉', '내 프로그램 대박', '근데 공은 옆 팀이 가져감'], b: ['🫥', '내 프로그램 폭망', '근데 아무도 모름'] },
        { a: ['🏝️', '휴가 2주', '대신 업무폰 들고 가기'], b: ['📴', '휴가 3일', '대신 완전 연락 두절'], tag: ['passion', 'chill'] },
        { a: ['❄️', '사무실 에어컨 리모컨 평생 내 거', '대신 점심 메뉴는 평생 남이 정함'], b: ['🍜', '점심 메뉴 결정권 평생 내 거', '대신 에어컨은 평생 남이 정함'] },
        { a: ['📈', '처우 확 좋아짐', '대신 서류가 2배'], b: ['📉', '처우 그대로', '대신 서류가 절반'], tag: ['passion', 'chill'] },
    ];
    const BALANCE_TYPES = {
        chill:   { emoji: '🛋️', name: '워라밸 수호 사복쌤', desc: '지치지 않아야 오래 도울 수 있다는 걸 아는 현명한 타입. 칼퇴는 권리, 휴가는 신성해요!' },
        balance: { emoji: '⚖️', name: '실속 균형 사복쌤', desc: '일도 삶도 적당히, 상황 따라 유연하게. 어느 팀에 가도 잘 맞는 든든한 타입이에요.' },
        passion: { emoji: '🔥', name: '현장 열정 만렙 사복쌤', desc: '몸은 피곤해도 마음은 늘 현장에. 동료들이 기대는 버팀목이지만, 가끔은 꼭 쉬어가요!' },
    };
    const bgState = { idx: 0, answers: [], friend: null, friendName: '' };

    function bgEsc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    // 공유 링크로 들어온 경우: 친구 답(15자 A/B)과 닉네임을 읽어 둔다
    function bgReadFriendFromUrl() {
        try {
            const q = new URLSearchParams(window.location.search);
            const bg = (q.get('bg') || '').toUpperCase();
            if (/^[AB]{15}$/.test(bg)) {
                bgState.friend = bg.split('');
                bgState.friendName = (q.get('bgn') || '동료').slice(0, 12);
            }
        } catch (e) { /* noop */ }
    }

    window.initBalanceGame = function () {
        bgReadFriendFromUrl();
        bgState.idx = 0;
        bgState.answers = [];
        bgRenderIntro();
    };

    function bgRoot() { return document.getElementById('pg-step-balance'); }

    function bgRenderIntro() {
        const friendLine = bgState.friend
            ? `<div style="background:#fff7d6; border:1px solid #fde68a; color:#92400e; border-radius:14px; padding:12px 14px; font-size:13.5px; font-weight:700; margin-bottom:16px;">💌 <b>${bgEsc(bgState.friendName)}</b>님이 도전장을 보냈어요!<br><span style="font-weight:500;">다 풀면 둘의 일치율을 알려드려요</span></div>`
            : '';
        bgRoot().innerHTML = `
            <div style="text-align:center; padding:18px 0 8px;">
                <div style="font-size:54px; margin-bottom:6px;">⚖️</div>
                <div style="font-size:11px; letter-spacing:3px; color:var(--text-6); font-weight:700; margin-bottom:6px;">BALANCE GAME</div>
                <h2 style="font-size:24px; font-weight:900; color:var(--text-1); line-height:1.35; margin-bottom:8px;">사복 밸런스 게임</h2>
                <p style="font-size:14px; color:var(--text-5); line-height:1.6; margin-bottom:20px;">둘 중 <b>하나만</b> 골라야 한다면?<br>15단계 극한 선택, 고민은 짧게! ⏱</p>
                ${friendLine}
                <button onclick="bgStart()" style="width:100%; border:none; border-radius:16px; padding:17px; font-size:17px; font-weight:900; color:#fff; background:linear-gradient(135deg,#2563eb,#0c9488); box-shadow:0 8px 20px rgba(37,99,235,0.25); cursor:pointer; font-family:inherit;">시작하기 →</button>
                <button onclick="pgShowAllSteps('menu')" style="margin-top:12px; background:none; border:none; color:var(--text-5); font-size:13px; cursor:pointer; font-family:inherit;">← 놀이터로</button>
            </div>`;
        pgResetScroll();
    }

    window.bgStart = function () { bgState.idx = 0; bgState.answers = []; bgRenderQuestion(); };

    function bgRenderQuestion() {
        const i = bgState.idx, q = BALANCE_QS[i], n = BALANCE_QS.length;
        const opt = (key, o, color) => `
            <button onclick="bgPick('${key}')" class="bg-opt" style="width:100%; min-height:120px; border:2px solid ${color}33; background:${color}0d; border-radius:20px; padding:18px 16px; cursor:pointer; font-family:inherit; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; transition:transform .12s, background .15s;">
                <span style="font-size:34px; line-height:1;">${o[0]}</span>
                <span style="font-size:17px; font-weight:900; color:var(--text-1); line-height:1.4; word-break:keep-all; text-align:center;">${bgEsc(o[1])}</span>
                ${o[2] ? `<span style="font-size:13.5px; font-weight:600; color:var(--text-5); line-height:1.45; word-break:keep-all; text-align:center;">${bgEsc(o[2])}</span>` : ''}
            </button>`;
        bgRoot().innerHTML = `
            <div style="padding-top:6px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <button onclick="${i > 0 ? 'bgPrev()' : 'bgRenderIntroBack()'}" style="background:none; border:none; color:var(--text-5); font-size:13px; font-weight:700; cursor:pointer; padding:4px 0; font-family:inherit;">← ${i > 0 ? '이전' : '처음'}</button>
                    <span style="font-size:13px; font-weight:900; color:#2563eb;">${i + 1} / ${n}</span>
                </div>
                <div style="height:8px; background:var(--surface-3); border-radius:999px; overflow:hidden; margin-bottom:22px;">
                    <div style="height:100%; width:${Math.round((i / n) * 100)}%; background:linear-gradient(90deg,#2563eb,#0c9488); border-radius:999px; transition:width .3s;"></div>
                </div>
                <div style="text-align:center; font-size:15px; font-weight:800; color:var(--text-4); margin-bottom:16px;">둘 중 하나만 골라야 한다면? 🤔</div>
                ${opt('A', q.a, '#2563eb')}
                <div style="text-align:center; margin:10px 0; font-size:18px; font-weight:900; color:#e05a3a;">VS</div>
                ${opt('B', q.b, '#0c9488')}
            </div>`;
        pgResetScroll();
    }
    window.bgRenderIntroBack = function () { bgRenderIntro(); };

    window.bgPick = function (key) {
        const btns = bgRoot().querySelectorAll('.bg-opt');
        const chosen = btns[key === 'A' ? 0 : 1];
        if (chosen) { chosen.style.transform = 'scale(0.97)'; chosen.style.background = key === 'A' ? '#dbeafe' : '#ccfbf1'; }
        btns.forEach(b => { b.disabled = true; });
        bgState.answers[bgState.idx] = key;
        setTimeout(() => {
            bgState.idx++;
            if (bgState.idx >= BALANCE_QS.length) bgRenderResult();
            else bgRenderQuestion();
        }, 220);
    };
    window.bgPrev = function () { if (bgState.idx > 0) { bgState.idx--; bgRenderQuestion(); } };

    function bgResultType() {
        let chill = 0, tagged = 0;
        BALANCE_QS.forEach((q, i) => {
            if (!q.tag) return;
            tagged++;
            if (q.tag[bgState.answers[i] === 'A' ? 0 : 1] === 'chill') chill++;
        });
        const r = chill / tagged;
        return r >= 0.7 ? 'chill' : (r <= 0.3 ? 'passion' : 'balance');
    }

    function bgShareUrl() {
        const name = (localStorage.getItem('saboks_anonymous_name') || '사복쌤').slice(0, 12);
        return location.origin + location.pathname + '?bg=' + bgState.answers.join('') + '&bgn=' + encodeURIComponent(name) + '#playground/balance';
    }

    function bgRenderResult() {
        trackUse('balance_done');
        const t = BALANCE_TYPES[bgResultType()];
        let compare = '';
        if (bgState.friend) {
            const same = bgState.answers.filter((a, i) => a === bgState.friend[i]).length;
            const pct = Math.round(same / BALANCE_QS.length * 100);
            const msg = pct >= 80 ? '거의 영혼의 단짝! 같은 팀 하세요 🤝' : pct >= 60 ? '꽤 잘 맞는 사이! 회식 메뉴는 금방 정하겠네요 🍽️' : pct >= 40 ? '반반! 서로 다른 매력이 있어요 🙂' : '정반대 스타일! 그래서 더 좋은 팀이 될지도 😆';
            const diffs = BALANCE_QS.map((q, i) => ({ q, i })).filter(x => bgState.answers[x.i] !== bgState.friend[x.i]).slice(0, 3)
                .map(x => `<li style="margin:6px 0;">나: <b>${bgEsc((bgState.answers[x.i] === 'A' ? x.q.a : x.q.b)[1])}</b><br><span style="color:var(--text-5);">${bgEsc(bgState.friendName)}: ${bgEsc((bgState.friend[x.i] === 'A' ? x.q.a : x.q.b)[1])}</span></li>`).join('');
            compare = `
                <div style="background:#fff7d6; border:1px solid #fde68a; border-radius:20px; padding:20px; margin-bottom:14px; text-align:center;">
                    <div style="font-size:13px; font-weight:800; color:#92400e; margin-bottom:4px;">${bgEsc(bgState.friendName)}님과의 일치율</div>
                    <div style="font-size:52px; font-weight:900; color:#b45309; line-height:1.1;">${pct}%</div>
                    <div style="font-size:14px; font-weight:700; color:#78350f; margin-top:6px;">${msg}</div>
                    ${diffs ? `<ul style="list-style:none; text-align:left; font-size:13px; margin-top:14px; padding-top:12px; border-top:1px dashed #fcd34d; line-height:1.5;"><li style="font-weight:800; color:#92400e; margin-bottom:4px;">이건 서로 달랐어요</li>${diffs}</ul>` : ''}
                </div>`;
        }
        const picks = BALANCE_QS.map((q, i) => {
            const o = bgState.answers[i] === 'A' ? q.a : q.b;
            return `<div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--border); font-size:13.5px;"><span style="flex:none; width:22px; font-weight:900; color:#2563eb;">${i + 1}</span><span style="flex:none;">${o[0]}</span><span style="color:var(--text-2); font-weight:700; word-break:keep-all;">${bgEsc(o[1])}</span></div>`;
        }).join('');
        bgRoot().innerHTML = `
            <div style="padding-top:8px;">
                ${compare}
                <div style="background:linear-gradient(135deg,#2563eb,#0c9488); color:#fff; border-radius:22px; padding:24px 20px; text-align:center; margin-bottom:14px; box-shadow:0 10px 24px rgba(37,99,235,0.22);">
                    <div style="font-size:12px; font-weight:700; opacity:0.85; margin-bottom:6px;">나의 사복 밸런스 유형</div>
                    <div style="font-size:48px; line-height:1.1; margin-bottom:6px;">${t.emoji}</div>
                    <div style="font-size:22px; font-weight:900; margin-bottom:8px;">${t.name}</div>
                    <div style="font-size:14px; line-height:1.6; opacity:0.95; word-break:keep-all;">${t.desc}</div>
                </div>
                <button onclick="bgShare()" id="bg-share-btn" style="width:100%; border:none; border-radius:16px; padding:16px; font-size:16px; font-weight:900; color:#78350f; background:#fde68a; cursor:pointer; font-family:inherit; margin-bottom:10px;">💌 동료한테 도전장 보내기</button>
                <p style="font-size:12px; color:var(--text-5); text-align:center; margin:0 0 18px;">링크로 풀면 나와의 일치율이 나와요</p>
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:14px 16px; margin-bottom:14px;">
                    <div style="font-size:13px; font-weight:900; color:var(--text-3); margin-bottom:4px;">📝 내가 고른 15개</div>
                    ${picks}
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button onclick="bgRestart()" style="border:1px solid var(--border); background:var(--surface); border-radius:14px; padding:13px; font-size:14px; font-weight:800; color:var(--text-3); cursor:pointer; font-family:inherit;">🔄 다시 하기</button>
                    <button onclick="pgShowAllSteps('menu')" style="border:1px solid var(--border); background:var(--surface); border-radius:14px; padding:13px; font-size:14px; font-weight:800; color:var(--text-3); cursor:pointer; font-family:inherit;">🎪 놀이터로</button>
                </div>
            </div>`;
        pgResetScroll();
    }

    window.bgRestart = function () {
        // 다시 할 땐 내 기준으로 풀도록 친구 비교 정보를 지우고 주소의 ?bg도 정리
        bgState.friend = null; bgState.friendName = '';
        try { history.replaceState(null, '', location.pathname + '#playground/balance'); } catch (e) { /* noop */ }
        bgRenderIntro();
    };

    window.bgShare = async function () {
        const t = BALANCE_TYPES[bgResultType()];
        const url = bgShareUrl();
        const text = `나는 '${t.name}' ${t.emoji}\n사복 밸런스 게임 15단계, 너는 뭐 고를래? 나랑 일치율 확인해봐!`;
        try {
            if (navigator.share) { await navigator.share({ title: '사복 밸런스 게임', text, url }); return; }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        try {
            await navigator.clipboard.writeText(text + '\n' + url);
            const btn = document.getElementById('bg-share-btn');
            if (btn) { btn.textContent = '✅ 링크 복사됨! 카톡에 붙여넣기'; setTimeout(() => { btn.textContent = '💌 동료한테 도전장 보내기'; }, 2200); }
        } catch (e) { prompt('이 링크를 복사해서 보내주세요', url); }
    };

    function pgShowAllSteps(stepName) {
        ['menu', 'intro', 'quiz', 'loading', 'result', 'ladder', 'lunch', 'balance'].forEach(s => {
            const el = document.getElementById('pg-step-' + s);
            if (el) el.style.display = (s === stepName) ? 'block' : 'none';
        });
        pgResetScroll();
    }

    // 스텝 전환·다시하기 후 이전 스크롤 위치 때문에 화면 상단이 잘려 보이는 것 방지
    // (#view-playground는 overflow:hidden이지만 scrollIntoView가 몰래 스크롤시킬 수 있어 함께 리셋)
    function pgResetScroll() {
        const main = document.querySelector('.app-main');
        if (main) main.scrollTop = 0;
        const view = document.getElementById('view-playground');
        if (view) view.scrollTop = 0;
        window.scrollTo(0, 0);
    }

    function pgShowStep(stepName) {
        pgShowAllSteps(stepName);
    }

    function pgRenderQuestion() {
        const q = pgQuestions[pgState.current];
        const pct = Math.round((pgState.current / pgQuestions.length) * 100);

        document.getElementById('pg-q-num').innerText = `Q${pgState.current + 1} / ${pgQuestions.length}`;
        document.getElementById('pg-q-pct').innerText = `${pct}%`;
        document.getElementById('pg-q-progress').style.width = `${pct}%`;

        document.getElementById('pg-q-situation').innerText = q.situation;
        document.getElementById('pg-q-text').innerText = q.q;

        const optionsHtml = [q.a, q.b, q.c].map((opt, i) => {
            const labels = ["A", "B", "C"];
            return `
            <button onclick="pgHandleAnswer('${opt.axis}', this)" style="
                width:100%; display:block; text-align:left; background:var(--surface);
                border:2px solid var(--border); border-radius:16px; padding:14px 20px; margin-bottom:8px;
                font-size:14px; font-weight:600; color:var(--text-2); cursor:pointer;
                transition:all 0.18s; line-height:1.4; font-family:inherit;
            " onmouseenter="if(!window.pgState.animating) this.style.border='2px solid #F59E0B55'" onmouseleave="if(!this.dataset.selected) this.style.border='2px solid #f0f0f0'">
                <span style="font-weight:800; margin-right:10px; color:#F59E0B; font-size:15px;">${labels[i]}</span>
                ${opt.text}
            </button>`;
        }).join('');

        document.getElementById('pg-q-options').innerHTML = optionsHtml;
    }

    window.pgHandleAnswer = function (axis, btnEl) {
        if (pgState.animating) return;
        pgState.animating = true;

        // Visual feedback
        btnEl.dataset.selected = 'true';
        btnEl.style.background = "linear-gradient(135deg,#FF6B6B18,#F59E0B18)";
        btnEl.style.border = "2px solid #F59E0B";

        Array.from(document.getElementById('pg-q-options').children).forEach(child => {
            if (child !== btnEl) child.style.opacity = 0.45;
        });

        setTimeout(() => {
            pgState.answers.push(axis);

            if (pgState.answers.length >= pgQuestions.length) {
                pgProcessResult();
            } else {
                pgState.current++;
                pgRenderQuestion();
            }
            pgState.animating = false;
        }, 450);
    };

    function pgGetType(ansArr) {
        const c = { record: 0, relation: 0, data: 0, creator: 0, hero: 0, balance: 0, feel: 0, empath: 0, networker: 0 };
        ansArr.forEach(a => { if (a) c[a]++; });

        // Upgraded Scoring Matrix (10 types, 9 axes)
        const typeScores = {
            hero: (c.hero * 1.5) + (c.feel * 0.5),
            recorder: (c.record * 1.5) + (c.data * 0.5),
            empath: (c.empath * 1.5) + (c.feel * 0.5),
            analyst: (c.data * 1.5) + (c.record * 0.5),
            creator: (c.creator * 1.5) + (c.relation * 0.5),
            networker: (c.networker * 1.5) + (c.relation * 0.5),
            navigator: (c.data * 1.0) + (c.networker * 1.0) + (c.record * 0.5),
            balancer: (c.balance * 1.5) + (c.record * 0.5) + (c.feel * 0.5),
            leader: (c.creator * 1.0) + (c.relation * 1.0) + (c.data * 0.5),
            advocate: (c.hero * 1.0) + (c.empath * 1.0) + (c.relation * 0.5)
        };

        const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
        return sortedTypes[0][0];
    }

    async function pgProcessResult() {
        pgShowStep('loading');
        pgState.statsLoading = true;

        const type = pgGetType(pgState.answers);
        pgState.resultType = type;

        try {
            // Save result — 기기당 1회만 집계 (재응시가 통계를 부풀리지 않도록)
            if (!localStorage.getItem('sabok_type_submitted')) {
                fetch(supabaseUrl + '/rest/v1/welfare_type_results', {
                    method: 'POST',
                    headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                    body: JSON.stringify({ type: type })
                }).then(r => {
                    if (r.ok) localStorage.setItem('sabok_type_submitted', '1');
                }).catch(e => console.warn('Could not save type result', e));
            }

            // Fetch stats concurrently with a minimum visual delay
            const [, statsData] = await Promise.all([
                new Promise(resolve => setTimeout(resolve, 1500)),
                fetch(supabaseUrl + '/rest/v1/welfare_type_results?select=type', {
                    headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
                }).then(r => r.json()).catch(() => null)
            ]);

            if (statsData && Array.isArray(statsData)) {
                const count = {};
                statsData.forEach(row => { count[row.type] = (count[row.type] || 0) + 1; });
                const total = statsData.length;
                const pct = {};
                Object.keys(count).forEach(k => { pct[k] = Math.round((count[k] / total) * 100); });
                pgState.stats = { pct, count, total };
            } else {
                pgState.stats = null;
            }
        } catch (e) {
            console.warn('pgProcessResult error (non-fatal):', e);
            pgState.stats = null;
            // Ensure minimum loading time even on error
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        pgState.statsLoading = false;
        pgRenderResultPage();
    }

    function pgRenderResultPage() {
        trackUse('quiz_done');
        pgShowStep('result');
        const t = pgTypes[pgState.resultType];

        // Distribution Markup
        let distHtml = '';
        if (pgState.statsLoading) {
            distHtml = `<div style="text-align:center; padding:18px 0;"><div style="font-size:22px; animation:spin 1.5s linear infinite; display:inline-block;">📡</div><div style="font-size:12px; color:var(--text-6); margin-top:8px;">데이터 집계 중이에요...<br>곧 실제 분포를 보여드릴게요!</div></div>`;
        } else if (pgState.stats && pgState.stats.total > 0) {
            const stats = pgState.stats;
            // 표본이 적을 땐 퍼센트가 과장돼 보이므로 실제 인원수로 표기
            const smallSample = stats.total < 30;
            distHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:13px; font-weight:800; color:var(--text-2);">📊 전체 복지사 유형 분포</div>
                    <div style="font-size:11px; color:var(--text-6);">지금까지 ${stats.total.toLocaleString()}명 참여</div>
                </div>
            `;

            Object.entries(pgTypes).forEach(([k, v]) => {
                const pct = stats.pct[k] || 0;
                const cnt = (stats.count && stats.count[k]) || 0;
                const isMe = k === pgState.resultType;
                const valueLabel = smallSample ? `${cnt}명` : `${pct}%`;
                distHtml += `
                <div style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                    <span style="font-size:11px; font-weight:${isMe ? 800 : 600}; color:${isMe ? v.color : '#888'};">${v.emoji} ${v.name}${isMe ? " ← 나" : ""}</span>
                    <span style="font-size:11px; font-weight:700; color:${isMe ? v.color : '#bbb'};">${valueLabel}</span>
                  </div>
                  <div style="height:5px; background:#f2f2f2; border-radius:99px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:${isMe ? v.bg : '#e0e0e0'}; border-radius:99px; transition:width 1s ease;"></div>
                  </div>
                </div>`;
            });

            if (smallSample) {
                distHtml += `<div style="font-size:10.5px; color:var(--text-6); margin-top:10px; text-align:center;">🌱 아직 참여자가 적어 분포가 한쪽으로 몰려 보일 수 있어요. 공유해서 표본을 늘려주세요!</div>`;
            }
        } else {
            distHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:13px; font-weight:800; color:var(--text-2);">📊 전체 복지사 유형 분포</div>
                </div>
                <div style="text-align:center; padding:14px 0; font-size:13px; color:var(--text-6); line-height:1.7;">🌱 아직 데이터를 모으고 있어요!<br><span style="font-size:12px;">참여자가 쌓이면 실제 분포를 공개할게요</span></div>`;
        }

        const btnStyle = (bg, shadow, color = "#fff") => `width:100%; border:none; border-radius:14px; padding:14px; font-size:14px; font-weight:800; cursor:pointer; margin-bottom:8px; background:${bg}; color:${color}; box-shadow:${shadow}; transition:all 0.2s;`;

        const html = `
            <div id="pg-card-inner" style="background:${t.bg}; border-radius:28px; padding:32px 24px; margin-bottom:14px; text-align:center; position:relative; overflow:hidden; box-shadow:0 12px 40px ${t.color}40; transform:scale(0.88); opacity:0; transition:all 0.55s cubic-bezier(0.34,1.56,0.64,1);">
              <div style="position:absolute; top:-40px; right:-40px; width:150px; height:150px; border-radius:50%; background:rgba(255,255,255,0.14);"></div>
              <div style="position:absolute; bottom:-30px; left:-20px; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,0.09);"></div>
              <div style="font-size:64px; margin-bottom:8px;">${t.emoji}</div>
              <div style="font-size:11px; color:rgba(255,255,255,0.75); letter-spacing:3px; font-weight:700; margin-bottom:4px;">나의 복지사 유형</div>
              <h2 style="font-size:26px; font-weight:900; color:#fff; margin-bottom:4px;">${t.name}</h2>
              <div style="font-size:13px; color:rgba(255,255,255,0.85); font-style:italic; margin-bottom:14px;">"${t.sub}"</div>
              <p style="font-size:14px; color:rgba(255,255,255,0.9); line-height:1.7; max-width:300px; margin:0 auto;">${t.desc}</p>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
              <div style="background:var(--surface); border-radius:18px; padding:16px;">
                <div style="font-size:13px; font-weight:800; color:#4ECDC4; margin-bottom:10px;">✅ 강점</div>
                ${t.strengths.map(s => `<div style="font-size:12px; color:var(--text-4); margin-bottom:5px; line-height:1.4;">• ${s}</div>`).join('')}
              </div>
              <div style="background:var(--surface); border-radius:18px; padding:16px;">
                <div style="font-size:13px; font-weight:800; color:#FF6B6B; margin-bottom:10px;">⚠️ 주의</div>
                ${t.cautions.map(c => `<div style="font-size:12px; color:var(--text-4); margin-bottom:5px; line-height:1.4;">• ${c}</div>`).join('')}
              </div>
            </div>

            <div style="background:var(--surface); border-radius:18px; padding:14px 18px; margin-bottom:10px;">
              <div style="font-size:12px; color:var(--text-6); margin-bottom:4px;">💬 동료들이 이렇게 말해요</div>
              <div style="font-size:14px; font-weight:700; color:var(--text-2);">"${t.peer}"</div>
            </div>
            
            <div style="background:${t.bg}; border-radius:18px; padding:14px 18px; margin-bottom:14px; text-align:center;">
              <div style="font-size:14px; font-weight:700; color:#fff;">🌿 오늘의 한마디</div>
              <div style="font-size:13px; color:rgba(255,255,255,0.9); margin-top:4px;">${t.message}</div>
            </div>

            <div style="background:var(--surface); border-radius:18px; padding:16px 18px; margin-bottom:14px;">
              ${distHtml}
            </div>

            <button id="pg-btn-img-share" onclick="pgHandleShareImage()" style="${btnStyle(t.bg, `0 6px 20px ${t.color}50`)} display:flex; align-items:center; justify-content:center; gap:8px; font-size:15px;">
              📤 결과 공유하기
            </button>
            <div style="text-align:center; font-size:11px; color:var(--text-6); margin-bottom:8px;">
              카톡·인스타 스토리로 바로 공유할 수 있어요 ✨
            </div>

            <button id="pg-btn-img-download" onclick="pgHandleDownloadImage()" style="${btnStyle('var(--surface)', 'none', 'var(--text-3)')} border:1.5px solid var(--border-strong); display:flex; align-items:center; justify-content:center; gap:8px;">
              🖼️ 결과 이미지 저장하기(다운로드)
            </button>
            <div style="text-align:center; font-size:11px; color:var(--text-6); margin-bottom:8px;">
              이미지가 기기의 사진첩(또는 다운로드 폴더)에 저장됩니다 🙌
            </div>
            
            <button id="pg-btn-link-copy" onclick="pgHandleCopyLink()" style="${btnStyle('linear-gradient(135deg,#FF6B6B,#F59E0B)', '0 6px 20px rgba(245,158,11,0.28)')}">
              🔗 링크 복사해서 공유하기
            </button>
            
            <button onclick="pgRestart()" style="${btnStyle('#f0f0f0', 'none', '#888')}">
              🔄 다시 테스트하기
            </button>
        `;

        document.getElementById('pg-step-result').innerHTML = html;

        // Trigger pop animation immediately after render
        setTimeout(() => {
            const card = document.getElementById('pg-card-inner');
            if (card) {
                card.style.transform = 'scale(1)';
                card.style.opacity = '1';
            }
        }, 50);
    }

    window.pgHandleCopyLink = function () {
        navigator.clipboard.writeText("나는 어떤 복지사 유형? 테스트 해봐! → https://www.saboknote.com/#playground/quiz");
        const btn = document.getElementById('pg-btn-link-copy');
        if (btn) {
            btn.innerHTML = "✅ 링크 복사됨!";
            setTimeout(() => { btn.innerHTML = "🔗 링크 복사해서 공유하기"; }, 2000);
        }
    };

    window.pgHandleDownloadImage = async function () {
        if (!pgState.resultType) return;
        const btn = document.getElementById('pg-btn-img-download');
        try {
            await pgDownloadImage(pgTypes[pgState.resultType]);
            if (btn) {
                const oldBg = btn.style.background;
                btn.style.background = "#4CAF50";
                btn.innerHTML = "✅ 이미지 준비 완료!";
                setTimeout(() => { btn.style.background = oldBg; btn.innerHTML = "🖼️ 결과 이미지 저장하기(다운로드)"; }, 3000);
            }
        } catch (e) {
            alert("이미지 저장에 실패했어요.\n(일부 브라우저 환경에서는 직접 다운로드가 제한될 수 있습니다.)");
            console.error(e);
        }
    };

    /* ===== 이미지 저장 공통 헬퍼 =====
       모바일(특히 iOS·카톡 인앱 브라우저)은 <a download> 클릭이 조용히 무시되는 경우가 많아
       이미지를 모달로 띄우고 저장 버튼 + '길게 눌러 저장' 안내를 함께 제공한다.
       데스크톱은 그대로 즉시 다운로드. */
    let _pendingSaveImage = null;

    function triggerBlobDownload(dataUrl, filename) {
        return fetch(dataUrl)
            .then(r => r.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = filename;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            });
    }

    window.saveModalDownload = async function () {
        if (!_pendingSaveImage) return;
        const btn = document.getElementById('save-modal-dl-btn');
        try {
            // 공유 시트를 지원하는 모바일은 시트의 '이미지 저장'이 사진첩에 바로 저장되는 가장 확실한 경로
            const blob = await fetch(_pendingSaveImage.dataUrl).then(r => r.blob());
            const file = new File([blob], _pendingSaveImage.filename, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: '사복노트' });
            } else {
                await triggerBlobDownload(_pendingSaveImage.dataUrl, _pendingSaveImage.filename);
            }
            if (btn) {
                btn.innerHTML = '✅ 완료!';
                setTimeout(() => { btn.innerHTML = '📥 이미지 저장하기'; }, 2500);
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return; // 사용자가 시트를 닫음
            console.warn('saveModalDownload:', e);
            // 마지막 폴백: 단순 다운로드 시도
            try { await triggerBlobDownload(_pendingSaveImage.dataUrl, _pendingSaveImage.filename); } catch (e2) { /* noop */ }
        }
    };

    function presentCanvasForSave(canvas, filename) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
        const dataUrl = canvas.toDataURL('image/png');
        if (isMobile) {
            _pendingSaveImage = { dataUrl, filename };
            openModal('🖼️ 이미지 저장', `
                <div style="text-align:center;">
                    <img src="${dataUrl}" alt="결과 이미지" style="width:100%; border-radius:14px; margin-bottom:14px; box-shadow:0 6px 20px rgba(0,0,0,0.15);">
                    <button id="save-modal-dl-btn" onclick="saveModalDownload()" class="btn-primary"
                        style="width:100%; padding:14px; border:none; border-radius:14px; font-size:0.95rem; font-weight:800; cursor:pointer; margin-bottom:10px;">
                        📥 이미지 저장하기</button>
                    <p style="font-size:0.82rem; color:var(--text-6); line-height:1.6;">
                        버튼이 안 되면 위 이미지를 <strong>길게 꾹~</strong> 눌러<br>'사진에 저장'을 선택하세요 👆</p>
                </div>`);
            return;
        }
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /* ===== 공유 공통 헬퍼: 모바일이면 네이티브 공유 시트(카톡·인스타), 아니면 다운로드+링크복사 ===== */
    async function shareCanvasAsImage(canvas, filename, shareText, shareUrl) {
        shareUrl = shareUrl || 'https://www.saboknote.com/';
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('이미지 생성 실패');
        const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            // 파일 공유 시 url 필드를 무시하는 앱(카톡 등)이 있어 텍스트에도 링크를 포함
            await navigator.share({ files: [file], title: '사복노트', text: `${shareText}\n${shareUrl}` });
            return 'shared';
        }
        if (navigator.share) {
            await navigator.share({ title: '사복노트', text: shareText, url: shareUrl });
            return 'shared';
        }
        // Web Share 미지원: 이미지 저장 안내(모바일=길게 눌러 저장, 데스크톱=다운로드) + 공유 문구 복사
        presentCanvasForSave(canvas, filename);
        try { await navigator.clipboard.writeText(shareText + ' → ' + shareUrl); } catch (e) { /* noop */ }
        return 'downloaded';
    }

    window.pgHandleShareImage = async function () {
        if (!pgState.resultType) return;
        const t = pgTypes[pgState.resultType];
        const btn = document.getElementById('pg-btn-img-share');
        try {
            const canvas = pgGenerateResultCanvas(t);
            const mode = await shareCanvasAsImage(
                canvas,
                `나의_사복_유형_${t.name.replace(/\s+/g, '_')}.png`,
                `나는 "${t.name}" 유형 사회복지사래요 ${t.emoji} 당신은 어떤 유형?`,
                'https://www.saboknote.com/#playground/quiz'
            );
            if (btn && mode === 'downloaded') {
                btn.innerHTML = '✅ 이미지 저장 + 공유 문구 복사됨!';
                setTimeout(() => { btn.innerHTML = '📤 결과 공유하기'; }, 3000);
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 닫음
            console.error(e);
            alert('공유에 실패했어요. 아래 이미지 저장 버튼을 이용해주세요.');
        }
    };

    /* 이모지는 글리프 여백이 비대칭이라 textAlign:center로도 살짝 치우친다.
       실제 그려지는 영역(actualBoundingBox)을 재서 시각적 중앙에 배치한다. */
    function drawEmojiCentered(ctx, text, cx, y, font) {
        ctx.save();
        ctx.font = font;
        ctx.textAlign = 'left';
        const m = ctx.measureText(text);
        const bbLeft = (typeof m.actualBoundingBoxLeft === 'number') ? m.actualBoundingBoxLeft : 0;
        const bbRight = (typeof m.actualBoundingBoxRight === 'number') ? m.actualBoundingBoxRight : m.width;
        ctx.fillText(text, cx - (bbRight - bbLeft) / 2, y);
        ctx.restore();
    }

    /* 공유 이미지용 QR — 테스트 시작 URL. 캔버스 오염 없이 그리려 data-URI로 프리로드 */
    const PG_QR_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYwAAAGMAQMAAADz9wcJAAAABlBMVEUeKTv///93/s7jAAABp0lEQVR42u2cSw7DIAxErV4g978lN6CfgG2cboq9aNUXRRWteJtoZA8DqfRPryYgICAg34aIXscYjx8fX8/bTejtJh9fIP+MvOR0DMWdgyEqrzc/AY2BbGlMq5Yvbo+BVTOdgMZAchozac2OGUWIxkCSGnuqSOyzd+oYSK0fM/OvZQ0/BpLXmF9Xvr1ZV4LkNOavIaSX8w9FbMYdPGSQzV4ZnL81yjATjYHsaaytC0nfHDu9EqTAj41MbIrtHJxLy1Dr0BjItsY0rzADNmW2zuEhg+z0yiUK09bZrHvafigaA9nOLlzu6hN+/BhIQXbRFj82WuRlRUDOD5LMxxZvJqY0VSB+DCTVK9XwuwTDZIYfA6nQWMgrfJUbY+oYSKJXijstZp1x3WnCj4HkNbasK0Meix8DyWcXEneOwml/cn6QmnMXhxl+3RxnLwmksI7Fgz3CeX6QCo1dPJglsYevYGQXIEXn+S95rLdnaAwkqTG/keT1xnl+kDKNXZy/hvwzx+Ahg+T8WLfXw3Wj3N67RGMgRetKFdWaWuDHQAryMf6FBgQE5NeQO/13OdJyoKO6AAAAAElFTkSuQmCC";
    const pgQrImg = new Image();
    pgQrImg.src = PG_QR_URI;

    function pgGenerateResultCanvas(t) {
        const W = 800, H = 940;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");

        const grad = ctx.createLinearGradient(0, 0, W, W);
        grad.addColorStop(0, t.color);
        grad.addColorStop(1, t.color2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.fill();

        [[W * 0.85, H * 0.13, 160, 0.11], [W * 0.1, H * 0.87, 130, 0.08], [W * 0.15, H * 0.38, 80, 0.06]].forEach(([x, y, r, a]) => {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
        });

        const cx = W / 2;
        ctx.textAlign = "center";

        ctx.font = "bold 22px Arial"; ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillText("사복천재 비밀노트", cx, 55);

        drawEmojiCentered(ctx, t.emoji, cx, 195, "130px serif");

        ctx.font = "bold 24px Arial"; ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText("나의 복지사 유형", cx, 270);

        ctx.font = "bold 60px Arial"; ctx.fillStyle = "#fff";
        ctx.fillText(t.name, cx, 345);

        ctx.font = "italic 26px Arial"; ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.fillText(`"${t.sub}"`, cx, 392);

        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath(); ctx.rect(60, 418, W - 120, 160); ctx.fill();

        ctx.font = "24px Arial"; ctx.fillStyle = "rgba(255,255,255,0.93)";
        const words = t.desc.split(" ");
        let line = "", lines = [];
        words.forEach(w => {
            if (ctx.measureText(line + w).width > W - 160 && line) { lines.push(line.trim()); line = w + " "; }
            else line += w + " ";
        });
        if (line) lines.push(line.trim());
        lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, cx, 456 + i * 42));

        ctx.font = "bold 20px Arial";
        const tagW = 200, tagH = 44, gap = 16;
        const totalW = t.strengths.length * (tagW + gap) - gap;
        const startX = (W - totalW) / 2;
        t.strengths.forEach((s, i) => {
            const tx = startX + i * (tagW + gap);
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath(); ctx.rect(tx, 640, tagW, tagH); ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.fillText("✓ " + s, tx + tagW / 2, 668);
        });

        ctx.fillStyle = "rgba(255,255,255,0.13)";
        ctx.beginPath(); ctx.rect(60, 710, W - 120, 50); ctx.fill();
        ctx.font = "20px Arial"; ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fillText(t.message, cx, 741);

        // ── 공유 유입 푸터: QR + CTA (스크린샷으로 퍼져도 바로 접속) ──
        const fY = 794, fH = 118, fX = 60, fW = W - 120;
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        roundRect(ctx, fX, fY, fW, fH, 20); ctx.fill();

        const qrS = 92, qrX = fX + 16, qrY = fY + (fH - qrS) / 2;
        let hasQr = false;
        try {
            if (pgQrImg && pgQrImg.complete && pgQrImg.naturalWidth) {
                ctx.drawImage(pgQrImg, qrX, qrY, qrS, qrS);
                hasQr = true;
            }
        } catch (_) { /* noop */ }

        const tX = hasQr ? (qrX + qrS + 22) : (fX + 30);
        ctx.textAlign = "left";
        ctx.font = "bold 27px Arial"; ctx.fillStyle = "#1e293b";
        ctx.fillText("나도 내 유형 궁금하다면?", tX, fY + 50);
        ctx.font = "22px Arial"; ctx.fillStyle = "#2563eb";
        ctx.fillText(hasQr ? "📷 QR 스캔 · saboknote.com" : "👉 saboknote.com", tX, fY + 86);
        ctx.textAlign = "center";

        return canvas;
    }

    async function pgDownloadImage(t) {
        const canvas = pgGenerateResultCanvas(t);
        presentCanvasForSave(canvas, `나의_사복_유형_${t.name.replace(/\s+/g, '_')}.png`);
    }

    /* --- Image Mosaic Logic --- */
    window.initImageMosaic = function () {
        const dropZone = document.getElementById('mosaicDropZone');
        const fileInput = document.getElementById('mosaicFileInput');
        const editor = document.getElementById('mosaicEditor');
        const canvasWrapper = document.getElementById('mosaicCanvasWrapper');
        const canvas = document.getElementById('mosaicCanvas');
        
        const btnBlur = document.getElementById('btnMosModeBlur');
        const btnPixel = document.getElementById('btnMosModePixel');
        const btnBlack = document.getElementById('btnMosModeBlack');
        const sizeInput = document.getElementById('mosSize');
        const sizeVal = document.getElementById('mosSizeVal');
        const strengthRow = document.getElementById('mosStrengthRow');
        const strengthInput = document.getElementById('mosStrength');
        const strengthVal = document.getElementById('mosStrengthVal');
        const strengthLabel = document.getElementById('mosStrengthLabel');
        const colorRow = document.getElementById('mosColorRow');
        const colorInput = document.getElementById('mosColor');
        const swatches = document.querySelectorAll('#mosSwatches .mos-sw[data-color]');
        const cursorEl = document.getElementById('mosCursor');
        const btnUndo = document.getElementById('btnMosUndo');
        const btnClear = document.getElementById('btnMosClear');
        const btnSave = document.getElementById('btnMosSave');
        const btnResetFile = document.getElementById('btnMosResetFile');

        if (!dropZone || !canvas) return;

        let ctx = canvas.getContext('2d');
        let originalImg = new Image();
        let isDrawing = false;
        let lastX = 0, lastY = 0;
        let mode = 'black'; // 'black'(완전가림) | 'pixel' | 'blur'
        let brushSize = 25;
        let strength = 5;          // 모자이크 블록 크기 / 블러 흐림 정도 (1~10)
        let coverColor = '#111827'; // 완전가림 색
        let history = [];
        let blurredCanvas = null;
        let pixelCanvas = null;
        let effectDirty = false;    // 강도를 바꾸면 다음 붓질 전에 효과 캔버스를 다시 만든다

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) handleFile(fileInput.files[0]);
        });

        function handleFile(file) {
            if (!file || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                originalImg.onload = () => {
                    initCanvas();
                    dropZone.style.display = 'none';
                    editor.classList.add('visible');
                };
                originalImg.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function initCanvas() {
            const MAX_WIDTH = 800;
            let width = originalImg.width;
            let height = originalImg.height;

            if (width > MAX_WIDTH) {
                height = Math.floor(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(originalImg, 0, 0, width, height);
            
            buildEffectCanvases();

            saveHistory();
        }

        function supportsCanvasFilter() {
            const t = document.createElement('canvas').getContext('2d');
            if (typeof t.filter === 'undefined') return false;
            t.filter = 'blur(2px)';
            return t.filter === 'blur(2px)';
        }

        function buildEffectCanvases() {
            blurredCanvas = createBlurredCanvas(canvas.width, canvas.height);
            pixelCanvas = createPixelCanvas(canvas.width, canvas.height);
            effectDirty = false;
        }

        // 모자이크: 이미지 전체를 같은 격자로 픽셀화해 두고, 붓질한 부분만 오려 붙인다
        function createPixelCanvas(width, height) {
            const block = 4 + strength * 4; // 강도 1 → 8px, 5 → 24px, 10 → 44px
            const small = document.createElement('canvas');
            small.width = Math.max(1, Math.round(width / block));
            small.height = Math.max(1, Math.round(height / block));
            const sctx = small.getContext('2d');
            sctx.imageSmoothingEnabled = true;
            sctx.drawImage(originalImg, 0, 0, small.width, small.height);
            const c = document.createElement('canvas');
            c.width = width;
            c.height = height;
            const cctx = c.getContext('2d');
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, width, height);
            return c;
        }

        function createBlurredCanvas(width, height) {
            const c = document.createElement('canvas');
            c.width = width;
            c.height = height;
            const bctx = c.getContext('2d');

            if (supportsCanvasFilter()) {
                // 블러 반경: 이미지 크기 비례 기본값(최소 16px)에 강도(1~10, 기본 5)를 곱함
                const radius = Math.max(3, Math.round(Math.max(16, width / 40) * strength / 5));
                bctx.filter = 'blur(' + radius + 'px)';
                for (let i = 0; i < 3; i++) bctx.drawImage(originalImg, 0, 0, width, height);
                bctx.filter = 'none';
                return c;
            }

            // Fallback: iOS Safari 등 ctx.filter 미지원 브라우저 → 축소-확대 방식 블러(강)
            let tmp = document.createElement('canvas');
            tmp.width = width;
            tmp.height = height;
            tmp.getContext('2d').drawImage(originalImg, 0, 0, width, height);
            let w = width, h = height;

            const passes = Math.min(8, Math.max(2, Math.round(strength * 0.6) + 2)); // 강도 5 → 5회(≈1/32)
            for (let i = 0; i < passes; i++) {
                const nw = Math.max(1, Math.floor(w / 2));
                const nh = Math.max(1, Math.floor(h / 2));
                const next = document.createElement('canvas');
                next.width = nw;
                next.height = nh;
                const nctx = next.getContext('2d');
                nctx.imageSmoothingEnabled = true;
                nctx.drawImage(tmp, 0, 0, w, h, 0, 0, nw, nh);
                tmp = next; w = nw; h = nh;
            }

            bctx.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in bctx) bctx.imageSmoothingQuality = 'high';
            bctx.drawImage(tmp, 0, 0, w, h, 0, 0, width, height);
            return c;
        }

        function saveHistory() {
            history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (history.length > 10) history.shift();
        }

        function getMousePos(evt) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            let clientX = evt.clientX;
            let clientY = evt.clientY;
            
            if (evt.touches && evt.touches.length > 0) {
                clientX = evt.touches[0].clientX;
                clientY = evt.touches[0].clientY;
            } else if (evt.changedTouches && evt.changedTouches.length > 0) {
                clientX = evt.changedTouches[0].clientX;
                clientY = evt.changedTouches[0].clientY;
            }

            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        }

        function startDrawing(e) {
            e.preventDefault();
            if (effectDirty) buildEffectCanvases();
            isDrawing = true;
            const pos = getMousePos(e);
            lastX = pos.x;
            lastY = pos.y;
            applyEffect(pos.x, pos.y);
        }

        function draw(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getMousePos(e);
            
            const dx = pos.x - lastX;
            const dy = pos.y - lastY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.max(Math.floor(distance / (brushSize / 2)), 1);

            for (let i = 0; i < steps; i++) {
                const x = lastX + (dx * i) / steps;
                const y = lastY + (dy * i) / steps;
                applyEffect(x, y);
            }

            lastX = pos.x;
            lastY = pos.y;
        }

        function stopDrawing(e) {
            if (isDrawing) {
                isDrawing = false;
                saveHistory();
            }
        }

        function applyEffect(x, y) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, brushSize, 0, Math.PI * 2);
            ctx.clip();

            ctx.filter = 'none';
            if (mode === 'black') {
                // 완전가림: 고른 색으로 불투명하게 덮음(복원 불가) — 원 클립 범위를 꽉 채움
                ctx.fillStyle = coverColor;
                ctx.fillRect(x - brushSize, y - brushSize, brushSize * 2, brushSize * 2);
            } else if (mode === 'blur') {
                if (blurredCanvas) ctx.drawImage(blurredCanvas, 0, 0, canvas.width, canvas.height);
            } else {
                if (pixelCanvas) ctx.drawImage(pixelCanvas, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
        }

        canvas.style.touchAction = 'none'; // Ensure mobile doesn't scroll when drawing

        // 브러시 크기 미리보기 원 (화면 표시 배율에 맞춰 그림)
        function showCursor(clientX, clientY) {
            if (!cursorEl || !canvas.width) return;
            const rect = canvas.getBoundingClientRect();
            const d = (brushSize * 2) * (rect.width / canvas.width);
            cursorEl.style.width = d + 'px';
            cursorEl.style.height = d + 'px';
            cursorEl.style.left = (clientX - rect.left) + 'px';
            cursorEl.style.top = (clientY - rect.top) + 'px';
            cursorEl.style.display = 'block';
        }
        let previewTimer = null;
        function previewSizeAtCenter() {
            const rect = canvas.getBoundingClientRect();
            showCursor(rect.left + rect.width / 2, rect.top + rect.height / 2);
            clearTimeout(previewTimer);
            previewTimer = setTimeout(() => { if (cursorEl) cursorEl.style.display = 'none'; }, 700);
        }
        canvas.addEventListener('mousemove', (e) => showCursor(e.clientX, e.clientY));
        canvas.addEventListener('mouseleave', () => { if (cursorEl) cursorEl.style.display = 'none'; });

        function setBrushSize(v) {
            brushSize = Math.max(4, Math.min(120, Math.round(v)));
            if (sizeInput) sizeInput.value = brushSize;
            if (sizeVal) sizeVal.textContent = brushSize;
        }
        if (sizeInput) sizeInput.addEventListener('input', () => { setBrushSize(+sizeInput.value); previewSizeAtCenter(); });
        // PC: 사진 위에서 마우스 휠로 굵기 조절
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            setBrushSize(brushSize + (e.deltaY < 0 ? 3 : -3));
            showCursor(e.clientX, e.clientY);
        }, { passive: false });

        if (strengthInput) strengthInput.addEventListener('input', () => {
            strength = +strengthInput.value;
            if (strengthVal) strengthVal.textContent = strength;
            effectDirty = true;
        });

        function setCoverColor(c) {
            coverColor = c;
            swatches.forEach(sw => sw.classList.toggle('active', sw.dataset.color.toLowerCase() === c.toLowerCase()));
            if (colorInput && colorInput.value.toLowerCase() !== c.toLowerCase()) colorInput.value = c;
        }
        swatches.forEach(sw => sw.addEventListener('click', () => setCoverColor(sw.dataset.color)));
        if (colorInput) colorInput.addEventListener('input', () => setCoverColor(colorInput.value));

        // 모드에 맞는 설정만 보이기: 완전가림 → 색, 모자이크·블러 → 강도
        function syncModePanel() {
            if (colorRow) colorRow.style.display = mode === 'black' ? 'flex' : 'none';
            if (strengthRow) strengthRow.style.display = mode === 'black' ? 'none' : 'flex';
            if (strengthLabel) strengthLabel.textContent = mode === 'blur' ? '흐림 정도' : '블록 크기';
        }
        
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDrawing);
        
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        window.addEventListener('touchend', stopDrawing);
        window.addEventListener('touchcancel', stopDrawing);

        const modeGroup = [btnBlack, btnPixel, btnBlur];
        const setModeActive = (btn) => {
            modeGroup.forEach(b => { if (!b) return; b.style.background = 'var(--surface-4)'; b.style.color = 'var(--text-4)'; });
            // 완전가림은 검정, 나머지는 파랑으로 활성 표시
            btn.style.background = (btn === btnBlack) ? '#111827' : '#3b82f6';
            btn.style.color = 'white';
        };
        if (btnBlack) btnBlack.onclick = () => { mode = 'black'; setModeActive(btnBlack); syncModePanel(); };
        if (btnPixel) btnPixel.onclick = () => { mode = 'pixel'; setModeActive(btnPixel); syncModePanel(); };
        if (btnBlur) btnBlur.onclick = () => { mode = 'blur'; setModeActive(btnBlur); syncModePanel(); };
        syncModePanel();

        btnUndo.onclick = () => {
            if (history.length > 1) {
                history.pop();
                const prev = history[history.length - 1];
                ctx.putImageData(prev, 0, 0);
            }
        };

        btnClear.onclick = () => {
            history = [];
            initCanvas();
        };

        btnSave.onclick = () => {
            const url = canvas.toDataURL('image/jpeg', 0.95);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mosaic_image.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        btnResetFile.onclick = () => {
            fileInput.value = '';
            editor.classList.remove('visible');
            dropZone.style.display = 'block';
            history = [];
        };
    };

    /* --- Image Converter Logic --- */
    window.initImageConverter = function () {
        const dropZone = document.getElementById('convDropZone');
        const fileInput = document.getElementById('convFileInput');
        const settings = document.getElementById('convSettings');
        const fileCount = document.getElementById('convFileCount');
        const fileList = document.getElementById('convFileList');
        const startBtn = document.getElementById('convStartBtn');
        const formatSelect = document.getElementById('convFormatSelect');
        const progressWrap = document.getElementById('convProgressWrap');
        const progressFill = document.getElementById('convProgressFill');
        const progressText = document.getElementById('convProgressText');
        const resultWrap = document.getElementById('convResultWrap');
        const downloadLinks = document.getElementById('convDownloadLinks');
        const resetBtn = document.getElementById('convResetBtn');

        if (!dropZone) return;

        let selectedFiles = [];

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
        });
        fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

        function handleFiles(files) {
            if (!files.length) return;
            selectedFiles = files;
            fileCount.textContent = files.length;
            
            fileList.innerHTML = '';
            files.forEach(f => {
                const item = document.createElement('div');
                item.className = 'conv-file-item';
                item.innerHTML = `<span>${f.name}</span> <span style="color:var(--text-6);">${(f.size/1024).toFixed(1)}KB</span>`;
                fileList.appendChild(item);
            });
            
            settings.classList.add('visible');
            resultWrap.style.display = 'none';
        }

        startBtn.addEventListener('click', async () => {
            if (!selectedFiles.length) return;
            startBtn.style.display = 'none';
            progressWrap.style.display = 'block';
            downloadLinks.innerHTML = '';
            
            const targetFormat = formatSelect.value;
            const ext = targetFormat === 'image/jpeg' ? '.jpg' : targetFormat === 'image/png' ? '.png' : '.webp';
            
            for (let i = 0; i < selectedFiles.length; i++) {
                progressFill.style.width = Math.round((i / selectedFiles.length) * 100) + '%';
                progressText.textContent = '변환 중... (' + (i + 1) + '/' + selectedFiles.length + ')';
                
                try {
                    const blob = await convertImage(selectedFiles[i], targetFormat);
                    const url = URL.createObjectURL(blob);
                    const newName = selectedFiles[i].name.replace(/\.[^/.]+$/, "") + ext;
                    
                    const btn = document.createElement('button');
                    btn.className = 'btn-primary';
                    btn.style.background = '#eab308';
                    btn.style.border = 'none';
                    btn.style.padding = '10px';
                    btn.innerHTML = '⬇️ ' + newName + ' 다운로드';
                    btn.onclick = () => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = newName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    };
                    downloadLinks.appendChild(btn);
                } catch(e) {
                    console.error('변환 오류:', e);
                }
            }
            
            progressFill.style.width = '100%';
            progressText.textContent = '변환 완료!';
            setTimeout(() => {
                progressWrap.style.display = 'none';
                resultWrap.style.display = 'block';
            }, 500);
        });

        resetBtn.addEventListener('click', () => {
            selectedFiles = [];
            fileInput.value = '';
            settings.classList.remove('visible');
            resultWrap.style.display = 'none';
            startBtn.style.display = 'block';
        });

        function convertImage(file, targetFormat) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    
                    if (targetFormat === 'image/jpeg') {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas toBlob failed'));
                    }, targetFormat, targetFormat === 'image/jpeg' ? 0.9 : undefined);
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
        }
    };

    /* --- Photo Compressor Logic --- */
    window.initPhotoCompressor = function () {
        const dropZone = document.getElementById('dropZoneComp');
        const fileInput = document.getElementById('fileInputComp');
        const settings = document.getElementById('settingsComp');
        const compressBtn = document.getElementById('compressBtnComp');
        const resultCard = document.getElementById('resultCardComp');
        const targetSlider = document.getElementById('targetSliderComp');
        const targetDisplay = document.getElementById('targetDisplayComp');
        const progressWrap = document.getElementById('progressWrapComp');
        const progressFill = document.getElementById('progressFillComp');
        const progressText = document.getElementById('progressTextComp');
        const previewRow = document.getElementById('previewRowComp');
        const statsRow = document.getElementById('statsRowComp');
        const warningBadge = document.getElementById('warningBadgeComp');
        const downloadBtn = document.getElementById('downloadBtnComp');

        if (!dropZone) return;

        let selectedFiles = [];
        let compressedBlobs = [];

        targetSlider.addEventListener('input', () => {
            targetDisplay.textContent = targetSlider.value + ' KB';
        });

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
        });
        fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

        function handleFiles(files) {
            if (!files.length) return;
            selectedFiles = files;
            const names = files.map(f => f.name).join(', ');
            dropZone.querySelector('.drop-text').textContent = `📎 ${files.length}장 선택됨`;
            dropZone.querySelector('.drop-sub').textContent = names.length > 40 ? names.slice(0, 40) + '...' : names;
            settings.classList.add('visible');
            compressBtn.classList.add('visible');
            resultCard.classList.remove('visible');
        }

        compressBtn.addEventListener('click', async () => {
            if (!selectedFiles.length) return;
            compressBtn.disabled = true;
            resultCard.classList.remove('visible');
            progressWrap.classList.add('visible');
            compressedBlobs = [];

            const targetKB = parseInt(targetSlider.value);
            const targetBytes = targetKB * 1024;

            for (let i = 0; i < selectedFiles.length; i++) {
                progressFill.style.width = Math.round((i / selectedFiles.length) * 100) + '%';
                progressText.textContent = `압축 중... (${i + 1}/${selectedFiles.length})`;
                const blob = await compressImage(selectedFiles[i], targetBytes);
                compressedBlobs.push({ name: selectedFiles[i].name, original: selectedFiles[i], blob });
            }

            progressFill.style.width = '100%';
            progressText.textContent = '완료!';
            setTimeout(() => {
                progressWrap.classList.remove('visible');
                showResults(targetBytes);
                compressBtn.disabled = false;
            }, 400);
        });

        async function compressImage(file, targetBytes) {
            return new Promise((resolve) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    let quality = 0.92, scale = 1.0;

                    const tryCompress = () => {
                        canvas.width = Math.round(w * scale);
                        canvas.height = Math.round(h * scale);
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        canvas.toBlob((blob) => {
                            if (blob.size <= targetBytes || quality <= 0.05) { resolve(blob); return; }
                            if (quality > 0.1) quality = Math.max(0.05, quality - 0.08);
                            else scale = Math.max(0.1, scale - 0.1);
                            tryCompress();
                        }, 'image/jpeg', quality);
                    };
                    tryCompress();
                };
                img.src = url;
            });
        }

        function formatSize(bytes) {
            if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
            return Math.round(bytes / 1024) + ' KB';
        }

        function showResults(targetBytes) {
            previewRow.innerHTML = '';
            statsRow.innerHTML = '';
            warningBadge.style.display = 'none';

            let totalBefore = 0, totalAfter = 0, hasOver = false;

            compressedBlobs.forEach(({ original, blob }) => {
                totalBefore += original.size;
                totalAfter += blob.size;
                if (blob.size > targetBytes) hasOver = true;
            });

            const first = compressedBlobs[0];
            previewRow.innerHTML = `
              <div class="preview-item">
                <img src="${URL.createObjectURL(first.original)}" alt="원본">
                <div class="preview-label">${compressedBlobs.length > 1 ? '대표 원본' : '원본'}</div>
                <div class="preview-size size-before">${compressedBlobs.length > 1 ? '총 ' : ''}${formatSize(totalBefore)}</div>
              </div>
              <div class="preview-item">
                <img src="${URL.createObjectURL(first.blob)}" alt="압축 후">
                <div class="preview-label">${compressedBlobs.length > 1 ? '대표 압축 후' : '압축 후'}</div>
                <div class="preview-size size-after">${compressedBlobs.length > 1 ? '총 ' : ''}${formatSize(totalAfter)}</div>
              </div>
            `;

            const reduction = Math.round((1 - totalAfter / totalBefore) * 100);
            statsRow.innerHTML = `
              <span>${formatSize(totalBefore)}</span><span>→</span>
              <span>${formatSize(totalAfter)}</span>
              <span class="reduction-badge">-${reduction}%</span>
            `;

            if (hasOver) {
                warningBadge.textContent = '⚠️ 일부 파일은 목표 용량보다 클 수 있어요. 원본이 이미 작은 경우예요.';
                warningBadge.style.display = 'block';
            }

            resultCard.classList.add('visible');
        }

        downloadBtn.addEventListener('click', async () => {
            for (const { name, blob } of compressedBlobs) {
                await new Promise(r => setTimeout(r, 200));
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'compressed_' + name.replace(/\.[^.]+$/, '.jpg');
                a.click();
            }
        });
    };

    /* ─── PWA 전용 로직 ─── */
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Chrome/Android: Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to let the user know they can install the PWA
        checkPWAStatus();
    });

    window.showPWAInstallGuide = function () {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isAndroid = /Android/.test(navigator.userAgent);
        const isSamsungBrowser = /SamsungBrowser/.test(navigator.userAgent);

        let guideHtml = '';

        if (isIOS) {
            guideHtml = `
            <div style="text-align:center; padding:10px 0;">
                <div style="font-size:3rem; margin-bottom:16px;">🍎</div>
                <h3 style="font-size:1.2rem; font-weight:800; color:var(--text-2); margin-bottom:10px;">아이폰(iOS) 설치 방법</h3>
                <div style="background:#fff4f4; border:1px solid #ffe2e2; border-radius:12px; padding:12px 14px; margin-bottom:18px; font-size:0.82rem; color:#e11d48; text-align:left; line-height:1.5;">
                    ⚠️ <strong>반드시 Safari(사파리) 앱</strong>으로 접속하셔야 합니다.<br>
                    카카오, 크롬 등 다른 앱 내 브라우저는 설치 메뉴가 없어요!
                </div>
                <div style="background:var(--surface-2); border-radius:16px; padding:20px; text-align:left; border:1px solid var(--border);">
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <span style="background:var(--primary); color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">1</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:800; margin-bottom:3px;">주소창 오른쪽 <b>[... 버튼]</b>을 누르세요</div>
                            <div style="font-size:0.8rem; color:var(--text-5);">주소창(URL창) 맨 오른쪽 끝에 있는 점 세 개 아이콘이에요 🔍</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <span style="background:var(--primary); color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">2</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:800; margin-bottom:3px;">메뉴에서 <b>[공유 📤]</b>를 누르세요</div>
                            <div style="font-size:0.8rem; color:var(--text-5);">나타나는 메뉴 목록 중 공유 버튼을 찾아주세요</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <span style="background:var(--primary); color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">3</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:800; margin-bottom:3px;">아래로 스크롤 → <b>[홈 화면에 추가]</b> 선택</div>
                            <div style="font-size:0.8rem; color:var(--text-5);">공유 시트를 아래로 내리면 보여요 📋</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <span style="background:#10b981; color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">✓</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:800; margin-bottom:3px;">오른쪽 상단 <b>[추가]</b>를 누르면 완료! 🎉</div>
                            <div style="font-size:0.8rem; color:var(--text-5);">바탕화면에 🌿 아이콘이 생겼어요!</div>
                        </div>
                    </div>
                </div>
            </div>`;
        } else if (isAndroid && deferredPrompt) {
            // If it's Android and we have the prompt, try to trigger it directly
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the PWA install prompt');
                } else {
                    console.log('User dismissed the PWA install prompt');
                }
                deferredPrompt = null;
            });
            return; // Exit early as we triggered the native prompt
        } else if (isAndroid) {
            const browserName = isSamsungBrowser ? '삼성 인터넷' : '크롬(Chrome)';
            const step1Text = isSamsungBrowser
                ? '오른쪽 하단 <b>[≡ 메뉴 탭]</b>을 누르세요'
                : '주소창 오른쪽 <b>[점 3개 ⋮]</b>를 누르세요';
            const step2Text = isSamsungBrowser
                ? '<b>[페이지 추가]</b> → <b>[홈 화면]</b>을 선택하세요'
                : '<b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 누르세요';

            guideHtml = `
            <div style="text-align:center; padding:10px 0;">
                <div style="font-size:3rem; margin-bottom:16px;">🤖</div>
                <h3 style="font-size:1.2rem; font-weight:800; color:var(--text-2); margin-bottom:10px;">안드로이드 설치 방법</h3>
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:12px 14px; margin-bottom:18px; font-size:0.82rem; color:#15803d; text-align:left;">
                    ✅ 감지된 브라우저: <strong>${browserName}</strong>
                </div>
                <div style="background:var(--surface-2); border-radius:16px; padding:20px; text-align:left; border:1px solid var(--border);">
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <span style="background:var(--primary); color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">1</span>
                        <div style="font-size:0.95rem; font-weight:700;">${step1Text}</div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px;">
                        <span style="background:var(--primary); color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">2</span>
                        <div style="font-size:0.95rem; font-weight:700;">${step2Text}</div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <span style="background:#10b981; color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0; margin-top:1px;">✓</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:800;">설치 완료! 🎉</div>
                            <div style="font-size:0.8rem; color:var(--text-5); margin-top:2px;">바탕화면에 🌿 아이콘이 생겼어요!</div>
                        </div>
                    </div>
                </div>
                <p style="font-size:0.78rem; color:var(--text-6); margin-top:16px; text-align:left; line-height:1.5;">
                    ※ 위 방법이 안 되면 크롬(Chrome) 브라우저에서 다시 시도해 보세요.
                </p>
            </div>`;
        } else {
            // General Desktop or other
            guideHtml = `
            <div style="text-align:center; padding:10px 0;">
                <div style="font-size:3rem; margin-bottom:20px;">💻</div>
                <h3 style="font-size:1.2rem; font-weight:800; color:var(--text-2); margin-bottom:12px;">앱 설치 안내</h3>
                <p style="font-size:0.95rem; color:var(--text-4); line-height:1.6; margin-bottom:16px;">
                    PC에서도 앱처럼 설치하여 이용하실 수 있습니다.
                </p>
                <p style="font-size:0.9rem; color:var(--text-5);">
                    브라우저 주소창 우측의 <b>[설치 아이콘]</b>을 누르거나,<br>
                    설정 메뉴에서 <b>[앱 설치]</b>를 선택해주세요.
                </p>
                <button class="btn-primary" style="margin-top:24px;" onclick="closeModal()">확인</button>
            </div>`;
        }

        openModal('앱으로 설치하기 📲', guideHtml);
    };

    function checkPWAStatus() {
        // standalone: PWA로 실행 중이면 배너 숨김, 아니면 표시
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        const promoBanner = document.getElementById('pwa-promo-banner');
        if (promoBanner) {
            promoBanner.style.display = isStandalone ? 'none' : 'block';
        }
    }

    // DOMContentLoaded와 load 양쪽에서 체크 (iOS 포함 모든 환경 대응)
    document.addEventListener('DOMContentLoaded', checkPWAStatus);
    window.addEventListener('load', checkPWAStatus);


    /* ===== 당겨서 새로고침 (Pull-to-Refresh) — .app-main 스크롤 최상단에서 아래로 당기면 reload ===== */
    (function initPullToRefresh() {
        function setup() {
            const container = document.querySelector('.app-main');
            if (!container || container.dataset.ptrReady) return;
            container.dataset.ptrReady = '1';

            const THRESHOLD = 72;   // 이만큼 당기면 새로고침
            const MAX = 110;        // 최대 당김 거리
            let startY = 0, pulling = false, dist = 0;

            // 당김 표시기
            const ind = document.createElement('div');
            ind.style.cssText = 'position:fixed; top:0; left:0; right:0; display:flex; align-items:flex-end; justify-content:center; pointer-events:none; z-index:9997; height:0; overflow:hidden; transition:none;';
            ind.innerHTML = '<div id="ptr-spinner" style="margin-bottom:10px; width:30px; height:30px; border-radius:50%; border:3px solid var(--border); border-top-color:#16a34a; transform:rotate(0deg);"></div>';
            document.body.appendChild(ind);
            const spinner = ind.querySelector('#ptr-spinner');

            function reset(animate) {
                ind.style.transition = animate ? 'height 0.2s ease' : 'none';
                ind.style.height = '0px';
                dist = 0; pulling = false;
            }

            container.addEventListener('touchstart', function (e) {
                if (container.scrollTop <= 0 && e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    pulling = true;
                    dist = 0;
                } else {
                    pulling = false;
                }
            }, { passive: true });

            container.addEventListener('touchmove', function (e) {
                if (!pulling) return;
                const dy = e.touches[0].clientY - startY;
                if (dy <= 0 || container.scrollTop > 0) { reset(false); return; }
                // 저항감(고무줄) 적용
                dist = Math.min(MAX, dy * 0.5);
                if (dist > 4) {
                    e.preventDefault(); // 네이티브 스크롤/바운스 억제
                    ind.style.transition = 'none';
                    ind.style.height = dist + 'px';
                    spinner.style.transform = 'rotate(' + (dist * 3) + 'deg)';
                    spinner.style.opacity = Math.min(1, dist / THRESHOLD);
                }
            }, { passive: false });

            container.addEventListener('touchend', function () {
                if (!pulling) return;
                if (dist >= THRESHOLD) {
                    // 새로고침 확정 — 스피너 회전시키며 리로드
                    ind.style.transition = 'height 0.2s ease';
                    ind.style.height = THRESHOLD + 'px';
                    spinner.style.animation = 'ptrSpin 0.6s linear infinite';
                    setTimeout(function () { location.reload(); }, 150);
                } else {
                    reset(true);
                }
            }, { passive: true });

            // 스피너 회전 keyframe 주입(중복 방지)
            if (!document.getElementById('ptr-style')) {
                const st = document.createElement('style');
                st.id = 'ptr-style';
                st.textContent = '@keyframes ptrSpin{to{transform:rotate(360deg)}}';
                document.head.appendChild(st);
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
        window.addEventListener('load', setup);
    })();

} catch (e) { console.error('Global JS Error:', e); }
