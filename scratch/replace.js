const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. My Info UI
html = html.replace(
    /(\* 이 코드를 다른 기기에서 입력하면 내 정보를 그대로 가져옵니다\.\n\s*<\/div>\n\s*<\/div>)/,
    `$1\n\n                             <!-- 연결된 소셜 계정 상태 -->\n                             <div id="my-linked-accounts-container" style="background:#f8fafc; padding:14px; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">\n                                 <div style="font-size:0.7rem; color:#475569; margin-bottom:8px; font-weight:800;">연결된 소셜 계정</div>\n                                 <div id="my-linked-accounts-list" style="display:flex; gap:8px; flex-wrap:wrap;">\n                                     <span style="font-size:0.75rem; color:#94a3b8;">확인 중...</span>\n                                 </div>\n                             </div>`
);

// 2. FAQ 3
html = html.replace(
    /<li><strong>기기를 바꿀 때:<\/strong> 기존 기기의 동기화 코드를 새 기기에 입력하면 내 기록\(글, 경험치 등\)이 그대로\s*나타납니다\.\<\/li>/,
    `<li><strong>기기를 바꿀 때:</strong> 기존 기기의 동기화 코드를 새 기기에 입력하면 내 기록(글, 경험치 등)이 그대로 나타납니다.</li>\n                                         <li><strong>소셜 계정 연동:</strong> '성장 궤적' 메뉴에서 카카오나 구글 계정을 한 번 연동해 두시면, 동기화 코드를 잃어버리거나 다른 기기에서 접속할 때 간편하게 원래 내 정보로 돌아올 수 있습니다. (추천!)</li>`
);

html = html.replace(
    /<li><strong>코드 분실 주의:<\/strong> 코드를 따로 적어두지 않고 브라우저 데이터를 초기화하면 <strong>기존 정보를 절대\s*찾을 수 없습니다\.<\/strong> \(저희도 못 찾아드려요! 😂\)<\/li>\s*<li><strong>보안:<\/strong> 코드가 노출되면 타인이 내 닉네임으로 활동할 수 있으니 꼭 비밀로 간직해 주세요\.<\/li>/,
    `<li><strong>코드 분실 주의:</strong> 소셜 연동을 하지 않은 상태에서 코드를 따로 적어두지 않고 브라우저 데이터를 초기화하면 <strong>기존 정보를 절대 찾을 수 없습니다.</strong></li>\n                                         <li><strong>보안:</strong> 코드가 노출되면 타인이 내 닉네임으로 활동할 수 있으니 꼭 비밀로 간직하시거나 안전하게 소셜 연동을 활용해 주세요.</li>`
);

// 3. FAQ Q3
html = html.replace(
    /복사할 수 있습니다\.\<\/p>/,
    `복사할 수 있습니다. <strong>분실을 방지하기 위해 가급적 카카오나 구글 소셜 연동을 활용하시는 것을 적극 권장</strong>합니다!</p>`
);

// 4. Privacy 1
html = html.replace(
    /랭킹 시스템 운영을 목적으로 수집합니다\.\<\/p>/,
    `랭킹 시스템 운영을 목적으로 수집합니다.<br>\n                                         - <strong>소셜 로그인 정보 (선택):</strong> 이용자가 계정 분실 방지를 위해 자발적으로 카카오 또는 구글 계정을 연동하는 경우, 해당 플랫폼이 제공하는 최소한의 고유 식별자(이메일 등 프로필 식별용)를 수집하여 데이터 복구 및 로그인 유지 목적으로만 사용합니다.</p>`
);

// 5. Privacy 2
html = html.replace(
    /익명 사용자 간의 상호작용 목적으로만 이용됩니다\.\<\/p>/,
    `익명 사용자 간의 상호작용 목적으로만 이용됩니다. (소셜 로그인 연동 시에도 외부에 사용자의 정보를 전달하지 않습니다.)</p>`
);

// 6. Privacy 3
html = html.replace(
    /- <strong>파쇄기 데이터:<\/strong> 브라우저 상에서 즉시 파기되며, 서버로 일절 전송되지 않습니다\.<br>\s*- 동기화 식별 코드를 기반으로 한 닉네임 정보는 서비스 종료 시까지 혹은 이용자의 데이터 삭제 요청 시 일괄 파기됩니다\.\<\/p>/,
    `- <strong>파쇄기 데이터:</strong> 브라우저 상에서 즉시 파기되며, 서버로 일절 전송되지 않습니다.<br>\n                                         - 동기화 식별 코드 및 연동된 소셜 로그인 정보는 서비스 종료 시까지 혹은 이용자의 데이터 삭제(회원 탈퇴) 요청 시 일괄 파기됩니다.</p>`
);

fs.writeFileSync('index.html', html, 'utf8');
console.log("Replaced successfully!");
