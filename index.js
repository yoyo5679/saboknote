/**
 * Social Worker's Secret Note - Core Logic
 * Includes Eligibility, LTC Simulator, and Terminology Translator
 */

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
    30: 17450,
    60: 25320,
    90: 34120,
    120: 43430,
    150: 50640,
    180: 57020,
    210: 63530,
    240: 70080
};

document.addEventListener('DOMContentLoaded', () => {
    initModal();
    initEligibilityCalculator();
    initAICaseManagement();
    initAICounseling();
    initDashboard();
    initAdminCalculator();
    initVocaDictionary();
});

// ... (preceding functions) ...

/* --- AI Newsletter Generator --- */

function initNewsletterTool() {
    const btn = document.getElementById('open-newsletter');
    if (btn) {
        btn.onclick = () => {
            const content = `
                <div id="nl-step-container">
                    <!-- Steps will be injected here -->
                </div>
            `;
            openModal('보호자 소통용 뉴스레터 AI 작성기', content);
            renderNewsletterStep(1);
        };
    }
}

const NlQuestions = [
    { text: "이번 뉴스레터의 가장 중요한 목적은 무엇인가요?", sub: "(예: 주요 행사 결과 공유, 신규 프로그램 안내, 운영 변경사항 등)", id: "nl-q1", icon: "🎯" },
    { text: "최근 기관에서 있었던 따뜻한 에피소드나 의미 있는 변화가 있나요?", sub: "(이용인, 참여자, 지역주민 등과 함께한 긍정적 사례)", id: "nl-q2", icon: "💖" },
    { text: "꼭 전달해야 하는 중요한 일정이나 공지사항이 있나요?", sub: "(정확한 날짜, 장소, 지원 자격 등 포함)", id: "nl-q3", icon: "📢" },
    { text: "최근 기관에서 특별히 신경 쓰고 계시는 복지/돌봄 포인트가 있나요?", sub: "(예: 환절기 건강 모니터링, 맞춤형 정서 지원 등)", id: "nl-q4", icon: "🔍" },
    { text: "마지막으로 전하고 싶은 안부나 당부의 한마디를 남겨주세요.", sub: "(소식지를 읽는 분들에게 전하는 따뜻한 인사말)", id: "nl-q5", icon: "💌" }
];

const nlAnswers = {};

window.renderNewsletterStep = function (stepIndex) {
    const container = document.getElementById('nl-step-container');
    if (!container) return;

    if (stepIndex <= 5) {
        const q = NlQuestions[stepIndex - 1];
        const val = nlAnswers[q.id] || '';

        const progressHtml = Array.from({ length: 5 }).map((_, i) =>
            `<div style="flex:1; height:6px; border-radius:3px; transition:background 0.3s ease; background:${i < stepIndex ? 'var(--primary)' : '#e2e8f0'}; box-shadow:${i < stepIndex ? '0 0 8px rgba(37,99,235,0.4)' : 'none'}"></div>`
        ).join('');

        container.innerHTML = `
            <div class="step-card beautiful-card" style="animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)">
                <div style="display:flex; gap:6px; margin-bottom:24px;">
                    ${progressHtml}
                </div>
                
                <div style="display:flex; align-items:flex-start; gap:16px; margin-bottom:20px;">
                    <div style="background:#eff6ff; min-width:56px; height:56px; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:1.8rem; border:2px solid #bfdbfe; box-shadow:0 4px 10px rgba(59,130,246,0.1)">
                        ${q.icon}
                    </div>
                    <div>
                        <div style="font-weight:800; color:var(--primary); font-size:0.85rem; letter-spacing:0.5px; margin-bottom:4px; text-transform:uppercase">Question <span style="font-size:1rem">${stepIndex}</span> <span style="color:#cbd5e1; font-weight:400">/ 5</span></div>
                        <h3 style="font-size:1.2rem; color:var(--text-dark); margin-bottom:6px; line-height:1.4">${q.text}</h3>
                        <p style="font-size:0.85rem; color:#64748b; line-height:1.5">${q.sub}</p>
                    </div>
                </div>
                
                <div class="textarea-wrapper">
                    <textarea id="${q.id}" class="calc-input beautiful-textarea" style="height:140px; resize:none;" placeholder="간략한 키워드나 핵심 내용만 적어주셔도 AI가 매끄럽게 완성해 드립니다.">${val}</textarea>
                </div>
                
                <div style="display:flex; justify-content:space-between; margin-top:24px; gap:12px">
                    <button class="btn-primary btn-outline" onclick="renderNewsletterStep(${stepIndex - 1})" 
                        style="${stepIndex === 1 ? 'visibility:hidden' : ''}; flex: 0 0 100px;">
                        < 뒤로
                    </button>
                    <button class="btn-primary pulse-hover" onclick="saveNlAnswer(${stepIndex}, ${stepIndex + 1})" style="flex:1; background:linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%); border:none; box-shadow:0 4px 14px rgba(37,99,235,0.3)">
                        ${stepIndex === 5 ? '✨ AI 완성하기' : '다음 단계로 >'}
                    </button>
                </div>
            </div>
        `;
    } else {
        // Step 6: Tone Selection & Generation
        // Step 6: Tone Selection & Generation
        container.innerHTML = `
            <div class="step-card beautiful-card" style="animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); text-align:center; padding:32px 20px">
                <div style="font-size:3rem; margin-bottom:16px; animation: bounce 2s infinite">🎉</div>
                <h3 style="font-size:1.4rem; color:var(--text-dark); margin-bottom:12px; font-weight:800">질문 작성이 완료되었습니다!</h3>
                <p style="font-size:0.95rem; color:#64748b; margin-bottom:32px">보내실 대상과 목적에 맞는 <strong style="color:var(--primary)">분위기(톤앤매너)</strong>를 선택해 주세요.</p>
                
                <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:32px">
                    <button class="btn-primary tone-btn" onclick="generateNewsletter('warm')" style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        <span style="font-size:1.5rem">🌻</span>
                        <div style="text-align:left">
                            <strong style="display:block; font-size:1.1rem; margin-bottom:4px">따뜻한 편지형</strong>
                            <span style="font-size:0.85rem; opacity:0.9; font-weight:400">감성과 안부 위주의 다정한 인사말</span>
                        </div>
                    </button>
                    <button class="btn-primary tone-btn" onclick="generateNewsletter('business')" style="background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                        <span style="font-size:1.5rem">🏢</span>
                        <div style="text-align:left">
                            <strong style="display:block; font-size:1.1rem; margin-bottom:4px">정중한 공문형</strong>
                            <span style="font-size:0.85rem; opacity:0.9; font-weight:400">신뢰감 있는 격식과 보고형 텍스트</span>
                        </div>
                    </button>
                </div>
                
                <button class="btn-primary btn-outline" onclick="renderNewsletterStep(5)" style="width:100%">
                    < 뒤로가기 (마지막 질문 수정)
                </button>
            </div>
        `;
    }
}

window.saveNlAnswer = function (currentIndex, nextIndex) {
    const qId = NlQuestions[currentIndex - 1].id;
    const val = document.getElementById(qId).value;
    nlAnswers[qId] = val; // Store even if empty
    renderNewsletterStep(nextIndex);
};

window.generateNewsletter = function (tone) {
    const container = document.getElementById('nl-step-container');
    container.innerHTML = `<div class="loading-spinner" style="margin:40px auto"></div><p style="text-align:center; color:#64748b">AI가 매끄러운 기승전결로 다듬는 중입니다...</p>`;

    setTimeout(() => {
        let title = '';
        let body = '';

        if (tone === 'warm') {
            title = '🌻 언제나 따뜻한 마음으로 함께합니다';
            body = `한 주의 피로가 쌓이는 금요일, 창밖으로 비치는 오후 햇살이 참 따스합니다. 이웃님들과 가족분들 댁내 두루 평안하신지요?
            
요즘 저희 기관에서는 작은 웃음꽃이 피어납니다. 최근 함께하신 분들의 밝은 모습을 보며 모두가 덩달아 마음이 따뜻해졌답니다. 이런 작은 미소 하나하나가 저희에겐 큰 원동력이 됩니다.

특별히 요즘 같은 때에는 소중한 분들의 세심한 지원과 프로그램 참여에 더욱 신경 쓰고 있습니다. 편안하고 유익한 시간이 될 수 있도록 항상 살피겠습니다.

그리고 미리 한 가지 전해드릴 소식이 있어요. ${nlAnswers['nl-q3'] ? nlAnswers['nl-q3'] : '(공지사항 반영)'} 내용을 참고 부탁드립니다. 조금 번거로우실 수 있겠지만, 더 나은 환경을 위함이니 너그러운 이해 부탁드려요.

앞으로도 변함없는 마음으로 정성을 다하겠습니다. 관심 가져주셔서 감사드리며, 환절기 건강 조심하세요!`;
        } else {
            title = '🏢 [안내] 주요 소식 및 공지사항';
            body = `관계자 및 가족 여러분께,

항상 저희 기관을 믿고 지지해 주셔서 깊이 감사드립니다. 본 서신을 통해 이번 달 주요 공지사항 및 운영 경과를 안내해 드립니다.

■ 핵심 공지사항 안내
${nlAnswers['nl-q3'] ? `- ${nlAnswers['nl-q3']}` : '- 주요 안내 사항 반영'}
관련하여 변동된 사안은 실무 절차에 따라 차질 없이 처리할 예정이오니 참고 부탁드립니다.

■ 주요 운영 현황 및 사례
최근 기관에서는 시설 이용과 서비스의 쾌적한 질적 향상을 위해 다방면으로 노력하고 있습니다. ${nlAnswers['nl-q4'] ? nlAnswers['nl-q4'] : '(운영 현황 반영)'}에 각별한 주의를 기울이고 있으며, 관련 평가에서도 우수한 만족도를 유지하고 있습니다.

저희 임직원 일동은 이용자분들께서 안정된 환경에서 혜택을 받으실 수 있도록 높은 수준의 전문성을 바탕으로 책임을 다할 것을 약속드립니다. 지속적인 성원을 부탁드리며, 추가 문의 사항이 있으시면 언제든 기관으로 연락 주시기 바랍니다.

감사합니다.`;
        }

        container.innerHTML = `
            <div style="animation: fadeIn 0.3s ease">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:2px solid var(--primary); padding-bottom:10px">
                    <h3 style="font-size:1.1rem; color:var(--text-dark)">완성된 뉴스레터</h3>
                    <button class="btn-primary" style="background:#10b981; padding:6px 12px; font-size:0.8rem" onclick="navigator.clipboard.writeText(document.getElementById('nl-final-text').innerText); alert('클립보드에 복사되었습니다. 카카오톡에 붙여넣기 하세요!');">복사하기 📋</button>
                </div>
                
                <div id="nl-final-text" style="background:#f8fafc; padding:20px; border-radius:12px; font-size:0.95rem; line-height:1.7; color:#334155; white-space:pre-wrap; border:1px solid #e2e8f0;"><b>${title}</b>

${body}</div>
                
                <div style="margin-top:20px; text-align:center">
                    <button class="btn-primary" onclick="renderNewsletterStep(1)" style="background:#cbd5e1; color:#334155;">새로 작성하기</button>
                </div>
            </div>
        `;
    }, 1500);
};

/* --- 2026 KPI Dashboard --- */

// Base 100% Median Income for 1,2,3,4 person households (2026)
const MED_INCOME_BASE = { 1: 2564238, 2: 4199292, 3: 5359036, 4: 6494738 };

// Key KPI data for 2026
const KPI_DATA_2026 = {
    basicLiving: {
        1: '822,524원',
        2: '1,343,777원',
        3: '1,714,892원',
        4: '2,084,364원'
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
            const ratios = [0.6, 0.8, 1.0, 1.2, 1.4];
            let incomeHtml = '';

            [1, 2, 3, 4].forEach(size => {
                let ratioBlocks = ratios.map(r => {
                    let val = Math.round(MED_INCOME_BASE[size] * r);
                    return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9; font-size:0.8rem">
                                <span style="color:#64748b">${Math.round(r * 100)}%</span>
                                <span style="font-weight:700; color:#1e293b">${val.toLocaleString()}원</span>
                            </div>`;
                }).join('');

                incomeHtml += `
                    <div style="background:#f8fafc; padding:12px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:12px;">
                        <p style="font-size:0.95rem; font-weight:800; color:var(--primary); margin-bottom:8px">👥 ${size}인 가구 기준 중위소득</p>
                        ${ratioBlocks}
                    </div>
                `;
            });

            const content = `
                <div style="background:var(--primary); color:white; padding:24px; border-radius:24px; margin-bottom:24px; position:relative; overflow:hidden">
                    <div style="position:relative; z-index:2">
                        <p style="font-size:0.85rem; opacity:0.8">올해의 핵심 숫자</p>
                        <h3 style="font-size:1.8rem; font-weight:900; margin-top:4px">10,310원</h3>
                        <p style="font-size:0.9rem; font-weight:700; margin-top:2px">2026년 최저임금 (시급)</p>
                    </div>
                    <div style="position:absolute; right:-20px; bottom:-20px; font-size:120px; opacity:0.1">💰</div>
                </div>

                <div class="kpi-section">
                    <p style="font-size:1.0rem; font-weight:800; color:#0f172a; margin-bottom:12px">💎 2026년 가구 규모별 중위소득 기준표</p>
                    ${incomeHtml}
                </div>


                <div class="kpi-section" style="margin-top:24px">
                    <p style="font-size:0.85rem; font-weight:800; color:#ef4444; margin-bottom:12px">🏠 생계급여 선정기준 (32%)</p>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
                        ${Object.entries(KPI_DATA_2026.basicLiving).map(([size, val]) => `
                            <div style="background:#fff1f2; padding:12px; border-radius:12px; border:1px solid #ffe4e6">
                                <p style="font-size:0.7rem; color:#fb7185">${size}인 가구</p>
                                <p style="font-size:0.95rem; font-weight:800; color:#e11d48">${val}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="kpi-section" style="margin-top:24px">
                    <p style="font-size:0.85rem; font-weight:800; color:var(--accent); margin-bottom:12px">👵 장기요양 재가한도액</p>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px">
                        ${Object.entries(KPI_DATA_2026.ltcLimits).map(([grade, val]) => `
                            <div style="background:#f0f9ff; padding:10px; border-radius:12px; border:1px solid #e0f2fe; text-align:center">
                                <p style="font-size:0.7rem; color:#0ea5e9">${grade}등급</p>
                                <p style="font-size:0.85rem; font-weight:800; color:#0369a1">${val.replace('원', '')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top:32px; padding:16px; background:#f1f5f9; border-radius:16px; font-size:0.75rem; color:#64748b; line-height:1.5">
                    💡 위 지표는 보건복지부 고시 정보를 바탕으로 구성되었으며, 구체적인 자격 판정은 각각의 전용 계산기를 이용해 주세요.
                </div>
    `;
            openModal('2026 핵심 지표 대시보드', content);
        };
    }
}

// ... (previous code above) ...

/* --- AI Smart Record (Counseling & Case Management) --- */

const AI_RECORD_DOMAINS = {
    housing: { label: "주거", keywords: ["집", "월세", "방", "추워", "난방", "단칸방", "고쳐"], phrase: "주택 노후화 및 주거 비용 체납으로 인한 주거 불안정성 확인" },
    daily: { label: "일상", keywords: ["밥", "쌀", "반찬", "혼자", "잠", "씻기", "빨래"], phrase: "가사 및 위생 관리 저하로 인한 일상 생활 지원 욕구 인지" },
    health: { label: "건강", keywords: ["아파", "병원", "약", "수술", "장애", "다침", "우울"], phrase: "만성 질환 및 신체/정신적 기능 저하로 인한 보건 의료 개입 필요" },
    career: { label: "진로", keywords: ["일", "직장", "취업", "알바", "공부", "학원", "학교"], phrase: "구직 활동 의사 확인 및 자활 의지 고취를 위한 교육적 지원 검토" },
    economy: { label: "경제", keywords: ["돈", "빚", "대출", "생활비", "연체", "밀려", "부족"], phrase: "정기 소득 부재 및 과다 채무로 인한 만성적 경제 위기 상황 확인" }
};

// PII Masking regex
const PII_REGEX = {
    resident: /\d{6}\s?-\s?[1-4]\d{6}/g,
    phone: /01[016789]\s?-?\s?\d{3,4}\s?-?\s?\d{4}/g,
    name: /([가-힣]{2,4})/g // Simplistic name detection for demo
};

function maskPII(text) {
    if (!text) return "";
    let masked = text;
    masked = masked.replace(PII_REGEX.resident, "******-*******");
    masked = masked.replace(PII_REGEX.phone, "010-****-****");
    return masked;
}

function initAICounseling() {
    const btn = document.getElementById('open-counseling-log');
    if (btn) {
        btn.onclick = () => {
            const content = `
                <div class="form-group">
                    <label>상담 메모 (일상어)</label>
                    <textarea id="ai-input" placeholder='예: "오늘 홍길동씨 만났는데 쌌이 떨어져서 밥을 못드신다고 하네요. 몸도 아파서 병원 가야한대요."' class="beautiful-textarea" style="height:120px; margin-bottom:16px;"></textarea>
                </div>
                <div style="background:#eff6ff; padding:12px; border-radius:10px; margin-bottom:20px; border:1px solid #dbeafe">
                    <label style="font-size:0.82rem; color:#1e40af; cursor:pointer; display:flex; align-items:center; gap:6px">
                        <input type="checkbox" id="pii-toggle" checked style="width:16px; height:16px"> 👩‍💻 개인정보 자동 비식별화 (마스킹)
                    </label>
                </div>
                <button class="btn-primary" id="run-refine-counsel">✨ 행정 용어로 변환</button>
                <div id="ai-result" class="log-result-area hidden"></div>
            `;
            openModal('AI 상담기록지', content);
            document.getElementById('run-refine-counsel').onclick = () => processAI('counseling');
        };
    }
}

function initAICaseManagement() {
    const btn = document.getElementById('open-case-log');
    if (btn) {
        btn.onclick = () => {
            const content = `
        <div class="form-group" >
                    <label>상담 내용 (사례관리용)</label>
                    <textarea id="ai-input" placeholder='예: "방에 비가 새고 월세도 밀렸대요. 당뇨 때문에 병원 가야하는데 차비도 없다고 하네요."' style="width:100%; height:150px; padding:16px; border-radius:14px; border:2px solid #f5f3ff; background:#fafaff; font-family:inherit; font-size:0.95rem; resize:none"></textarea>
                </div>
                <div style="background:#f5f3ff; padding:12px; border-radius:10px; margin-bottom:20px; border:1px solid #ede9fe">
                    <label style="font-size:0.82rem; color:#6d28d9; cursor:pointer; display:flex; align-items:center; gap:6px">
                        <input type="checkbox" id="pii-toggle" checked style="width:16px; height:16px"> 🔒 전문가용 비식별화 필터링 활성
                    </label>
                </div>
                <button class="btn-primary" style="background:#a855f7" id="run-refine-case">⚡ 5대 영역별 자동 분류</button>
                <div id="ai-result" class="log-result-area hidden"></div>
    `;
            openModal('AI 사례관리기록지', content);
            document.getElementById('run-refine-case').onclick = () => processAI('case');
        };
    }
}

function processAI(mode) {
    const inputArea = document.getElementById('ai-input');
    const resultDiv = document.getElementById('ai-result');
    const piiEnabled = document.getElementById('pii-toggle').checked;

    let rawText = inputArea.value;
    if (!rawText.trim()) return;

    if (piiEnabled) rawText = maskPII(rawText);

    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<div style="text-align:center; padding:30px; color:var(--primary)" >
        <div class="loading-spinner"></div>
        <p style="margin-top:10px">AI 전문가가 기록지를 작성 중입니다...</p>
    </div> `;

    setTimeout(() => {
        let content = '';
        if (mode === 'counseling') {
            const refined = refineGeneralLog(rawText);
            content = `
        <div class="result-box" style="border-top:4px solid var(--primary)" >
                    <p style="font-size:0.8rem; font-weight:800; color:var(--primary); margin-bottom:12px">📋 정제된 행정 기록</p>
                    <div style="background:#f8fafc; padding:20px; border-radius:14px; border:1px solid #e2e8f0; font-size:1rem; line-height:1.7; color:#1e293b">
                        ${refined}
                    </div>
                </div>
        `;
        } else {
            const domains = classifyDomains(rawText);
            content = `
        <div class="result-box" style="border-top:4px solid #a855f7" >
            <p style="font-size:0.8rem; font-weight:800; color:#6d28d9; margin-bottom:12px">📁 5대 영역별 핵심 요약</p>
                    ${domains.map(d => `
                        <div class="log-card" style="border-left:4px solid #a855f7">
                            <span class="domain-tag" style="background:#f5f3ff; color:#6d28d9">${d.label}</span>
                            <div class="log-content" style="font-weight:700">${d.phrase}</div>
                        </div>
                    `).join('')
                }
                </div>
        `;
        }

        resultDiv.innerHTML = content + `
        <div style="display:flex; gap:10px; margin-top:24px" >
                <button class="btn-primary" style="flex:1" onclick="alert('기록이 클립보드에 복사되었습니다.')">📋 복사하기</button>
                <button class="btn-primary" style="flex:1; background:var(--accent)" onclick="alert('시스템에 자동 저장되었습니다.')">💾 저장/전송</button>
            </div>
        <div style="margin-top:16px; font-size:0.75rem; color:#94a3b8; text-align:center">
            ※ AI 기술을 활용하여 정제된 초안입니다. 실무자의 검토 후 사용하세요.
        </div>
    `;
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }, 1200);
}

function refineGeneralLog(text) {
    // Mimic the domain guideline matching
    let output = "대상자(비식별화)와의 면담을 통해 현재의 실태를 파악한 결과, ";
    let found = false;
    Object.values(AI_RECORD_DOMAINS).forEach(d => {
        if (d.keywords.some(kw => text.includes(kw))) {
            output += d.phrase + ", ";
            found = true;
        }
    });
    if (!found) output += "전반적인 생활 실태 확인 및 정서적 지지 제공함.";
    else output = output.slice(0, -2) + " 상태이므로 차후 집중적인 사례관리 개입이 필요한 것으로 사료됨.";
    return output;
}

function classifyDomains(text) {
    let results = [];
    Object.values(AI_RECORD_DOMAINS).forEach(d => {
        if (d.keywords.some(kw => text.includes(kw))) {
            results.push(d);
        }
    });
    if (results.length === 0) results.push({ label: "종합", phrase: "전반적인 가구 실태 조사 및 욕구 파악 실시함" });
    return results;
}

function initModal() {
    const modalContainer = document.getElementById('modal-container');
    const closeBtn = document.getElementById('close-modal');

    if (closeBtn) {
        closeBtn.onclick = () => {
            modalContainer.classList.add('hidden');
            modalContainer.classList.remove('active');
        };
    }

    window.addEventListener('click', (event) => {
        if (event.target === modalContainer) {
            modalContainer.classList.add('hidden');
            modalContainer.classList.remove('active');
        }
    });
}

function openModal(title, contentHtml) {
    const modalContainer = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    if (modalContainer && modalTitle && modalBody) {
        modalTitle.innerText = title;
        modalBody.innerHTML = contentHtml;
        modalContainer.classList.remove('hidden');
        modalContainer.classList.add('active');
        modalBody.scrollTop = 0;
    }
}

/* --- Official Eligibility Gateway (Bokjiro) --- */

function initEligibilityCalculator() {
    const calcBtn = document.getElementById('calc-eligibility');
    if (calcBtn) {
        calcBtn.onclick = () => {
            const content = `
        <div style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding:24px; border-radius:24px; border:1px solid #bae6fd; margin-bottom:24px" >
                    <h3 style="color:#1e40af; font-size:1.2rem; font-weight:900">🛡️ 안전한 판정을 위한 공식 연결</h3>
                    <p style="font-size:0.9rem; color:#1e40af; line-height:1.6; margin-top:10px">
                        자체 계산기의 오차 리스크를 방지하고 정확한 상담을 위해 <strong>보건복지부 공식 시뮬레이터</strong>로 연결합니다.
                    </p>
                </div>

                <div class="kpi-section">
                    <p style="font-size:0.85rem; font-weight:800; color:#475569; margin-bottom:12px">✅ 상담 전 필수 체크리스트</p>
                    <div style="display:flex; flex-direction:column; gap:12px">
                        ${CHECKLIST_2026.map(item => `
                            <label style="display:flex; gap:12px; background:white; padding:14px; border-radius:14px; border:1px solid #f1f5f9; cursor:pointer; font-size:0.9rem">
                                <input type="checkbox" style="width:18px; height:18px"> 
                                <span style="line-height:1.4; color:#334155">${item}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top:32px">
                    <a href="${BOKJIRO_SIMULATOR_URL}" target="_blank" class="btn-primary" 
                       style="display:block; text-align:center; text-decoration:none; background:#2563eb; padding:18px; font-size:1.1rem">
                       🌐 보건복지부 복지로 연결하기
                    </a>
                    <p style="text-align:center; font-size:0.75rem; color:#94a3b8; margin-top:10px">
                        ※ 외부 브라우저(복지로)에서 판정 완료 후 비밀노트로 돌아와 주세요.
                    </p>
                </div>
    `;
            openModal('수급 자격 판정 가이드', content);
        };
    }
}

/* --- Administrative/Accounting Calculators (Includes LTC) --- */

function initAdminCalculator() {
    const btn = document.getElementById('open-admin-calc');
    if (btn) {
        btn.onclick = () => {
            const content = `
                <div class="admin-tabs" style="display:flex; gap:8px; margin-bottom:24px; padding:4px; background:#f1f5f9; border-radius:12px;">
                    <button class="tab-btn active" id="tab-vat" onclick="switchAdminTab('vat')" style="flex:1; padding:10px 4px; border:none; border-radius:8px; background:white; font-weight:700; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.05); font-size:0.85rem; transition:all 0.2s;">1. 부가세</button>
                    <button class="tab-btn" id="tab-tax" onclick="switchAdminTab('tax')" style="flex:1; padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:#64748b; font-size:0.85rem; transition:all 0.2s;">2. 강사료</button>
                    <button class="tab-btn" id="tab-ltc" onclick="switchAdminTab('ltc')" style="flex:1; padding:10px 4px; border:none; border-radius:8px; background:transparent; font-weight:600; color:#64748b; font-size:0.85rem; transition:all 0.2s;">3. 장기요양</button>
                </div>

                <div id="admin-content-vat" class="tab-content" style="animation: fadeIn 0.3s ease;">
                    
                    <!-- 부가세 역산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px;">
                        <h4 style="color:#0f172a; font-weight:800; font-size:1.1rem; margin-bottom:16px;">🧾 부가세/공급가액 역산기</h4>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">총 결제금액 입력 (원)</label>
                            <input type="number" id="vat-input" class="calc-input" placeholder="예: 55000" oninput="calcVAT()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                <span style="color:#64748b; font-size:0.9rem;">공급가액</span>
                                <span id="vat-supply" style="font-weight:700; color:#0f172a; font-size:1rem;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
                                <span style="color:#64748b; font-size:0.9rem;">부가세 (10%)</span>
                                <span id="vat-tax" style="font-weight:700; color:#0f172a; font-size:1rem;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:12px;">
                                <span style="font-weight:800; color:var(--primary); font-size:0.95rem;">W4C 복사용 서식</span>
                                <button onclick="navigator.clipboard.writeText(document.getElementById('vat-copy-text').innerText); alert('복사되었습니다.')" style="background:#e0e7ff; color:var(--primary); border:none; border-radius:6px; padding:6px 12px; font-size:0.8rem; font-weight:800; cursor:pointer;">복사하기</button>
                            </div>
                            <div id="vat-copy-text" style="font-size:0.85rem; color:#475569; margin-top:8px;">공급가액 0원 / 부가세 0원</div>
                        </div>
                    </div>

                </div>

                <div id="admin-content-tax" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    
                    <!-- 강사료 세금역산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px; border-color:#e0e7ff;">
                        <h4 style="color:#4f46e5; font-weight:800; font-size:1.1rem; margin-bottom:8px;">👩‍🏫 강사료 세금 역산기</h4>
                        <p style="font-size:0.8rem; color:#4338ca; margin-bottom:16px;">실수령액 기준 품의서 작성을 위한 세전(Gross) 금액 역산</p>
                        <div style="display:flex; gap:10px; margin-bottom:16px;">
                            <button id="btn-tax-business" onclick="setTaxType('business')" class="btn-primary" style="flex:1; background:var(--primary); padding:10px 0; font-size:0.9rem;">사업소득 (3.3%)</button>
                            <button id="btn-tax-other" onclick="setTaxType('other')" class="btn-primary btn-outline" style="flex:1; padding:10px 0; font-size:0.9rem;">기타소득 (8.8%)</button>
                        </div>
                        <p id="tax-desc" style="font-size:0.75rem; color:#64748b; margin-bottom:16px; background:#f1f5f9; padding:10px; border-radius:8px;">💡 <strong>사업소득(3.3%)</strong>: 직업적, 계속적, 반복적으로 강의를 하는 전문 강사 등</p>

                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">강사에게 지급할 '실수령액' (원)</label>
                            <input type="number" id="instructor-input" class="calc-input" placeholder="예: 150000" oninput="calcInstructorTax()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        
                        <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                                <span style="font-weight:800; color:#3730a3; font-size:0.95rem;">품의해야 할 세전 총액</span>
                                <span id="inst-gross" style="font-weight:900; color:#312e81; font-size:1.1rem;">0원</span>
                            </div>
                            <div style="font-size:0.85rem; color:#4f46e5; display:flex; justify-content:space-between;">
                                <span>원천징수 세액</span>
                                <span id="inst-tax" style="font-weight:700;">0원</span>
                            </div>
                        </div>
                    </div>

                    <!-- 1인당 예산 검열기 -->
                    <div class="step-card beautiful-card" id="budget-checker-card" style="padding:20px; transition:all 0.3s; border:2px solid transparent;">
                        <h4 style="color:#0f172a; font-weight:800; font-size:1.1rem; margin-bottom:8px;">🍽️ 1인당 단가 검열기 (식대/다과)</h4>
                        
                        <div style="display:flex; gap:12px; margin-bottom:16px; margin-top:16px;">
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:#64748b; font-weight:600;">총 영수증 금액</label>
                                <input type="number" id="budget-total" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:#64748b; font-weight:600;">참석 인원 (명)</label>
                                <input type="number" id="budget-people" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; background:#f8fafc; padding:12px; border-radius:12px;">
                            <label style="font-size:0.8rem; color:#475569; font-weight:800; flex:1;">W4C 지침 내부 한도액</label>
                            <input type="number" id="budget-limit" value="8000" class="calc-input" style="width:100px; padding:8px; text-align:right" oninput="checkBudget()">
                            <span style="font-size:0.8rem; color:#64748b;">원</span>
                        </div>

                        <div id="budget-feedback" style="padding:16px; border-radius:12px; text-align:center; background:#f1f5f9; font-weight:700; color:#64748b; transition:all 0.3s ease;">
                            금액과 인원을 입력해주세요.
                        </div>
                    </div>

                </div>

                <div id="admin-content-ltc" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    
                    <div class="step-card beautiful-card" style="padding:20px;">
                        <h4 style="color:#0f172a; font-weight:800; font-size:1.1rem; margin-bottom:16px;">👵 방문요양 장기요양 계산기</h4>
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">장기요양 등급</label>
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
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">본인부담 율 (%)</label>
                            <select id="ltc-rate" class="calc-input">
                                <option value="0.15">일반 (15%)</option>
                                <option value="0.09">감경 (9%)</option>
                                <option value="0.06">감경 (6%)</option>
                                <option value="0">기초 (0%)</option>
                            </select>
                        </div>
                        <div class="form-group" style="background:#f8fafc; padding:16px; border-radius:12px; margin-top:20px; border:1px solid #e2e8f0;">
                            <label style="color:var(--primary); font-weight:800; font-size:0.9rem;">방문요양 서비스 설정</label>
                            <div style="display:flex; gap:10px; margin-top:12px;">
                                <div style="flex:1;">
                                    <label style="font-size:0.8rem; color:#64748b;">1회 이용시간</label>
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
                                    <label style="font-size:0.8rem; color:#64748b;">월 이용일수</label>
                                    <input type="number" id="ltc-days" value="20" min="1" max="31" class="calc-input">
                                </div>
                            </div>
                        </div>
                        <button class="btn-primary" id="run-ltc-calc" style="width:100%; margin-top:20px; padding:14px; font-size:1.05rem;">정밀 계산하기</button>
                        <div id="ltc-result" class="hidden" style="margin-top:20px;"></div>
                    </div>

                </div>
            `;
            openModal('행정/회계 마스터 💸', content);

            // Set initial state
            window.currentTaxRate = 0.033;
            document.getElementById('run-ltc-calc').onclick = calculateLTC;
        };
    }
}
function calculateLTC() {
    const grade = parseInt(document.getElementById('ltc-grade').value);
    const rate = parseFloat(document.getElementById('ltc-rate').value);
    const time = parseInt(document.getElementById('ltc-time').value);
    const days = parseInt(document.getElementById('ltc-days').value) || 0;

    const limit = LTC_THRESHOLDS_2026[grade];
    const unitPrice = LTC_HOURLY_RATES_2026[time];
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
            <hr style="border:0; border-top:1px solid #e2e8f0; margin:16px 0">
            <div class="result-item"><span class="result-label">정부 지원금 (공단 부담)</span><span style="color:var(--accent); font-weight:800">${Math.round(support).toLocaleString()}원</span></div>
            <div class="result-item"><span class="result-label">최종 본인부담금</span><span style="color:#b91c1c; font-weight:900; font-size:1.3rem">${Math.round(total).toLocaleString()}원</span></div>
            <div style="background:#fff7ed; padding:12px; border-radius:10px; margin-top:16px; font-size:0.8rem; color:#9a3412; border:1px solid #ffedd5">💡 남은 한도액: <strong>${Math.max(0, limit - (price * days)).toLocaleString()}원</strong></div>
            <button class="btn-primary" style="background:var(--accent); margin-top:20px" onclick="alert('결과가 전송되었습니다!')">📄 전문가용 결과 전송</button>
        </div>
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
}

/* --- Administrative/Accounting Calculators --- */

function initAdminCalculator() {
    const btn = document.getElementById('open-admin-calc');
    if (btn) {
        btn.onclick = () => {
            const content = `
                <div class="admin-tabs" style="display:flex; gap:8px; margin-bottom:24px; padding:4px; background:#f1f5f9; border-radius:12px;">
                    <button class="tab-btn active" id="tab-vat" onclick="switchAdminTab('vat')" style="flex:1; padding:12px; border:none; border-radius:8px; background:white; font-weight:700; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.05); transition:all 0.2s;">1. 부가세/원단위</button>
                    <button class="tab-btn" id="tab-tax" onclick="switchAdminTab('tax')" style="flex:1; padding:12px; border:none; border-radius:8px; background:transparent; font-weight:600; color:#64748b; transition:all 0.2s;">2. 강사료/식대</button>
                </div>

                <div id="admin-content-vat" class="tab-content" style="animation: fadeIn 0.3s ease;">
                    
                    <!-- 부가세 역산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px;">
                        <h4 style="color:#0f172a; font-weight:800; font-size:1.1rem; margin-bottom:16px;">🧾 부가세/공급가액 역산기</h4>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">총 결제금액 입력 (원)</label>
                            <input type="number" id="vat-input" class="calc-input" placeholder="예: 55000" oninput="calcVAT()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                <span style="color:#64748b; font-size:0.9rem;">공급가액</span>
                                <span id="vat-supply" style="font-weight:700; color:#0f172a; font-size:1rem;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
                                <span style="color:#64748b; font-size:0.9rem;">부가세 (10%)</span>
                                <span id="vat-tax" style="font-weight:700; color:#0f172a; font-size:1rem;">0원</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:12px;">
                                <span style="font-weight:800; color:var(--primary); font-size:0.95rem;">W4C 복사용 서식</span>
                                <button onclick="navigator.clipboard.writeText(document.getElementById('vat-copy-text').innerText); alert('복사되었습니다.')" style="background:#e0e7ff; color:var(--primary); border:none; border-radius:6px; padding:6px 12px; font-size:0.8rem; font-weight:800; cursor:pointer;">복사하기</button>
                            </div>
                            <div id="vat-copy-text" style="font-size:0.85rem; color:#475569; margin-top:8px;">공급가액 0원 / 부가세 0원</div>
                        </div>
                    </div>

                </div>

                <div id="admin-content-tax" class="tab-content" style="display:none; animation: fadeIn 0.3s ease;">
                    
                    <!-- 강사료 세금역산기 -->
                    <div class="step-card beautiful-card" style="margin-bottom:24px; padding:20px; border-color:#e0e7ff;">
                        <h4 style="color:#4f46e5; font-weight:800; font-size:1.1rem; margin-bottom:8px;">👩‍🏫 강사료 세금 역산기</h4>
                        <p style="font-size:0.8rem; color:#4338ca; margin-bottom:16px;">실수령액 기준 품의서 작성을 위한 세전(Gross) 금액 역산</p>
                        <div style="display:flex; gap:10px; margin-bottom:16px;">
                            <button id="btn-tax-business" onclick="setTaxType('business')" class="btn-primary" style="flex:1; background:var(--primary); padding:10px 0; font-size:0.9rem;">사업소득 (3.3%)</button>
                            <button id="btn-tax-other" onclick="setTaxType('other')" class="btn-primary btn-outline" style="flex:1; padding:10px 0; font-size:0.9rem;">기타소득 (8.8%)</button>
                        </div>
                        <p id="tax-desc" style="font-size:0.75rem; color:#64748b; margin-bottom:16px; background:#f1f5f9; padding:10px; border-radius:8px;">💡 <strong>사업소득(3.3%)</strong>: 직업적, 계속적, 반복적으로 강의를 하는 전문 강사 등</p>

                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                            <label style="font-size:0.85rem; color:#475569; font-weight:600;">강사에게 지급할 '실수령액' (원)</label>
                            <input type="number" id="instructor-input" class="calc-input" placeholder="예: 150000" oninput="calcInstructorTax()" style="font-size:1.1rem; padding:12px;">
                        </div>
                        
                        <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                                <span style="font-weight:800; color:#3730a3; font-size:0.95rem;">품의해야 할 세전 총액</span>
                                <span id="inst-gross" style="font-weight:900; color:#312e81; font-size:1.1rem;">0원</span>
                            </div>
                            <div style="font-size:0.85rem; color:#4f46e5; display:flex; justify-content:space-between;">
                                <span>원천징수 세액</span>
                                <span id="inst-tax" style="font-weight:700;">0원</span>
                            </div>
                        </div>
                    </div>

                    <!-- 1인당 예산 검열기 -->
                    <div class="step-card beautiful-card" id="budget-checker-card" style="padding:20px; transition:all 0.3s; border:2px solid transparent;">
                        <h4 style="color:#0f172a; font-weight:800; font-size:1.1rem; margin-bottom:8px;">🍽️ 1인당 단가 검열기 (식대/다과)</h4>
                        
                        <div style="display:flex; gap:12px; margin-bottom:16px; margin-top:16px;">
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:#64748b; font-weight:600;">총 영수증 금액</label>
                                <input type="number" id="budget-total" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:0.8rem; color:#64748b; font-weight:600;">참석 인원 (명)</label>
                                <input type="number" id="budget-people" class="calc-input" style="padding:10px;" oninput="checkBudget()">
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; background:#f8fafc; padding:12px; border-radius:12px;">
                            <label style="font-size:0.8rem; color:#475569; font-weight:800; flex:1;">W4C 지침 내부 한도액</label>
                            <input type="number" id="budget-limit" value="8000" class="calc-input" style="width:100px; padding:8px; text-align:right" oninput="checkBudget()">
                            <span style="font-size:0.8rem; color:#64748b;">원</span>
                        </div>

                        <div id="budget-feedback" style="padding:16px; border-radius:12px; text-align:center; background:#f1f5f9; font-weight:700; color:#64748b; transition:all 0.3s ease;">
                            금액과 인원을 입력해주세요.
                        </div>
                    </div>

                </div>
            `;
            openModal('행정/회계 마스터 💸', content);

            // Set initial state
            window.currentTaxRate = 0.033;
        };
    }
}

// Global functions for Admin calculator scoping
window.switchAdminTab = function (tabName) {
    document.getElementById('admin-content-vat').style.display = tabName === 'vat' ? 'block' : 'none';
    document.getElementById('admin-content-tax').style.display = tabName === 'tax' ? 'block' : 'none';
    document.getElementById('admin-content-ltc').style.display = tabName === 'ltc' ? 'block' : 'none';

    const btnVat = document.getElementById('tab-vat');
    const btnTax = document.getElementById('tab-tax');
    const btnLtc = document.getElementById('tab-ltc');

    const setActive = (btn) => {
        btn.style.background = 'white';
        btn.style.color = 'var(--primary)';
        btn.style.fontWeight = '700';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
    };

    const setInactive = (btn) => {
        btn.style.background = 'transparent';
        btn.style.color = '#64748b';
        btn.style.fontWeight = '600';
        btn.style.boxShadow = 'none';
    };

    setInactive(btnVat); setInactive(btnTax); setInactive(btnLtc);

    if (tabName === 'vat') setActive(btnVat);
    else if (tabName === 'tax') setActive(btnTax);
    else if (tabName === 'ltc') setActive(btnLtc);
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
    const supply = Math.floor(total / 1.1);
    const tax = total - supply;

    document.getElementById('vat-supply').innerText = supply.toLocaleString() + '원';
    document.getElementById('vat-tax').innerText = tax.toLocaleString() + '원';
    document.getElementById('vat-copy-text').innerText = `공급가액 ${supply.toLocaleString()}원 / 부가세 ${tax.toLocaleString()}원`;
};

window.setTaxType = function (type) {
    const btnBus = document.getElementById('btn-tax-business');
    const btnOth = document.getElementById('btn-tax-other');
    const desc = document.getElementById('tax-desc');

    if (type === 'business') {
        window.currentTaxRate = 0.033;
        btnBus.classList.remove('btn-outline');
        btnBus.style.background = 'var(--primary)';
        btnBus.style.color = 'white';

        btnOth.classList.add('btn-outline');
        btnOth.style.background = 'white';
        btnOth.style.color = '#475569';

        desc.innerHTML = `💡 <strong>사업소득(3.3%)</strong>: 직업적, 계속적, 반복적으로 강의를 하는 전문 강사 등`;
    } else {
        window.currentTaxRate = 0.088;
        btnOth.classList.remove('btn-outline');
        btnOth.style.background = 'var(--primary)';
        btnOth.style.color = 'white';

        btnBus.classList.add('btn-outline');
        btnBus.style.background = 'white';
        btnBus.style.color = '#475569';

        desc.innerHTML = `💡 <strong>기타소득(8.8%)</strong>: 일시적, 우발적으로 특강 등을 진행하는 비전문 강사 등<br><span style="font-size:0.75rem; color:#ef4444">* 세전 125,000원(실수령액 114,000원) 이하는 과세최저한으로 세금 감면</span>`;
    }
    calcInstructorTax();
};

window.calcInstructorTax = function () {
    const input = document.getElementById('instructor-input').value;
    const rate = window.currentTaxRate;
    const isOther = rate === 0.088;

    if (!input || isNaN(input)) {
        document.getElementById('inst-gross').innerText = '0원';
        document.getElementById('inst-tax').innerText = '0원';
        return;
    }

    const net = parseInt(input);
    let gross = 0;
    let tax = 0;

    if (isOther) {
        // 기타소득 (8.8%)
        if (net <= 114000) { // 125,000 * 0.912 => 114,000 won
            gross = net;
            tax = 0;
        } else {
            // Net = Gross - Gross * 0.088
            // Gross = Net / 0.912
            let approxGross = Math.round(net / 0.912);
            gross = Math.floor(approxGross / 10) * 10;
            tax = gross - net;

            // Re-eval check without while loop (prevent freeze)
            let actualTax = Math.floor(gross * 0.088 / 10) * 10;
            if (gross - actualTax !== net) {
                // simple direct adjustment
                tax = actualTax;
                gross = net + tax;
            }
        }
    } else {
        // 사업소득 (3.3%)
        let approxGross = Math.round(net / 0.967);
        gross = Math.floor(approxGross / 10) * 10;
        tax = gross - net;

        let actualTax = Math.floor(gross * 0.033 / 10) * 10;
        if (gross - actualTax !== net) {
            tax = actualTax;
            gross = net + tax;
        }
    }

    document.getElementById('inst-gross').innerText = gross.toLocaleString() + '원';
    document.getElementById('inst-tax').innerText = tax.toLocaleString() + '원';
};

window.checkBudget = function () {
    const totalInput = document.getElementById('budget-total').value;
    const peopleInput = document.getElementById('budget-people').value;
    const limitInput = document.getElementById('budget-limit').value;
    const fbBox = document.getElementById('budget-feedback');
    const card = document.getElementById('budget-checker-card');

    if (!totalInput || !peopleInput || !limitInput) {
        fbBox.innerText = '금액과 인원을 모두 입력해주세요.';
        fbBox.style.background = '#f1f5f9';
        fbBox.style.color = '#64748b';
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
    { category: "회계/행정", icon: "📢", word: "기안문", meaning: "우리 이거 할게요!", desc: "행사나 사업을 시작하겠다는 선전포고" },
    { category: "회계/행정", icon: "💰", word: "품의서", meaning: "이거 할 건데, 돈 좀 쓸게요!", desc: "물건 사기 전 허락받기" },
    { category: "회계/행정", icon: "🧾", word: "지출결의서", meaning: "허락하신 돈, 이렇게 썼어요!", desc: "영수증 딱풀로 붙여서 제출" },
    { category: "회계/행정", icon: "📑", word: "결과보고서", meaning: "우리 이거 무사히 끝냈어요!", desc: "사진 박고, 남은 돈 반납할 때 씀" },
    { category: "회계/행정", icon: "🙏", word: "프로포절 (Proposal)", meaning: "저희한테 돈 주시면 진짜 기깔나게 써볼게요!", desc: "외부 재단에 보내는 눈물의 제안서" },
    { category: "회계/행정", icon: "😭", word: "자부담", meaning: "지원금 말고, 우리 기관 쌩돈", desc: "매칭 비율 맞출 때 피눈물 나는 돈" },
    { category: "회계/행정", icon: "🔄", word: "전용 (예산 전용)", meaning: "A 주머니 돈을 B 주머니로 옮길게요", desc: "관할 관청에 허락받아야 함" },
    { category: "회계/행정", icon: "📥", word: "수입결의서", meaning: "우와, 우리 통장에 돈 들어왔어요!", desc: "후원금, 보조금 등 입금" },
    { category: "회계/행정", icon: "🚌", word: "여비교통비", meaning: "출장 가서 쓴 밥값, 차비 (내 돈 먼저 쓰고 나중에 받기)", desc: "여비 교부" },
    { category: "사례관리", icon: "🕵️", word: "인테이크 (Intake)", meaning: "첫 만남. 기초 현황 조사하면서 우리 기관이랑 맞는지 간 보기", desc: "초기 면접" },
    { category: "사례관리", icon: "🔍", word: "어세스먼트 (Assessment)", meaning: "이 분에게 진짜 뭐가 필요한지 샅샅이 파악하기", desc: "사정 (문제 및 욕구 파악)" },
    { category: "사례관리", icon: "🤝", word: "라포 (Rapport) 형성", meaning: "클라이언트랑 짱친 먹기. (이거 안 되면 아무것도 안 됨)", desc: "친밀한 신뢰 관계 형성" },
    { category: "사례관리", icon: "📞", word: "모니터링", meaning: "계획대로 잘 지내시나~ 하고 슬쩍 엿보거나 안부 전화하기", desc: "서비스 개입 후 점검" },
    { category: "사례관리", icon: "🔗", word: "자원 연계", meaning: "우리가 못 도와주니까, 이거 해줄 수 있는 옆 동네 단체 연결시켜 주기", desc: "지역사회 자원 동원" },
    { category: "사례관리", icon: "👋", word: "종결", meaning: "이별의 시간. 다 나아서 자립했거나, 이사 가셔서 그만 만나요", desc: "사례관리 목표 달성 후 마무리" },
    { category: "기관생활", icon: "😎", word: "공가", meaning: "나라 일이나 예비군, 건강검진 때문에 당당하게 합법적으로 쉬는 날", desc: "공적 업무로 인한 휴가" },
    { category: "기관생활", icon: "🤒", word: "병가", meaning: "나 진짜 아파서 쉬는 거임 (진단서 떼와야 할 수도 있음)", desc: "질병 또는 부상으로 인한 휴가" },
    { category: "기관생활", icon: "📦", word: "수불부", meaning: "물건이나 후원품 언제/누구한테 들어와서 나갔는지 적는 깐깐한 장부", desc: "물품 수입 및 불출 대장" },
    { category: "기관생활", icon: "💻", word: "W4C / 희망이음", meaning: "사회복지사들의 영혼을 갈아 넣는 매운맛 국가 전산망 시스템", desc: "사회복지시설 정보시스템 / 차세대 시스템" }
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
                           style="width:100%; padding:14px 14px 14px 46px; border-radius:14px; border:2px solid #e2e8f0; font-size:1rem; font-family:inherit; background:#f8fafc; transition:all 0.2s; outline:none; box-sizing:border-box;">
                </div>

                <!-- Category Tabs -->
                <div id="voca-tab-bar" style="display:flex; gap:8px; margin-bottom:20px; padding:4px; background:#f1f5f9; border-radius:12px;">
                    <button onclick="switchVocaTab('회계/행정')" id="tab-voca-acct"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; background:white; color:var(--primary); box-shadow:0 2px 4px rgba(0,0,0,0.06); transition:all 0.2s;">
                        💰 회계/행정
                    </button>
                    <button onclick="switchVocaTab('사례관리')" id="tab-voca-case"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer; background:transparent; color:#64748b; transition:all 0.2s;">
                        🤝 사례관리
                    </button>
                    <button onclick="switchVocaTab('기관생활')" id="tab-voca-life"
                        style="flex:1; padding:10px 4px; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer; background:transparent; color:#64748b; transition:all 0.2s;">
                        🏢 기관생활
                    </button>
                </div>

                <!-- Voca list -->
                <div id="voca-list-container" style="display:flex; flex-direction:column; gap:14px; max-height:55vh; overflow-y:auto; padding-right:4px;">
                </div>
            `;
            openModal('초보 복지사 생존 단어장 📖', content);

            // render default tab
            renderVocaList(VOCABULARY_DATA.filter(d => d.category === vocaActiveCategory));

            // focus event
            const si = document.getElementById('voca-search');
            if (si) {
                si.addEventListener('focus', () => si.style.borderColor = 'var(--primary)');
                si.addEventListener('blur', () => si.style.borderColor = '#e2e8f0');
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
            el.style.background = 'white';
            el.style.color = 'var(--primary)';
            el.style.fontWeight = '700';
            el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';
        } else {
            el.style.background = 'transparent';
            el.style.color = '#64748b';
            el.style.fontWeight = '600';
            el.style.boxShadow = 'none';
        }
    });

    renderVocaList(VOCABULARY_DATA.filter(d => d.category === cat));
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
            el.style.color = '#64748b';
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
            <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                <div style="font-size:3rem; margin-bottom:12px;">😢</div>
                <p style="font-weight:700">검색 결과가 없습니다.</p>
                <p style="font-size:0.85rem">다른 키워드로 검색해보세요.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = data.map(item => `
        <div class="voca-card" style="background:white; border-radius:16px; padding:20px; border:1px solid #e2e8f0; box-shadow:0 4px 6px rgba(0,0,0,0.02); transition:transform 0.2s">
            <div style="display:flex; align-items:flex-start; gap:16px;">
                <div style="background:#f1f5f9; min-width:54px; height:54px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:1.8rem;">
                    ${item.icon}
                </div>
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <h4 style="font-size:1.2rem; font-weight:800; color:var(--text-dark); margin:0;">${item.word}</h4>
                        <span style="background:#e0e7ff; color:#4f46e5; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:20px;">${item.category}</span>
                    </div>
                    <p style="font-size:0.95rem; color:#1e293b; line-height:1.5; font-weight:600; margin-bottom:8px;">${item.meaning}</p>
                    <p style="font-size:0.8rem; color:#64748b; margin:0; display:inline-block; border-left:3px solid #cbd5e1; padding-left:8px;">📝 행정 의미: ${item.desc}</p>
                </div>
            </div>
        </div>
    `).join('');
}


