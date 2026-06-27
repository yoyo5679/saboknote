#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CardMaker Agent — 사복노트 카드뉴스 AI 자동 생성 에이전트
Gemini API를 호출하여 기획→마케팅→원고→HTML→저장까지 완전 자동화

실행:
  export GEMINI_API_KEY="AIza..."
  python3 cardmaker_agent.py
  python3 cardmaker_agent.py --topic "2026 최저임금" --fast
"""

import os
import sys
import json
import argparse
import time
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler
import socketserver
from datetime import datetime

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    print("⬇️  google-genai 설치 중...")
    os.system("pip3 install google-genai -q")
    from google import genai
    from google.genai import types as genai_types

# ─── 경로 설정 ────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
CARDNEWS_DIR  = os.path.join(BASE_DIR, "cardnews")
STATUS_FILE   = os.path.join(BASE_DIR, "live_status.json")
MONITOR_FILE  = os.path.join(BASE_DIR, "live_monitor.html")

# ─── 에이전트 상태 ─────────────────────────────────────────────
AGENTS = {
    "Lenner": {"status": "Idle", "emoji": "🐹"},
    "Cater":  {"status": "Idle", "emoji": "🐶"},
    "Ry":     {"status": "Idle", "emoji": "🐱"},
    "Inner":  {"status": "Idle", "emoji": "🐰"},
    "Yoyo":   {"status": "Idle", "emoji": "🦁"},
}

# ─── 테마 컬러 매핑 ────────────────────────────────────────────
THEMES = {
    "mint": {
        "s1_bg":"#1B2E4B", "s2_head":"#2ABFB5", "s3_bg":"#4ECDC4",
        "s4_bg":"#F0FAFA", "s4_tag":"#2ABFB5", "s4_foot":"rgba(78,205,196,0.1)",
        "s5_bg":"#fff",    "s5_tag":"#2ABFB5", "s5_foot":"#F4F6FA",
        "s6_bg":"#F4F6FA", "s6_tag":"#2F6FED", "s6_foot":"#EBF2FF",
    },
    "hotpink": {
        "s1_bg":"#2d0b1e", "s2_head":"#ec4899", "s3_bg":"#f472b6",
        "s4_bg":"#fdf2f8", "s4_tag":"#ec4899", "s4_foot":"rgba(236,72,153,0.1)",
        "s5_bg":"#fff",    "s5_tag":"#ec4899", "s5_foot":"#fdf2f8",
        "s6_bg":"#fbf7f9", "s6_tag":"#8b5cf6", "s6_foot":"#ede9fe",
    },
    "emerald": {
        "s1_bg":"#062e26", "s2_head":"#10b981", "s3_bg":"#059669",
        "s4_bg":"#f0fdf4", "s4_tag":"#10b981", "s4_foot":"rgba(16,185,129,0.1)",
        "s5_bg":"#fff",    "s5_tag":"#10b981", "s5_foot":"#f0fdf4",
        "s6_bg":"#f4fcf7", "s6_tag":"#06b6d4", "s6_foot":"#ecfeff",
    },
    "indigo": {
        "s1_bg":"#1e1b4b", "s2_head":"#4338ca", "s3_bg":"#4f46e5",
        "s4_bg":"#f5f3ff", "s4_tag":"#6366f1", "s4_foot":"rgba(99,102,241,0.1)",
        "s5_bg":"#fff",    "s5_tag":"#6366f1", "s5_foot":"#f5f3ff",
        "s6_bg":"#faf5ff", "s6_tag":"#7c3aed", "s6_foot":"#f3e8ff",
    },
    "navy": {
        "s1_bg":"#0f172a", "s2_head":"#2563eb", "s3_bg":"#1d4ed8",
        "s4_bg":"#eff6ff", "s4_tag":"#2563eb", "s4_foot":"rgba(37,99,235,0.1)",
        "s5_bg":"#fff",    "s5_tag":"#2563eb", "s5_foot":"#eff6ff",
        "s6_bg":"#f8fafc", "s6_tag":"#0284c7", "s6_foot":"#f0f9ff",
    },
}

# ─── 유틸 함수 ─────────────────────────────────────────────────

def update_status(agent, step, total, progress, message, result_draft=None):
    """live_status.json 실시간 갱신"""
    data = {
        "active_agent": agent,
        "step": step,
        "total_steps": total,
        "progress": progress,
        "status_message": message,
        "agents": {k: {"status": v["status"]} for k, v in AGENTS.items()},
        "result_draft": result_draft,
    }
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  [!] 상태 갱신 실패: {e}")

def set_agent(name, status):
    AGENTS[name]["status"] = status

def reset_agents():
    for k in AGENTS:
        AGENTS[k]["status"] = "Idle"

def parse_json_from_response(text: str) -> dict:
    """Claude 응답에서 JSON 추출 (마크다운 코드블록 포함 처리)"""
    # ```json ... ``` 블록 추출
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    # 앞뒤 공백 제거 후 파싱
    text = text.strip()
    return json.loads(text)

def call_claude(system: str, user: str, model: str = "gemini-2.5-flash", max_tokens: int = 2048) -> str:
    """Gemini API 단일 호출 (무료 플랜 사용)"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY 환경변수가 설정되지 않았습니다.\n"
            "https://aistudio.google.com/apikey 에서 무료 키 발급 후\n"
            "export GEMINI_API_KEY='AIza...' 로 설정해주세요."
        )
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model,
        config=genai_types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
        ),
        contents=user,
    )
    return resp.text

# ─── Phase 1: Planner (Lenner) ─────────────────────────────────

def phase_planner(topic: str) -> dict:
    print("\n" + "="*55)
    print(f"  🐹 [Phase 1 / Lenner] 기획 브리프 생성 중...")
    print("="*55)
    reset_agents(); set_agent("Lenner", "Planning")
    update_status("Lenner", 1, 5, 10, f"'{topic}' 주제 분석 및 기획 브리프 생성 중...")

    system = """당신은 사복노트의 기획 팀장 Lenner입니다.
사회복지사 실무 핫이슈를 분석하여 카드뉴스 기획 브리프를 생성합니다.
반드시 valid JSON만 반환하세요. 설명 텍스트 없이 JSON 블록만 출력하세요.
복지 수치는 2026년 기준(최저임금 10,030원, 중위소득4인 6,097,773원)을 사용하세요."""

    user = f"""주제: {topic}

아래 JSON 구조로 기획 브리프를 작성하세요. 사회복지사 실무 맥락에 맞게 작성하세요:
{{
  "topic_key": "영문_식별자_언더스코어 (예: min_wage_2026)",
  "topic_title": "카드뉴스 한국어 주제 제목",
  "target_audience": "타겟 독자층 (예: 재무 담당 사회복지사)",
  "pain_point": "핵심 실무 혼동 포인트 1~2줄",
  "core_message": "슬라이드를 관통하는 한 줄 핵심 메시지",
  "three_terms": [
    {{"term": "실무 용어1", "question": "독자가 궁금해하는 짧은 질문"}},
    {{"term": "실무 용어2", "question": "독자가 궁금해하는 짧은 질문"}},
    {{"term": "실무 용어3", "question": "독자가 궁금해하는 짧은 질문"}}
  ],
  "three_tips": [
    {{"category": "이모지 카테고리명", "title": "실무팁1 제목", "key_fact": "핵심 수치/공식 (정확한 숫자 포함)"}},
    {{"category": "이모지 카테고리명", "title": "실무팁2 제목", "key_fact": "핵심 수치/공식"}},
    {{"category": "이모지 카테고리명", "title": "실무팁3 제목", "key_fact": "핵심 수치/공식"}}
  ],
  "theme": "mint 또는 hotpink 또는 emerald 또는 indigo 또는 navy 중 주제에 맞는 것",
  "cta_feature": "사복노트 연결 기능 (예: 급여 계산기, 세금 계산기, 복지 지표 대시보드)"
}}"""

    raw = call_claude(system, user, max_tokens=1500)
    result = parse_json_from_response(raw)
    update_status("Lenner", 1, 5, 20, f"기획 완료! 주제: '{result['topic_title']}'")
    print(f"  ✅ 기획 완료: {result['topic_title']}")
    print(f"     테마: {result.get('theme','mint')} | CTA: {result.get('cta_feature','')}")
    return result

# ─── Phase 2: Marketer (Cater) ─────────────────────────────────

def phase_marketer(brief: dict) -> dict:
    print("\n" + "="*55)
    print(f"  🐶 [Phase 2 / Cater] 바이럴 타이틀 & 카피 생성 중...")
    print("="*55)
    reset_agents(); set_agent("Cater", "Trending")
    update_status("Cater", 2, 5, 30, "인스타 200% 바이럴 훅 타이틀 설계 중...")

    system = """당신은 사복노트의 바이럴 마케터 Cater입니다.
사회복지사들이 인스타그램에서 스크롤을 멈추고 저장 버튼을 누르는 훅 타이틀을 만듭니다.
반드시 valid JSON만 반환하세요. 설명 없이 JSON만 출력하세요."""

    user = f"""기획 브리프:
- 주제: {brief['topic_title']}
- 타겟: {brief['target_audience']}
- 페인포인트: {brief['pain_point']}
- 핵심 메시지: {brief['core_message']}

바이럴 카피를 아래 JSON으로 작성하세요:
{{
  "viral_title": "30자 이내 인스타 훅 제목 (구체적 수치/이모티콘 포함)",
  "badge": "배지 텍스트 (이모지 포함, 15자 이내, 예: 📅 첫 월급 생존기)",
  "hook_question": "이 단어들 다 아세요? 👀",
  "hint_copy": "S1 힌트 카피 (em 태그로 강조, 40자 이내, 예: 선배 사복이가 <em>일할계산</em> 싹 정리해드림!)",
  "s2_headline": "S2 공감씬 헤드라인 (20자 이내)",
  "s3_tag": "S3 태그 문구 (예: REAL WORLD FACT, 사복노트 솔루션)",
  "cta_text": "S7 버튼 텍스트 (10자 이내, 예: 계산기 바로가기)",
  "cta_big": "S7 큰 텍스트 (<br>줄바꿈, <em>강조, 예: 첫 월급도, 정산도<br><em>사복노트 계산기</em>로 해결!)",
  "cta_sub": "S7 서브 설명 2줄 (br 구분)"
}}"""

    raw = call_claude(system, user, max_tokens=800)
    result = parse_json_from_response(raw)
    update_status("Cater", 2, 5, 40, f"타이틀 확정: \"{result['viral_title']}\"")
    print(f"  ✅ 바이럴 타이틀: {result['viral_title']}")
    return result

# ─── Phase 3: Writer (Ry) ──────────────────────────────────────

def phase_writer(brief: dict, copy: dict) -> dict:
    print("\n" + "="*55)
    print(f"  🐱 [Phase 3 / Ry] 7슬라이드 원고 집필 중...")
    print("="*55)
    reset_agents(); set_agent("Ry", "Writing")
    update_status("Ry", 3, 5, 55, "선배 사복이 페르소나로 꿀맛 원고 집필 중...")

    system = """당신은 사복노트의 콘텐츠 작가 Ry입니다.
3~5년차 선배 사회복지사 페르소나로 신입들이 "내 이야기다!" 느끼는 원고를 씁니다.
수치는 정확하게, 말투는 따뜻하고 유쾌하게. 공문서 말투("~합니다", "~입니다") 금지.
반드시 valid JSON만 반환하세요."""

    tips_info = "\n".join([
        f"팁{i+1}: {t['category']} | {t['title']} | {t['key_fact']}"
        for i, t in enumerate(brief['three_tips'])
    ])
    terms_info = "\n".join([
        f"용어{i+1}: {t['term']} — {t['question']}"
        for i, t in enumerate(brief['three_terms'])
    ])

    user = f"""기획 정보:
- 주제: {brief['topic_title']}
- 핵심 메시지: {brief['core_message']}
- 실무 용어 3개: {terms_info}
- 실무 팁 3개: {tips_info}
- CTA 기능: {brief['cta_feature']}

바이럴 카피:
- 힌트: {copy['hint_copy']}
- CTA 버튼: {copy['cta_text']}

아래 JSON으로 원고를 작성하세요. 수치는 정확하게, 말투는 유쾌하게:
{{
  "scenes": [
    {{"icon": "😶", "when": "상황 레이블 (예: 기안서 작성 중)", "text": "공감 서술 1~2문장 (사복이 말투)"}},
    {{"icon": "😰", "when": "상황 레이블", "text": "공감 서술"}},
    {{"icon": "🥲", "when": "상황 레이블", "text": "공감 서술"}},
    {{"icon": "😤", "when": "상황 레이블", "text": "공감 서술"}}
  ],
  "s3_title": "S3 반전 제목 (<br>줄바꿈, <em>강조어</em>)",
  "s3_desc": "S3 핵심 팩트 설명 (<strong>핵심 강조</strong> 포함, 2~3줄)",
  "tips": [
    {{
      "label": "항목 레이블 (예: 일할 급여 산식)",
      "value": "핵심 수치/공식 (정확한 숫자 포함)",
      "note": "실무 팁 한 줄 (이모지 1개, 친근한 말투)"
    }},
    {{
      "label": "항목 레이블",
      "value": "핵심 수치/공식",
      "note": "실무 팁"
    }},
    {{
      "label": "항목 레이블",
      "value": "핵심 수치/공식",
      "note": "실무 팁"
    }}
  ]
}}"""

    raw = call_claude(system, user, max_tokens=2000)
    result = parse_json_from_response(raw)
    update_status("Ry", 3, 5, 65, "원고 집필 완료!", result_draft=result)
    print(f"  ✅ 원고 완성: 공감씬 {len(result['scenes'])}개, 팁 {len(result['tips'])}개")
    return result

# ─── Phase 4: Designer (Inner) — HTML 조립 ────────────────────

def phase_designer(brief: dict, copy: dict, script: dict) -> str:
    print("\n" + "="*55)
    print(f"  🐰 [Phase 4 / Inner] HTML 카드뉴스 조립 중...")
    print("="*55)
    reset_agents(); set_agent("Inner", "Designing")
    update_status("Inner", 4, 5, 80, f"'{brief['theme']}' 테마로 HTML 조립 중...")

    c = THEMES.get(brief.get("theme", "mint"), THEMES["mint"])
    tk  = brief["topic_key"]
    vt  = copy["viral_title"]
    sc  = script["scenes"]
    tips = script["tips"]
    t3  = brief["three_tips"]
    terms = brief["three_terms"]

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>사복노트 · {vt}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{background:#DDE3ED;font-family:'Noto Sans KR',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;}}
.top-label{{font-size:12px;font-weight:700;color:#8A94A6;letter-spacing:2px;margin-bottom:20px;text-transform:uppercase;}}
.card{{width:480px;height:600px;border-radius:22px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.18);position:relative;flex-shrink:0;}}
.slide{{display:none;width:100%;height:100%;position:absolute;top:0;left:0;}}
.slide.on{{display:flex;flex-direction:column;}}
.foot{{height:48px;flex-shrink:0;display:flex;align-items:center;padding:0 32px;justify-content:space-between;}}
.foot .fl{{font-size:12px;font-weight:900;}}
.foot .fr{{font-size:11px;}}
.voca-card{{background:white;border-radius:14px;padding:12px 15px;box-shadow:0 2px 8px rgba(0,0,0,0.05);}}
.voca-top{{display:flex;align-items:center;gap:7px;margin-bottom:4px;}}
.voca-cat{{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}}
.cat-a{{background:rgba(78,205,196,0.12);color:#2ABFB5;}}
.cat-b{{background:#EBF2FF;color:#2F6FED;}}
.cat-c{{background:#FFF3E8;color:#E8842A;}}
.voca-name{{font-size:14px;font-weight:900;color:#1B2E4B;margin-bottom:4px;}}
.voca-real{{font-size:12.5px;color:#3D4A5C;font-weight:600;line-height:1.5;margin-bottom:4px;word-break:keep-all;}}
.voca-admin{{font-size:11px;color:#8A94A6;line-height:1.5;padding-left:9px;border-left:2px solid #E0E8F0;word-break:keep-all;}}
.s1{{background:{c['s1_bg']};}}
.s1 .logo-bar{{display:flex;justify-content:space-between;align-items:center;padding:24px 32px 0;flex-shrink:0;}}
.s1 .logo{{font-size:13px;font-weight:900;color:rgba(255,255,255,0.4);}}
.s1 .body{{flex:1;padding:0 32px;display:flex;flex-direction:column;justify-content:center;}}
.s1 .pill{{display:inline-block;background:rgba(78,205,196,0.18);border:1px solid rgba(78,205,196,0.3);color:#4ECDC4;font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:16px;align-self:flex-start;letter-spacing:1px;}}
.s1 .q{{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:14px;}}
.s1 .words{{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}}
.s1 .wrow{{display:flex;align-items:baseline;gap:10px;}}
.s1 .wname{{font-size:26px;font-weight:900;color:white;}}
.s1 .wq{{font-size:13px;color:rgba(255,255,255,0.3);}}
.s1 .hint{{font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;word-break:keep-all;}}
.s1 .hint em{{color:#4ECDC4;font-style:normal;font-weight:700;}}
.s1 .foot{{background:rgba(255,255,255,0.04);border-top:1px solid rgba(255,255,255,0.07);}}
.s1 .foot .fl{{color:rgba(255,255,255,0.35);}}
.s1 .foot .fr{{color:rgba(255,255,255,0.2);}}
.s2{{background:#fff;}}
.s2 .head{{background:{c['s2_head']};padding:22px 32px 18px;flex-shrink:0;}}
.s2 .head-tag{{font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:2px;margin-bottom:6px;}}
.s2 .head-title{{font-size:22px;font-weight:900;color:white;line-height:1.35;}}
.s2 .body{{flex:1;padding:18px 32px 0;display:flex;flex-direction:column;gap:8px;}}
.s2 .scene{{background:#F4F6FA;border-radius:13px;padding:12px 15px;}}
.s2 .scene-top{{display:flex;align-items:center;gap:7px;margin-bottom:5px;}}
.s2 .s-icon{{font-size:16px;}}
.s2 .s-when{{font-size:10px;font-weight:700;color:#8A94A6;letter-spacing:1px;}}
.s2 .s-text{{font-size:13px;color:#3D4A5C;font-weight:500;line-height:1.55;word-break:keep-all;}}
.s2 .foot{{background:#F4F6FA;}}
.s2 .foot .fl{{color:{c['s2_head']};}}
.s2 .foot .fr{{color:#8A94A6;}}
.s3{{background:{c['s3_bg']};}}
.s3 .body{{flex:1;padding:32px 32px 0;display:flex;flex-direction:column;justify-content:center;}}
.s3 .tag{{font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);letter-spacing:2px;margin-bottom:12px;}}
.s3 .ico{{font-size:48px;margin-bottom:10px;line-height:1;}}
.s3 .title{{font-size:26px;font-weight:900;color:white;line-height:1.3;margin-bottom:12px;}}
.s3 .title em{{color:#FFD166;font-style:normal;}}
.s3 .desc{{font-size:14px;color:rgba(255,255,255,0.85);line-height:1.8;margin-bottom:16px;word-break:keep-all;}}
.s3 .foot{{background:rgba(0,0,0,0.12);border-top:1px solid rgba(255,255,255,0.15);}}
.s3 .foot .fl{{color:rgba(255,255,255,0.5);}}
.s3 .foot .fr{{color:rgba(255,255,255,0.35);}}
.s4{{background:{c['s4_bg']};}}
.s4 .top{{padding:20px 32px 0;flex-shrink:0;}}
.s4 .stag{{font-size:10px;font-weight:700;color:{c['s4_tag']};letter-spacing:2px;margin-bottom:5px;}}
.s4 .stit{{font-size:19px;font-weight:900;color:#1B2E4B;line-height:1.35;margin-bottom:10px;}}
.s4 .body{{flex:1;padding:0 32px;display:flex;flex-direction:column;gap:7px;}}
.s4 .foot{{background:{c['s4_foot']};}}
.s4 .foot .fl{{color:{c['s4_tag']};}}
.s4 .foot .fr{{color:#8A94A6;}}
.s5{{background:{c['s5_bg']};}}
.s5 .top{{padding:20px 32px 0;flex-shrink:0;}}
.s5 .stag{{font-size:10px;font-weight:700;color:{c['s5_tag']};letter-spacing:2px;margin-bottom:5px;}}
.s5 .stit{{font-size:19px;font-weight:900;color:#1B2E4B;line-height:1.35;margin-bottom:10px;}}
.s5 .body{{flex:1;padding:0 32px;display:flex;flex-direction:column;gap:7px;}}
.s5 .foot{{background:{c['s5_foot']};}}
.s5 .foot .fl{{color:{c['s5_tag']};}}
.s5 .foot .fr{{color:#8A94A6;}}
.s6{{background:{c['s6_bg']};}}
.s6 .top{{padding:20px 32px 0;flex-shrink:0;}}
.s6 .stag{{font-size:10px;font-weight:700;color:{c['s6_tag']};letter-spacing:2px;margin-bottom:5px;}}
.s6 .stit{{font-size:19px;font-weight:900;color:#1B2E4B;line-height:1.35;margin-bottom:10px;}}
.s6 .body{{flex:1;padding:0 32px;display:flex;flex-direction:column;gap:7px;}}
.s6 .foot{{background:{c['s6_foot']};}}
.s6 .foot .fl{{color:{c['s6_tag']};}}
.s6 .foot .fr{{color:#8A94A6;}}
.s7{{background:linear-gradient(160deg,#0A2A2A 0%,#1B4A4A 100%);}}
.s7 .inner{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 36px;text-align:center;}}
.s7 .emo{{font-size:50px;margin-bottom:14px;line-height:1;}}
.s7 .big{{font-size:21px;font-weight:900;color:white;line-height:1.6;margin-bottom:12px;word-break:keep-all;}}
.s7 .big em{{color:#4ECDC4;font-style:normal;}}
.s7 .div2{{width:36px;height:2px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 14px;}}
.s7 .sub{{font-size:13px;color:rgba(255,255,255,0.5);line-height:1.85;margin-bottom:22px;word-break:keep-all;}}
.s7 .cta{{background:#4ECDC4;color:white;font-size:14px;font-weight:900;padding:12px 26px;border-radius:40px;margin-bottom:8px;text-decoration:none;display:inline-block;cursor:pointer;}}
.s7 .url{{font-size:11px;color:rgba(255,255,255,0.3);}}
.s7 .foot{{background:rgba(0,0,0,0.15);border-top:1px solid rgba(255,255,255,0.06);}}
.s7 .foot .fl{{color:rgba(255,255,255,0.3);}}
.s7 .foot .fr{{color:rgba(255,255,255,0.2);}}
.nav{{display:flex;align-items:center;gap:14px;margin-top:18px;}}
.nbtn{{width:38px;height:38px;border-radius:50%;background:white;border:none;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.12);color:#1B2E4B;transition:all .18s;}}
.nbtn:hover:not(:disabled){{background:#1B2E4B;color:white;}}
.nbtn:disabled{{opacity:.3;cursor:default;}}
.dots{{display:flex;gap:5px;}}
.d{{width:7px;height:7px;border-radius:50%;background:#C0C8D4;cursor:pointer;transition:all .18s;}}
.d.on{{background:#1B2E4B;width:18px;border-radius:4px;}}
.ctr{{font-size:11px;color:#8A94A6;margin-top:6px;text-align:center;}}
</style>
</head>
<body>
<div class="top-label">사복노트 · {tk.upper()} 특강</div>
<div class="card">

<!-- S1 훅 -->
<div class="slide s1 on">
  <div class="logo-bar">
    <span class="logo">sano 사복노트</span>
    <span style="font-size:11px;color:rgba(255,255,255,0.25);">1 / 7</span>
  </div>
  <div class="body">
    <div class="pill">{copy['badge']}</div>
    <div class="q">{copy['hook_question']}</div>
    <div class="words">
      <div class="wrow"><span class="wname">{terms[0]['term']}</span><span class="wq">{terms[0]['question']}</span></div>
      <div class="wrow"><span class="wname">{terms[1]['term']}</span><span class="wq">{terms[1]['question']}</span></div>
      <div class="wrow"><span class="wname">{terms[2]['term']}</span><span class="wq">{terms[2]['question']}</span></div>
    </div>
    <div class="hint">{copy['hint_copy']}</div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">1 / 7</span></div>
</div>

<!-- S2 공감 -->
<div class="slide s2">
  <div class="head">
    <div class="head-tag">초보 담당자 공감 200%</div>
    <div class="head-title">{copy['s2_headline']}</div>
  </div>
  <div class="body">
    {chr(10).join(f'''    <div class="scene">
      <div class="scene-top"><span class="s-icon">{sc[i]['icon']}</span><span class="s-when">{sc[i]['when']}</span></div>
      <div class="s-text">{sc[i]['text']}</div>
    </div>''' for i in range(min(4, len(sc))))}
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">2 / 7</span></div>
</div>

<!-- S3 반전 -->
<div class="slide s3">
  <div class="body">
    <div class="tag">{copy['s3_tag']}</div>
    <div class="ico">💡</div>
    <div class="title">{script['s3_title']}</div>
    <div class="desc">{script['s3_desc']}</div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">3 / 7</span></div>
</div>

<!-- S4 실무팁1 -->
<div class="slide s4">
  <div class="top">
    <div class="stag">{t3[0]['category']}</div>
    <div class="stit">{t3[0]['title']}</div>
  </div>
  <div class="body">
    <div class="voca-card">
      <div class="voca-top"><span class="voca-cat cat-a">핵심 공식</span></div>
      <div class="voca-name">{tips[0]['label']}</div>
      <div class="voca-real">{tips[0]['value']}</div>
      <div class="voca-admin">{tips[0]['note']}</div>
    </div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">4 / 7</span></div>
</div>

<!-- S5 실무팁2 -->
<div class="slide s5">
  <div class="top">
    <div class="stag">{t3[1]['category']}</div>
    <div class="stit">{t3[1]['title']}</div>
  </div>
  <div class="body">
    <div class="voca-card">
      <div class="voca-top"><span class="voca-cat cat-b">심화 정보</span></div>
      <div class="voca-name">{tips[1]['label']}</div>
      <div class="voca-real">{tips[1]['value']}</div>
      <div class="voca-admin">{tips[1]['note']}</div>
    </div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">5 / 7</span></div>
</div>

<!-- S6 실무팁3 -->
<div class="slide s6">
  <div class="top">
    <div class="stag">{t3[2]['category']}</div>
    <div class="stit">{t3[2]['title']}</div>
  </div>
  <div class="body">
    <div class="voca-card">
      <div class="voca-top"><span class="voca-cat cat-c">주의 사항</span></div>
      <div class="voca-name">{tips[2]['label']}</div>
      <div class="voca-real">{tips[2]['value']}</div>
      <div class="voca-admin">{tips[2]['note']}</div>
    </div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">6 / 7</span></div>
</div>

<!-- S7 CTA -->
<div class="slide s7">
  <div class="inner">
    <div class="emo">🌿</div>
    <div class="big">{copy['cta_big']}</div>
    <div class="div2"></div>
    <div class="sub">{copy['cta_sub']}</div>
    <a class="cta" href="https://saboknote.com" target="_blank">{copy['cta_text']}</a>
    <div class="url">saboknote.com</div>
  </div>
  <div class="foot"><span class="fl">사복노트</span><span class="fr">7 / 7</span></div>
</div>

</div><!-- /.card -->

<div class="nav">
  <button class="nbtn" id="prev" onclick="move(-1)">&#8592;</button>
  <div class="dots" id="dots"></div>
  <button class="nbtn" id="next" onclick="move(1)">&#8594;</button>
</div>
<div class="ctr">← 좌우 버튼으로 슬라이드 이동 →</div>

<script>
const slides = document.querySelectorAll('.slide');
const dotsEl = document.getElementById('dots');
let cur = 0;

function buildDots(){{
  dotsEl.innerHTML = '';
  slides.forEach((_,i)=>{{
    const d = document.createElement('span');
    d.className = 'd' + (i===0?' on':'');
    d.onclick = ()=>go(i);
    dotsEl.appendChild(d);
  }});
}}

function go(n){{
  slides[cur].classList.remove('on');
  dotsEl.children[cur].classList.remove('on');
  cur = (n + slides.length) % slides.length;
  slides[cur].classList.add('on');
  dotsEl.children[cur].classList.add('on');
  document.getElementById('prev').disabled = cur === 0;
  document.getElementById('next').disabled = cur === slides.length - 1;
}}

function move(d){{ go(cur + d); }}

buildDots();
document.getElementById('prev').disabled = true;

// 스와이프
let tx = 0;
document.querySelector('.card').addEventListener('touchstart', e => tx = e.touches[0].clientX);
document.querySelector('.card').addEventListener('touchend', e => {{
  const dx = e.changedTouches[0].clientX - tx;
  if(Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
}});
</script>
</body>
</html>"""

    update_status("Inner", 4, 5, 88, "HTML 조립 완료! Yoyo 검토 대기 중.")
    print(f"  ✅ HTML 생성 완료 ({len(html)//1024}KB)")
    return html

# ─── Phase 5: Director (Yoyo) — 품질 검토 ────────────────────

def phase_director(brief: dict, copy: dict, script: dict, fast: bool = False) -> dict:
    print("\n" + "="*55)
    print(f"  🦁 [Phase 5 / Yoyo] 최종 품질 검토 중...")
    print("="*55)
    reset_agents(); set_agent("Yoyo", "Approving")
    update_status("Yoyo", 5, 5, 95, "Yoyo 총괄 디렉터 최종 검토 중...")

    if fast:
        result = {"score": 90, "approved": True, "issues": [], "highlights": ["빠른 모드로 자동 승인"], "verdict": "✅ 빠른 모드 자동 승인"}
        print("  ⚡ 빠른 모드: 자동 승인")
        return result

    system = """당신은 사복노트 총괄 디렉터 Yoyo입니다.
카드뉴스 콘텐츠를 검토하고 품질 점수와 의견을 JSON으로 반환합니다.
반드시 valid JSON만 반환하세요."""

    user = f"""검토할 카드뉴스 요약:
- 주제: {brief['topic_title']}
- 바이럴 타이틀: {copy['viral_title']}
- 핵심 메시지: {brief['core_message']}
- 팁 수치들: {[t['key_fact'] for t in brief['three_tips']]}
- CTA: {copy['cta_text']}

아래 JSON으로 검토 결과를 반환하세요:
{{
  "score": 0~100 점수,
  "approved": true 또는 false,
  "issues": ["문제점 (없으면 빈 배열)"],
  "highlights": ["잘된 점 1~2가지"],
  "verdict": "한 줄 총평"
}}"""

    try:
        raw = call_claude(system, user, model="gemini-2.5-flash", max_tokens=500)
        result = parse_json_from_response(raw)
    except Exception as e:
        print(f"  [!] Yoyo 검토 실패 ({e}), 자동 승인 처리")
        result = {"score": 85, "approved": True, "issues": [], "highlights": [], "verdict": "자동 승인"}

    print(f"  {'✅' if result['approved'] else '❌'} 점수: {result['score']}점 | {result['verdict']}")
    if result.get("issues"):
        for issue in result["issues"]:
            print(f"  ⚠️  {issue}")
    return result

# ─── 메인 파이프라인 ───────────────────────────────────────────

def run_pipeline(topic: str, fast: bool = False, with_monitor: bool = False, instagram: bool = False):
    """전체 카드뉴스 생성 파이프라인 실행"""
    os.makedirs(CARDNEWS_DIR, exist_ok=True)

    print("\n" + "🎬 " * 15)
    print(f"  사복노트 CardMaker Agent 시작")
    print(f"  주제: {topic}")
    print(f"  모드: {'⚡ 빠른' if fast else '🔍 일반'}")
    print("🎬 " * 15)

    update_status("None", 0, 5, 0, "CardMaker 에이전트 초기화 중...")

    try:
        # Phase 1: Planner
        brief = phase_planner(topic)
        time.sleep(1)

        # Phase 2: Marketer
        copy = phase_marketer(brief)
        time.sleep(1)

        # Phase 3: Writer
        script = phase_writer(brief, copy)
        time.sleep(1)

        # Phase 4: Designer
        html_content = phase_designer(brief, copy, script)
        time.sleep(1)

        # Phase 5: Director
        review = phase_director(brief, copy, script, fast=fast)

    except EnvironmentError as e:
        print(f"\n❌ 환경 설정 오류:\n{e}")
        update_status("None", 0, 5, 0, f"오류: {str(e)}")
        return
    except json.JSONDecodeError as e:
        print(f"\n❌ AI 응답 파싱 오류: {e}")
        update_status("None", 0, 5, 0, "AI 응답 파싱 실패")
        return

    # 사용자 최종 승인
    print("\n" + "="*55)
    print(f"  👑 [Yoyo] 최종 검토 결과")
    print("="*55)
    print(f"  ▶ 주제     : {brief['topic_title']}")
    print(f"  ▶ 타이틀   : {copy['viral_title']}")
    print(f"  ▶ 품질 점수: {review['score']}점")
    print(f"  ▶ 총평     : {review['verdict']}")
    print("-"*55)

    if not review.get("approved", True):
        print("\n⚠️  Yoyo가 수정을 권고합니다:")
        for issue in review.get("issues", []):
            print(f"   - {issue}")

    try:
        ans = input("\n  👉 카드뉴스를 저장하시겠습니까? [Y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        ans = "y"

    if ans in ("y", "yes", ""):
        # 파일 저장
        file_name = f"saboknote-auto-{brief['topic_key']}.html"
        save_path = os.path.join(CARDNEWS_DIR, file_name)
        with open(save_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        reset_agents()
        update_status(
            "Yoyo", 5, 5, 100,
            f"🎉 미션 성공! '{copy['viral_title']}' 카드뉴스 저장 완료!",
        )
        print(f"\n🎉 저장 완료!")
        print(f"   📁 {save_path}")
        print(f"   🌐 브라우저에서 바로 열 수 있습니다.\n")


        if instagram:
            try:
                ig_script = os.path.join(BASE_DIR, "instagram_post.py")
                print("\n📸 인스타그램 자동 업로드 시작...")
                subprocess.run(
                    [sys.executable, ig_script,
                     "--html", save_path,
                     "--topic", brief.get("topic_title", topic)],
                    check=True
                )
            except Exception as ig_err:
                print(f"⚠️  인스타 업로드 실패 (파이프라인은 정상 완료): {ig_err}")

        if with_monitor and os.path.exists(MONITOR_FILE):
            webbrowser.open(f"file://{MONITOR_FILE}")

    else:
        reset_agents()
        update_status("None", 0, 5, 0, "작업 취소됨.")
        print("\n❌ 저장이 취소되었습니다.\n")

# ─── 대화형 주제 선택 ──────────────────────────────────────────

def interactive_topic() -> str:
    """주제를 직접 입력받거나 사전 정의 목록에서 선택"""
    print("\n" + "="*55)
    print("  🔍 카드뉴스 주제를 선택하세요")
    print("="*55)
    presets = [
        "중도 입사자 급여 정산 일할 계산",
        "강사료 세금 한도 12만 5천원의 비밀",
        "자립준비청년 보호종료일 계산 가이드",
        "2026 핵심 복지 지표 총정리 (최저임금·중위소득)",
        "직접 입력",
    ]
    for i, t in enumerate(presets, 1):
        print(f"  [{i}] {t}")
    print("="*55)
    while True:
        try:
            choice = input("  👉 번호 또는 주제를 직접 입력: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 종료합니다.")
            sys.exit(0)
        if choice.isdigit() and 1 <= int(choice) <= len(presets) - 1:
            return presets[int(choice) - 1]
        elif choice == str(len(presets)) or choice.lower() in ("5", "직접", "직접입력"):
            try:
                return input("  ✏️  주제를 입력하세요: ").strip()
            except (EOFError, KeyboardInterrupt):
                sys.exit(0)
        elif len(choice) > 3:
            return choice
        else:
            print("  ❌ 다시 선택해주세요.")

# ─── 진입점 ────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="사복노트 CardMaker Agent")
    parser.add_argument("--topic",        type=str,  default="",    help="카드뉴스 주제")
    parser.add_argument("--fast",         action="store_true",       help="Yoyo 검토 건너뛰기")
    parser.add_argument("--with-monitor", action="store_true",       help="완료 시 라이브 모니터 열기")
    parser.add_argument("--instagram",    action="store_true",       help="완료 시 인스타그램 자동 업로드")
    args = parser.parse_args()

    topic = args.topic.strip() if args.topic else interactive_topic()
    if not topic:
        print("❌ 주제를 입력해주세요.")
        sys.exit(1)

    run_pipeline(topic, fast=args.fast, with_monitor=args.with_monitor, instagram=args.instagram)
    
