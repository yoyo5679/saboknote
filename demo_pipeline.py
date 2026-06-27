#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
demo_pipeline.py — API 없이 live_monitor.html 동작 확인용 시뮬레이터
실제 cardmaker_agent.py와 동일한 live_status.json 업데이트 패턴 사용
"""
import json, time, os

BASE = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE, "live_status.json")

AGENTS = {
    "Lenner":{"status":"Idle"},
    "Cater": {"status":"Idle"},
    "Ry":    {"status":"Idle"},
    "Inner": {"status":"Idle"},
    "Yoyo":  {"status":"Idle"},
}

def write(agent, step, progress, msg, draft=None):
    data = {
        "active_agent": agent,
        "step": step, "total_steps": 5,
        "progress": progress,
        "status_message": msg,
        "agents": {k:{"status":v["status"]} for k,v in AGENTS.items()},
        "result_draft": draft
    }
    with open(STATUS_FILE,"w",encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def reset():
    for k in AGENTS: AGENTS[k]["status"] = "Idle"

def run():
    print("🎬 사복노트 파이프라인 데모 시작")
    print("   live_monitor.html 을 브라우저에서 열어 확인하세요\n")

    # 초기화
    reset(); write("None", 0, 0, "파이프라인 시작 대기 중...")
    time.sleep(1.5)

    # Step 1 — Lenner + Cater
    reset()
    AGENTS["Lenner"]["status"] = "Planning"
    AGENTS["Cater"]["status"]  = "Trending"
    print("⠸ [1/5] Lenner + Cater 실행 중...")
    for i, msg in enumerate([
        "주제 '2026 핵심 복지 지표' 분석 중...",
        "pain_point 추출: 최저임금·중위소득 혼용 혼동",
        "슬라이드 구조 S1~S7 설계 완료",
        "바이럴 타이틀 후보 생성 중...",
        "✓ 타이틀 확정: '사복이 뇌정지 오는 2026 핵심 복지 지표 총정리!'",
    ]):
        write("Lenner & Cater", 1, 10 + i*4, msg)
        time.sleep(1.2)

    # Step 2 — Ry
    reset()
    AGENTS["Ry"]["status"] = "Writing"
    print("⠸ [2/5] Ry 원고 집필 중...")
    draft_preview = [
        {"title":"이 단어들 다 아세요? 👀", "hint":"최저임금·중위소득·장기요양 헷갈리는 사복이 소환!"},
        {"title":"이런 상황 있었죠?", "hint":"상담 전화 왔을 때 식은땀 삐질..."},
        {"title":"더 이상 헤매지 마세요!", "hint":"사복노트 핵심 지표 대시보드"},
        {"title":"💰 2026 최저임금 상세", "hint":"시급 10,030원 · 월 2,096,270원"},
        {"title":"🌳 2026 기준 중위소득", "hint":"4인 가구 6,097,773원"},
        {"title":"🌿 장기요양 & 생계급여", "hint":"1등급 재가 2,069,900원"},
        {"title":"📊 사복노트 대시보드로 한번에!", "hint":"매년 업데이트되는 최신 고시 기반"},
    ]
    for i, msg in enumerate([
        "선배 사복이 페르소나 적용 중...",
        "S1 훅 슬라이드 — 용어 3개 퀴즈 작성",
        "S2 공감 씬 4개 작성 중...",
        "S3 반전 포인트 설정",
        "S4~S6 실무팁 수치 검증 (2026 기준)",
        "S7 CTA — 사복노트 대시보드 연결",
        "✓ 7슬라이드 원고 집필 완료",
    ]):
        write("Ry", 2, 30 + i*5, msg,
              draft=draft_preview if i >= 5 else None)
        time.sleep(1.1)

    # Step 3 — Inner
    reset()
    AGENTS["Inner"]["status"] = "Designing"
    print("⠸ [3/5] Inner HTML 조립 중...")
    for i, msg in enumerate([
        "인디고/퍼플 테마 선택",
        "S1~S2 CSS 레이아웃 조립 중...",
        "S3~S5 실무팁 카드 렌더링",
        "S6~S7 CTA 버튼 + 인터랙션 추가",
        "모바일 390px 반응형 점검",
        "✓ saboknote-auto-kpi.html 생성 완료 (87KB)",
    ]):
        write("Inner", 3, 65 + i*3, msg, draft=draft_preview)
        time.sleep(1.0)

    # Step 4 — Yoyo
    reset()
    AGENTS["Yoyo"]["status"] = "Approving"
    print("⠸ [4/5] Yoyo 품질 검토 중...")
    for i, msg in enumerate([
        "수치 정확성 검토: 2026 최저임금 10,030원 ✓",
        "바이럴 타이틀 임팩트 평가: 88점",
        "CTA → 사복노트 대시보드 연결 확인 ✓",
        "✓ 품질 검토 통과 · 최종 승인",
    ]):
        write("Yoyo", 4, 83 + i*3, msg, draft=draft_preview)
        time.sleep(1.2)

    # 완료
    reset()
    write(
        "Yoyo", 5, 100,
        "🎉 미션 성공! '사복이 뇌정지 오는 2026 핵심 복지 지표 총정리!' 카드뉴스 저장 완료!",
        draft=draft_preview
    )
    print("\n🎉 데모 완료! live_monitor.html에서 결과를 확인하세요.")

if __name__ == "__main__":
    run()
