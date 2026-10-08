#!/usr/bin/env python3
"""사복노트 검색용 정적 페이지 만들기

앱(index.js) 안에만 있던 내용을 구글이 읽을 수 있는 별도 페이지로 꺼낸다.
  - AI_PROMPTS(프롬프트 23개)    → prompts/index.html, prompts/<key>.html
  - VOCABULARY_DATA(생존 단어장) → voca/index.html
  - 워크북 실습 6개(scripts/build_workbook.py의 LABS) → 해당 프롬프트 페이지의 '가상 예시'
  - 소개·개인정보처리방침·이용약관 → about.html, privacy.html, terms.html
    (앱 마이페이지의 이용약관·개인정보처리방침 메뉴도 이 페이지를 연다)
  - sitemap.xml

앱에서 프롬프트·단어를 고치거나 방침을 바꾸면 다시 실행:  python3 scripts/build_pages.py
(index.js를 읽는 데 node가 필요하다)
"""
import ast
import datetime
import html
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.saboknote.com"
CONTACT = "saboknote@naver.com"
POLICY_DATE = "2026년 10월 9일"
e = html.escape


# ---------------------------------------------------------------- 데이터 읽기
def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


def app_data():
    """index.js의 AI_PROMPTS · VOCABULARY_DATA · 프롬프트 분류(categories)를 node로 그대로 읽는다."""
    js = r"""
const s = require('fs').readFileSync(process.argv[1], 'utf8');
function grab(open, close) {          // open: 여는 괄호로 끝나는 줄, close: 닫는 괄호가 있는 줄
  const i = s.indexOf(open); if (i < 0) throw new Error('못 찾음: ' + open);
  const j = s.indexOf(close, i); if (j < 0) throw new Error('끝을 못 찾음: ' + open);
  return new Function('return ' + s.slice(i + open.length - 1, j + close.length - 1))();
}
process.stdout.write(JSON.stringify({
  prompts: grab('const AI_PROMPTS = {', '\n    };'),
  voca: grab('const VOCABULARY_DATA = [', '\n    ];'),
  cats: grab('const categories = [', '\n            ];'),
}));
"""
    out = subprocess.run(["node", "-e", js, os.path.join(ROOT, "index.js")],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def common_rules(src):
    """앱의 buildPrompt()가 프롬프트 뒤에 붙이는 공통 규칙 (앱에서 복사하는 글과 똑같게)."""
    m = re.search(r"function buildPrompt\(data, values\) \{.*?const askRule = data\.noQuestions\s*\? '(.*?)'\s*: '(.*?)';"
                  r".*?return `\$\{data\.prompt\}(.*?)<입력>\n\$\{fields\}\n</입력>`;", src, re.S)
    if not m:
        raise SystemExit("index.js의 buildPrompt 모양이 바뀌었어요. build_pages.py의 common_rules()를 맞춰 주세요.")
    ask_no, ask_yes, body = (x.replace("\\'", "'") for x in m.groups())
    return ask_no, ask_yes, body


def full_prompt(p, rules):
    ask_no, ask_yes, body = rules
    body = body.replace("${askRule}", ask_no if p.get("noQuestions") else ask_yes)
    fields = "\n".join(f"■ {f}: " for f in p["fields"])
    return f"{p['prompt']}{body}<입력>\n{fields}\n</입력>"


def workbook_labs():
    """scripts/build_workbook.py의 LABS(실습 6개)를 실행하지 않고 값만 읽는다."""
    tree = ast.parse(read("scripts/build_workbook.py"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "LABS":
            labs = ast.literal_eval(node.value)
            return {L[1]: L for L in labs}
    return {}


# ---------------------------------------------------------------- 공통 틀
ADSENSE = """    <meta name="google-adsense-account" content="ca-pub-4943960812497979">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4943960812497979"
        crossorigin="anonymous"></script>"""

CSS = """
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; }
        a { color: #2563eb; }
        .top { background: linear-gradient(125deg, #0f2d6b 0%, #1e4eb5 45%, #3b7ef8 100%); color: #fff; padding: 28px 20px 32px; }
        .top .site { font-size: 0.82rem; opacity: 0.85; margin-bottom: 10px; }
        .top .site a { color: #fff; text-decoration: none; font-weight: 700; }
        .top h1 { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1.35; }
        .top p { font-size: 0.9rem; opacity: 0.9; margin-top: 6px; }
        main { max-width: 680px; margin: 0 auto; padding: 20px 16px 60px; }
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
        .card h2 { font-size: 1.08rem; font-weight: 800; margin-bottom: 12px; }
        .card h3 { font-size: 0.98rem; font-weight: 800; margin: 18px 0 8px; }
        .card p, .card li { font-size: 0.92rem; color: #334155; }
        .card p + p { margin-top: 10px; }
        .card ol, .card ul { padding-left: 20px; }
        .card li + li { margin-top: 6px; }
        .muted { color: #64748b !important; font-size: 0.84rem !important; }
        .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 12px 14px; font-size: 0.86rem; color: #78350f; margin-top: 12px; }
        .chips a { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 20px; padding: 8px 14px; font-size: 0.85rem; font-weight: 700; text-decoration: none; margin: 0 6px 8px 0; }
        .cta { display: block; text-align: center; background: linear-gradient(135deg, #2563eb, #4338ca); color: #fff !important; border-radius: 14px; padding: 15px; font-size: 0.95rem; font-weight: 800; text-decoration: none; margin: 4px 0 16px; }
        .list a.item { display: flex; gap: 12px; align-items: flex-start; padding: 13px 0; border-top: 1px solid #f1f5f9; text-decoration: none; color: inherit; }
        .list a.item:first-of-type { border-top: none; }
        .list .ico { font-size: 1.5rem; line-height: 1.2; flex-shrink: 0; }
        .list .t { display: block; font-size: 0.95rem; font-weight: 800; color: #1e293b; }
        .list .d { display: block; font-size: 0.83rem; color: #64748b; margin-top: 2px; }
        pre.prompt { white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; font-family: inherit; font-size: 0.84rem; line-height: 1.65; color: #334155; max-height: 520px; overflow: auto; }
        .copy { width: 100%; border: none; border-radius: 12px; padding: 13px; margin-bottom: 12px; background: #1e293b; color: #fff; font-family: inherit; font-size: 0.92rem; font-weight: 800; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        th, td { border: 1px solid #e2e8f0; padding: 9px 10px; text-align: left; vertical-align: top; color: #334155; }
        th { background: #f1f5f9; font-weight: 800; white-space: nowrap; }
        .bubble { background: #eff6ff; border-radius: 12px; padding: 10px 12px; font-size: 0.88rem; color: #1e3a8a; margin-top: 8px; }
        .check li { list-style: none; position: relative; }
        .check li::before { content: '☐'; position: absolute; left: -20px; color: #64748b; }
        dl.voca dt { font-size: 0.98rem; font-weight: 800; margin-top: 16px; }
        dl.voca dt:first-child { margin-top: 0; }
        dl.voca dd { font-size: 0.9rem; color: #334155; }
        dl.voca dd b { color: #1d4ed8; }
        .policy h2 { margin-top: 6px; }
        .policy h3 { font-size: 0.95rem; }
        .policy .scroll { margin: 4px 0 12px; }
        .policy td:first-child { font-weight: 700; }
        @media (max-width: 600px) {
            .policy table, .policy tbody, .policy tr, .policy td { display: block; width: 100%; }
            .policy tr:first-child { display: none; }
            .policy tr { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
            .policy td { border: none; padding: 3px 0; }
            .policy td[data-label]::before { content: attr(data-label); display: block; font-size: 0.75rem; font-weight: 800; color: #94a3b8; }
            .policy td:first-child { font-size: 0.95rem; color: #1e293b; padding-bottom: 4px; }
        }
        footer { text-align: center; font-size: 0.78rem; color: #94a3b8; padding: 0 16px 40px; line-height: 2; }
        footer a { color: #64748b; margin: 0 4px; }
"""

FOOTER = """    <footer>
        <div><a href="/">📔 사복노트</a> · <a href="/about.html">소개</a> · <a href="/prompts/">AI 프롬프트</a> · <a href="/voca/">생존 단어장</a> · <a href="/tools/">실무 도구</a> · <a href="/treasure.html">꿀자료</a></div>
        <div><a href="/terms.html">이용약관</a> · <a href="/privacy.html"><b>개인정보처리방침</b></a> · 문의 <a href="mailto:%s">%s</a></div>
    </footer>""" % (CONTACT, CONTACT)


def page(path, title, desc, crumbs, h1, lead, body, icon, extra_head="", script=""):
    """path: 사이트 기준 주소 (예: /prompts/), crumbs: [(이름, 링크 또는 None)]"""
    crumb = " › ".join(f'<a href="{u}">{e(n)}</a>' if u else e(n) for n, u in crumbs)
    url = SITE + path
    return f"""<!DOCTYPE html>
<html lang="ko">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{e(title)}</title>
    <meta name="description" content="{e(desc)}">
    <link rel="canonical" href="{url}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="사복노트">
    <meta property="og:title" content="{e(title.split(' | ')[0])}">
    <meta property="og:description" content="{e(desc)}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{SITE}/og-image.png">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>{icon}</text></svg>">
{extra_head}{ADSENSE}
    <style>{CSS}    </style>
</head>

<body>
    <div class="top">
        <div class="site">{crumb}</div>
        <h1>{h1}</h1>
        <p>{lead}</p>
    </div>

    <main>
{body}
    </main>

{FOOTER}
{script}</body>

</html>
"""


def clean_desc(text):
    return re.sub(r"^사용 상황:\s*", "", text).strip()


def short(text, n=150):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


# ---------------------------------------------------------------- 프롬프트
COPY_JS = """    <script>
        function copyPrompt(btn) {
            var text = document.getElementById('prompt-text').innerText;
            var done = function () { var o = btn.innerHTML; btn.innerHTML = '✅ 복사했어요. AI 채팅창에 붙여넣으세요'; setTimeout(function () { btn.innerHTML = o; }, 2200); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('이 글을 복사하세요', text); });
            else window.prompt('이 글을 복사하세요', text);
        }
    </script>
"""

HOW_TO = """        <div class="card">
            <h2>사용 순서</h2>
            <ol>
                <li>위의 <b>[프롬프트 복사하기]</b>를 눌러요.</li>
                <li>ChatGPT, Claude, Gemini 채팅창에 붙여넣어요.</li>
                <li>맨 아래 <b>&lt;입력&gt;</b> 칸을 채워서 보내요. 모르는 칸은 비워 둬도 되고, 기관 양식은 파일로 첨부해도 돼요.</li>
                <li>결과를 받은 뒤 "더 짧게", "표로 바꿔 줘"처럼 이어서 요청하면 더 좋아져요.</li>
            </ol>
            <div class="note">
                <b>⚠ 꼭 지켜 주세요</b><br>
                · 실명·주민등록번호·주소·연락처는 지우고 넣어 주세요. 기관의 AI 사용 지침도 확인해 주세요.<br>
                · AI 서비스 설정에서 '대화 내용으로 모델 학습'을 꺼 두면 더 안전해요.<br>
                · AI 결과는 초안이에요. <b>[확인 필요]</b> 표시는 직접 확인한 뒤 써 주세요.
            </div>
        </div>
"""

PROMPTS_INTRO = """        <div class="card">
            <h2>이 프롬프트는 이렇게 만들었어요</h2>
            <p>AI에게 '상담일지 써 줘'라고만 하면 그럴듯하지만 그대로 쓸 수 없는 글이 나와요. 사복노트 프롬프트는 사회복지 현장에서 자주 쓰는 문서마다 AI가 맡을 역할, 지킬 원칙, 결과물 형식을 미리 적어 둔 지시문이에요. 선생님은 맨 아래 &lt;입력&gt; 칸만 채우면 돼요.</p>
            <p>모든 프롬프트에는 공통 규칙이 들어 있어요. 통계·법 조항·기관 연락처처럼 확인이 필요한 사실은 AI가 지어내지 말고 <b>[확인 필요]</b>로 표시하게 했고, 대상자 이름이나 연락처가 보이면 가려서 쓰게 했어요. 그래도 AI가 낸 결과는 초안이에요. 사실 확인과 최종 판단은 담당 사회복지사가 해요.</p>
        </div>

        <div class="card">
            <h2>쓰기 전에 꼭 지킬 것 3가지</h2>
            <ol>
                <li><b>개인정보는 넣지 않아요.</b> 실명, 주민등록번호, 정확한 주소, 연락처, 사진, 전산시스템 화면 캡처는 빼요. 가명, 연령대, 동 단위로 바꿔도 기록에 필요한 맥락은 대부분 남아요.</li>
                <li><b>학습 설정을 확인해요.</b> AI 서비스 설정에서 '대화 내용으로 모델 학습'을 꺼 둬요. 기관에 AI 사용 지침이 있으면 그 지침이 먼저예요.</li>
                <li><b>최종 판단은 사람이 해요.</b> 사실 확인, 사정 판단, 서명은 담당 사회복지사의 몫이에요.</li>
            </ol>
        </div>
"""


def prompt_pages(data, rules, labs):
    prompts, cats = data["prompts"], data["cats"]
    cat_of, written = {}, []
    for c in cats:
        for k in c["keys"]:
            cat_of[k] = c
    missing = [k for k in prompts if k not in cat_of]
    if missing:
        raise SystemExit(f"분류(categories)에 없는 프롬프트: {missing}")

    # 목록 페이지
    sections = []
    for c in cats:
        items = "\n".join(
            f'                <a class="item" href="/prompts/{k}.html"><span class="ico">{prompts[k]["icon"]}</span>'
            f'<span><span class="t">{e(prompts[k]["title"])}</span><span class="d">{e(short(clean_desc(prompts[k]["description"]), 90))}</span></span></a>'
            for k in c["keys"])
        sections.append(f"""        <div class="card list" id="{c['id']}">
            <h2>{e(c['name'])} <span class="muted">{len(c['keys'])}개</span></h2>
{items}
        </div>
""")
    n = len(prompts)
    body = PROMPTS_INTRO + "\n".join(sections) + f"""
        <a class="cta" href="/#home/prompt">✏️ 사복노트 앱에서 빈칸 미리 채우고 복사하기 →</a>
        <div class="card chips">
            <h2>함께 보면 좋아요</h2>
            <a href="/#home/workbook">📘 프롬프트 워크북 (무료 PDF)</a>
            <a href="/voca/">📖 초보 사회복지사 생존 단어장</a>
            <a href="/treasure.html">🍯 AI 활용 꿀자료</a>
            <a href="/tools/">🛠️ 실무 도구 모음</a>
        </div>
"""
    write("prompts/index.html", page(
        "/prompts/", f"사회복지사 AI 프롬프트 {n}개 — 사례관리·행정·홍보 실무용 | 사복노트",
        f"사례관리 기록, 초기사정, 공모사업 계획서, 결과보고서, 공문, 홍보 글까지. ChatGPT·Claude·Gemini에 붙여넣어 쓰는 사회복지 실무용 AI 프롬프트 {n}개를 무료로 공개해요.",
        [("📔 사복노트", "/"), ("AI 프롬프트", None)],
        "🪄 사회복지사 AI 프롬프트 모음",
        f"사례관리 기록부터 공모사업 계획서, 홍보 글까지. 복사해서 바로 쓰는 실무용 프롬프트 {n}개예요.",
        body, "🪄"))
    written.append("/prompts/")

    # 프롬프트마다 한 쪽
    for c in cats:
        for k in c["keys"]:
            p = prompts[k]
            desc = clean_desc(p["description"])
            fields = "\n".join(f"                <li>{e(f)}</li>" for f in p["fields"])
            lab_html = ""
            if k in labs:
                _, _, _, _, _, example, tip, follow, checks = labs[k]
                rows = "\n".join(f"                <tr><th>{e(a)}</th><td>{e(b)}</td></tr>" for a, b in example)
                fo = "\n".join(f'            <div class="bubble">"{e(x)}"</div>' for x in follow)
                ch = "\n".join(f"                <li>{e(x)}</li>" for x in checks)
                lab_html = f"""        <div class="card">
            <h2>가상 예시로 따라 해 보기</h2>
            <p class="muted">연습용으로 지어낸 사례예요. 실제 기록에는 우리 기관 사례를 가명으로 바꿔 넣어 주세요.</p>
            <div class="scroll" style="margin-top:10px;"><table>
{rows}
            </table></div>
            <p style="margin-top:12px;"><b>볼 점</b> · {e(tip)}</p>
            <h3>결과를 받은 뒤 이어서 요청하기</h3>
{fo}
            <h3>결과에서 확인할 것</h3>
            <ul class="check">
{ch}
            </ul>
        </div>
"""
            others = "\n".join(f'            <a href="/prompts/{o}.html">{prompts[o]["icon"]} {e(prompts[o]["title"])}</a>'
                               for o in c["keys"] if o != k)
            cat_name = re.sub(r"^\W+\s*", "", c["name"])
            body = f"""        <div class="card">
            <h2>이럴 때 쓰세요</h2>
            <p>{e(desc)}</p>
        </div>

        <div class="card">
            <h2>빈칸에 넣을 것</h2>
            <ol>
{fields}
            </ol>
            <p class="muted" style="margin-top:10px;">모르는 칸은 비워 둬도 돼요. 대상자는 실명 대신 가명·연령대·동 단위로 적어 주세요.</p>
        </div>

{lab_html}        <div class="card">
            <h2>프롬프트 전문</h2>
            <button class="copy" type="button" onclick="copyPrompt(this)">📋 프롬프트 복사하기</button>
            <pre class="prompt" id="prompt-text">{e(full_prompt(p, rules))}</pre>
        </div>

{HOW_TO}
        <a class="cta" href="/#home/prompt-{k}">✏️ 사복노트 앱에서 빈칸 미리 채우고 복사하기 →</a>

        <div class="card chips">
            <h2>{e(cat_name)}의 다른 프롬프트</h2>
{others}
            <a href="/prompts/">🪄 프롬프트 {n}개 전체 보기</a>
        </div>
"""
            write(f"prompts/{k}.html", page(
                f"/prompts/{k}.html", f"{p['title']} — 사회복지사 AI 프롬프트 | 사복노트",
                short(f"{p['title']} AI 프롬프트. {desc}", 155),
                [("📔 사복노트", "/"), ("AI 프롬프트", "/prompts/"), (p["title"], None)],
                f"{p['icon']} {e(p['title'])}",
                f"{e(cat_name)} · 복사해서 ChatGPT·Claude·Gemini에 붙여넣는 AI 프롬프트",
                body, p["icon"], script=COPY_JS))
            written.append(f"/prompts/{k}.html")
    return written


# ---------------------------------------------------------------- 생존 단어장
def voca_page(data):
    voca = data["voca"]
    cats = []
    for v in voca:
        if v["category"] not in cats:
            cats.append(v["category"])
    nav = "\n".join(f'            <a href="#c{i}">{e(c)}</a>' for i, c in enumerate(cats))
    secs = []
    for i, c in enumerate(cats):
        items = [v for v in voca if v["category"] == c]
        dl = "\n".join(f"""                <dt>{v['icon']} {e(v['word'])}</dt>
                <dd><b>{e(v['meaning'])}</b><br>{e(v['desc'])}</dd>""" for v in items)
        secs.append(f"""        <div class="card" id="c{i}">
            <h2>{e(c)} <span class="muted">{len(items)}개</span></h2>
            <dl class="voca">
{dl}
            </dl>
        </div>
""")
    n = len(voca)
    body = f"""        <div class="card">
            <h2>이 단어장은요</h2>
            <p>선배들이 당연하게 쓰는 말이 신입에겐 외국어처럼 들릴 때가 있어요. 이 단어장에는 회계·행정부터 사례관리, 기관 생활까지 입사 첫 달에 자주 듣는 말을 분류별로 모았어요.</p>
            <p>굵은 글씨가 '쉽게 말하면'이고, 그 아래가 실무에서 알아 둘 점이에요. 서식과 절차는 기관마다 다르니 실제 업무는 기관 규정과 담당 부서 안내를 따라 주세요.</p>
        </div>

        <div class="card chips">
            <h2>분류</h2>
{nav}
        </div>

{''.join(secs)}
        <a class="cta" href="/#home/voca">📖 사복노트 앱에서 단어장 펼치기 →</a>
        <div class="card chips">
            <h2>함께 보면 좋아요</h2>
            <a href="/prompts/">🪄 사회복지사 AI 프롬프트</a>
            <a href="/tools/">🛠️ 실무 도구 모음</a>
            <a href="/treasure.html">🍯 AI 활용 꿀자료</a>
        </div>
"""
    write("voca/index.html", page(
        "/voca/", f"초보 사회복지사 생존 단어장 — 실무 용어 {n}개 쉽게 풀이 | 사복노트",
        f"기안문, 품의서, 지출결의서, 원천징수, 사례관리까지. 초보 사회복지사가 입사 첫 달에 자주 듣는 실무 용어 {n}개를 쉬운 말로 풀었어요.",
        [("📔 사복노트", "/"), ("생존 단어장", None)],
        "📖 초보 사회복지사 생존 단어장",
        f"입사 첫 달에 쏟아지는 실무 용어 {n}개를 쉬운 말로 풀었어요.",
        body, "📖"))
    return ["/voca/"]


# ---------------------------------------------------------------- 소개·방침·약관
ABOUT = f"""        <div class="card">
            <h2>사복노트는 이런 곳이에요</h2>
            <p>사복노트(사회복지사 비밀노트)는 사회복지 현장의 서류, 계산, 고민을 조금 덜어 주려고 만든 웹 서비스예요. 사례관리 기록, 공모사업 계획서, 결과보고서, 강사료 정산처럼 시간을 많이 잡아먹는 일에 바로 쓸 수 있는 도구를 모았어요.</p>
            <p>가입하지 않아도 쓸 수 있고, 모든 기능은 무료예요.</p>
        </div>

        <div class="card list">
            <h2>무엇을 할 수 있나요</h2>
            <a class="item" href="/prompts/"><span class="ico">🪄</span><span><span class="t">AI 프롬프트</span><span class="d">사례관리·행정·홍보 문서 초안을 AI로 쓰는 지시문 모음</span></span></a>
            <a class="item" href="/tools/"><span class="ico">🧮</span><span><span class="t">실무 계산기</span><span class="d">부가세, 강사료 원천징수, 장기요양 한도액, 급여 일할 계산 등</span></span></a>
            <a class="item" href="/voca/"><span class="ico">📖</span><span><span class="t">생존 단어장</span><span class="d">신입이 헷갈리는 실무 용어를 쉬운 말로 풀이</span></span></a>
            <a class="item" href="/treasure.html"><span class="ico">🍯</span><span><span class="t">꿀자료 보물창고</span><span class="d">제미나이 노트북·안티그래비티 같은 AI 도구 활용 가이드</span></span></a>
            <a class="item" href="/#community"><span class="ico">💬</span><span><span class="t">익명 Q&amp;A·커뮤니티</span><span class="d">실무 고민을 익명으로 묻고 답하는 공간</span></span></a>
            <a class="item" href="/#shredder"><span class="ico">🗑️</span><span><span class="t">감정 파쇄기</span><span class="d">힘든 하루를 적고 파쇄하는 공간 (적은 글은 저장하지 않아요)</span></span></a>
            <a class="item" href="/#playground"><span class="ico">🎪</span><span><span class="t">놀이터</span><span class="d">사회복지사 유형 테스트, 밸런스 게임, 미니 게임</span></span></a>
        </div>

        <div class="card">
            <h2>만들 때 지키는 원칙</h2>
            <ul>
                <li><b>개인정보는 최소한만.</b> 가입 없이 익명으로 쓰고, 기록이 꼭 필요한 기능만 서버에 저장해요. 사진 모자이크·압축 같은 도구는 파일을 서버로 보내지 않고 기기 안에서 처리해요.</li>
                <li><b>AI는 초안까지만.</b> 프롬프트마다 AI가 사실을 지어내지 못하게 막고, 확인할 곳은 [확인 필요]로 남기게 했어요.</li>
                <li><b>정보는 참고용.</b> 제도와 금액은 해마다 바뀌어요. 계산기와 자료는 참고용이니, 최종 기준은 관계 기관 고시와 기관 규정에서 확인해 주세요.</li>
            </ul>
        </div>

        <div class="card">
            <h2>운영과 연락처</h2>
            <p>사복노트는 개인이 운영하는 서비스예요. 운영비를 마련하려고 페이지에 광고(Google AdSense)가 나올 수 있어요.</p>
            <p>📮 이메일 <a href="mailto:{CONTACT}">{CONTACT}</a><br>
            🏫 기관 AI 실무 교육 문의 <a href="/#home/edu">교육 문의 남기기</a><br>
            💡 기능 제안·오류 제보 <a href="/#home/request">사복노트 앱에서 요청하기</a></p>
        </div>
"""

PRIVACY = f"""<p>사복노트(사회복지사 비밀노트, 이하 "서비스")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고 관련 고충을 원활하게 처리하기 위해 다음과 같이 개인정보처리방침을 둡니다.</p>

<h2>1. 처리하는 개인정보와 목적</h2>
<p>서비스는 회원가입 없이 익명으로 이용할 수 있으며, 실명·주민등록번호·전화번호를 요구하지 않습니다. 기능별로 처리하는 정보는 다음과 같습니다.</p>
<div class="scroll"><table>
<tr><th>기능</th><th>처리 항목</th><th>목적</th><th>보유 기간</th></tr>
<tr><td>익명 이용 (자동)</td><td>익명 계정 식별자, 자동 생성 닉네임, 활동 레벨·경험치</td><td>기기 간 이어 쓰기, 게시판·랭킹 운영</td><td>삭제 요청 또는 서비스 종료 시까지</td></tr>
<tr><td>소셜 로그인 (선택)</td><td>카카오·구글 계정의 고유 식별자, 이메일</td><td>계정 연결, 다른 기기에서 기록 복구</td><td>연결 해제 또는 삭제 요청 시까지</td></tr>
<tr><td>익명 Q&amp;A·커뮤니티</td><td>작성한 글·답변, 작성 시각, 익명 계정 식별자</td><td>게시판 운영</td><td>이용자가 삭제할 때까지 (운영 원칙에 어긋나는 글은 삭제될 수 있음)</td></tr>
<tr><td>비밀편지(뉴스레터)·워크북·전자책 신청</td><td>이메일 주소</td><td>소식과 자료 발송</td><td>구독 취소 시까지</td></tr>
<tr><td>기관 교육 문의</td><td>기관명, 담당자 이름, 연락처(이메일 또는 전화), 교육 방식·인원·희망 시기, 문의 내용</td><td>교육 문의 답변</td><td>문의 처리 후 1년 (요청하면 바로 삭제)</td></tr>
<tr><td>기능 요청</td><td>요청 내용, 익명 계정 식별자</td><td>서비스 개선</td><td>삭제 요청 또는 서비스 종료 시까지</td></tr>
<tr><td>프롬프트 보관함</td><td>담아 둔 프롬프트, 빈칸에 저장한 입력</td><td>다른 기기에서 이어 쓰기</td><td>이용자가 지울 때까지</td></tr>
<tr><td>감정 파쇄기 '선배에게 털어놓기'</td><td>힘듦 정도(1~5), 주제 태그(최대 3개), 위로 한 줄</td><td>성장 궤적(회고) 보여 주기</td><td>이용자가 지울 때까지 (성장 궤적 화면에서 직접 삭제)</td></tr>
<tr><td>게임 기록</td><td>닉네임, 점수, 게임 진행 기록</td><td>랭킹 표시, 이어 하기</td><td>서비스 종료 시까지</td></tr>
<tr><td>이용 통계 (자동)</td><td>날짜별 기능 이용 횟수, 유입 경로 분류(예: 인스타그램, 검색), 익명 계정 식별자</td><td>서비스 개선</td><td>수집일로부터 2년</td></tr>
<tr><td>접속 기록 (자동)</td><td>IP 주소, 브라우저 정보, 접속 시각</td><td>보안, 오류 확인</td><td>호스팅·데이터베이스 업체의 보관 정책에 따름</td></tr>
</table></div>
<p>다음 정보는 서버로 보내지 않습니다. 감정 파쇄기에 적고 파쇄한 글은 이용자의 기기 안에서만 처리합니다. 사진 모자이크·사진 압축·PDF 압축·이미지 변환 도구는 파일을 기기 안에서 처리합니다. 자립 어드벤처 게임 기록은 이용자의 브라우저에만 저장합니다. 사회복지사 유형 테스트는 누가 했는지 알 수 없도록 결과 유형만 통계로 저장합니다.</p>
<p>'선배에게 털어놓기'에 적은 글은 위로 문장을 만들기 위해 AI 서비스(Google Gemini API)로 보내지며, 서비스는 그 원문을 저장하지 않습니다. 위 표의 세 가지(힘듦 정도, 주제 태그, 위로 한 줄)만 저장합니다.</p>
<p>게시판, 프롬프트 빈칸, 문의 내용에 대상자의 실명·연락처 같은 개인정보를 쓰지 말아 주세요. 서비스는 민감정보를 수집하지 않으며, 만 14세 미만 아동의 개인정보를 알면서 수집하지 않습니다.</p>

<h2>2. 개인정보 처리 위탁과 국외 이전</h2>
<p>서비스는 운영을 위해 다음 업체에 개인정보 처리를 맡깁니다.</p>
<div class="scroll"><table>
<tr><th>업체</th><th>맡기는 일</th><th>처리 위치</th></tr>
<tr><td>Supabase Inc.</td><td>데이터베이스, 익명 계정·로그인 운영</td><td>대한민국(서울 리전)</td></tr>
<tr><td>Vercel Inc.</td><td>웹사이트 호스팅 (접속 기록)</td><td>미국 및 전 세계 전송 거점</td></tr>
<tr><td>Google LLC</td><td>'선배에게 털어놓기' 위로 문장 생성 (Gemini API)</td><td>미국</td></tr>
</table></div>
<p>국외(미국)로 옮겨지는 정보는 접속 기록과 '선배에게 털어놓기'에 적은 글입니다. 이용자가 그 기능을 쓸 때 네트워크로 전송되며, 각 업체의 약관과 개인정보처리방침에 따라 처리됩니다. 국외 이전을 원하지 않으면 '선배에게 털어놓기' 대신 일반 파쇄 기능을 쓰면 됩니다. 카카오·구글 로그인은 이용자가 선택한 경우에만 해당 회사의 로그인 절차를 거칩니다.</p>
<p>서비스는 이용자의 개인정보를 판매하지 않으며, 법령에 근거가 있는 경우를 빼고는 제3자에게 제공하지 않습니다.</p>

<h2>3. 광고와 쿠키</h2>
<p>서비스는 Google AdSense 광고를 게재할 수 있습니다. Google을 비롯한 제3자 광고 사업자는 쿠키를 사용해 이용자가 이 사이트와 다른 사이트를 방문한 기록을 바탕으로 광고를 보여 줄 수 있습니다. Google은 광고 쿠키를 사용해 이용자에게 맞춤 광고를 제공할 수 있습니다.</p>
<p>이용자는 <a href="https://adssettings.google.com" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 끌 수 있고, <a href="https://www.aboutads.info" rel="noopener" target="_blank">www.aboutads.info</a>에서 다른 제3자 광고 사업자의 맞춤 광고 쿠키를 끌 수 있습니다. Google이 광고에 데이터를 쓰는 방식은 <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">Google 파트너 사이트 데이터 사용 안내</a>에서 확인할 수 있습니다.</p>
<p>서비스 자체는 로그인 유지와 설정 저장(다크 모드, 저장한 입력 등)을 위해 브라우저의 로컬 저장소를 씁니다. 브라우저 설정에서 쿠키와 저장 데이터를 지우거나 막을 수 있으며, 막으면 일부 기능을 쓰기 어려울 수 있습니다.</p>

<h2>4. 이용자의 권리와 행사 방법</h2>
<p>이용자는 언제든 자신의 개인정보를 열람하거나 정정·삭제·처리정지를 요구할 수 있습니다. 아래 이메일로 요청하면 지체 없이 처리합니다. 다음은 서비스 안에서 바로 할 수 있습니다.</p>
<ul>
<li>내가 쓴 게시글·답변 삭제</li>
<li>성장 궤적 전체 삭제 (성장 궤적 화면)</li>
<li>프롬프트 보관함 비우기</li>
<li>비밀편지 구독 취소 (이메일로 요청)</li>
</ul>

<h2>5. 개인정보의 파기</h2>
<p>보유 기간이 끝나거나 처리 목적을 이루면 지체 없이 파기합니다. 전자 파일은 복구할 수 없는 방법으로 지웁니다.</p>

<h2>6. 안전성 확보 조치</h2>
<p>데이터베이스의 모든 표에 행 단위 접근 제한(RLS)을 걸어, 프롬프트 보관함·성장 궤적 같은 개인 기록은 본인만 볼 수 있고 교육 문의는 운영자만 볼 수 있게 했습니다. 모든 통신은 HTTPS로 암호화하며, 관리자 계정은 운영자만 씁니다.</p>

<h2>7. 개인정보 보호책임자</h2>
<p>개인정보 보호책임자: 사복노트 운영자<br>이메일: <a href="mailto:{CONTACT}">{CONTACT}</a></p>
<p>개인정보 침해에 대한 신고나 상담은 아래 기관에도 할 수 있습니다.<br>
· 개인정보분쟁조정위원회 1833-6972 (www.kopico.go.kr)<br>
· 개인정보침해신고센터 국번 없이 118 (privacy.kisa.or.kr)<br>
· 대검찰청 국번 없이 1301 (www.spo.go.kr)<br>
· 경찰청 국번 없이 182 (ecrm.police.go.kr)</p>

<h2>8. 방침의 변경</h2>
<p>이 방침은 {POLICY_DATE}부터 적용됩니다. 내용이 바뀌면 이 페이지에 알립니다.</p>
"""

TERMS = f"""<h2>제1조 (목적)</h2>
<p>이 약관은 사복노트(사회복지사 비밀노트, 이하 "서비스")가 제공하는 웹 서비스의 이용 조건과 절차를 정합니다.</p>

<h2>제2조 (서비스 내용)</h2>
<p>서비스는 사회복지 실무자를 위한 AI 프롬프트, 실무 계산기, 용어 풀이, 익명 Q&amp;A·커뮤니티, 감정 파쇄기, 게임 등을 무료로 제공합니다. 회원가입 없이 익명으로 이용할 수 있고, 이용자가 원하면 카카오·구글 계정을 연결할 수 있습니다.</p>

<h2>제3조 (AI 도구와 정보의 성격)</h2>
<p>1. 서비스의 AI 프롬프트, 템플릿, 계산기, 자료는 실무 참고용이며 법적 효력이 없습니다. 최종 검토와 판단의 책임은 이용자에게 있습니다.<br>
2. 제도, 금액, 기준은 바뀔 수 있습니다. 실제 업무에는 관계 기관의 고시와 소속 기관의 규정을 확인해 주세요.</p>

<h2>제4조 (이용자의 의무)</h2>
<p>이용자는 다음 행위를 해서는 안 됩니다.<br>
1. 대상자나 다른 사람의 실명, 주민등록번호, 연락처, 주소 등 개인정보를 게시판·프롬프트 칸·문의에 쓰는 행위<br>
2. 다른 이용자를 비방하거나 욕설, 혐오 표현을 쓰는 행위<br>
3. 광고, 홍보, 불법 정보를 올리는 행위<br>
4. 서비스의 정상 운영을 방해하는 행위</p>

<h2>제5조 (게시물 관리)</h2>
<p>익명 커뮤니티는 서로 응원하는 공간입니다. 제4조를 어긴 게시물은 예고 없이 삭제될 수 있습니다. 게시물에 대한 권리와 책임은 작성자에게 있습니다.</p>

<h2>제6조 (광고)</h2>
<p>서비스는 운영을 위해 페이지에 광고(Google AdSense 등)를 게재할 수 있습니다. 광고 쿠키에 대한 내용은 <a href="/privacy.html">개인정보처리방침</a>을 확인해 주세요.</p>

<h2>제7조 (책임의 한계)</h2>
<p>1. 서비스는 이용자 사이에 생긴 거래, 분쟁, 손해, 사기 행위에 대해 법적 책임을 지지 않습니다.<br>
2. 게시판 정보를 활용해 생긴 결과는 이용자 본인의 판단과 책임에 따릅니다.</p>

<h2>제8조 (서비스 변경과 종료)</h2>
<p>1. 서비스는 운영 사정에 따라 내용을 바꾸거나 종료할 수 있습니다. 중요한 자료는 따로 보관해 주세요.<br>
2. 감정 파쇄기에 넣고 파쇄한 글은 서비스도 되살릴 수 없습니다.</p>

<h2>제9조 (약관의 변경)</h2>
<p>약관을 바꾸면 이 페이지에 알립니다. 이 약관은 {POLICY_DATE}부터 적용됩니다.</p>
<p class="muted">문의: <a href="mailto:{CONTACT}">{CONTACT}</a></p>
"""


def label_cells(text):
    """표의 칸마다 머리글을 data-label로 달아 둔다 (좁은 화면에서 카드 모양으로 보여 줄 때 씀)."""
    def one(table):
        heads = re.findall(r"<th>(.*?)</th>", table)
        def row(m):
            cells = re.findall(r"<td>(.*?)</td>", m.group(0))
            if not cells:
                return m.group(0)
            return "<tr>" + "".join(f'<td data-label="{e(re.sub("<[^>]+>", "", h))}">{c}</td>' if i else f"<td>{c}</td>"
                                    for i, (h, c) in enumerate(zip(heads, cells))) + "</tr>"
        return re.sub(r"<tr>.*?</tr>", row, table)
    return re.sub(r"<table>.*?</table>", lambda m: one(m.group(0)), text, flags=re.S)


def policy_pages():
    write("about.html", page(
        "/about.html", "사복노트 소개 — 사회복지사를 위한 무료 실무 도구 | 사복노트",
        "사복노트는 사회복지사를 위한 무료 웹 서비스예요. AI 프롬프트, 실무 계산기, 생존 단어장, 익명 Q&A를 가입 없이 쓸 수 있어요.",
        [("📔 사복노트", "/"), ("소개", None)],
        "🌿 사복노트 소개", "사회복지사의 서류·계산·고민을 덜어 주는 무료 실무 도구 모음", ABOUT, "🌿"))
    write("privacy.html", page(
        "/privacy.html", "개인정보처리방침 | 사복노트",
        "사복노트가 처리하는 개인정보의 항목, 목적, 보유 기간, 위탁, 광고 쿠키와 이용자의 권리를 안내합니다.",
        [("📔 사복노트", "/"), ("개인정보처리방침", None)],
        "🔒 개인정보처리방침", f"시행일 {POLICY_DATE}",
        f'        <div class="card policy">\n{label_cells(PRIVACY)}        </div>\n', "🔒"))
    write("terms.html", page(
        "/terms.html", "서비스 이용약관 | 사복노트",
        "사복노트 서비스의 이용 조건, 이용자의 의무, 게시물 관리, 광고와 책임의 한계를 안내합니다.",
        [("📔 사복노트", "/"), ("이용약관", None)],
        "📋 서비스 이용약관", f"시행일 {POLICY_DATE}",
        f'        <div class="card policy">\n{TERMS}        </div>\n', "📋"))
    return ["/about.html", "/privacy.html", "/terms.html"]


# ---------------------------------------------------------------- 사이트맵
STATIC = ["/", "/about.html", "/tools/", "/tools/vat.html", "/tools/lecture-fee.html", "/tools/ltc-limit.html",
          "/treasure.html"]
GUIDES = ["notebooklm_2026_guide", "notebooklm_advanced1", "notebooklm_advanced2", "notebooklm_advanced3",
          "notebooklm_advanced4", "notebooklm_advanced5", "notebooklm_advanced6", "antigravity_guide",
          "antigravity_r1_webpage", "antigravity_r2_checklist", "antigravity_r3_excel_merge", "antigravity_r4_chart",
          "antigravity_r5_survey", "antigravity_r6_document", "antigravity_r7_thankyou", "antigravity_r8_report",
          "finance_tips_guide"]


def sitemap(urls):
    today = datetime.date.today().isoformat()
    rows = "\n".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n'
                         f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}\n</urlset>\n')


def main():
    data = app_data()
    rules = common_rules(read("index.js"))
    urls = list(STATIC)
    urls += prompt_pages(data, rules, workbook_labs())
    urls += voca_page(data)
    urls += [u for u in policy_pages() if u not in urls]
    urls += [f"/honeydata/{g}.html" for g in GUIDES]
    for u in urls:   # 사이트맵에 넣는 페이지가 실제로 있는지
        f = u.strip("/")
        if u.endswith("/"):
            f = f + "/index.html" if f else "index.html"
        if not os.path.exists(os.path.join(ROOT, f)):
            raise SystemExit(f"없는 페이지: {u}")
    sitemap(urls)
    print(f"프롬프트 {len(data['prompts'])}개 · 단어 {len(data['voca'])}개 · 사이트맵 {len(urls)}개 주소")


if __name__ == "__main__":
    main()
