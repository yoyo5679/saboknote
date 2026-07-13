import os
import re

def generate_card(file_name, data):
    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>사복노트 {data['title']}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#DDE3ED; font-family:'Noto Sans KR',sans-serif; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:32px 16px 48px; }}
  .top-label {{ font-size:12px; font-weight:700; color:#8A94A6; letter-spacing:2px; margin-bottom:20px; text-transform:uppercase; }}
  .card {{ width:480px; height:600px; border-radius:22px; overflow:hidden; box-shadow:0 16px 48px rgba(0,0,0,0.18); position:relative; flex-shrink:0; }}
  .slide {{ display:none; width:100%; height:100%; position:absolute; top:0; left:0; }}
  .slide.on {{ display:flex; flex-direction:column; }}
  .foot {{ height:48px; flex-shrink:0; display:flex; align-items:center; padding:0 32px; justify-content:space-between; }}
  .foot .fl {{ font-size:12px; font-weight:900; }}
  .foot .fr {{ font-size:11px; }}
  .voca-card {{ background:white; border-radius:14px; padding:12px 15px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }}
  .voca-top {{ display:flex; align-items:center; gap:7px; margin-bottom:4px; }}
  .voca-cat {{ font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; }}
  .cat-mint {{ background:rgba(78,205,196,0.12); color:#2ABFB5; }}
  .cat-blue {{ background:#EBF2FF; color:#2F6FED; }}
  .voca-name {{ font-size:14px; font-weight:900; color:#1B2E4B; margin-bottom:4px; }}
  .voca-real {{ font-size:12.5px; color:#3D4A5C; font-weight:600; line-height:1.5; margin-bottom:4px; word-break:keep-all; }}
  .voca-admin {{ font-size:11px; color:#8A94A6; line-height:1.5; padding-left:9px; border-left:2px solid #E0E8F0; word-break:keep-all; }}

  /* S1 훅 — 화이트 톤 */
  .s1 {{ background:#ffffff; }}
  .s1 .logo-bar {{ display:flex; justify-content:space-between; align-items:center; padding:24px 32px 0; flex-shrink:0; }}
  .s1 .logo {{ font-size:13px; font-weight:900; color:#94A3B8; }}
  .s1 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; justify-content:center; }}
  .s1 .pill {{ display:inline-block; background:#0D9488; border:1px solid #0D9488; color:#ffffff; font-size:10px; font-weight:700; padding:4px 12px; border-radius:20px; margin-bottom:16px; align-self:flex-start; letter-spacing:1px; }}
  .s1 .q {{ font-size:14px; color:#64748B; margin-bottom:14px; }}
  .s1 .words {{ display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }}
  .s1 .wrow {{ display:flex; align-items:baseline; gap:10px; }}
  .s1 .wname {{ font-size:26px; font-weight:900; color:#1B2E4B; }}
  .s1 .wq {{ font-size:13px; color:#94A3B8; }}
  .s1 .hint {{ font-size:14px; color:#475569; line-height:1.7; word-break:keep-all; }}
  .s1 .hint em {{ color:#0D9488; font-style:normal; font-weight:700; }}
  .s1 .foot {{ background:#F8FAFC; border-top:1px solid #E2E8F0; }}
  .s1 .foot .fl {{ color:#64748B; }}
  .s1 .foot .fr {{ color:#94A3B8; }}

  /* S2 공감 */
  .s2 {{ background:#fff; }}
  .s2 .head {{ background:{data['s2_color']}; padding:22px 32px 18px; flex-shrink:0; }}
  .s2 .head-tag {{ font-size:10px; font-weight:700; color:rgba(255,255,255,0.7); letter-spacing:2px; margin-bottom:6px; }}
  .s2 .head-title {{ font-size:22px; font-weight:900; color:white; line-height:1.35; }}
  .s2 .body {{ flex:1; padding:18px 32px 0; display:flex; flex-direction:column; gap:8px; }}
  .s2 .scene {{ background:#F4F6FA; border-radius:13px; padding:12px 15px; }}
  .s2 .scene-top {{ display:flex; align-items:center; gap:7px; margin-bottom:5px; }}
  .s2 .s-icon {{ font-size:16px; }}
  .s2 .s-when {{ font-size:10px; font-weight:700; color:#8A94A6; letter-spacing:1px; }}
  .s2 .s-text {{ font-size:13px; color:#3D4A5C; font-weight:500; line-height:1.55; word-break:keep-all; }}
  .s2 .s-inner {{ font-size:11px; color:#8A94A6; margin-top:2px; font-style:italic; }}
  .s2 .foot {{ background:#F4F6FA; }}
  .s2 .foot .fl {{ color:{data['s2_color']}; }}
  .s2 .foot .fr {{ color:#8A94A6; }}

  /* S3 반전 */
  .s3 {{ background:{data['s3_color']}; }}
  .s3 .body {{ flex:1; padding:32px 32px 0; display:flex; flex-direction:column; justify-content:center; }}
  .s3 .tag {{ font-size:10px; font-weight:700; color:rgba(255,255,255,0.65); letter-spacing:2px; margin-bottom:12px; }}
  .s3 .ico {{ font-size:48px; margin-bottom:10px; line-height:1; }}
  .s3 .title {{ font-size:28px; font-weight:900; color:white; line-height:1.3; margin-bottom:12px; }}
  .s3 .title em {{ color:#FFD166; font-style:normal; }}
  .s3 .desc {{ font-size:14px; color:rgba(255,255,255,0.85); line-height:1.8; margin-bottom:16px; word-break:keep-all; }}
  .s3 .compare {{ background:rgba(255,255,255,0.15); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }}
  .s3 .cr {{ display:flex; align-items:flex-start; gap:8px; }}
  .s3 .cl {{ font-size:10px; font-weight:700; min-width:32px; padding-top:2px; }}
  .s3 .ct {{ font-size:13px; line-height:1.55; word-break:keep-all; }}
  .s3 .foot {{ background:rgba(0,0,0,0.12); border-top:1px solid rgba(255,255,255,0.15); }}
  .s3 .foot .fl {{ color:rgba(255,255,255,0.5); }}
  .s3 .foot .fr {{ color:rgba(255,255,255,0.35); }}

  /* S4 */
  .s4 {{ background:#F0FAFA; }}
  .s4 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s4 .stag {{ font-size:10px; font-weight:700; color:#2ABFB5; letter-spacing:2px; margin-bottom:5px; }}
  .s4 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s4 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s4 .foot {{ background:rgba(78,205,196,0.1); }}
  .s4 .foot .fl {{ color:#2ABFB5; }}
  .s4 .foot .fr {{ color:#8A94A6; }}

  /* S5 */
  .s5 {{ background:#fff; }}
  .s5 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s5 .stag {{ font-size:10px; font-weight:700; color:#2ABFB5; letter-spacing:2px; margin-bottom:5px; }}
  .s5 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s5 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s5 .foot {{ background:#F4F6FA; }}
  .s5 .foot .fl {{ color:#2F6FED; }}
  .s5 .foot .fr {{ color:#8A94A6; }}

  /* S6 */
  .s6 {{ background:#F4F6FA; }}
  .s6 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s6 .stag {{ font-size:10px; font-weight:700; color:#2F6FED; letter-spacing:2px; margin-bottom:5px; }}
  .s6 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s6 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s6 .order-box {{ background:#EBF2FF; border-radius:13px; padding:12px 15px; }}
  .s6 .ob-title {{ font-size:11px; font-weight:700; color:#2F6FED; margin-bottom:5px; }}
  .s6 .ob-text {{ font-size:13px; color:#3D4A5C; font-weight:600; line-height:1.55; }}
  .s6 .ob-sub {{ font-size:11px; color:#8A94A6; margin-top:3px; }}
  .s6 .foot {{ background:#EBF2FF; }}
  .s6 .foot .fl {{ color:#2F6FED; }}
  .s6 .foot .fr {{ color:#8A94A6; }}

  /* S7 CTA */
  .s7 {{ background:linear-gradient(160deg,#0A2A2A 0%,#1B4A4A 100%); }}
  .s7 .inner {{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0 36px; text-align:center; }}
  .s7 .emo {{ font-size:50px; margin-bottom:14px; line-height:1; }}
  .s7 .big {{ font-size:21px; font-weight:900; color:white; line-height:1.6; margin-bottom:12px; word-break:keep-all; }}
  .s7 .big em {{ color:#4ECDC4; font-style:normal; }}
  .s7 .div2 {{ width:36px; height:2px; background:rgba(255,255,255,0.15); border-radius:2px; margin:0 auto 14px; }}
  .s7 .sub {{ font-size:13px; color:rgba(255,255,255,0.5); line-height:1.85; margin-bottom:22px; word-break:keep-all; }}
  .s7 .cta {{ background:#4ECDC4; color:white; font-size:14px; font-weight:900; padding:12px 26px; border-radius:40px; margin-bottom:8px; }}
  .s7 .url {{ font-size:11px; color:rgba(255,255,255,0.3); }}
  .s7 .foot {{ background:rgba(0,0,0,0.15); border-top:1px solid rgba(255,255,255,0.06); }}
  .s7 .foot .fl {{ color:rgba(255,255,255,0.3); }}
  .s7 .foot .fr {{ color:rgba(255,255,255,0.2); }}

  .nav {{ display:flex; align-items:center; gap:14px; margin-top:18px; }}
  .nbtn {{ width:38px; height:38px; border-radius:50%; background:white; border:none; cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.12); color:#1B2E4B; transition:all .18s; }}
  .nbtn:hover:not(:disabled) {{ background:#1B2E4B; color:white; }}
  .nbtn:disabled {{ opacity:.3; cursor:default; }}
  .dots {{ display:flex; gap:5px; }}
  .d {{ width:7px; height:7px; border-radius:50%; background:#C0C8D4; cursor:pointer; transition:all .18s; }}
  .d.on {{ background:#1B2E4B; width:18px; border-radius:4px; }}
  .ctr {{ font-size:11px; color:#8A94A6; margin-top:6px; text-align:center; }}
</style>
</head>
<body>
<div class="top-label">사복노트 · {data['title']}</div>
<div class="card">

  <!-- S1 훅 -->
  <div class="slide s1 on">
    <div class="logo-bar">
      <span class="logo">sano 사복노트</span>
      <span style="font-size:11px;color:#CBD5E1;">1 / 7</span>
    </div>
    <div class="body">
      <div class="pill">📖 {data['s1_pill']}</div>
      <div class="q">{data['s1_q']}</div>
      <div class="words">
        {data['s1_words']}
      </div>
      <div class="hint">{data['s1_hint']}</div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">1 / 7</span></div>
  </div>

  <!-- S2 공감 -->
  <div class="slide s2">
    <div class="head">
      <div class="head-tag">{data['s2_tag']}</div>
      <div class="head-title">{data['s2_title']}</div>
    </div>
    <div class="body">
      {data['s2_scenes']}
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">2 / 7</span></div>
  </div>

  <!-- S3 반전 -->
  <div class="slide s3">
    <div class="body">
      <div class="tag">{data['s3_tag']}</div>
      <div class="ico">{data['s3_icon']}</div>
      <div class="title">{data['s3_title']}</div>
      <div class="desc">{data['s3_desc']}</div>
      <div class="compare">
        {data['s3_compare']}
      </div>
    </div>
    <div class="foot"><span class="fl" style="color:rgba(255,255,255,0.5);">사복노트</span><span class="fr" style="color:rgba(255,255,255,0.35);">3 / 7</span></div>
  </div>

  <!-- S4 -->
  <div class="slide s4">
    <div class="top">
      <div class="stag">{data['s4_tag']}</div>
      <div class="stit">{data['s4_title']}</div>
    </div>
    <div class="body">
      {data['s4_cards']}
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">4 / 7</span></div>
  </div>

  <!-- S5 -->
  <div class="slide s5">
    <div class="top">
      <div class="stag">{data['s5_tag']}</div>
      <div class="stit">{data['s5_title']}</div>
    </div>
    <div class="body">
      {data['s5_cards']}
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">5 / 7</span></div>
  </div>

  <!-- S6 -->
  <div class="slide s6">
    <div class="top">
      <div class="stag">{data['s6_tag']}</div>
      <div class="stit">{data['s6_title']}</div>
    </div>
    <div class="body">
      {data['s6_cards']}
      {data['s6_order_box']}
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">6 / 7</span></div>
  </div>

  <!-- S7 CTA -->
  <div class="slide s7">
    <div class="inner">
      <div class="emo">📖</div>
      <div class="big">{data['s7_big']}</div>
      <div class="div2"></div>
      <div class="sub">{data['s7_sub']}</div>
      <div class="cta">📖 지금 바로 사용하기</div>
      <div class="url">saboknote.com</div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">7 / 7</span></div>
  </div>

</div>

<div class="nav">
  <button class="nbtn" id="p" onclick="go(-1)" disabled>←</button>
  <div class="dots" id="dots"></div>
  <button class="nbtn" id="n" onclick="go(1)">→</button>
</div>
<div class="ctr" id="ctr">1 / 7</div>

<script>
  let cur=0; const N=7;
  const slides=document.querySelectorAll('.slide');
  const wrap=document.getElementById('dots');
  for(let i=0;i<N;i++){{
    const d=document.createElement('div');
    d.className='d'+(i===0?' on':'');
    d.onclick=()=>to(i);
    wrap.appendChild(d);
  }}
  function to(n){{
    slides[cur].classList.remove('on'); wrap.children[cur].classList.remove('on');
    cur=n;
    slides[cur].classList.add('on'); wrap.children[cur].classList.add('on');
    document.getElementById('ctr').textContent=`${{cur+1}} / ${{N}}`;
    document.getElementById('p').disabled=cur===0;
    document.getElementById('n').disabled=cur===N-1;
  }}
  function go(d){{const nx=cur+d;if(nx>=0&&nx<N)to(nx);}}
  document.addEventListener('keydown',e=>{{
    if(e.key==='ArrowRight')go(1);
    if(e.key==='ArrowLeft')go(-1);
  }});
</script>
</body>
</html>"""
    with open(f"/Users/hong-eunseong/Documents/안티그래비티/saboksnote/cardnews/{file_name}", "w") as f:
        f.write(html)


data1 = {
    "title": "프로포절 작성법",
    "s2_color": "#FF6B6B", "s3_color": "#4ECDC4",
    "s1_pill": "기획 꿀팁",
    "s1_q": "프로포절 작성, 아직도 막막하신가요? 📝",
    "s1_words": '''
        <div class="wrow"><span class="wname">사업배경</span><span class="wq">뭐부터 써야 할지?</span></div>
        <div class="wrow"><span class="wname">목표설정</span><span class="wq">정량적? 정성적?</span></div>
        <div class="wrow"><span class="wname">예산편성</span><span class="wq">산출근거는 어떻게?</span></div>
    ''',
    "s1_hint": "사복노트에서<br><em>프로포절 3단계 공식</em>을 알려드려요",
    "s2_tag": "신입 때 다 겪었죠",
    "s2_title": "빈 화면만 보며<br>깜빡이는 커서...",
    "s2_scenes": '''
      <div class="scene">
        <div class="scene-top"><span class="s-icon">😶</span><span class="s-when">사업계획서 작성</span></div>
        <div class="s-text">"올해 신규 사업 기안해봐요"</div>
        <div class="s-inner">(속으로: 네? 제가요...?)</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">😰</span><span class="s-when">예산 작성 중</span></div>
        <div class="s-text">"산출근거가 안 맞네요"</div>
        <div class="s-inner">(도대체 강사비는 얼마로 잡아야...)</div>
      </div>
    ''',
    "s3_tag": "사복노트 기획법 ✅",
    "s3_icon": "💡",
    "s3_title": "막막한 프로포절<br><em>3단계 핵심 공식</em>",
    "s3_desc": "Why, What, How만 기억하세요",
    "s3_compare": '''
        <div class="cr">
          <span class="cl" style="color:rgba(255,255,255,0.35);">❌ 기존</span>
          <span class="ct" style="color:rgba(255,255,255,0.45);">일단 프로그램 일정부터 짠다</span>
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);"></div>
        <div class="cr">
          <span class="cl" style="color:#FFD166;">✅ 사복</span>
          <span class="ct" style="color:white;font-weight:700;">필요성(Why)부터 고민하고<br>그에 맞는 프로그램(How) 기획!</span>
        </div>
    ''',
    "s4_tag": "STEP 1. 배경 및 필요성",
    "s4_title": "왜 이 사업이 필요한가요?",
    "s4_cards": '''
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">📊</span><span class="voca-cat cat-mint">객관적 근거</span></div>
        <div class="voca-name">통계와 기사 활용하기</div>
        <div class="voca-real">지역사회 통계나 최신 기사를 인용하여 객관성을 높이세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">🗣️</span><span class="voca-cat cat-mint">대상자 욕구</span></div>
        <div class="voca-name">실제 현장의 목소리</div>
        <div class="voca-real">클라이언트의 인터뷰나 상담 사례를 통해 절실함을 어필하세요.</div>
      </div>
    ''',
    "s5_tag": "STEP 2. 목적 및 목표",
    "s5_title": "무엇을 변화시킬 건가요?",
    "s5_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🎯</span><span class="voca-cat cat-blue">SMART 기법</span></div>
        <div class="voca-name">측정 가능한 목표</div>
        <div class="voca-real">구체적이고(Specific), 측정가능한(Measurable) 목표를 세우세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">📈</span><span class="voca-cat cat-blue">성과 지표</span></div>
        <div class="voca-name">변화의 증거</div>
        <div class="voca-real">사전/사후 검사지, 만족도 조사 등 목표 달성을 증명할 도구를 정하세요.</div>
      </div>
    ''',
    "s6_tag": "STEP 3. 예산 편성",
    "s6_title": "그래서 얼마가 필요한가요?",
    "s6_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">💰</span><span class="voca-cat cat-blue">산출근거</span></div>
        <div class="voca-name">구체적인 계산식</div>
        <div class="voca-real">단가 × 인원 × 횟수 = 예산액. 누구나 봐도 납득되게 쓰세요.</div>
      </div>
    ''',
    "s6_order_box": '''
      <div class="order-box">
        <div class="ob-title">💡 꿀팁</div>
        <div class="ob-text">복지부 사회복지시설 관리안내 책자의<br>강사수당 및 원고료 기준을 참고하세요!</div>
      </div>
    ''',
    "s7_big": "프로포절의 정답,<br><em>사복노트에서</em> 찾아보세요",
    "s7_sub": "합격하는 사업계획서 예시부터<br>예산 편성 기준표까지! 🙂<br><br>작성 중인 동료에게 공유해주세요 🔖"
}

data2 = {
    "title": "악성 민원 응대",
    "s2_color": "#FF6B6B", "s3_color": "#4ECDC4",
    "s1_pill": "생존 매뉴얼",
    "s1_q": "갑자기 소리지르는 클라이언트 🗣️",
    "s1_words": '''
        <div class="wrow"><span class="wname">막무가내</span><span class="wq">다 해달라고 할 때?</span></div>
        <div class="wrow"><span class="wname">폭언/욕설</span><span class="wq">당황해서 얼어붙었다면?</span></div>
        <div class="wrow"><span class="wname">부당한 요구</span><span class="wq">거절하기 힘들다면?</span></div>
    ''',
    "s1_hint": "사복노트에서<br><em>당황하지 않는 대처법</em>을 알려드려요",
    "s2_tag": "누구나 겪는 위기",
    "s2_title": "머릿속이 하얘지고<br>심장만 쿵쾅쿵쾅...",
    "s2_scenes": '''
      <div class="scene">
        <div class="scene-top"><span class="s-icon">🤬</span><span class="s-when">사무실 방문</span></div>
        <div class="s-text">"당장 내놔! 내가 누군지 알아?"</div>
        <div class="s-inner">(주변 선생님들 눈치만 보임...)</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">📞</span><span class="s-when">전화 상담 중</span></div>
        <div class="s-text">다짜고짜 쌍욕부터 하시는 어르신</div>
        <div class="s-inner">(끊지도 못하고 30분째 듣는 중)</div>
      </div>
    ''',
    "s3_tag": "사복노트 매뉴얼 ✅",
    "s3_icon": "🛡️",
    "s3_title": "감정노동으로부터<br><em>나를 지키는 법</em>",
    "s3_desc": "무조건 참는 것이 정답은 아닙니다",
    "s3_compare": '''
        <div class="cr">
          <span class="cl" style="color:rgba(255,255,255,0.35);">❌ 오해</span>
          <span class="ct" style="color:rgba(255,255,255,0.45);">사회복지사니까 무조건 친절해야 해</span>
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);"></div>
        <div class="cr">
          <span class="cl" style="color:#FFD166;">✅ 정답</span>
          <span class="ct" style="color:white;font-weight:700;">부당한 폭력과 욕설에는<br>단호하고 안전하게 대처하기!</span>
        </div>
    ''',
    "s4_tag": "STEP 1. 안전 확보",
    "s4_title": "가장 중요한 건 선생님의 안전",
    "s4_cards": '''
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">🏃</span><span class="voca-cat cat-mint">물리적 거리</span></div>
        <div class="voca-name">책상 너머로 대화하기</div>
        <div class="voca-real">흥분한 클라이언트와는 반드시 1m 이상의 거리를 유지하세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">👥</span><span class="voca-cat cat-mint">동료 지원</span></div>
        <div class="voca-name">절대 혼자 대응하지 않기</div>
        <div class="voca-real">위험 상황 시 즉시 주변 동료나 중간관리자에게 도움을 요청하세요.</div>
      </div>
    ''',
    "s5_tag": "STEP 2. 경청과 공감",
    "s5_title": "감정 누그러뜨리기",
    "s5_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">👂</span><span class="voca-cat cat-blue">초기 대응</span></div>
        <div class="voca-name">일단 끝까지 듣기</div>
        <div class="voca-real">"많이 속상하셨군요" 공감만 해줘도 분노의 절반은 가라앉습니다.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🧊</span><span class="voca-cat cat-blue">쿨다운</span></div>
        <div class="voca-name">따뜻한 물 한 잔의 마법</div>
        <div class="voca-real">자리를 권하고 물을 드리며 감정이 진정될 시간을 벌어주세요.</div>
      </div>
    ''',
    "s6_tag": "STEP 3. 단호한 대처",
    "s6_title": "안 되는 건 안 된다고 명확히",
    "s6_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🚫</span><span class="voca-cat cat-blue">규정 안내</span></div>
        <div class="voca-name">정확한 한계선 긋기</div>
        <div class="voca-real">기관의 규정과 원칙을 차분하고 단호한 목소리로 설명하세요.</div>
      </div>
    ''',
    "s6_order_box": '''
      <div class="order-box">
        <div class="ob-title">💡 전화 폭언 대처법</div>
        <div class="ob-text">"선생님, 계속 욕설을 하시면 상담을 진행할 수 없습니다."<br>3회 경고 후 단호하게 통화를 종료하세요.</div>
      </div>
    ''',
    "s7_big": "현장의 위기 상황,<br><em>사복노트가</em> 지켜드릴게요",
    "s7_sub": "악성 민원 응대 매뉴얼부터<br>법적 대처 가이드까지! 🙂<br><br>상처받은 동료에게 힘이 되어주세요 🔖"
}

data3 = {
    "title": "번아웃 극복",
    "s2_color": "#FF6B6B", "s3_color": "#4ECDC4",
    "s1_pill": "마음 처방전",
    "s1_q": "출근길이 너무 무거우신가요? 😥",
    "s1_words": '''
        <div class="wrow"><span class="wname">서류폭탄</span><span class="wq">끝이 없는 업무들</span></div>
        <div class="wrow"><span class="wname">감정소진</span><span class="wq">내 마음 돌볼 틈이 없다면</span></div>
        <div class="wrow"><span class="wname">무기력증</span><span class="wq">다 그만두고 싶을 때</span></div>
    ''',
    "s1_hint": "사복노트에서<br><em>번아웃을 이겨내는 법</em>을 알려드려요",
    "s2_tag": "열정의 배터리 방전",
    "s2_title": "좋아서 시작한 일인데<br>왜 이렇게 힘들까요",
    "s2_scenes": '''
      <div class="scene">
        <div class="scene-top"><span class="s-icon">🔋</span><span class="s-when">퇴근길 버스 안</span></div>
        <div class="s-text">창밖만 멍하니 바라보는 내 모습</div>
        <div class="s-inner">(집에 가면 씻지도 못하고 기절)</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">🥺</span><span class="s-when">클라이언트 상담 후</span></div>
        <div class="s-text">그 분의 아픔이 내 아픔처럼 느껴짐</div>
        <div class="s-inner">(대리 외상, 감정의 스폰지가 되어버렸다)</div>
      </div>
    ''',
    "s3_tag": "사복노트 힐링 ✅",
    "s3_icon": "🌱",
    "s3_title": "소진된 나를 위한<br><em>셀프 케어 가이드</em>",
    "s3_desc": "선생님이 건강해야 세상도 건강해집니다",
    "s3_compare": '''
        <div class="cr">
          <span class="cl" style="color:rgba(255,255,255,0.35);">❌ 오해</span>
          <span class="ct" style="color:rgba(255,255,255,0.45);">내가 부족해서 힘든 거야, 더 노력해야지</span>
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);"></div>
        <div class="cr">
          <span class="cl" style="color:#FFD166;">✅ 정답</span>
          <span class="ct" style="color:white;font-weight:700;">번아웃은 너무 열심히 했다는 훈장!<br>지금은 잠시 멈추고 쉬어야 할 때</span>
        </div>
    ''',
    "s4_tag": "STEP 1. 일과 삶의 분리",
    "s4_title": "퇴근 후엔 스위치 OFF",
    "s4_cards": '''
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">📴</span><span class="voca-cat cat-mint">디지털 디톡스</span></div>
        <div class="voca-name">업무 연락차단</div>
        <div class="voca-real">퇴근 후 단톡방 알림은 끄세요. 내일의 나에게 맡기세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">🧘</span><span class="voca-cat cat-mint">나만의 의식</span></div>
        <div class="voca-name">퇴근길 리추얼</div>
        <div class="voca-real">좋아하는 음악 듣기, 산책하기 등 업무 모드를 끄는 행동을 만드세요.</div>
      </div>
    ''',
    "s5_tag": "STEP 2. 감정의 환기",
    "s5_title": "내 마음의 쓰레기통 비우기",
    "s5_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">☕</span><span class="voca-cat cat-blue">동료 지지</span></div>
        <div class="voca-name">슈퍼비전과 티타임</div>
        <div class="voca-real">혼자 끙끙 앓지 말고 믿을 수 있는 동료나 슈퍼바이저와 나누세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">📝</span><span class="voca-cat cat-blue">감정 일기</span></div>
        <div class="voca-name">내 감정 기록하기</div>
        <div class="voca-real">오늘 느낀 부정적 감정을 종이에 쓰고 찢어버리세요. 생각보다 후련합니다.</div>
      </div>
    ''',
    "s6_tag": "STEP 3. 작은 성취 경험",
    "s6_title": "복지가 아닌 다른 곳에서",
    "s6_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🎨</span><span class="voca-cat cat-blue">취미 생활</span></div>
        <div class="voca-name">나만을 위한 시간</div>
        <div class="voca-real">운동, 베이킹, 드로잉 등 업무와 전혀 무관한 취미를 가져보세요.</div>
      </div>
    ''',
    "s6_order_box": '''
      <div class="order-box">
        <div class="ob-title">💡 무료 심리상담 지원</div>
        <div class="ob-text">한국사회복지사협회나 각 지자체에서 제공하는<br>사회복지사 심리지원 프로그램을 적극 활용하세요!</div>
      </div>
    ''',
    "s7_big": "지친 선생님의 마음,<br><em>사복노트가</em> 안아드릴게요",
    "s7_sub": "선생님은 충분히 잘하고 계십니다.<br>오늘 하루도 고생 많으셨어요 🙂<br><br>위로가 필요한 동료에게 건네주세요 🔖"
}

data4 = {
    "title": "자원 연계 노하우",
    "s2_color": "#FF6B6B", "s3_color": "#4ECDC4",
    "s1_pill": "네트워크 팁",
    "s1_q": "우리 동네 자원, 어디 숨어있을까? 🗺️",
    "s1_words": '''
        <div class="wrow"><span class="wname">후원발굴</span><span class="wq">맨땅에 헤딩하기?</span></div>
        <div class="wrow"><span class="wname">타기관 연계</span><span class="wq">전화하기 뻘쭘할 때</span></div>
        <div class="wrow"><span class="wname">자원지도</span><span class="wq">어디서부터 그려야 할지</span></div>
    ''',
    "s1_hint": "사복노트에서<br><em>지역사회 자원 찾는 법</em>을 알려드려요",
    "s2_tag": "자원 빈곤의 늪",
    "s2_title": "도와드릴 분은 많은데<br>줄 수 있는 게 없어요",
    "s2_scenes": '''
      <div class="scene">
        <div class="scene-top"><span class="s-icon">💸</span><span class="s-when">긴급 지원 필요시</span></div>
        <div class="s-text">"당장 생계비가 필요하신데 우리 기관 예산은 바닥..."</div>
        <div class="s-inner">(포털 사이트에 후원재단 폭풍 검색)</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">☎️</span><span class="s-when">타 기관 문의할 때</span></div>
        <div class="s-text">"안녕하세요 OOO복지관인데요..."</div>
        <div class="s-inner">(거절당할까봐 덜덜 떨리는 목소리)</div>
      </div>
    ''',
    "s3_tag": "사복노트 네트워크 ✅",
    "s3_icon": "🤝",
    "s3_title": "맨땅에 헤딩 끝!<br><em>스마트한 자원 발굴</em>",
    "s3_desc": "혼자 다 하려고 하지 마세요",
    "s3_compare": '''
        <div class="cr">
          <span class="cl" style="color:rgba(255,255,255,0.35);">❌ 기존</span>
          <span class="ct" style="color:rgba(255,255,255,0.45);">무작정 발품 팔고 전화 돌리기</span>
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);"></div>
        <div class="cr">
          <span class="cl" style="color:#FFD166;">✅ 사복</span>
          <span class="ct" style="color:white;font-weight:700;">기존 네트워크 활용하고<br>서로 윈윈(Win-Win)하는 구조 만들기!</span>
        </div>
    ''',
    "s4_tag": "STEP 1. 숨은 자원 찾기",
    "s4_title": "멀리 있지 않아요",
    "s4_cards": '''
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">🏢</span><span class="voca-cat cat-mint">행정복지센터</span></div>
        <div class="voca-name">맞춤형 복지팀 활용</div>
        <div class="voca-real">동 행정복지센터 주무관님들과 친해지세요. 지역 사정에 가장 밝습니다.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">🌐</span><span class="voca-cat cat-mint">온라인 플랫폼</span></div>
        <div class="voca-name">복지로 & 민간재단</div>
        <div class="voca-real">카카오같이가치, 네이버해피빈, 지역 맘카페 등을 주기적으로 모니터링하세요.</div>
      </div>
    ''',
    "s5_tag": "STEP 2. 관계 맺기",
    "s5_title": "거절을 두려워 마세요",
    "s5_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">📝</span><span class="voca-cat cat-blue">명분 만들기</span></div>
        <div class="voca-name">왜 당신의 도움이 필요한가</div>
        <div class="voca-real">기관의 필요가 아닌, '이웃의 변화'에 초점을 맞춰 제안하세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">☕</span><span class="voca-cat cat-blue">작은 교류</span></div>
        <div class="voca-name">자원 회의 참석</div>
        <div class="voca-real">사례관리 네트워크 회의나 실무자 모임에 적극 참여해 얼굴을 트세요.</div>
      </div>
    ''',
    "s6_tag": "STEP 3. 자원 유지관리",
    "s6_title": "한 번 맺은 인연, 평생 가도록",
    "s6_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">💌</span><span class="voca-cat cat-blue">피드백</span></div>
        <div class="voca-name">결과 공유하기</div>
        <div class="voca-real">도움이 어떻게 쓰였는지, 어떤 변화가 있었는지 반드시 알려주세요. (최고의 유지 비결!)</div>
      </div>
    ''',
    "s6_order_box": '''
      <div class="order-box">
        <div class="ob-title">💡 자원지도 그리기</div>
        <div class="ob-text">의료/주거/생계/교육 등 영역별로<br>우리 기관이 연락할 수 있는 핫라인 목록을 엑셀로 정리해두세요.</div>
      </div>
    ''',
    "s7_big": "든든한 지역사회 만들기,<br><em>사복노트와</em> 함께해요",
    "s7_sub": "최신 공모사업 정보부터<br>협력기관 리스트업 노하우까지! 🙂<br><br>자원 발굴에 고민하는 동료에게 🔖"
}

data5 = {
    "title": "실습생 지도 팁",
    "s2_color": "#FF6B6B", "s3_color": "#4ECDC4",
    "s1_pill": "선배의 품격",
    "s1_q": "다음 주부터 실습생이 온다구요? 😱",
    "s1_words": '''
        <div class="wrow"><span class="wname">일정표</span><span class="wq">뭐부터 가르쳐야 하지?</span></div>
        <div class="wrow"><span class="wname">과제피드백</span><span class="wq">빨간펜 선생님은 부담스러워</span></div>
        <div class="wrow"><span class="wname">MZ세대</span><span class="wq">어떻게 소통해야 할까?</span></div>
    ''',
    "s1_hint": "사복노트에서<br><em>존경받는 실습지도자</em>가 되는 법을 알려드려요",
    "s2_tag": "내 코가 석 자인데",
    "s2_title": "내 업무도 바쁜데<br>지도까지 하려니 막막...",
    "s2_scenes": '''
      <div class="scene">
        <div class="scene-top"><span class="s-icon">⏳</span><span class="s-when">실습 첫날 아침</span></div>
        <div class="s-text">어색하게 마주앉은 실습생과 나</div>
        <div class="s-inner">(무슨 말부터 꺼내야 하지...)</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">📝</span><span class="s-when">과제 검토 중</span></div>
        <div class="s-text">"이건 이렇게 쓰면 안되는데..."</div>
        <div class="s-inner">(다 고쳐주자니 상처받을까 걱정, 안 고치자니 무책임한 것 같고)</div>
      </div>
    ''',
    "s3_tag": "사복노트 지도법 ✅",
    "s3_icon": "🎓",
    "s3_title": "실습생도 나도 성장하는<br><em>윈윈(Win-Win) 실습</em>",
    "s3_desc": "가르치면서 가장 많이 배웁니다",
    "s3_compare": '''
        <div class="cr">
          <span class="cl" style="color:rgba(255,255,255,0.35);">❌ 기존</span>
          <span class="ct" style="color:rgba(255,255,255,0.45);">단순 잡무만 시키거나 방치하기</span>
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);"></div>
        <div class="cr">
          <span class="cl" style="color:#FFD166;">✅ 사복</span>
          <span class="ct" style="color:white;font-weight:700;">구체적인 피드백과 동기부여로<br>미래의 훌륭한 동료 양성하기!</span>
        </div>
    ''',
    "s4_tag": "STEP 1. 체계적인 계획",
    "s4_title": "첫 단추 잘 끼우기",
    "s4_cards": '''
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">📅</span><span class="voca-cat cat-mint">오리엔테이션</span></div>
        <div class="voca-name">명확한 목표와 규칙 공유</div>
        <div class="voca-real">기관의 미션과 실습기간 지켜야 할 그라운드 룰을 명확히 안내하세요.</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #4ECDC4;">
        <div class="voca-top"><span style="font-size:18px;">📋</span><span class="voca-cat cat-mint">일정표 공유</span></div>
        <div class="voca-name">예측 가능한 일정</div>
        <div class="voca-real">160시간의 로드맵을 미리 제공하여 실습생이 주도적으로 준비하게 하세요.</div>
      </div>
    ''',
    "s5_tag": "STEP 2. 따뜻하지만 예리한 피드백",
    "s5_title": "비판이 아닌 성장을 위해",
    "s5_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🍔</span><span class="voca-cat cat-blue">햄버거 화법</span></div>
        <div class="voca-name">칭찬-수정-칭찬</div>
        <div class="voca-real">"이 부분 좋네요(빵) + 여긴 이렇게 고쳐볼까요?(패티) + 고생했어요!(빵)"</div>
      </div>
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">❓</span><span class="voca-cat cat-blue">질문하기</span></div>
        <div class="voca-name">정답 주지 않기</div>
        <div class="voca-real">"이 상황에서 선생님이라면 어떻게 하셨을까요?" 스스로 생각할 기회를 주세요.</div>
      </div>
    ''',
    "s6_tag": "STEP 3. 동료로 대우하기",
    "s6_title": "예비 사회복지사로서의 존중",
    "s6_cards": '''
      <div class="voca-card" style="border-left:3px solid #2F6FED;">
        <div class="voca-top"><span style="font-size:18px;">🤝</span><span class="voca-cat cat-blue">역할 부여</span></div>
        <div class="voca-name">의미 있는 과제</div>
        <div class="voca-real">단순 복사가 아닌, 실제 프로그램 기획이나 진행 보조 등 실무를 경험하게 하세요.</div>
      </div>
    ''',
    "s6_order_box": '''
      <div class="order-box">
        <div class="ob-title">💡 마무리 평가회</div>
        <div class="ob-text">실습이 끝날 때, 부족했던 점보다는<br>얼마나 성장했는지에 초점을 맞춰 격려해주세요!</div>
      </div>
    ''',
    "s7_big": "최고의 실습 지도자,<br><em>사복노트가</em> 돕겠습니다",
    "s7_sub": "과제 양식부터 피드백 예시까지<br>실습지도의 모든 것! 🙂<br><br>실습지도를 앞둔 동료에게 공유하세요 🔖"
}


generate_card("saboknote-proposal.html", data1)
generate_card("saboknote-client.html", data2)
generate_card("saboknote-burnout.html", data3)
generate_card("saboknote-resource.html", data4)
generate_card("saboknote-practicum.html", data5)
print("5 HTML files generated successfully.")
