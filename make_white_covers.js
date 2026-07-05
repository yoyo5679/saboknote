/**
 * make_white_covers.js
 * 17개 카드뉴스 첫 번째 슬라이드를 화이트 톤으로 변환
 * Usage: node make_white_covers.js
 */

const { chromium } = require('./node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE = path.resolve(__dirname);
const ORDER_DIR = path.join(BASE, '카드뉴스순서');

// HTML 소스 → 카드뉴스순서 폴더 매핑 (MD5 해시 검증 완료)
const MAPPING = [
  { html: path.join(BASE, 'cardnews/saboknote-card1.html'),            folder: '01_계정소개_사회복지사도AI씁니다' },
  { html: path.join(BASE, 'cardnews/saboknote-card2.html'),            folder: '02_공감_오늘도야근' },
  { html: path.join(BASE, 'cardnews/saboknote-card3.html'),            folder: '03_현실밈_직업설명하기' },
  { html: path.join(BASE, 'cardnews/saboknote-card4.html'),            folder: '04_번아웃자가진단' },
  { html: path.join(BASE, 'cardnews/saboknote-card7.html'),            folder: '05_선배가신입에게' },
  { html: path.join(BASE, 'cardnews/saboknote-card8.html'),            folder: '06_중간관리자에게' },
  { html: path.join(BASE, 'cardnews/saboknote-voca-v2.html'),          folder: '07_생존단어장' },
  { html: path.join(BASE, 'cardnews/saboknote-card5.html'),            folder: '08_기록문장10개' },
  { html: path.join(BASE, 'cardnews/saboknote-prompt.html'),           folder: '09_비밀프롬프트_AI기록30초' },
  { html: path.join(BASE, 'cardnews/saboknote-accounting-master.html'),folder: '10_행정회계마스터' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-00-intro.html'),    folder: '11_NotebookLM_소개' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-01-briefing.html'), folder: '12_NotebookLM_브리핑' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-02-mindmap.html'),  folder: '13_NotebookLM_마인드맵' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-03-compare.html'),  folder: '14_NotebookLM_제도비교' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-04-collab.html'),   folder: '15_NotebookLM_팀협업' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-05-audio.html'),    folder: '16_NotebookLM_오디오' },
  { html: path.join(BASE, 'honeydata/카드뉴스/files/nlm-06-casemanage.html'),folder: '17_NotebookLM_사례관리' },
];

/**
 * 페이지에서 .s1 (첫 번째 슬라이드)을 화이트 톤으로 변환하는 JS 인젝션
 */
async function injectWhiteTheme(page) {
  await page.evaluate(() => {
    const s1 = document.querySelector('.s1');
    if (!s1) return;

    // 1. 슬라이드 배경을 흰색으로
    s1.style.setProperty('background', '#FFFFFF', 'important');
    s1.style.setProperty('background-image', 'none', 'important');

    // 2. 모든 하위 요소 순회하며 색상 교정
    function processEl(el) {
      const cs = window.getComputedStyle(el);

      // ── 텍스트 색상 처리
      const colorMatch = cs.color.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );
      if (colorMatch) {
        const r = +colorMatch[1], g = +colorMatch[2], b = +colorMatch[3];
        const a = colorMatch[4] !== undefined ? +colorMatch[4] : 1;
        const isNearWhite = r > 170 && g > 170 && b > 170;

        if (isNearWhite) {
          // 이 요소 자신의 배경이 진한 색(버튼 등)인지 확인
          const bgMatch = cs.backgroundColor.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
          );
          let ownDarkBg = false;
          if (bgMatch) {
            const br = +bgMatch[1], bg2 = +bgMatch[2], bb = +bgMatch[3];
            const ba = bgMatch[4] !== undefined ? +bgMatch[4] : 1;
            if ((br + bg2 + bb) < 350 && ba > 0.25) ownDarkBg = true;
          }

          if (!ownDarkBg) {
            if (a > 0.85) {
              el.style.setProperty('color', '#1B2E4B', 'important');
            } else {
              el.style.setProperty('color', `rgba(27,46,75,${Math.min(a * 1.2, 0.8).toFixed(2)})`, 'important');
            }
          }
        }
      }

      // ── 배경색 처리
      const bgMatch = cs.backgroundColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );
      if (bgMatch) {
        const r = +bgMatch[1], g = +bgMatch[2], b = +bgMatch[3];
        const a = bgMatch[4] !== undefined ? +bgMatch[4] : 1;

        // 반투명 흰색 overlay → 반투명 어두운 overlay
        if (r > 200 && g > 200 && b > 200 && a > 0 && a < 0.35) {
          el.style.setProperty(
            'background-color',
            `rgba(0,0,0,${(a * 0.8).toFixed(2)})`,
            'important'
          );
        }

        const lum = (r + g + b) / 3;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);

        // 진한 무채색 다크 배경 (footer 등) → 연한 회색
        if (lum < 80 && a > 0.6 && chroma < 40) {
          el.style.setProperty('background-color', '#F0F4F8', 'important');
        }

        // 진한 다크 네이비 (#1B2E4B 계열) → 연한 회색
        if (r < 50 && g < 80 && b < 120 && a > 0.6) {
          el.style.setProperty('background-color', '#EEF2F7', 'important');
        }
      }

      // ── border 색상 처리 (흰 테두리 → 연한 회색)
      const borderMatch = cs.borderTopColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );
      if (borderMatch) {
        const r = +borderMatch[1], g = +borderMatch[2], b = +borderMatch[3];
        const a = borderMatch[4] !== undefined ? +borderMatch[4] : 1;
        if (r > 180 && g > 180 && b > 180 && a > 0.05) {
          el.style.setProperty('border-color', `rgba(0,0,0,${(a * 0.3).toFixed(2)})`, 'important');
        }
      }

      for (const child of el.children) processEl(child);
    }

    for (const child of s1.children) processEl(child);
  });
}

(async () => {
  console.log('🚀 카드뉴스 커버 화이트 톤 변환 시작\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  let ok = 0, skip = 0, warn = 0;

  for (const { html, folder } of MAPPING) {
    if (!fs.existsSync(html)) {
      console.log(`⚠️  SKIP (파일 없음): ${path.basename(html)}`);
      skip++; continue;
    }

    const outDir = path.join(ORDER_DIR, folder);
    if (!fs.existsSync(outDir)) {
      console.log(`⚠️  SKIP (폴더 없음): ${folder}`);
      skip++; continue;
    }

    const outputPath = path.join(outDir, 'slide_01.png');
    const backupPath = path.join(outDir, 'slide_01_dark.png');

    // 기존 파일 백업
    if (fs.existsSync(outputPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(outputPath, backupPath);
    }

    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);  // 폰트·렌더 대기

    await injectWhiteTheme(page);
    await page.waitForTimeout(100);  // repaint

    const card = await page.$('.card');
    if (!card) {
      console.log(`❌  WARN (.card 없음): ${folder}`);
      warn++; continue;
    }

    await card.screenshot({ path: outputPath });
    console.log(`✅  ${folder}`);
    ok++;
  }

  await browser.close();

  console.log(`\n──────────────────────────────────────────`);
  console.log(`✨ 완료: ${ok}개 변환 / ${skip}개 스킵 / ${warn}개 경고`);
  console.log(`   원본 백업: 각 폴더의 slide_01_dark.png 로 보존`);
})();
