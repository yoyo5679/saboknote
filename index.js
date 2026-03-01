try {
    /**
     * Social Worker's Secret Note - Core Logic
     */

    /* --- Supabase Configuration --- */
    const supabaseUrl = 'https://seldrnpohdkggennjieo.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbGRybnBvaGRrZ2dlbm5qaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzI3MjksImV4cCI6MjA4NzgwODcyOX0.PyzWPa-kwYgh-HmuDELD642TCVn7Ajri54FsR7Ik2Gs';
    const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

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

    /* --- Newsletter Reader (비밀 편지) --- */
    function initNewsletterReader() {
        const btn = document.getElementById('open-newsletter-read');
        if (btn) {
            btn.onclick = () => {
                const content = `
                <div style="text-align:center; padding: 20px 0;">
                    <div style="font-size:3rem; margin-bottom:12px; animation: bounce 2s infinite">💌</div>
                    <h3 style="font-size:1.4rem; color:var(--text-dark); margin-bottom:8px; font-weight:900">비밀 편지</h3>
                    <p style="font-size:0.95rem; color:#64748b; margin-bottom:24px; line-height:1.5;"><strong>"쉿! 이건 비밀인데 너한테만 알려주는거야."</strong><br>팀장님 몰래 보는 진짜 쓸모있는 복지 트렌드랑 막히는 업무 뚫어주는 AI 꼼수! 출퇴근길 3분이면 충분해 😎</p>
                    
                    <div style="background:#f5f3ff; padding:20px; border-radius:16px; border:1px solid #ede9fe; text-align:left; margin-bottom:24px">
                        <div style="font-size:0.8rem; font-weight:800; color:#7c3aed; margin-bottom:12px">📮 이번 주 편지 미리보기</div>
                        <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed #ddd6fe">
                            <strong style="color:#0f172a; font-size:0.95rem; display:block; margin-bottom:4px">[Vol 1.] 2026 복지 패러다임 변화, 사회복지사를 위한 AI 활용법 101</strong>
                            <span style="font-size:0.8rem; color:#64748b">발행일: 오늘</span>
                        </div>
                        <div>
                            <strong style="color:#0f172a; font-size:0.95rem; display:block; margin-bottom:4px">[Vol 2.] 최신 고독사 예방 가이드라인 & 선진국 대응 사례 총정리</strong>
                            <span style="font-size:0.8rem; color:#64748b">발행일: 다음 주 예정</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <input type="email" class="calc-input" placeholder="이메일 주소만 쓱 남겨봐" style="font-size:1rem; padding:14px; border:2px solid #e2e8f0; border-radius:12px;">
                        <button class="btn-primary" style="background:linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding:16px; font-size:1.1rem; border-radius:12px; box-shadow:0 4px 14px rgba(124,58,237,0.3)" onclick="alert('🎉 오케이 접수! 평생 무료로 비밀 편지 쏴줄게...💌')">나도 비밀 편지 받아볼래!</button>
                    </div>
                </div>
            `;
                openModal('비밀 편지 구독방', content);
            };
        }
    }

    /* --- User Request Modal (무엇이든 물어보살) --- */
    function initRequestModal() {
        const btn = document.getElementById('open-request-modal');
        if (btn) {
            btn.onclick = () => {
                const content = `
                <div style="text-align:center; padding: 10px 0;">
                    <div style="font-size:3rem; margin-bottom:12px; animation: float 3s ease-in-out infinite">🧞‍♂️</div>
                    <h3 style="font-size:1.3rem; color:var(--text-dark); margin-bottom:8px; font-weight:900">무엇이든 물어보살</h3>
                    <p style="font-size:0.9rem; color:#64748b; margin-bottom:24px; line-height:1.5;">필요한 프롬프트나 헷갈리는 사회복지 용어가 있나요?<br>사복천재에게 남겨주시면 다음 업데이트 때 쓱- 추가해 드릴게요!</p>
                    
                    <div style="text-align:left; margin-bottom:20px;">
                        <label style="font-size:0.85rem; font-weight:800; color:#475569; display:block; margin-bottom:8px;">어떤 카테고리의 요청인가요?</label>
                        <select id="request-category" class="calc-input" style="font-size:0.95rem; padding:12px; border:1px solid #cbd5e1; border-radius:10px; background:#f8fafc;">
                            <option value="prompt">🪄 AI 비밀 프롬프트 추가 요청</option>
                            <option value="voca">📖 초보복지사 생존단어 추가 요청</option>
                            <option value="calc">💸 행정/회계 마스터 계산기 추가 요청</option>
                            <option value="other">💡 기타 아이디어 및 건의사항</option>
                        </select>
                    </div>

                    <div style="text-align:left; margin-bottom:24px;">
                        <label style="font-size:0.85rem; font-weight:800; color:#475569; display:block; margin-bottom:8px;">자세한 내용을 적어주세요</label>
                        <textarea id="request-content" class="calc-input" placeholder="예: 사례관리 기록할 때 쓸 수 있는 프롬프트 좀 만들어주세요!&#10;예: '결연후원' 정확한 행정 처리 뜻이 뭔가요?" style="height:120px; font-size:0.95rem; padding:14px; border:1px solid #cbd5e1; border-radius:10px; resize:none;"></textarea>
                    </div>

                    <button class="btn-primary" style="width:100%; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding:16px; font-size:1.1rem; border-radius:12px; box-shadow:0 4px 14px rgba(245,158,11,0.3); border:none;" onclick="submitRequest()">램프 문지르기 (요청 전송)</button>
                </div>
            `;
                openModal('사복천재 소환하기', content);
            };
        }
    }

    window.submitRequest = function () {
        const content = document.getElementById('request-content').value;
        if (!content.trim()) {
            alert('요청 내용을 조금이라도 적어주셔야 사복천재가 알아들을 수 있어요! 😅');
            return;
        }

        // In a real app, this would be an API call
        const btn = document.querySelector('#modal-body .btn-primary');
        btn.innerHTML = '전송 중... 🚀';
        btn.style.opacity = '0.7';

        setTimeout(() => {
            alert('🎉 소원이 접수되었습니다! 뚝딱뚝딱 만들어서 금방 돌아올게요!');
            document.getElementById('close-modal').click();
        }, 800);
    };

    document.addEventListener('DOMContentLoaded', () => {
        initModal();
        initEligibilityCalculator();
        initDashboard();
        initAIPrompter();
        initAdminCalculator();
        initVocaDictionary();
        initNewsletterReader();
        initRequestModal();
        initRecordTemplates();
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
            1: '820,556원',
            2: '1,343,773원',
            3: '1,714,892원',
            4: '2,078,316원'
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
                        <h3 style="font-size:1.8rem; font-weight:900; margin-top:4px">10,320원</h3>
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

    /* --- 사복천재의 비밀 프롬프트 (AI Work Prompter) --- */

    const AI_PROMPTS = {
        counseling: {
            title: "AI 상담일지 분석 전문가 (Pro)",
            icon: "📝",
            description: "[사회복지 기록지침 적용] 일상적인 상담 메모를 PIE(환경 속 인간) 관점에 기반한 전문적인 공식 상담일지로 정제합니다.",
            prompt: `[역할: 20년 경력의 종합사회복지관 수석 사회복지사 및 감수 위원]
[임무: 아래 제공되는 거친 상담 메모를 '사회복지시설 기록관리지침'을 준수한 고품질의 공식 상담일지(과정기록/요약기록) 형식으로 변환하라.]

[기록 원칙 및 지침]
1. 객관성과 전문성: 감정적 표현이나 구어체('~갔다 옴', '~라 함')를 배제하고, 사실 기반의 간결하고 명확한 문어체 행정 용어(~함, ~임, ~을 확인함)로 작성할 것.
2. 사실과 판단의 분리: 클라이언트의 진술(주관적 호소)과 워커의 관찰(객관적 사실)을 명확히 구분할 것.
3. PIE(Person-In-Environment) 관점: 클라이언트의 개인적 특성뿐만 아니라 환경적 요인(가족, 지역사회 지원체계) 상호작용을 분석할 것.
4. 강점 관점(Strengths Perspective) 통합: 문제나 결핍에만 집중하지 않고, 클라이언트가 가진 내/외부적 자원과 강점을 반드시 발굴하여 기록할 것.
5. 개인정보 보호: 실명, 주민번호, 구체적 주소 및 개인 식별이 가능한 민감정보는 'OOO', '***' 등으로 완벽히 마스킹 처리할 것.

[출력 구조]
■ 접수/상담 개요: 방문/상담 목적 (1~2줄 요약)
■ 주 호소 문제 (Presenting Problem): 클라이언트의 핵심 욕구와 현재 겪고 있는 주요 어려움
■ 상담 내용 및 관찰 (Observation & Fact):
  - 클라이언트 진술 요약 (사실 위주)
  - 정보 제공 및 워커의 개입 내용
  - 비언어적 태도 및 환경적 관찰 사항 (정서 상태, 거주환경 등)
■ 전문가 사정 및 평가 (Assessment): PIE 관점 및 강점 관점을 적용한 사회복지사의 전문적 해석과 소견 (3~4문장)
■ 향후 계획 (Future Plan): 구체적이고 실행 가능한 단기 개입 계획 및 자원 연계 방안

상담 메모 내용:
{{INPUT}}`
        },
        case: {
            title: "AI 사례관리 마스터 (Pro)",
            icon: "📋",
            description: "[보건복지부 통합사례관리 지침 적용] 복합 위기가구를 분석하고, SMART 기법이 적용된 체계적인 개입 계획을 수립합니다.",
            prompt: `[역할: 보건복지부 희망복지지원단 및 종합사회복지관 통합사례관리 슈퍼바이저]
[임무: 다음 상담 및 배경 정보를 분석하여, '통합사례관리 사업안내' 지침에 부합하는 전문가 수준의 [초기사정 및 개입계획서]를 작성하라.]

[사례분석 및 작성 지침]
1. 6대 욕구 영역 사정: 건강, 일상생활유지, 가족/사회관계, 경제, 교육/취업, 안전/권익보장 영역 중 발견된 위기 요인과 결핍을 논리적으로 진단할 것.
2. 생태체계적 관점(Eco-systems Perspective): 가계도(Genogram)와 생태도(Ecomap)를 그릴 수 있을 수준의 핵심 지지체계 및 갈등 구조를 텍스트로 시각화하여 요약할 것.
3. 위기 정도 평가: 긴급성, 심각성, 만성성, 클라이언트의 극복 의지를 종합하여 '고난도/집중/일반' 사례 중 어느 분류에 해당하는지 근거와 함께 제시할 것.
4. SMART 목표 설정: 개입 목표는 구체적(Specific), 측정가능(Measurable), 성취가능(Achievable), 현실적(Realistic), 기한이 있는(Time-bound) 형태로 서술할 것.
5. 다중 역할 개입: 조력자(Enabler), 중개자(Broker), 옹호자(Advocate) 등 사회복지사의 다각적 역할에 맞춘 자원 연계(공공/민간) 계획을 맵핑할 것.

[출력 구조]
■ 사례 개요 및 위기 수준 진단: (종합적 상황 요약 및 위기 정도 평가)
■ 영역별 사정 (Assessment by Domain): (진단된 주요 영역의 위험 요인과 클라이언트/환경 강점)
■ 핵심 장애물 및 문제 구조: (목표 달성을 방해하는 가장 큰 취약점)
■ 사례관리 개입 목표 (SMART Goals):
  - 단기 목표: (1~3개월 내 달성, ex: 자살위험 감소 및 기초생계비 신청)
  - 장기 목표: (6~12개월 달성, ex: 근로 능력 회복 및 자립 지지체계 형성)
■ 실행 및 자원 연계 계획: (공공수급, 보건의료, 심리상담, 민간후원 결연 등 구체적 Action Plan)

사례 내용:
{{INPUT}}`
        },
        background: {
            title: "AI 프로포절/추진배경 (Pro)",
            icon: "💡",
            description: "[공동모금회 프로포절 심사기준 적용] 데이터 기반의 논리 모델을 적용하여 설득력 있는 사업 필요성을 도출합니다.",
            prompt: `[역할: 사회복지 공동모금회 배분심사위원 및 20년 차 프로그램 개발/평가 전문가]
[임무: 제공된 사업 아이디어와 키워드를 바탕으로, 심사위원을 단번에 설득할 수 있는 최상위 수준의 '사업 추진 배경 및 필요성(프로포절)' 단락을 완성하라.]

[기획 및 작성 지침]
1. 데이터 기반 문제 제기(Evidence-Based): 대상자의 문제를 단순한 감정적 호소가 아닌, 거시적 통계(국가 지표, 언론 보도)와 미시적 데이터(지역사회 욕구조사, 기관 내부 사례)를 교차로 가공하여 객관적인 '문제의 심각성'을 증명할 것.
2. 대상자의 욕구 및 문제 정의: 대상자가 겪고 있는 어려움을 '결핍' 패러다임이 아닌 '권리 보장' 및 '사회적 비용 감소' 차원에서 재해석할 것. (예: 노인 고독사를 단순한 외로움의 문제가 아닌 지역사회 지지체계의 붕괴와의 문제로 접근)
3. 기존 서비스의 한계(차별성 부각): 현재 시행 중인 공공/민간 서비스의 맹점(사각지대)을 지적하고, 본 사업이 그 간극(Gap)을 어떻게 메울 수 있는지 당위성을 논리적으로 제시할 것.
4. 사업의 기대 효과 및 지속가능성 도출: 논리모델(Logic Model)의 성과(Outcome)에 기반하여, 이 사업이 향후 지역사회에 가져올 구조적 변화와 파급효과를 서술할 것.
5. 전문 용어 및 이론적 배경 프레이밍: 대상자에 맞는 적합한 실천 이론(예: 임파워먼트 접근, 로스만의 지역사회조직 모델 등)을 기반으로 기획의 뼈대를 세울 것.

[출력 구조]
■ 현황 및 문제의 심각성: (거시적 통계 및 미시적 현장 욕구 융합)
■ 기존 대응의 한계 및 사각지대: (지금 이 사업이 왜 '반드시', '우리 기관에서' 진행되어야 하는가?)
■ 이론적 배경 및 접근 전략: (문제를 해결하기 위한 전문적 실천 프레임워크 적용)
■ 기대되는 사회적 변화(Impact): (사업 성공 시 도출되는 대상자와 지역사회의 질적 변화)

사업 키워드 및 초기 아이디어:
{{INPUT}}`
        },
        newsletter: {
            title: "AI 후원자/소식지 작가 (Pro)",
            icon: "💌",
            description: "[비영리 마케팅(NPO) 카피라이팅 기법] 단순 소식 전달을 넘어, 후원자와 보호자의 감동과 행동(참여)을 이끌어냅니다.",
            prompt: `[역할: 대형 비영리단체(NPO)의 수석 모금 마케터 및 심리 분석 기반 감성 카피라이터]
[임무: 전달된 팩트(소식)를 바탕으로, 읽는 이의 마음을 울리고 기관에 대한 절대적 신뢰를 구축하며, 지속적인 후원과 지지를 이끌어내는 마스터피스 뉴스레터/서신을 작성하라.]

[카피라이팅 및 심리 기법 지침]
1. 단순한 실적 보고 금지 ('~를 했습니다' 지양): 기관이 무엇을 했는지가 아니라, "후원자님(보호자님)의 사랑과 참여 덕분에 대상자의 삶이 어떻게 기적처럼 변했는지"로 초점을 전환할 것. (Donor-Centric Approach)
2. 감각적 스토리텔링(Sensory Storytelling) 적용: 현장의 온도, 대상자의 표정 변화, 들려온 작은 목소리 등 오감을 자극하는 구체적이고 디테일한 묘사를 포함하여 독자가 현장에 함께 있는 것처럼 느끼게 할 것.
3. 밴드왜건 및 사회적 증거(Social Proof) 활용: '우리 모두가 함께 만들어가는 변화'라는 공동체 의식을 부여하고 소속감을 강화할 것.
4. 명확한 가독성과 리듬감: 문장은 호흡을 짧게 가져가고, 시각적 피로를 줄이기 위해 단락을 여유롭게 나누며 핵심 감동 포인트는 강조(볼드체 대체 등 문장 부호 제어)할 것.
5. 강력하고 여운이 남는 Call To Action (행동 촉구): 마무리는 단순한 감사 인사가 아니라, 앞으로도 이 아름다운 변화의 여정에 계속 동행해 달라는 정중하고도 마음을 울리는 초대로 끝맺을 것.

[출력 옵션 요구사항]
AI는 반드시 동일한 내용을 아래 **두 가지 버전**으로 각각 작성하여 제공할 것.

[버전 1: 감성 터치형 (스토리텔링 중심, 개인 후원자 및 보호자 대상)]
(키워드: 따뜻함, 눈물, 미소, 기적, 동행)

[버전 2: 신뢰와 임팩트형 (사회적 가치와 투명성 중심, 기업 후원자 및 유관기관 대상)]
(키워드: 파트너십, 사회적 성과, 투명성, 변화 지표, 연대)

전달하고자 하는 핵심 소식/팩트:
{{INPUT}}`
        }
    };

    function initAIPrompter() {
        const btn = document.getElementById('open-ai-prompter');
        const btn2 = document.getElementById('open-ai-prompter-2');

        const openPrompterModal = () => {
            let optionsHtml = '';
            for (const [key, data] of Object.entries(AI_PROMPTS)) {
                optionsHtml += `
                <div class="prompt-option-card" onclick="renderPromptDetail('${key}')">
                    <div class="prompt-option-icon">${data.icon}</div>
                    <div class="prompt-option-info">
                        <div class="prompt-option-title">${data.title}</div>
                        <div class="prompt-option-desc">${data.description}</div>
                    </div>
                    <div class="prompt-option-arrow">→</div>
                </div>
            `;
            }

            const content = `
            <div class="prompter-intro">
                <div class="prompter-badge">BEST</div>
                <h3>사복천재의 비밀 프롬프트 🪄</h3>
                <p>사회복지 전문가의 사고방식을 학습시킨 특수 프롬프트입니다. 아래 항목을 선택하여 복사한 뒤, AI(ChatGPT 등)에게 입력해 보세요!</p>
            </div>
            <div class="prompt-options-list">
                ${optionsHtml}
            </div>
        `;
            openModal('사복천재의 비밀 프롬프트', content);
        };

        if (btn) btn.onclick = openPrompterModal;
        if (btn2) btn2.onclick = openPrompterModal;
    }

    window.renderPromptDetail = function (type) {
        const data = AI_PROMPTS[type];
        const modalBody = document.getElementById('modal-body');
        const modalTitle = document.getElementById('modal-title');

        modalTitle.innerText = data.title;
        modalBody.innerHTML = `
        <div class="prompt-detail-view" style="animation: slideInRight 0.3s ease;">
            <div style="margin-bottom:20px;">
                <button class="btn-primary btn-outline" onclick="document.getElementById('open-ai-prompter').click()" style="padding:6px 12px; font-size:0.85rem; width:auto">← 목록으로</button>
            </div>
            
            <div class="prompt-header-box">
                <span style="font-size:2.5rem; display:block; margin-bottom:12px;">${data.icon}</span>
                <h4 style="font-size:1.2rem; font-weight:800; color:var(--text-dark); margin-bottom:8px;">${data.title}</h4>
                <p style="font-size:0.9rem; color:#64748b; line-height:1.5;">${data.description}</p>
            </div>

            <div class="prompt-content-box">
                <div class="prompt-content-label">복사할 프롬프트 내용</div>
                <div id="prompt-text" class="prompt-text-area">${data.prompt.replace('{{INPUT}}', '(이곳에 내용을 입력하세요)')}</div>
                <button class="btn-primary" style="margin-top:16px; width:100%; height:54px; font-size:1.1rem;" onclick="copyPromptToClipboard('${type}')">🪄 프롬프트 복사하기</button>
            </div>

            <div class="prompt-guide-box">
                <div style="font-weight:800; color:#1e40af; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <span>💡</span> 사용 방법
                </div>
                <ol style="padding-left:20px; font-size:0.85rem; color:#475569; line-height:1.7;">
                    <li>위의 <b>[프롬프트 복사하기]</b> 버튼을 누릅니다.</li>
                    <li>ChatGPT, Claude, Gemini 등의 AI 채팅창을 엽니다.</li>
                    <li>복사한 내용을 붙여넣고, 하단의 <b>'{{INPUT}}'</b> 부분에 실제 내용을 입력한 뒤 전송하세요!</li>
                </ol>
            </div>
        </div>
    `;
        modalBody.scrollTop = 0;
    };

    window.copyPromptToClipboard = function (type) {
        const data = AI_PROMPTS[type];
        const textToCopy = data.prompt;

        // Create a temporary textarea to hold the text
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = textToCopy;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();

        try {
            document.execCommand('copy');
            alert('프롬프트가 복사되었습니다! 이제 AI 채팅창에 붙여넣어보세요.');
        } catch (err) {
            console.error('Copy failed', err);
            // Fallback or modern API
            if (navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    alert('프롬프트가 복사되었습니다!');
                });
            }
        } finally {
            document.body.removeChild(tempTextArea);
        }
    };

    function initModal() {
        const modalContainer = document.getElementById('modal-container');
        const closeBtn = document.getElementById('close-modal');

        if (closeBtn) {
            closeBtn.onclick = () => {
                const overlay = document.getElementById('modal-overlay');
                if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('active'); }
                if (modalContainer) { modalContainer.classList.add('hidden'); modalContainer.classList.remove('active'); }
            };
        }

        window.addEventListener('click', (event) => {
            const overlay = document.getElementById('modal-overlay');
            if (overlay && event.target === overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('active');
                if (modalContainer) { modalContainer.classList.add('hidden'); modalContainer.classList.remove('active'); }
            }
        });
    }

    function openModal(title, contentHtml) {
        const modalOverlay = document.getElementById('modal-overlay');
        const modalContainer = document.getElementById('modal-container');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');

        if (modalTitle && modalBody) {
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
        const btn2 = document.getElementById('open-admin-calc-2');

        const openAdminModal = () => {
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

        if (btn) btn.onclick = openAdminModal;
        if (btn2) btn2.onclick = openAdminModal;
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
    }

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
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
            <div style="background:#fff; border-radius:12px; padding:16px; border:1px solid #e2e8f0; box-shadow:var(--shadow-card);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-weight:800; color:var(--text-900); font-size:0.95rem;">${tpl.title}</div>
                    <button class="btn-primary btn-outline" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px;" onclick="copyTemplate(${idx})">복사하기</button>
                </div>
                <div id="tpl-content-${idx}" style="font-size:0.85rem; color:#64748b; background:#f8fafc; padding:12px; border-radius:8px; white-space:pre-wrap; border:1px solid #f1f5f9;">${tpl.content}</div>
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

        // Simulate API call and simple mock logic
        const outDiv = document.getElementById('purifier-result');
        const outText = document.getElementById('purifier-output');
        outDiv.style.display = 'none';

        setTimeout(() => {
            outText.innerText = "클라이언트의 주관적 호소 및 경제적 어려움에 대한 불안도가 관찰됨. 주거 환경 내 전반적인 정돈 및 위생 관리가 미흡한 상태로 평가되며, 즉각적인 환경 개선 개입이 요구됨.";
            outDiv.style.display = 'block';
        }, 600);
    };

    /* --- Community / Emotion Trash Can --- */
    window.throwAwayEmotion = function () {
        const input = document.getElementById('trash-input');
        const btn = document.getElementById('btn-trash');
        const anim = document.getElementById('trash-animation');

        if (!input.value.trim()) {
            alert('버릴 감정이 없으신가요? 다행이네요! 🥰');
            return;
        }

        input.disabled = true;
        btn.disabled = true;

        // Show shredding animation
        anim.classList.remove('hidden');
        anim.style.animation = 'fadeIn 0.3s ease';

        setTimeout(() => {
            anim.classList.add('hidden');
            input.value = '';
            input.disabled = false;
            btn.disabled = false;
            alert('🗑️ 감정 분리수거함이 비워졌습니다. 훌훌 털어버리세요!');
        }, 2500);
    };


    // Global functions for Admin calculator scoping
    window.switchAdminTab = function (tabName) {
        const contentVat = document.getElementById('admin-content-vat');
        const contentTax = document.getElementById('admin-content-tax');
        const contentLtc = document.getElementById('admin-content-ltc');

        if (contentVat) contentVat.style.display = tabName === 'vat' ? 'block' : 'none';
        if (contentTax) contentTax.style.display = tabName === 'tax' ? 'block' : 'none';
        if (contentLtc) contentLtc.style.display = tabName === 'ltc' ? 'block' : 'none';

        const btnVat = document.getElementById('tab-vat');
        const btnTax = document.getElementById('tab-tax');
        const btnLtc = document.getElementById('tab-ltc');

        const setActive = (btn) => {
            if (!btn) return;
            btn.style.background = 'white';
            btn.style.color = 'var(--primary)';
            btn.style.fontWeight = '700';
            btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        };

        const setInactive = (btn) => {
            if (!btn) return;
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

        /* ─── 💰 회계/행정 (20개) ─── */
        { category: "회계/행정", icon: "📢", word: "기안문", meaning: "우리 이거 할게요!", desc: "행사나 사업을 시작하겠다는 공식 선전포고" },
        { category: "회계/행정", icon: "💰", word: "품의서", meaning: "이거 살 건데, 돈 좀 쓸게요!", desc: "물건 구매·용역 계약 전 결재권자에게 사전 허락받는 문서" },
        { category: "회계/행정", icon: "🧾", word: "지출결의서", meaning: "허락하신 돈, 이렇게 썼어요!", desc: "영수증 딱풀로 붙여서 회계에 제출하는 정산 문서" },
        { category: "회계/행정", icon: "📑", word: "결과보고서", meaning: "우리 이거 무사히 끝냈어요!", desc: "사진 첨부 + 집행내역 + 남은 돈 반납할 때 쓰는 마무리 문서" },
        { category: "회계/행정", icon: "🙏", word: "프로포절 (Proposal)", meaning: "저희한테 돈 주시면 진짜 기깔나게 써볼게요!", desc: "외부 재단·관청에 보내는 사업 제안서" },
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
        { category: "사례관리", icon: "🕵️", word: "인테이크 (Intake)", meaning: "첫 만남. 기초 현황 조사하면서 우리 기관이랑 맞는지 간 보기", desc: "초기 면접 — 주호소 문제, 의뢰 경위, 서비스 욕구 파악" },
        { category: "사례관리", icon: "🔍", word: "어세스먼트 (Assessment)", meaning: "이 분에게 진짜 뭐가 필요한지 샅샅이 파악하기", desc: "사정(査定) — 강점·문제·욕구를 다면적으로 분석" },
        { category: "사례관리", icon: "🤝", word: "라포 (Rapport) 형성", meaning: "클라이언트랑 짱친 먹기. 이거 안 되면 아무것도 안 됨", desc: "신뢰 관계 형성 — 비밀 보장·공감·일관성이 핵심" },
        { category: "사례관리", icon: "📞", word: "모니터링", meaning: "계획대로 잘 지내시나~ 하고 슬쩍 엿보거나 안부 전화하기", desc: "서비스 개입 후 정기적 점검 — 면담·전화·방문 병행" },
        { category: "사례관리", icon: "🔗", word: "자원 연계", meaning: "우리가 못 도와주니까, 이거 해줄 수 있는 옆 동네 단체 연결시켜 주기", desc: "지역사회 자원 동원 — 연계 후 사후 관리까지 책임" },
        { category: "사례관리", icon: "👋", word: "종결", meaning: "이별의 시간. 다 나아서 자립했거나 이사 가셔서 그만 만나요", desc: "목표 달성·이관·사망·거부 등 사유로 사례 마무리" },
        { category: "사례관리", icon: "🗺️", word: "욕구 (Need)", meaning: "이 분이 진짜 원하고 필요로 하는 것 (본인도 모를 때 있음)", desc: "표현 욕구·규범적 욕구·비교 욕구·잠재 욕구로 구분" },
        { category: "사례관리", icon: "💪", word: "강점 관점", meaning: "문제만 보지 말고, 이 분이 가진 강점을 먼저 보기", desc: "역량강화(Empowerment) 실천의 핵심 철학" },
        { category: "사례관리", icon: "🎯", word: "개입 목표", meaning: "우리가 이 사례를 통해 달성하려는 구체적인 목표", desc: "SMART 원칙(구체적·측정가능·달성가능·현실적·기한)으로 설정" },
        { category: "사례관리", icon: "📋", word: "서비스 계획서", meaning: "누가, 언제, 뭘, 어떻게 도와줄지 적어 두는 약속 문서", desc: "클라이언트 동의 서명 필수 — 주기적으로 재검토" },
        { category: "사례관리", icon: "⚠️", word: "위기 개입", meaning: "갑자기 상황이 심각해졌을 때 빠르게 투입!", desc: "자해·학대·화재 등 긴급 상황 — 72시간 내 집중 개입 원칙" },
        { category: "사례관리", icon: "🔁", word: "재사정 (Re-assessment)", meaning: "시간 지나서 상황 바뀌었으니까 처음부터 다시 파악해 보기", desc: "보통 6개월~1년마다 실시, 목표 달성 여부도 확인" },
        { category: "사례관리", icon: "🧑‍🤝‍🧑", word: "사례 회의", meaning: "이 분 어떻게 도울지 팀원·관련 기관들이 모여서 머리 맞대기", desc: "다학제적 접근 — 의사·간호사·복지사·치료사 등 협력" },
        { category: "사례관리", icon: "🏠", word: "아웃리치 (Outreach)", meaning: "기다리지 말고 직접 찾아가기! 복지사가 먼저 나가기", desc: "은둔형 취약계층 발굴 — 정기 방문으로 단절 예방" },
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
        { category: "기관생활", icon: "🧑‍💼", word: "승인 결재", meaning: "상사 도장 또는 전자 서명 받기. 이게 없으면 아무것도 시작 못 함", desc: "전결 규정에 따라 결재 라인 상이 — 규정 미리 확인 필수" },
        { category: "기관생활", icon: "🎓", word: "직무 교육", meaning: "직무 향상을 위해 기관이 보내주거나 본인이 들어야 하는 교육", desc: "아동학대·인권·성희롱 예방 교육 등 별도 의무 존재" },
        { category: "기관생활", icon: "🤝", word: "인수인계", meaning: "내가 맡던 일을 다음 담당자에게 빠짐없이 넘겨주기", desc: "미흡한 인수인계는 업무 공백·민원의 원인" },
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
            listContainer.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px 0; font-size:0.9rem;">Supabase 설정이 필요합니다.</p>';
            return;
        }

        // Show loading
        listContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#94a3b8;"><p style="font-size:0.9rem;">불러오는 중...</p></div>';

        try {
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                listContainer.innerHTML = `
                <div style="text-align:center; padding:48px 20px;">
                    <div style="font-size:3rem; margin-bottom:12px;">🌱</div>
                    <p style="font-size:1rem; font-weight:800; color:#334155; margin-bottom:6px;">아직 질문이 없어요</p>
                    <p style="font-size:0.85rem; color:#94a3b8;">첫 번째 질문의 주인공이 되어보세요!</p>
                </div>`;
                return;
            }

            let html = '';
            data.forEach(post => {
                html += `
                <div style="background:#fff; border-radius:16px; padding:18px; border:1px solid #e2e8f0; box-shadow:var(--shadow-card); cursor:pointer;" onclick="openQaDetail('${post.id}')">
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <span style="background:#e0e7ff; color:#4338ca; font-size:0.7rem; font-weight:800; padding:4px 8px; border-radius:12px;">${post.category || '일반'}</span>
                    </div>
                    <div style="font-size:1.05rem; font-weight:800; color:var(--text-900); line-height:1.4; margin-bottom:8px;">${post.title}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#94a3b8;">
                        <span>${post.author || '익명'}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
            `;
            });
            listContainer.innerHTML = html;
        } catch (err) {
            console.error('Error fetching posts:', err);
            listContainer.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#ef4444;">
                <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                <p style="font-size:0.9rem;">데이터를 불러오지 못했습니다.<br><span style="font-size:0.8rem; color:#94a3b8;">${err.message}</span></p>
            </div>`;
        }
    }

    window.openAskModal = function () {
        const content = `
        <div style="display:flex; flex-direction:column; gap:20px;">
            <div class="form-group">
                <label>질문 카테고리</label>
                <select id="ask-category" class="calc-input">
                    <option value="사례관리">🤝 사례관리</option>
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
            <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; font-size:0.85rem; color:#64748b;">
                📢 게시판 운영 원칙: 욕설, 비방, 개인정보 유출 등은 금지되며 익명으로 게시됩니다.
            </div>
            <button class="btn-primary" id="btn-submit-post" onclick="submitQuestion()">🪄 익명으로 게시하기</button>
        </div>
    `;
        openModal('질문하기 🆘', content);
    };

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

            const { error } = await supabase
                .from('posts')
                .insert([
                    { title, category, content, author: '익명의 복지사' }
                ]);

            if (error) throw error;

            alert('질문이 게시되었습니다! 답변이 달리면 알림을 드릴게요.');
            document.getElementById('close-modal').click();
            initHelpMe(); // Refresh list
        } catch (err) {
            console.error('Error submitting post:', err);
            alert('게시 중 오류가 발생했습니다.');
        } finally {
            btn.disabled = false;
            btn.innerText = '🪄 익명으로 게시하기';
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

            let repliesHtml = replies.length > 0 ? '' : '<p style="text-align:center; padding:30px 0; color:#94a3b8; font-size:0.9rem;">아직 등록된 답변이 없습니다.<br>첫 번째 답변의 주인공이 되어보세요! ✨</p>';

            replies.forEach(r => {
                repliesHtml += `
                <div style="background:#f8fafc; padding:16px; border-radius:14px; border:1px solid #f1f5f9; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:800; font-size:0.85rem; color:var(--text-900);">${r.author}</span>
                        <span style="font-size:0.75rem; color:#94a3b8;">${formatDate(r.created_at)}</span>
                    </div>
                    <div style="font-size:0.9rem; color:#475569; line-height:1.5;">${r.content}</div>
                </div>
            `;
            });

            const modalContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="padding-bottom:16px; border-bottom:1px solid #f1f5f9;">
                    <span style="background:#e0e7ff; color:#4338ca; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:12px;">${post.category}</span>
                    <h3 style="font-size:1.3rem; font-weight:900; color:var(--text-900); line-height:1.4; margin-bottom:12px;">${post.title}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:#64748b;">
                        <span>${post.author}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
                
                <div style="font-size:1rem; color:#334155; line-height:1.7; white-space:pre-wrap;">${post.content}</div>
                
                <div style="padding-top:24px;">
                    <h4 style="font-size:1rem; font-weight:800; color:var(--text-900); margin-bottom:16px; display:flex; align-items:center; gap:6px;">
                        💬 답변 <span style="color:var(--primary);">${replies.length}</span>
                    </h4>
                    <div id="replies-list">${repliesHtml}</div>
                </div>
                
                <div style="margin-top:10px; border-top:1px solid #f1f5f9; padding-top:20px;">
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
                    { post_id: postId, content: content, author: '익명의 사복샘' }
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

    /* --- Community Board --- */
    window.initCommunity = function () {
        loadCommunityPosts('all');
    };

    window.loadCommunityPosts = async function (category) {
        const listContainer = document.getElementById('community-list');
        if (!listContainer) return;

        // 탭 활성화 UI 업데이트
        ['all', 'free', 'info', 'job'].forEach(c => {
            const btn = document.getElementById('cat-' + c);
            if (btn) {
                btn.style.background = '#fff';
                btn.style.color = '#475569';
                btn.style.border = '1px solid #e2e8f0';
            }
        });

        let activeBtnId = 'cat-all';
        if (category === '자유게시판') activeBtnId = 'cat-free';
        if (category === '정보 공유방') activeBtnId = 'cat-info';
        if (category === '취업/이직') activeBtnId = 'cat-job';

        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.style.background = 'var(--primary)';
            activeBtn.style.color = '#fff';
            activeBtn.style.border = 'none';
        }

        if (!supabase) {
            listContainer.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px 0; font-size:0.9rem;">Supabase 설정이 필요합니다.</p>';
            return;
        }

        listContainer.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#94a3b8;"><div class="loading-spinner" style="margin: 0 auto 12px auto;"></div><p style="font-size:0.9rem;">게시글을 불러오는 중...</p></div>';

        try {
            let query = supabase.from('community_posts').select('*').order('created_at', { ascending: false });
            if (category !== 'all') {
                query = query.eq('category', category);
            }
            const { data, error } = await query;

            if (error) throw error;

            if (!data || data.length === 0) {
                listContainer.innerHTML = `
                <div style="text-align:center; padding:48px 20px;">
                    <div style="font-size:3rem; margin-bottom:12px;">📭</div>
                    <p style="font-size:1rem; font-weight:800; color:#334155; margin-bottom:6px;">아직 작성된 글이 없어요</p>
                    <p style="font-size:0.85rem; color:#94a3b8;">새로운 이야기를 시작해보세요!</p>
                </div>`;
                return;
            }

            let html = '';
            data.forEach(post => {
                let badgeColor = '#e0e7ff';
                let textColor = '#4338ca';
                if (post.category === '정보 공유방') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
                if (post.category === '취업/이직') { badgeColor = '#dcfce3'; textColor = '#15803d'; }

                html += `
                <div style="background:#fff; border-radius:16px; padding:18px; border:1px solid #e2e8f0; box-shadow:var(--shadow-card); cursor:pointer;" onclick="openCommunityDetailModal('${post.id}')">
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <span style="background:${badgeColor}; color:${textColor}; font-size:0.7rem; font-weight:800; padding:4px 8px; border-radius:12px;">${post.category || '일반'}</span>
                    </div>
                    <div style="font-size:1.05rem; font-weight:800; color:var(--text-900); line-height:1.4; margin-bottom:8px;">${post.title}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#94a3b8;">
                        <span>${post.author || '익명'}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
            `;
            });
            listContainer.innerHTML = html;
        } catch (err) {
            console.error('Error fetching community posts:', err);
            listContainer.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#ef4444;">
                <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                <p style="font-size:0.9rem;">데이터를 불러오지 못했습니다.<br><span style="font-size:0.8rem; color:#94a3b8;">${err.message}</span></p>
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
                    <option value="취업/이직">🤝 취업/이직</option>
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
            <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; font-size:0.85rem; color:#64748b;">
                📢 게시판 별 성격에 맞게 작성해 주시고, 비방이나 욕설은 통보 없이 삭제될 수 있습니다.
            </div>
            <button class="btn-primary" id="btn-submit-comm" onclick="submitCommunityPost()">✏️ 커뮤니티에 글 남기기</button>
        </div>
    `;
        openModal('글쓰기 📝', content);
    };

    window.submitCommunityPost = async function () {
        const title = document.getElementById('comm-title').value;
        const category = document.getElementById('comm-category').value.replace(/[^가-힣/]/g, '').trim(); // Remove emojis just in case
        let cleanCategory = "자유게시판";
        if (category.includes('정보')) cleanCategory = "정보 공유방";
        if (category.includes('취업') || category.includes('이직')) cleanCategory = "취업/이직";

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

            const { error } = await supabase
                .from('community_posts')
                .insert([
                    { title, category: cleanCategory, content, author: '익명의 복지사' }
                ]);

            if (error) throw error;

            alert('글이 등록되었습니다!');
            document.getElementById('close-modal').click();

            // Navigate back to the submitted category
            if (cleanCategory === '자유게시판') loadCommunityPosts('자유게시판');
            else if (cleanCategory === '정보 공유방') loadCommunityPosts('정보 공유방');
            else if (cleanCategory === '취업/이직') loadCommunityPosts('취업/이직');
            else loadCommunityPosts('all');

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

            let repliesHtml = safeReplies.length > 0 ? '' : '<p style="text-align:center; padding:30px 0; color:#94a3b8; font-size:0.9rem;">아직 댓글이 없습니다.<br>첫 번째 댓글을 남겨보세요! ✨</p>';

            safeReplies.forEach(r => {
                repliesHtml += `
                <div style="background:#f8fafc; padding:16px; border-radius:14px; border:1px solid #f1f5f9; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:800; font-size:0.85rem; color:var(--text-900);">${r.author}</span>
                        <span style="font-size:0.75rem; color:#94a3b8;">${formatDate(r.created_at)}</span>
                    </div>
                    <div style="font-size:0.9rem; color:#475569; line-height:1.5;">${r.content}</div>
                </div>
            `;
            });

            let badgeColor = '#e0e7ff';
            let textColor = '#4338ca';
            if (post.category === '정보 공유방') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
            if (post.category === '취업/이직') { badgeColor = '#dcfce3'; textColor = '#15803d'; }

            const modalContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="padding-bottom:16px; border-bottom:1px solid #f1f5f9;">
                    <span style="background:${badgeColor}; color:${textColor}; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:12px; display:inline-block; margin-bottom:12px;">${post.category}</span>
                    <h3 style="font-size:1.3rem; font-weight:900; color:var(--text-900); line-height:1.4; margin-bottom:12px;">${post.title}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:#64748b;">
                        <span>${post.author}</span>
                        <span>${formatDate(post.created_at)}</span>
                    </div>
                </div>
                
                <div style="font-size:1rem; color:#334155; line-height:1.7; white-space:pre-wrap;">${post.content}</div>
                
                <div style="padding-top:24px;">
                    <h4 style="font-size:1rem; font-weight:800; color:var(--text-900); margin-bottom:16px; display:flex; align-items:center; gap:6px;">
                        💬 댓글 <span style="color:var(--primary);">${safeReplies.length}</span>
                    </h4>
                    <div id="comm-replies-list">${repliesHtml}</div>
                </div>
                
                <div style="margin-top:10px; border-top:1px solid #f1f5f9; padding-top:20px;">
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
                    { post_id: postId, content: content, author: '익명의 복지사' }
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

    /* --- View Switcher --- */
    window.switchView = function (view) {
        const views = ['home', 'record', 'community', 'mypage'];
        views.forEach(v => {
            const el = document.getElementById('view-' + v);
            if (el) el.className = (v === view) ? 'view-content active' : 'view-content hidden';
            const navBtn = document.getElementById('nav-' + v);
            if (navBtn) navBtn.classList.toggle('active', v === view);
        });

        // 커뮤니티 탭 진입 시 데이터 로딩
        if (view === 'community') {
            loadCommunityPosts('all');
        }
    };

    /* --- Global Init --- */
    window.onload = () => {
        initModal();
        initAIPrompter();
        initEligibilityCalculator();
        initAdminCalculator();
        initVocaDictionary();
        initRecordTemplates();
        initHelpMe();
        initCommunity();
    };



} catch (e) { alert("Global JS Error: " + e.message); console.error(e); }