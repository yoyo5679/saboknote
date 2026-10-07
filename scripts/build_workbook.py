# 사복노트 AI 프롬프트 워크북 PDF 만들기
# 1) python build_workbook.py workbook.html  → HTML 생성 (pip: qrcode[pil])
# 2) moai-office pdf-writer의 render_pdf.py(weasyprint)로 PDF 변환:
#    python render_pdf.py --in workbook.html --out ../downloads/saboknote-prompt-workbook.pdf
# 글꼴: Noto Sans CJK (pdf-writer 스킬의 assets/fonts). 실습 문구를 고치면 다시 만들어 올리면 됨.

# 사복노트 AI 프롬프트 워크북 HTML 생성 → render_pdf.py(weasyprint)로 PDF 변환
import base64, io, html, sys
import qrcode

SITE = "https://www.saboknote.com"

def qr(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    q.add_data(url); q.make(fit=True)
    img = q.make_image(fill_color="#1e3a8a", back_color="white")
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

e = html.escape

# 실습 6개: (번호, prompt key, 제목, 언제 쓰나, [(필드 라벨, 힌트, 칸 크기)], [가상 예시 (라벨, 내용)], 실습 포인트, 이어서 요청하기 2개, 확인할 것 3개)
LABS = [
    (1, "pie_records", "상담 메모를 상담일지로 (PIE 기록)",
     "상담은 끝났는데 수첩엔 '힘들다, 울었다, 화냈다'만 남았을 때. 순서도 줄임말도 엉망인 메모를 공식 상담일지 형식으로 정리해 줘요.",
     [("상담 일시·방식", "예: 10/6 가정방문", "s"),
      ("상담 메모", "줄임말·순서 엉망이어도 그대로", "xl"),
      ("기관 기록 양식 또는 원하는 형식", "예: 양식 붙여넣기, SOAP", "s")],
     [("상담 일시·방식", "10/6 가정방문"),
      ("상담 메모", "\"요즘 잠을 못 잔다\" 반복. 면담 중 두 번 울먹임. 아들은 주말에만 옴. 약봉투 정리 안 됨. 경로당 안 나간 지 한 달."),
      ("기관 기록 양식", "우리 기관 상담일지 양식 붙여넣기")],
     "메모에 없는 아들의 방문 이유나 대상자의 감정을 AI가 덧붙이지 않는지 보세요.",
     ["전산 입력용 요약을 200자 안으로 다시 써 줘", "사정 부분을 SOAP 형식으로 바꿔 줘"],
     ["메모에 없는 사실이 들어가지 않았나", "대상자가 한 말, 내가 본 것, 내 판단이 각자 제자리에 있나", "대상자가 읽어도 상처받지 않을 표현인가"]),
    (2, "case_assessment", "초기사정·개입계획서",
     "대상자는 \"아무것도 필요 없다\"고 하는데, 내 눈엔 해결할 일이 줄줄이 보일 때. 영역별 사정 표와 개입계획 초안을 만들어요.",
     [("대상자 기본 정보", "예: 70대 남성, 1인 가구 — 실명 빼고", "s"),
      ("의뢰 경로와 주 호소", "", "m"),
      ("상담·방문에서 확인한 내용", "", "l"),
      ("현재 받는 서비스·자원", "", "s"),
      ("기관 사정 양식의 영역", "있으면", "s")],
     [("대상자 기본 정보", "70대 남성, 1인 가구"),
      ("의뢰 경로와 주 호소", "이웃 신고로 동 행정복지센터가 의뢰. 본인은 \"혼자 잘 지낸다\"고 함"),
      ("확인한 내용", "집 안에 쓰레기가 쌓여 있음. 당뇨약을 처방받았지만 약이 많이 남아 있음. 식사는 하루 한 끼 라면"),
      ("현재 받는 서비스·자원", "주 1회 안부전화"),
      ("기관 사정 양식의 영역", "(비워 둠)")],
     "대상자가 도움을 원하지 않는 상황이에요. 서비스 계획보다 관계 맺기 계획이 먼저 나오는지 보세요.",
     ["대상자가 원하는 것부터 시작하는 관계 맺기 계획을 더 구체적으로 써 줘", "개입계획 표에 연계할 기관 후보를 [확인 필요]로 표시해서 넣어 줘"],
     ["'안전 확인 필요' 표시가 떴다면 오늘 안에 확인할 일인가", "판단이 사실 칸에 섞이지 않았나", "모든 목표에 개입이 하나 이상 붙어 있나"]),
    (3, "case_conference", "사례회의 안건지·회의록",
     "내일이 사례회의인데 안건지가 백지일 때. 회의가 끝나고 \"그래서 누가 뭘 하기로 했지?\"만 남았을 때.",
     [("만들 것", "회의 전 안건지 / 회의 뒤 회의록", "s"),
      ("회의 종류와 참석 기관", "예: 통합사례회의, 동 행정복지센터·정신건강복지센터", "s"),
      ("사례 내용 또는 회의 메모", "", "l"),
      ("대상자 의견", "들은 것이 있으면", "s"),
      ("기관 양식", "있으면 붙여넣기", "s")],
     [("만들 것", "회의 뒤 회의록"),
      ("회의 종류와 참석 기관", "통합사례회의, 동 행정복지센터·정신건강복지센터·우리 기관"),
      ("회의 메모", "주거 이전과 집수리 논의 → 수리로 가닥. 집수리 지원 신청은 동 행정복지센터가 이번 달 안에. 정신건강 상담 연계는 대상자 동의를 받고 다음 주. 병원 동행은 결론 못 냄"),
      ("대상자 의견", "\"이 집에서 계속 살고 싶다\"")],
     "병원 동행은 결론이 안 났어요. AI가 결정을 지어내지 않고 '보류'로 적는지 보세요.",
     ["결정 사항 표만 뽑아서 참석 기관에 보낼 메일 본문으로 써 줘", "보류 안건을 다음 회의 안건지 질문으로 바꿔 줘"],
     ["모든 결정에 담당과 기한이 있나", "메모에 없는 결정이 생기지 않았나", "외부 기관에 줄 정보가 필요한 만큼만 들어갔나"]),
    (4, "proposal", "공모사업 계획서 (프로포절)",
     "하고 싶은 사업은 머릿속에 있는데, 양식은 '논리적 근거'를 내놓으라고 할 때. 필요성부터 예산까지 뼈대를 세워 줘요.",
     [("사업 아이디어·키워드", "", "s"),
      ("대상과 지역", "예: OO구 독거 어르신 30명", "s"),
      ("공모처와 지원 규모", "예: 사회복지공동모금회, 1,000만 원", "s"),
      ("우리 기관의 근거 자료", "예: 욕구조사 결과, 대기자 수, 실제 사례", "l"),
      ("공모 양식 목차·분량 제한", "있으면 붙여넣기", "s")],
     [("사업 아이디어", "독거 어르신 디지털 안부 모임"),
      ("대상과 지역", "행복구 독거 어르신 30명"),
      ("공모처와 지원 규모", "OO재단, 1,000만 원"),
      ("근거 자료", "우리 기관 이용 어르신 설문 결과 (표 붙여넣기)"),
      ("공모 양식", "공모 양식 목차 붙여넣기")],
     "근거 자료가 설문 하나뿐이에요. 부족한 통계를 숫자로 지어내지 않고 [확인 필요] 자리로 남기는지 보세요.",
     ["심사위원 눈으로 본 약점을 보완해서 필요성 부분만 다시 써 줘", "예산안을 공모처 기준표에 맞춰 줘 (기준표 붙여넣기)"],
     ["출처 없는 숫자가 들어가지 않았나", "필요성 → 목표 → 활동 → 성과가 이어지나", "성과목표마다 측정 도구와 시기가 있나"]),
    (5, "result_report", "사업 결과보고서",
     "사업은 잘 끝났는데 결과보고서는 시작도 못 했을 때. 목표 대비 실적표와 결재용 요약을 한 번에 만들어요.",
     [("사업명·기간·대상", "", "s"),
      ("계획했던 목표와 성과지표", "", "s"),
      ("예산과 항목별 집행액", "", "s"),
      ("실제 실적", "숫자 그대로", "s"),
      ("참여자 변화 사례·소감", "실제 들은 말", "m"),
      ("보고서 양식이나 제출처", "있으면", "xs")],
     [("사업명·기간·대상", "어르신 건강 요리교실, 2026. 4.~9., 20명"),
      ("목표와 성과지표", "12회 운영, 참여율 80%, 식습관 점수 향상"),
      ("예산과 집행액", "재료비 300만 원 중 280만 원 집행"),
      ("실제 실적", "12회 운영, 평균 참여 15명"),
      ("참여자 소감", "\"혼자 먹을 땐 대충 먹었는데 이제 반찬을 만들어 봐요\"")],
     "평균 참여 15명이면 참여율 75%로 목표(80%)에 못 미쳐요. 식습관 점수는 입력에 없어요. 미달을 숨기지 않는지, 점수를 지어내지 않는지 보세요.",
     ["결재용 요약을 3줄로 줄여 줘", "목표 대비 실적표를 엑셀에 붙일 수 있게 탭으로 나눠 줘"],
     ["표의 숫자와 본문의 숫자가 같은가", "달성률 계산식이 맞나", "목표에 못 미친 항목에 사유와 개선 방안이 있나"]),
    (6, "official_doc", "협조 요청 공문",
     "다른 기관에 협조를 부탁해야 하는데 공문 형식이 헷갈릴 때. 받는 쪽이 첫 문단만 읽어도 무엇을 언제까지 해 달라는지 알게 써 줘요.",
     [("받는 기관", "", "xs"),
      ("문서 종류", "예: 협조 요청, 행사 안내, 회신", "xs"),
      ("핵심 내용", "무엇을, 언제, 어디서", "m"),
      ("회신 기한과 담당자", "연락처는 OOO으로 둬도 됨", "s"),
      ("붙임 자료", "있으면", "xs")],
     [("받는 기관", "행복동 행정복지센터"),
      ("문서 종류", "협조 요청"),
      ("핵심 내용", "10월 마지막 주 어르신 건강강좌에 쓸 2층 회의실 대관"),
      ("회신 기한과 담당자", "2026. 10. 20.(화)까지, 담당 OOO"),
      ("붙임 자료", "행사 계획서 1부")],
     "회신 기한이 첫 문단에 보이는지, 날짜가 '2026. 10. 20.(화)' 형식으로 맞춰졌는지 보세요.",
     ["같은 내용을 담당 주무관에게 보낼 짧은 문자로 바꿔 줘", "어렵다는 답이 오면 다른 날짜를 제안하는 회신 문장을 써 줘"],
     ["첫 문단만 읽어도 요청과 기한이 보이나", "날짜·시간·항목 기호가 규칙에 맞나", "본문 끝에 '끝.'이 있나"]),
]

CHECKS = [
    "실명·주민번호·주소·연락처가 남아 있지 않다",
    "[확인 필요] 표시를 모두 직접 확인해서 채우거나 지웠다",
    "숫자·날짜·금액을 원자료와 한 번 더 맞춰 봤다",
    "대상자의 말과 내 판단이 섞이지 않았다",
    "'비협조적', '문제 가정' 같은 낙인 표현이 없다",
    "대상자 의견이 빠지지 않았다",
    "기관 서식의 항목 순서와 이름에 맞췄다",
    "외부에 보내는 문서에는 필요한 정보만 담았다",
    "사례·사진을 쓸 때 동의를 받았다",
    "최종본은 내가 처음부터 끝까지 읽었다",
]

FONT_DIR = "/Users/hong-eunseong/.claude/plugins/synced/c8a594e9-55fa-4c53-81ec-2d5a6e417553_00055d87-31e7-4e6f-99c2-b26adc97c046/moai-office/skills/pdf-writer/assets/fonts"
FONT_FACE = "".join("@font-face{font-family:'Noto Sans CJK';font-weight:%d;font-style:normal;src:url('file://%s/NotoSansCJK-%s.otf');}" % (w, FONT_DIR, n) for w, n in [(300,'Light'),(400,'Regular'),(500,'Medium'),(700,'Bold')])

CSS = r"""
@page { size: A4; margin: 14mm 15mm 15mm;
  @bottom-left { content: "사복노트 AI 프롬프트 워크북 · 초안"; font-size: 7.5pt; color: #94a3b8; }
  @bottom-right { content: counter(page); font-size: 8pt; color: #94a3b8; } }
@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { font-family: 'Noto Sans CJK', sans-serif; color: #1f2937; font-size: 9.6pt; line-height: 1.55; }
body { margin: 0; }
h1 { font-size: 19pt; font-weight: 700; color: #1e3a8a; margin: 0 0 3mm; letter-spacing: -0.02em; }
h2 { font-size: 11pt; font-weight: 700; color: #1e40af; margin: 0 0 2mm; }
p { margin: 0 0 2.5mm; }
.page { break-before: page; }
.lead { font-size: 10.4pt; color: #334155; margin-bottom: 6mm; }
.muted { color: #64748b; }
.small { font-size: 8.4pt; }

/* 표지 */
.cover { page: cover; height: 297mm; padding: 26mm 22mm 20mm; color: #fff;
  background: linear-gradient(160deg, #1e3a8a 0%, #2563eb 62%, #3b82f6 100%); position: relative; }
.cover .tag { display: inline-block; font-size: 9pt; font-weight: 500; padding: 1.6mm 4mm; border: 0.3mm solid rgba(255,255,255,0.6); border-radius: 20mm; }
.cover .title { font-size: 40pt; font-weight: 700; line-height: 1.15; margin: 30mm 0 6mm; letter-spacing: -0.03em; }
.cover .sub { font-size: 15pt; font-weight: 500; margin-bottom: 3mm; }
.cover .desc { font-size: 10.5pt; opacity: 0.85; }
.flow { margin-top: 26mm; width: 92mm; }
.flow .pill { background: #fff; color: #1e3a8a; border-radius: 4mm; padding: 3.2mm 5mm; font-size: 10pt; font-weight: 700; }
.flow .pill .k { display: block; font-size: 7.6pt; color: #64748b; font-weight: 500; }
.flow .pill.out { background: #fef3c7; color: #92400e; }
.flow .arrow { text-align: center; font-size: 11pt; color: #bfdbfe; margin: 1.2mm 0; }
.cover .foot { position: absolute; left: 22mm; right: 22mm; bottom: 18mm; font-size: 9pt; opacity: 0.9; border-top: 0.3mm solid rgba(255,255,255,0.35); padding-top: 4mm; }
.cover .foot b { font-size: 11pt; }

/* 쓰는 법 */
.steps { margin: 0 0 6mm; }
.step { display: flex; gap: 4mm; align-items: flex-start; padding: 3.2mm 4mm; border: 0.3mm solid #dbe3f0; border-radius: 3mm; margin-bottom: 2.6mm; break-inside: avoid; }
.step .n { flex: 0 0 8mm; height: 8mm; border-radius: 50%; background: #2563eb; color: #fff; font-weight: 700; text-align: center; line-height: 8mm; font-size: 10pt; }
.step .t { font-weight: 700; color: #1e3a8a; font-size: 10.4pt; }
.note { background: #eff6ff; border-left: 1.2mm solid #2563eb; padding: 3mm 4mm; border-radius: 0 2mm 2mm 0; margin-bottom: 6mm; }
.toc { border-top: 0.3mm solid #dbe3f0; padding-top: 4mm; }
.toc a { display: flex; color: #1f2937; text-decoration: none; padding: 1.3mm 0; border-bottom: 0.2mm dotted #cbd5e1; }
.toc a span { flex: 1; }
.toc a b { color: #2563eb; font-weight: 700; }

/* 약속 */
.rule { border: 0.3mm solid #dbe3f0; border-radius: 3mm; padding: 3.5mm 4.5mm; margin-bottom: 3mm; break-inside: avoid; }
.rule .h { font-weight: 700; font-size: 11pt; color: #1e3a8a; margin-bottom: 1mm; }
.rule .h b { color: #2563eb; margin-right: 1.5mm; }
table.mask { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 9.2pt; }
table.mask th { background: #1e3a8a; color: #fff; font-weight: 700; padding: 2.2mm 3mm; text-align: left; }
table.mask td { border: 0.3mm solid #dbe3f0; padding: 2.4mm 3mm; height: 13mm; vertical-align: top; width: 50%; }
table.mask tr.ex td { background: #f8fafc; height: auto; }
table.mask tr.ex td:first-child::before { content: "예시"; display: inline-block; font-size: 7.4pt; color: #fff; background: #94a3b8; border-radius: 1mm; padding: 0 1.5mm; margin-right: 1.5mm; }

/* 실습 쪽 */
.lab-head { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 3.5mm; }
.lab-head .l { flex: 1; }
.lab-no { display: inline-block; background: #2563eb; color: #fff; font-weight: 700; font-size: 8.6pt; padding: 0.8mm 3.2mm; border-radius: 10mm; margin-bottom: 1.5mm; }
.lab-head h1 { margin-bottom: 1.5mm; }
.when { background: #eff6ff; border-radius: 2.5mm; padding: 2.6mm 3.6mm; font-size: 9.4pt; color: #1e3a8a; }
.when b { margin-right: 1.5mm; }
.qrbox { flex: 0 0 26mm; text-align: center; }
.qrbox img { width: 24mm; height: 24mm; display: block; margin: 0 auto 1mm; }
.qrbox .cap { font-size: 6.8pt; color: #64748b; line-height: 1.3; }
.sec-t { font-size: 10pt; font-weight: 700; color: #1e40af; margin: 3.5mm 0 1.8mm; }
.sec-t .h { font-weight: 400; color: #94a3b8; font-size: 8pt; margin-left: 2mm; }
.field { margin-bottom: 2mm; break-inside: avoid; }
.field .lab { font-size: 8.8pt; font-weight: 700; color: #334155; }
.field .lab i { font-style: normal; font-weight: 400; color: #94a3b8; margin-left: 1.5mm; }
.field .box { border: 0.3mm solid #cbd5e1; border-radius: 2mm; margin-top: 0.8mm;
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 6.6mm, #e2e8f0 6.6mm, #e2e8f0 6.9mm); }
.box.xs { height: 8mm; } .box.s { height: 11mm; } .box.m { height: 17mm; } .box.l { height: 27mm; } .box.xl { height: 46mm; }
.example { background: #f8fafc; border: 0.3mm dashed #94a3b8; border-radius: 2.5mm; padding: 2.8mm 3.8mm; font-size: 8.9pt; }
.example .row { margin-bottom: 0.8mm; }
.example .row b { color: #334155; }
.example .tip { margin-top: 2mm; padding-top: 2mm; border-top: 0.2mm dashed #cbd5e1; color: #92400e; }
.example .tip b { color: #b45309; }
.two { display: flex; gap: 4mm; margin-top: 3mm; }
.two > div { flex: 1; border: 0.3mm solid #dbe3f0; border-radius: 2.5mm; padding: 2.8mm 3.6mm; }
.two h2 { font-size: 9.6pt; }
.bubble { background: #eef2ff; border-radius: 2.5mm 2.5mm 2.5mm 0.6mm; padding: 1.8mm 2.8mm; margin-bottom: 1.6mm; font-size: 8.8pt; color: #3730a3; }
.chk { font-size: 8.9pt; margin-bottom: 1.4mm; padding-left: 5.5mm; text-indent: -5.5mm; }
.chk::before { content: "□"; color: #2563eb; font-weight: 700; margin-right: 1.8mm; }

/* 체크리스트 · 약속 */
.big-chk { border: 0.3mm solid #dbe3f0; border-radius: 3mm; padding: 4mm 5mm; }
.big-chk .chk { font-size: 10.8pt; padding: 2.6mm 0 2.6mm 8mm; text-indent: -8mm; margin: 0; border-bottom: 0.2mm dotted #cbd5e1; }
.big-chk .chk:last-child { border-bottom: none; }
.big-chk .chk::before { font-size: 13pt; margin-right: 3mm; }
.pledge .item { margin-bottom: 4.2mm; break-inside: avoid; }
.pledge .item .q { font-weight: 700; color: #1e3a8a; font-size: 10.4pt; }
.pledge .item .q b { color: #2563eb; margin-right: 1.5mm; }
.pledge .item .line { border-bottom: 0.3mm solid #94a3b8; height: 9mm; }
.pledge .item .fixed { padding: 2mm 0; font-size: 10pt; }
.pledge .item .hint { font-size: 8pt; color: #94a3b8; }
.sign { display: flex; gap: 3mm; margin-top: 4mm; }
.sign div { flex: 1; border: 0.3mm solid #cbd5e1; border-radius: 2mm; height: 17mm; font-size: 7.6pt; color: #94a3b8; padding: 1.5mm 2mm; }

/* 뒷표지 */
.back { page: cover; height: 297mm; padding: 26mm 22mm 20mm; background: #1e3a8a; color: #fff; position: relative; break-before: page; }
.back h1 { color: #fff; font-size: 22pt; margin-bottom: 10mm; }
.card { background: rgba(255,255,255,0.08); border: 0.3mm solid rgba(255,255,255,0.25); border-radius: 4mm; padding: 6mm; margin-bottom: 6mm; display: flex; gap: 6mm; align-items: center; }
.card .tx { flex: 1; }
.card .tt { font-size: 13pt; font-weight: 700; margin-bottom: 1.5mm; }
.card .dd { font-size: 9.6pt; opacity: 0.85; }
.card .url { font-size: 9pt; color: #fde68a; margin-top: 2mm; font-weight: 500; }
.card img { width: 26mm; height: 26mm; background: #fff; border-radius: 2mm; padding: 1.5mm; }
.back .foot { position: absolute; left: 22mm; right: 22mm; bottom: 18mm; font-size: 8.6pt; opacity: 0.75; line-height: 1.6; }
"""

def field_html(lab, hint, size):
    h = f"<i>{e(hint)}</i>" if hint else ""
    return f'<div class="field"><div class="lab">■ {e(lab)}{h}</div><div class="box {size}"></div></div>'

def lab_page(L):
    no, key, title, when, fields, example, tip, follow, checks = L
    url = f"{SITE}/?utm_source=workbook#home/prompt-{key}"   # QR로 들어온 방문을 따로 셈
    fh = "".join(field_html(*f) for f in fields)
    ex = "".join(f'<div class="row"><b>■ {e(a)}:</b> {e(b)}</div>' for a, b in example)
    fo = "".join(f'<div class="bubble">"{e(x)}"</div>' for x in follow)
    ch = "".join(f'<div class="chk">{e(x)}</div>' for x in checks)
    return f"""
<section class="page" id="lab{no}">
  <div class="lab-head">
    <div class="l">
      <span class="lab-no">실습 {no}</span>
      <h1>{e(title)}</h1>
      <div class="when"><b>언제 쓰나</b>{e(when)}</div>
    </div>
    <div class="qrbox"><img src="{qr(url)}" alt=""><div class="cap">폰 카메라로 찍으면<br>바로 열려요</div></div>
  </div>
  <div class="sec-t">빈칸 연습 <span class="h">먼저 여기에 적어 보고, AI 채팅창의 &lt;입력&gt; 칸에 옮겨요</span></div>
  {fh}
  <div class="sec-t">가상 예시 <span class="h">연습용으로 지어낸 사례예요</span></div>
  <div class="example">{ex}<div class="tip"><b>실습 포인트</b> {e(tip)}</div></div>
  <div class="two">
    <div><h2>이어서 요청하기</h2>{fo}</div>
    <div><h2>확인할 것</h2>{ch}</div>
  </div>
</section>"""

toc_items = [("#rules", "시작 전 약속 3가지")] + [(f"#lab{L[0]}", f"실습 {L[0]} · {L[2]}") for L in LABS] + [("#check", "제출 전 체크리스트"), ("#pledge", "우리 팀 AI 사용 약속")]
toc = "".join(f'<a href="{h}"><span>{e(t)}</span><b>{n}</b></a>' for n, (h, t) in enumerate(toc_items, start=3))

doc = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사복노트 AI 프롬프트 워크북 (초안)</title><style>{FONT_FACE}{CSS}</style></head><body>

<section class="cover">
  <span class="tag">사복노트 실습 교재 · 초안 v0.1 · 2026. 10.</span>
  <div class="title">AI 프롬프트<br>워크북</div>
  <div class="sub">사례관리 기록·사업계획서, AI로 반나절 줄이기</div>
  <div class="desc">빈칸을 채우며 따라 하는 사회복지사용 실습지</div>
  <div class="flow">
    <div class="pill"><span class="k">이렇게 들어가서</span>순서도 줄임말도 엉망인 상담 메모</div>
    <div class="arrow">↓</div>
    <div class="pill"><span class="k">빈칸만 채운</span>사복노트 프롬프트</div>
    <div class="arrow">↓</div>
    <div class="pill out"><span class="k">이렇게 나와요</span>[확인 필요]까지 표시된 상담일지 초안</div>
  </div>
  <div class="foot"><b>saboknote.com</b><br>사회복지사를 위한 무료 실무 도구 · 프롬프트 23개 · 행정 계산기</div>
</section>

<section class="page">
  <h1>이 워크북 쓰는 법</h1>
  <p class="lead">상담 기록, 사업계획서, 공문. 쓸 건 많은데 시간은 늘 모자라죠. 이 워크북은 사복노트 '비밀 프롬프트' 가운데 기록과 문서 작업에 쓰는 6개를 골라 빈칸 채우기 실습지로 묶었어요. 강의 교재로 써도 되고, 혼자 익힐 때 옆에 두고 써도 돼요.</p>
  <div class="steps">
    <div class="step"><div class="n">1</div><div><div class="t">프롬프트 복사</div>사복노트에서 프롬프트를 열고 [복사하기]를 눌러요. 실습 쪽마다 바로 가는 QR이 있어요.</div></div>
    <div class="step"><div class="n">2</div><div><div class="t">빈칸 채우기</div>이 워크북에 먼저 적어 보고 AI 채팅창의 &lt;입력&gt; 칸에 옮겨요. 모르는 칸은 비워 둬도 돼요.</div></div>
    <div class="step"><div class="n">3</div><div><div class="t">AI에 보내기</div>ChatGPT, Claude, Gemini 어디든 괜찮아요. 기관 양식이 있으면 파일로 첨부해요.</div></div>
    <div class="step"><div class="n">4</div><div><div class="t">[확인 필요] 검토</div>AI가 지어내지 못하게 막아 둔 자리예요. 하나씩 직접 확인해서 채워요.</div></div>
    <div class="step"><div class="n">5</div><div><div class="t">기관 서식에 맞추기</div>항목 순서와 표현을 우리 기관 서식에 맞춰 옮기고, 최종본은 내가 읽고 확정해요.</div></div>
  </div>
  <div class="note">실습 쪽은 <b>언제 쓰나 → 빈칸 연습 → 가상 예시 → 이어서 요청하기 → 확인할 것</b> 순서로 되어 있어요. 이 워크북에 나오는 사례는 모두 연습용으로 지어낸 가상 사례예요.</div>
  <h2>차례</h2>
  <div class="toc">{toc}</div>
</section>

<section class="page" id="rules">
  <h1>시작 전 약속 3가지</h1>
  <p class="lead">AI는 빠르지만, 기록의 책임은 여전히 사회복지사에게 있어요. 실습 전에 이 세 가지부터 맞춰 두세요.</p>
  <div class="rule"><div class="h"><b>1</b>개인정보는 넣지 않아요</div>실명, 주민등록번호, 정확한 주소, 연락처, 사진, 전산시스템 화면 캡처는 빼요. 가명, 연령대, 동 단위로 바꾸면 기록에 필요한 맥락은 대부분 남아요.</div>
  <div class="rule"><div class="h"><b>2</b>학습 설정을 확인해요</div>AI 서비스 설정에서 '대화 내용으로 모델 학습'을 꺼 둬요. 기관에 AI 사용 지침이 있으면 그 지침이 먼저예요.</div>
  <div class="rule"><div class="h"><b>3</b>최종 판단은 사람이 해요</div>AI 결과는 초안이에요. 사실 확인, 사정 판단, 서명은 담당 사회복지사의 몫이에요.</div>
  <div class="sec-t" style="margin-top:6mm">연습 · 가명으로 바꿔 보기</div>
  <table class="mask">
    <tr><th>원래 메모</th><th>AI에 넣을 수 있게 바꾼 메모</th></tr>
    <tr class="ex"><td>홍길동 님(78세, 행복동 12-3), 010-0000-0000</td><td>대상자 A(70대 후반 남성), 행복동, 연락처 생략</td></tr>
    <tr><td>① 아들 홍철수(52세, 회사원)가 주말마다 반찬을 가져다줌</td><td></td></tr>
    <tr><td>② 행복동 주민센터 박지훈 주무관과 통화함</td><td></td></tr>
    <tr><td>③ 가스요금 3개월 체납, 고지서에 고객번호 1234-5678이 적혀 있음</td><td></td></tr>
  </table>
  <p class="small muted" style="margin-top:3mm">예시 답 — ① 아들(50대)이 주말마다 반찬을 가져다줌 ② 동 행정복지센터 담당 주무관과 통화함 ③ 가스요금 3개월 체납 (고객번호는 적지 않음)</p>
</section>

{''.join(lab_page(L) for L in LABS)}

<section class="page" id="check">
  <h1>제출 전 체크리스트</h1>
  <p class="lead">AI 초안을 기관 문서로 옮기기 전에 한 번씩 짚어 보세요. 열 칸이 다 채워지면 제출해도 좋아요.</p>
  <div class="big-chk">{''.join(f'<div class="chk">{e(c)}</div>' for c in CHECKS)}</div>
</section>

<section class="page pledge" id="pledge">
  <h1>우리 팀 AI 사용 약속</h1>
  <p class="lead">우리 팀이 함께 정하는 AI 사용 원칙이에요. 빈칸을 채워 팀 회의에서 같이 읽고, 잘 보이는 곳에 붙여 두세요.</p>
  <div class="item"><div class="q"><b>1</b>우리 팀이 AI를 쓰는 일</div><div class="line"></div><div class="hint">예: 상담일지 초안, 공문 초안, 홍보 문구</div></div>
  <div class="item"><div class="q"><b>2</b>AI에 넣지 않는 정보</div><div class="fixed">실명, 주민등록번호, 주소, 연락처, 그리고</div><div class="line"></div></div>
  <div class="item"><div class="q"><b>3</b>쓰는 AI 서비스와 설정</div><div class="line"></div><div class="hint">□ '대화 내용으로 학습' 끄기를 확인했어요</div></div>
  <div class="item"><div class="q"><b>4</b>AI 초안을 검토하는 사람</div><div class="line"></div></div>
  <div class="item"><div class="q"><b>5</b>기관 지침과 다를 때</div><div class="fixed">기관 지침을 따른다</div></div>
  <div class="item"><div class="q"><b>6</b>함께 점검하는 날</div><div class="fixed">매월 ______ 일</div></div>
  <div class="item"><div class="q">작성일 · 서명</div>
    <div class="sign"><div>작성일</div><div>서명</div><div>서명</div><div>서명</div><div>서명</div></div></div>
</section>

<section class="back">
  <h1>다음은 이렇게 이어 가요</h1>
  <div class="card"><div class="tx"><div class="tt">더 많은 프롬프트는 사복노트에서</div><div class="dd">사례관리·행정·홍보 프롬프트 23개, 행정 계산기, 사진 속 개인정보 가리기 도구까지 무료로 써요.</div><div class="url">saboknote.com</div></div><img src="{qr(SITE + '/?utm_source=workbook')}" alt=""></div>
  <div class="card"><div class="tx"><div class="tt">우리 기관도 함께 배우고 싶다면</div><div class="dd">기관 출강·온라인 실습 2시간. 이 워크북을 교재로 써요.</div><div class="url">saboknote.com/#home/edu</div></div><img src="{qr(SITE + '/?utm_source=workbook#home/edu')}" alt=""></div>
  <div class="card"><div class="tx"><div class="tt">새 프롬프트 소식 받기</div><div class="dd">사복노트 홈에서 비밀편지를 구독하면 새 프롬프트와 자료를 먼저 보내 드려요.</div></div></div>
  <div class="foot">이 워크북은 초안이에요. 고쳤으면 하는 점은 사복노트 홈의 '사복천재님, 이것 좀 만들어주세요!'에 남겨 주세요.<br>© 2026 사복노트 · 이 워크북의 사례는 모두 연습용 가상 사례예요.</div>
</section>

</body></html>"""

out = sys.argv[1]
open(out, "w", encoding="utf-8").write(doc)
print("written", out, len(doc))
