#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import time
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler
import socketserver

# JSON 파일 경로
STATUS_FILE = "/Users/hong-eunseong/Documents/안티그래비티/saboksnote/live_status.json"
CARDNEWS_DIR = "/Users/hong-eunseong/Documents/안티그래비티/saboksnote/cardnews"

def update_status(active_agent, step, total_steps, progress, message, agents_status, result_draft=None):
    """Live Monitor용 JSON 상태 파일 실시간 갱신"""
    status_data = {
        "active_agent": active_agent,
        "step": step,
        "total_steps": total_steps,
        "progress": progress,
        "status_message": message,
        "agents": agents_status,
        "result_draft": result_draft
    }
    try:
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(status_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[!] 상태 갱신 실패: {e}")

def get_trend_topic():
    """트렌디한 사회복지사 실무 핫이슈 리스트제공"""
    print("\n" + "="*50)
    print(" 🔍 [Lenner] 실무 밀착형 복지 트렌드 분석 & 검색")
    print("="*50)
    
    topics = [
        {
            "id": 1,
            "title": "중도 입사자 급여 정산 일할 계산 (달력일수 기준의 진실)",
            "key": "prorate",
            "desc": "한 달 중간에 들어온 사복이의 첫 월급! 사회복지 관행상 4대보험과 일할 계산을 깔끔하게 정리해드림",
            "icon": "📅"
        },
        {
            "id": 2,
            "title": "강사료 세금 한도 12만 5천원의 비밀 (24만원 실무 예제)",
            "key": "tax",
            "desc": "125,000원 이하는 세금이 0원? 24만원을 지급할 때는 왜 기타소득세가 떼이는지 명쾌하게 뽀개기",
            "icon": "💸"
        },
        {
            "id": 3,
            "title": "자립준비청년 보호종료일 계산기 가이드 (주거 지원 탈출!)",
            "key": "youth",
            "desc": "주거 지원 기준이 아닌 진짜 보호종료일 계산하는 팩트 폭격 가이드! 헷갈리는 자립 지원 팩트 정리",
            "icon": "🪂"
        },
        {
            "id": 4,
            "title": "사복이 뇌정지 오는 2026 핵심 복지 지표 총정리 (최저임금, 중위소득)",
            "key": "kpi",
            "desc": "2026년 최저임금 최초 만원 돌파, 기준 중위소득 및 생계급여 인상, 장기요양 재가급여 한도액 인상 등 핵심 지표 요약",
            "icon": "📊"
        }
    ]
    
    for idx, t in enumerate(topics):
        print(f" [{idx + 1}] {t['icon']} {t['title']}")
        print(f"     ㄴ {t['desc']}")
    print("="*50)
    
    while True:
        try:
            choice = input(" 👉 카드뉴스로 제작할 주제 번호를 입력해 주세요 (1-4): ").strip()
            if choice in ["1", "2", "3", "4"]:
                selected = topics[int(choice) - 1]
                print(f"\n🎯 '{selected['title']}' 주제가 선정되었습니다!")
                return selected
            else:
                print("❌ 1부터 4 사이의 번호를 입력해주세요.")
        except KeyboardInterrupt:
            print("\n👋 제작을 종료합니다.")
            sys.exit(0)

# 에이전트별 상태 기본 사전
AGENTS_STATUS = {
    "Lenner": {"status": "Idle"},
    "Cater": {"status": "Idle"},
    "Ry": {"status": "Idle"},
    "Inner": {"status": "Idle"},
    "Yoyo": {"status": "Idle"}
}
class ReuseAddressTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def start_background_web_server():
    """8000번 포트로 백그라운드 웹 서버 기동"""
    port = 8000
    
    # HTTP log 출력을 억제하여 터미널을 깨끗하게 유지
    class QuietHTTPRequestHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

    def run_server():
        try:
            handler = QuietHTTPRequestHandler
            with ReuseAddressTCPServer(("", port), handler) as httpd:
                httpd.serve_forever()
        except Exception as e:
            # 이미 서버가 실행 중이거나 충돌 시 건너뜀
            pass

    t = threading.Thread(target=run_server, daemon=True)
    t.start()

def auto_open_browser():
    """기본 브라우저로 3D 라이브 모니터 자동 연결"""
    try:
        url = "http://localhost:8000/live_monitor.html"
        print("🌐 [System] 기본 브라우저를 통해 3D 라이브 모니터 대시보드를 자동 실행합니다...")
        webbrowser.open(url)
    except Exception as e:
        print(f"[!] 브라우저 자동 실행 실패: {e}")

def reset_agents():
    for name in AGENTS_STATUS:
        AGENTS_STATUS[name]["status"] = "Idle"

def main():
    # 8000번 포트 웹 서버 가동 및 브라우저 자동 열기
    start_background_web_server()
    time.sleep(0.5)  # 서버 구동 대기
    auto_open_browser()
    time.sleep(1.0)  # 브라우저 활성화 대기
    
    print("🚀 사복노트 카드뉴스 자동화 협업 파이프라인 시동 중...")
    
    # 0. 초기 상태 갱신
    reset_agents()
    update_status("None", 0, 4, 0, "트렌드 기획안 작성 대기 중...", AGENTS_STATUS)
    time.sleep(1)

    # 1. 트렌드 선정 (Lenner & Cater 협업)
    selected_topic = get_trend_topic()
    topic_key = selected_topic["key"]
    topic_title = selected_topic["title"]
    
    print("\n🤖 [Step 1] 기획 및 마케팅 설계팀 작동 중 (Lenner & Cater)")
    reset_agents()
    AGENTS_STATUS["Lenner"]["status"] = "Planning"
    AGENTS_STATUS["Cater"]["status"] = "Trending"
    update_status(
        "Lenner & Cater", 1, 4, 15,
        f"Lenner가 '{topic_title}'의 기획 구조를 분석하고, Cater가 인스타 200% 바이럴 훅 타이틀을 매핑 중입니다...",
        AGENTS_STATUS
    )
    
    # 기획 시연 딜레이
    time.sleep(4)
    
    # 주제별 맞춤 기획 요약 및 후킹 타이틀 설정
    viral_title = ""
    target_theme = ""
    if topic_key == "prorate":
        viral_title = "신입 때 식은땀 삐질;; 첫 월급 '일할계산'의 진실"
        target_theme = "민트초코처럼 상큼하지만 팩트 가득한 민트 테마"
    elif topic_key == "tax":
        viral_title = "강사료 12만 5천원 이하는 진짜 세금 안 떼나요?"
        target_theme = "눈에 쏙 박히는 강렬한 핫핑크 경고 테마"
    elif topic_key == "youth":
        viral_title = "자립준비청년 주거가 아님! 진짜 보호종료일 계산 가이드"
        target_theme = "안정감을 주는 신뢰감 넘치는 딥그린/에메랄드 테마"
    else:
        viral_title = "사복이 뇌정지 오는 2026 핵심 복지 지표 총정리!"
        target_theme = "전문적이고 세련된 인디고/퍼플 프리미엄 테마"
        
    print(f" ✨ Cater가 뽑아낸 초강력 바이럴 타이틀: \"{viral_title}\"")
    update_status(
        "Lenner & Cater", 1, 4, 25,
        f"기획 완료! 타이틀 도출: \"{viral_title}\" ({target_theme})",
        AGENTS_STATUS
    )
    time.sleep(2)

    # 2. 작가 단계 (Ry)
    print("\n🤖 [Step 2] 콘텐츠스토리텔링 작가팀 작동 중 (Ry)")
    reset_agents()
    AGENTS_STATUS["Ry"]["status"] = "Writing"
    update_status(
        "Ry", 2, 4, 45,
        f"Ry가 선배 사복이 페르소나로 빙의하여 꿀맛 찰진 카드뉴스 원고(S1~S7)를 집필하는 중입니다...",
        AGENTS_STATUS
    )
    
    # 집필 시연 딜레이
    time.sleep(5)

    # 주제별 상세 슬라이드 원고 정의
    slides_content = []
    if topic_key == "prorate":
        slides_content = [
            # S1 훅
            {"badge": "📅 첫 월급 생존기", "title": "이 단어들 다 아세요? 👀", 
             "w1": "중도 입사", "wq1": "월 중간에 출근했을 때?",
             "w2": "달력 일수", "wq2": "영업일? 주말 포함?",
             "w3": "4대보험 일할", "wq3": "과연 깎여서 나갈까요?",
             "hint": "첫 월급 명세서 떼보고 멘붕 온 신입 사복이 모여라!<br>선배 사복이가 <em>달력일수 기준 일할계산</em> 싹 정리해드림!"},
            # S2 공감
            {"scene_icon1": "😶", "scene_when1": "첫 명세서 확인 중", "scene_text1": "기본급이 왜 반토막이지? 주말은 뺀 건가? 머릿속 복잡해짐",
             "scene_icon2": "😰", "scene_when2": "선배 눈치 보며", "scene_text2": "이거 달력일수로 나눠요? 아님 영업일 20일로 나눠요? 질문 대기 중",
             "scene_icon3": "🥲", "scene_when3": "동기 톡방에서", "scene_text3": "나만 월급 적게 들어온 줄 알고 식은땀 흘린 신입 사복이의 슬픈 고백",
             "scene_icon4": "😤", "scene_when4": "인터넷 검색 결과", "scene_text4": "어려운 노동법 판례만 가득하고, 사회복지시설 실무 관행은 왜 안 나와?"},
            # S3 반전
            {"title": "사복노트에서<br><em>급여 정산 팁</em> 쏩니다", "desc": "영업일 기준 아닙니다! 세법 및 사회복지시설 일반 관행은<br>철저히 <strong>'달력 총 일수(28~31일)'</strong>를 기준으로 합니다!"},
            # S4 실무
            {"category": "📅 입사자 일할계산 공식", "title": "입사자 급여 공식 뚝딱!", "desc": "첫 출근한 날부터 그 달 마지막 날까지의 일수 기준!",
             "v1_name": "일할 급여 산식", "v1_real": "기본급 × (실제 근무 달력일수 ÷ 해당 월의 총 달력일수)", "v1_admin": "예: 5월 15일 입사면 (31-15+1)=17일 기준! 주말/공휴일도 전부 포함해서 계산해요!"},
            # S5 실무2
            {"category": "🛡️ 4대보험의 진실", "title": "4대보험도 깎이나요? 🧐", "desc": "당연히 일할 적용된 급여 기준으로 재산정되는 게 원칙!",
             "v2_name": "사회복지시설 관행", "v2_real": "실제 지급되는 월 보수액을 기준으로 요율을 재계산합니다.", "v2_admin": "일할 급여로 과세표준이 낮아지니 건강보험, 국민연금, 고용보험 부담액도 비례해서 꿀처럼 줄어들어요!"},
            # S6 실무3
            {"category": "⏰ 시급 계산기", "title": "통상시급은 209시간 기준!", "desc": "일할계산과 별개로 연장수당용 시급은 월급 기준 그대로 계산!",
             "v3_name": "통상시급 산정", "v3_real": "(기본급 + 식대) ÷ 209시간 (소정근로시간)", "v3_admin": "사복노트 급여 계산기에 기본급만 넣으면 통상시급이 자동으로 쏙 채워지니 뇌정지 올 필요 없어요!"},
            # S7 CTA
            {"emoji": "👛", "big": "첫 월급도, 중도 퇴사 정산도<br><em>사복노트 급여 계산기</em>로 해결!", "sub": "달력일수 기준 일할 계산부터 4대보험 자동 재산정까지<br>신입 사복이의 든든한 멘토, 사복노트에서 바로 검증해보세요!", "cta_text": "사복노트 급여 계산기 써보기"}
        ]
    elif topic_key == "tax":
        slides_content = [
            # S1 훅
            {"badge": "💸 세금 탈출기", "title": "이 단어들 다 아세요? 👀", 
             "w1": "기타소득세", "wq1": "강사료 줄 때 떼는 세금?",
             "w2": "필요경비 60%", "wq2": "나라에서 빼주는 보너스?",
             "w3": "과세최저한", "wq3": "세금 면제되는 마법 한도?",
             "hint": "강사료 줄 때 125,000원은 왜 세금 안 떼고,<br>240,000원은 왜 8.8% 떼는지 헷갈렸던 담당자 소환! 👨‍🏫"},
            # S2 공감
            {"scene_icon1": "😶", "scene_when1": "강사료 기안서 작성 중", "scene_text1": "강사료 12만원 기안 올렸더니 선배 왈: '어? 이건 세금 안 떼요!'",
             "scene_icon2": "😰", "scene_when2": "24만원 강사료 지급할 때", "scene_text2": "이건 세금 떼야 하나? 몇 퍼센트 떼야 하지? 3.3%? 8.8%? 동공지진",
             "scene_icon3": "🥲", "scene_when3": "인터넷 뒤져봤는데", "scene_text3": "필요경비 60%에 세율 20%에 지방세 10%... 수학 공식 가득함",
             "scene_icon4": "😤", "scene_when4": "홈택스 입력 중", "scene_text4": "입력했더니 원천징수 영수증 발행 오류 나서 땀 뻘뻘 흘리는 나..."},
            # S3 반전
            {"title": "사복노트가<br><em>강사료 세금 규칙</em> 쉽게 알려줌", "desc": "복잡한 법 조항 집어치우고 딱 3초 만에 외우는 공식!<br>기타소득은 <strong>건당 지급액 125,000원</strong>이 세금 면제 커트라인!"},
            # S4 실무
            {"category": "💸 왜 12만 5천원인가?", "title": "마법의 기준점, 125,000원!", "desc": "기타소득은 60%를 필요경비(실제 쓴 비용)로 인정해줍니다.",
             "v1_name": "경비 처리의 진실", "v1_real": "125,000원 지급 시 경비 60%(75,000원) 빼면 진짜 소득은 50,000원!", "v1_admin": "세법상 진짜 소득이 5만원 이하면 세금 안 뗌 (과세최저한 규칙)"},
            # S5 실무2
            {"category": "🔥 24만원 지급할 때는?", "title": "24만원이면 세금 8.8% 적용!", "desc": "125,000원을 초과했으니 전체 금액에 세금을 매깁니다.",
             "v2_name": "24만원 기타소득 정산", "v2_real": "240,000원 × 8.8% = 21,120원 원천징수!", "v2_admin": "실지급액은 세금 21,120원을 뺀 218,880원! 사복노트 세금 계산기로 두드리면 1초 컷!"},
            # S6 실무3
            {"category": "🛡️ 원천징수 주의점", "title": "주민세까지 같이 떼야죠! ✍️", "desc": "기타소득세 8%에 지방소득세 0.8%를 더해서 총 8.8%!",
             "v3_name": "세금 신고 팁", "v3_real": "기타소득은 다음 달 10일까지 홈택스/위택스에 신고해야 함", "v3_admin": "실수로 세금 안 떼고 다 줬다면 강사님께 다시 전화해서 돌려달라고 해야 하는 불상사 발생..."},
            # S7 CTA
            {"emoji": "🏦", "big": "강사료 기안 올리기 전엔<br><em>사복노트 세금 계산기</em> 필독!", "sub": "기타소득(8.8%) 및 사업소득(3.3%) 한도 자동 검증!<br>실수하기 쉬운 강사료 정산, 사복노트에서 똑똑하게 검증하세요!", "cta_text": "사복노트 세금 계산기 써보기"}
        ]
    elif topic_key == "youth":
        slides_content = [
            # S1 훅
            {"badge": "🪂 자립준비청년 팩트", "title": "이 단어들 다 아세요? 👀", 
             "w1": "보호종료일", "wq1": "아동양육시설 등에서 나오는 날?",
             "w2": "보호연장", "wq2": "대학 가거나 준비할 때 연장?",
             "w3": "자립수당", "wq3": "매월 받는 꿀 같은 지원금?",
             "hint": "자립준비청년 지원은 '주거 복지'가 아닙니다!<br>진짜 핵심인 <em>보호종료일 계산</em>과 자립 기준 팩트 폭격 드림! 🚀"},
            # S2 공감
            {"scene_icon1": "😶", "scene_when1": "사례 관리 카드 작성 시", "scene_text1": "'자립준비청년이니까 주거 지원 탭에 써야지' -> 대답: 땡! 틀렸습니다!",
             "scene_icon2": "😰", "scene_when2": "보호종료일이 헷갈릴 때", "scene_text2": "만 18세 생일 기준인가? 만 24세까지 연장 가능하다는데 종료일이 언제지?",
             "scene_icon3": "🥲", "scene_when3": "지원금 안내할 때", "scene_text3": "보호종료일이 하루라도 어긋나면 수당 신청 자격 날아갈까 봐 불안초조",
             "scene_icon4": "😤", "scene_when4": "공문 확인 중", "scene_text4": "매년 바뀌는 자립준비청년 연장 규정... 한눈에 볼 수 있는 곳 없을까?"},
            # S3 반전
            {"title": "주거 지원이 아닙니다!<br><em>보호종료일 계산</em>이 핵심!", "desc": "자립준비청년의 법적 신분과 지원금 수급 자격을 결정짓는 건<br>정확한 <strong>'아동복지법상 보호종료일'</strong>의 산정입니다!"},
            # S4 실무
            {"category": "🪂 진짜 자립준비청년 기준", "title": "만 18세 vs 만 24세 연장", "desc": "기본은 만 18세 달성 시 종료이지만, 본인 의사에 따라 연장 가능!",
             "v1_name": "보호연장 규정", "v1_real": "대학 재학, 직업 훈련, 질병 치료 등의 사유로 만 24세까지 연장 가능", "v1_admin": "중간에 연장을 종료하고 나가는 날이 최종 보호종료일이 됩니다."},
            # S5 실무2
            {"category": "💰 팩트체크: 자립수당 한도", "title": "매월 50만원 자립정착금!", "desc": "보호종료 후 5년간 월 50만원의 자립수당이 지원됩니다.",
             "v2_name": "자립수당 신청 자격", "v2_real": "보호종료일로부터 5년이 지나지 않은 자립준비청년", "v2_admin": "사복노트 보호종료 계산기를 쓰면 잔여 지원 개월 수와 자립 지원 종료일을 바로 알려드려요!"},
            # S6 실무3
            {"category": "🛡️ 사례관리 주의점", "title": "종료일 하루 오차도 치명적!", "desc": "시설 퇴소 날짜와 법적 보호종료일이 다르면 수당 지급 오류!",
             "v3_name": "행정 처리 필수 꿀팁", "v3_real": "시설 퇴소 보고서 상의 '보호종료일자'와 일치하는지 꼭 더블체크!", "v3_admin": "실무에서 가장 골치 아픈 게 날짜 안 맞아서 반려당하는 것... 미리 계산해 둡시다!"},
            # S7 CTA
            {"emoji": "🪂", "big": "자립준비청년 사례관리 전<br><em>보호종료일 계산기</em> 필수!", "sub": "만 18세 기준 종료일 및 보호연장 만료일 1초 자동 연산!<br>보호종료아동의 든든한 권리 보장, 사복노트에서 한 큐에 계산하세요!", "cta_text": "보호종료일 계산기 써보기"}
        ]
    else: # kpi
        slides_content = [
            # S1 훅
            {"badge": "📊 2026 실무 서바이벌", "title": "이 단어들 다 아세요? 👀", 
             "w1": "최저임금", "wq1": "시급 최초 10,000원 돌파!",
             "w2": "기준 중위소득", "wq2": "4인 가구 649만 원 돌파!",
             "w3": "장기요양 재가", "wq3": "1등급 250만 원 돌파!",
             "hint": "최저임금 만 원 돌파부터 중위소득, 장기요양 대폭 인상까지!<br>선배 사복이가 올해 꼭 알아야 할 <em>핵심 복지 지표 4선</em> 싹 정리해드림!"},
            # S2 공감
            {"scene_icon1": "😶", "scene_when1": "2026년 상담 전화 왔을 때", "scene_text1": "\"선생님, 올해 생계급여 얼마 받나요?\" 질문에 식은땀 삐질",
             "scene_icon2": "😰", "scene_when2": "장기요양 한도액 확인할 때", "scene_text2": "\"등급 한도 늘어났다는데... 재가 급여 한도액 계산기 어딨지?\"",
             "scene_icon3": "🥲", "scene_when3": "중위소득 기준표 찾을 때", "scene_text3": "\"소득 인정액 80%가 얼마더라?\" 매년 인터넷 표 뒤지며 동공 지진",
             "scene_icon4": "😤", "scene_when4": "최저임금 급여 기안할 때", "scene_text4": "\"주휴수당 포함 209시간 월급이 215만 원 맞나?\" 계산기 두드리는 중"},
            # S3 반전
            {"title": "더 이상 헤매지 마세요!<br>사복노트 <em>핵심 지표 대시보드</em>가 해결해 드립니다", "desc": "매년 바뀌는 보건복지부 고시, 외우지 마세요!<br>2026년 시급, 중위소득, 생계급여, 장기요양 등급 한도까지<br>사복노트 대시보드에 다 들어있습니다!"},
            # S4 실무
            {"category": "💰 2026 최저임금 상세", "title": "최초로 만 원 돌파! 시급 10,320원!", "desc": "2026년도 최저임금이 드디어 시급 만 원을 넘어섰습니다!<br>일급 및 주 40시간(월 209시간) 기준 급여를 꼭 기억하세요.",
             "v1_name": "2026 최저임금 표준", "v1_real": "시급: 10,320원 | 월급(209시간): 2,156,880원 (주휴수당 포함)", "v1_admin": "전년 대비 1.7% 인상되었습니다. 단시간 근로자 주휴수당 매핑 시 필수 적용하세요!"},
            # S5 실무2
            {"category": "🌳 2026 기준 중위소득", "title": "급여 자격 판정의 핵심 기준!", "desc": "모든 정부 복지 급여와 서비스 대상자를 선별하는 기준 중위소득!<br>4인 가구 기준 6,494,738원으로 확정되었습니다.",
             "v2_name": "가구원수별 100% 기준 중위소득", "v2_real": "1인: 2,564,238원 | 2인: 4,199,292원 | 4인: 6,494,738원", "v2_admin": "중위소득 60%(차상위 등), 80%, 120%(긴급지원 등), 180%(신설) 비율도 대시보드에서 1초 만에 확인 가능!"},
            # S6 실무3
            {"category": "🌿 장기요양 & 생계급여 개편", "title": "역대 최대 인상! 재가 한도 & 생계급여", "desc": "초고령사회 대응을 위한 재가급여 한도액 대폭 인상과<br>중위소득 32%로 확대된 생계급여 최저 보장 수준을 확인하세요.",
             "v3_name": "재가 월 한도액 & 생계급여 기준", "v3_real": "장기요양 1등급: 2,512,900원 | 1인 가구 생계급여: 820,556원", "v3_admin": "1등급 한도가 무려 22.3% 대폭 인상되었습니다! 재가 복지 어르신 사례 관리 시 필독 요망!"},
            # S7 CTA
            {"emoji": "📊", "big": "2026년 복지 행정 복잡할 땐<br><em>사복노트 핵심 지표</em>로 한번에!", "sub": "매년 업데이트되는 보건복지부 최신 고시 데이터를 기반으로<br>복지 자격 심사 및 모의 계산을 즉시 수행해 보세요! 편안한 실무의 동반자!", "cta_text": "사복노트 핵심 지표 대시보드 확인"}
        ]

    print(" ✍️ Ry가 맛깔스러운 유쾌한 카드뉴스 원고를 성공적으로 완성했습니다!")
    update_status(
        "Ry", 2, 4, 60,
        f"원고 집필 완료! 유쾌한 사복이 감성 코팅 완료.",
        AGENTS_STATUS,
        result_draft=slides_content
    )
    time.sleep(2)

    # 3. 디자인 단계 (Inner)
    print("\n🤖 [Step 3] UX/UI 디자인 및 퍼블리싱팀 작동 중 (Inner)")
    reset_agents()
    AGENTS_STATUS["Inner"]["status"] = "Designing"
    update_status(
        "Inner", 3, 4, 75,
        f"Inner가 원고를 넘겨받아 '{target_theme}' 디자인 템플릿과 Glassmorphism CSS 코드를 조립 중입니다...",
        AGENTS_STATUS
    )
    
    # 디자인 조립 시연 딜레이
    time.sleep(4)

    # HTML 템플릿 바인딩
    generated_html = build_cardnews_html(topic_key, viral_title, slides_content)
    
    print(" 🎨 Inner가 눈부신 디자인의 카드뉴스 단일 HTML 코드를 완벽하게 완성했습니다!")
    update_status(
        "Inner", 3, 4, 90,
        f"HTML/CSS 조립 완료! Yoyo 총괄 승인 및 사용자 결재 대기 중.",
        AGENTS_STATUS
    )
    time.sleep(2)

    # 4. Yoyo 승인 단계 및 사용자 최종 결재
    print("\n🤖 [Step 4] 최종 검토 및 사용자 결재 요청 (Yoyo)")
    reset_agents()
    AGENTS_STATUS["Yoyo"]["status"] = "Approving"
    update_status(
        "Yoyo", 4, 4, 95,
        "Yoyo 총괄 디렉터가 최종 원고 및 HTML 코드를 검토하고 사용자 결재(승인)를 요청했습니다.",
        AGENTS_STATUS
    )

    print("\n" + "="*60)
    print(" 👑 [Yoyo] 최종 카드뉴스 기획 및 디자인 검토 결과")
    print("="*60)
    print(f" ▶ 제작 주제 : {topic_title}")
    print(f" ▶ 마케팅 훅 : {viral_title}")
    print(f" ▶ 슬라이드 수 : 총 {len(slides_content)}장")
    print(f" ▶ 디자인 톤 : {target_theme}")
    print("-"*60)
    print(" 📖 [Ry의 꿀맛 원고 요약]")
    print(f"   - 슬라이드 1: {slides_content[0]['title']} ({slides_content[0]['hint'].replace('<em>', '').replace('</em>', '')})")
    print(f"   - 슬라이드 3: {slides_content[2]['title'].replace('<br>', ' ').replace('<em>', '').replace('</em>', '')}")
    print(f"   - 슬라이드 7 (CTA): {slides_content[6]['big'].replace('<br>', ' ').replace('<em>', '').replace('</em>', '')}")
    print("="*60)
    
    try:
        user_approval = input("\n 👉 최종 승인하시겠습니까? (승인 시 바로 제작 및 저장) [Y/N]: ").strip().lower()
        if user_approval in ["y", "yes", ""]:
            print("\n🎉 사용자가 기획을 최종 승인하였습니다! 즉시 카드뉴스를 제작하여 실시간 배포합니다!")
            
            # 100% 진행도 및 축하 폭죽 가동!
            reset_agents() # 승인 시 모두 완료 대기 상태로 리셋
            update_status(
                "Yoyo", 4, 4, 100,
                f"🎉 미션 성공! '{viral_title}' 카드뉴스가 cardnews 폴더에 최종 저장되었습니다! 대시보드 폭죽 팡파르 발동!",
                AGENTS_STATUS
            )
            
            # HTML 파일 저장
            file_name = f"saboknote-auto-{topic_key}.html"
            full_path = os.path.join(CARDNEWS_DIR, file_name)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(generated_html)
                
            print(f"\n✨ 저장 완료! 파일 경로: {full_path}")
            print("💡 브라우저에서 'live_monitor.html'을 켜두셨다면 실시간으로 팡파르 폭죽이 터지는 모습을 감상하실 수 있습니다! 🥳")
            print("="*60 + "\n")
            
        else:
            print("\n❌ 제작이 취소되었습니다. 에이전트들이 아쉬움을 머금고 Idle 상태로 들어갑니다.")
            reset_agents()
            update_status(
                "Yoyo", 0, 4, 0,
                "사용자 반려로 제작이 취소되었습니다. 다음 미션을 대기 중...",
                AGENTS_STATUS
            )
    except KeyboardInterrupt:
        print("\n👋 승인이 취소되었습니다.")
        reset_agents()
        update_status("None", 0, 4, 0, "작업 대기 중...", AGENTS_STATUS)


def build_cardnews_html(topic_key, viral_title, s):
    """Ry의 원고와 Inner의 테마 디자인을 결합해 saboknote-voca-v2.html와 동일한 슬라이더 HTML 조립"""
    
    # 주제별 컬러 테마 매핑
    theme_colors = {
        "prorate": {
            "s1_bg": "#1B2E4B", "s2_head": "#FF6B6B", "s3_bg": "#4ECDC4", 
            "s4_bg": "#F0FAFA", "s4_tag": "#2ABFB5", "s4_foot": "rgba(78,205,196,0.1)",
            "s5_bg": "#fff", "s5_tag": "#2ABFB5", "s5_foot": "#F4F6FA",
            "s6_bg": "#F4F6FA", "s6_tag": "#2F6FED", "s6_foot": "#EBF2FF"
        },
        "tax": {
            "s1_bg": "#2d0b1e", "s2_head": "#ec4899", "s3_bg": "#f472b6", 
            "s4_bg": "#fdf2f8", "s4_tag": "#ec4899", "s4_foot": "rgba(236,72,153,0.1)",
            "s5_bg": "#fff", "s5_tag": "#ec4899", "s5_foot": "#fdf2f8",
            "s6_bg": "#fbf7f9", "s6_tag": "#8b5cf6", "s6_foot": "#ede9fe"
        },
        "youth": {
            "s1_bg": "#062e26", "s2_head": "#10b981", "s3_bg": "#059669", 
            "s4_bg": "#f0fdf4", "s4_tag": "#10b981", "s4_foot": "rgba(16,185,129,0.1)",
            "s5_bg": "#fff", "s5_tag": "#10b981", "s5_foot": "#f0fdf4",
            "s6_bg": "#f4fcf7", "s6_tag": "#06b6d4", "s6_foot": "#ecfeff"
        },
        "kpi": {
            "s1_bg": "#1e1b4b", "s2_head": "#4338ca", "s3_bg": "#4f46e5", 
            "s4_bg": "#f5f3ff", "s4_tag": "#6366f1", "s4_foot": "rgba(99,102,241,0.1)",
            "s5_bg": "#fff", "s5_tag": "#6366f1", "s5_foot": "#f5f3ff",
            "s6_bg": "#faf5ff", "s6_tag": "#7c3aed", "s6_foot": "#f3e8ff"
        }
    }
    
    c = theme_colors[topic_key]
    
    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>사복노트 · {viral_title}</title>
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

  /* S1 훅 */
  .s1 {{ background:{c['s1_bg']}; }}
  .s1 .logo-bar {{ display:flex; justify-content:space-between; align-items:center; padding:24px 32px 0; flex-shrink:0; }}
  .s1 .logo {{ font-size:13px; font-weight:900; color:rgba(255,255,255,0.4); }}
  .s1 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; justify-content:center; }}
  .s1 .pill {{ display:inline-block; background:rgba(78,205,196,0.18); border:1px solid rgba(78,205,196,0.3); color:#4ECDC4; font-size:10px; font-weight:700; padding:4px 12px; border-radius:20px; margin-bottom:16px; align-self:flex-start; letter-spacing:1px; }}
  .s1 .q {{ font-size:14px; color:rgba(255,255,255,0.5); margin-bottom:14px; }}
  .s1 .words {{ display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }}
  .s1 .wrow {{ display:flex; align-items:baseline; gap:10px; }}
  .s1 .wname {{ font-size:26px; font-weight:900; color:white; }}
  .s1 .wq {{ font-size:13px; color:rgba(255,255,255,0.3); }}
  .s1 .hint {{ font-size:14px; color:rgba(255,255,255,0.5); line-height:1.7; word-break:keep-all; }}
  .s1 .hint em {{ color:#4ECDC4; font-style:normal; font-weight:700; }}
  .s1 .foot {{ background:rgba(255,255,255,0.04); border-top:1px solid rgba(255,255,255,0.07); }}
  .s1 .foot .fl {{ color:rgba(255,255,255,0.35); }}
  .s1 .foot .fr {{ color:rgba(255,255,255,0.2); }}

  /* S2 공감 */
  .s2 {{ background:#fff; }}
  .s2 .head {{ background:{c['s2_head']}; padding:22px 32px 18px; flex-shrink:0; }}
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
  .s2 .foot .fl {{ color:{c['s2_head']}; }}
  .s2 .foot .fr {{ color:#8A94A6; }}

  /* S3 반전 */
  .s3 {{ background:{c['s3_bg']}; }}
  .s3 .body {{ flex:1; padding:32px 32px 0; display:flex; flex-direction:column; justify-content:center; }}
  .s3 .tag {{ font-size:10px; font-weight:700; color:rgba(255,255,255,0.65); letter-spacing:2px; margin-bottom:12px; }}
  .s3 .ico {{ font-size:48px; margin-bottom:10px; line-height:1; }}
  .s3 .title {{ font-size:28px; font-weight:900; color:white; line-height:1.3; margin-bottom:12px; }}
  .s3 .title em {{ color:#FFD166; font-style:normal; }}
  .s3 .desc {{ font-size:14px; color:rgba(255,255,255,0.85); line-height:1.8; margin-bottom:16px; word-break:keep-all; }}
  .s3 .foot {{ background:rgba(0,0,0,0.12); border-top:1px solid rgba(255,255,255,0.15); }}
  .s3 .foot .fl {{ color:rgba(255,255,255,0.5); }}
  .s3 .foot .fr {{ color:rgba(255,255,255,0.35); }}

  /* S4 용어 실무1 */
  .s4 {{ background:{c['s4_bg']}; }}
  .s4 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s4 .stag {{ font-size:10px; font-weight:700; color:{c['s4_tag']}; letter-spacing:2px; margin-bottom:5px; }}
  .s4 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s4 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s4 .foot {{ background:{c['s4_foot']}; }}
  .s4 .foot .fl {{ color:{c['s4_tag']}; }}
  .s4 .foot .fr {{ color:#8A94A6; }}

  /* S5 용어 실무2 */
  .s5 {{ background:{c['s5_bg']}; }}
  .s5 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s5 .stag {{ font-size:10px; font-weight:700; color:{c['s5_tag']}; letter-spacing:2px; margin-bottom:5px; }}
  .s5 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s5 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s5 .foot {{ background:{c['s5_foot']}; }}
  .s5 .foot .fl {{ color:{c['s5_tag']}; }}
  .s5 .foot .fr {{ color:#8A94A6; }}

  /* S6 용어 실무3 */
  .s6 {{ background:{c['s6_bg']}; }}
  .s6 .top {{ padding:20px 32px 0; flex-shrink:0; }}
  .s6 .stag {{ font-size:10px; font-weight:700; color:{c['s6_tag']}; letter-spacing:2px; margin-bottom:5px; }}
  .s6 .stit {{ font-size:19px; font-weight:900; color:#1B2E4B; line-height:1.35; margin-bottom:10px; }}
  .s6 .body {{ flex:1; padding:0 32px; display:flex; flex-direction:column; gap:7px; }}
  .s6 .foot {{ background:{c['s6_foot']}; }}
  .s6 .foot .fl {{ color:{c['s6_tag']}; }}
  .s6 .foot .fr {{ color:#8A94A6; }}

  /* S7 CTA */
  .s7 {{ background:linear-gradient(160deg,#0A2A2A 0%,#1B4A4A 100%); }}
  .s7 .inner {{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0 36px; text-align:center; }}
  .s7 .emo {{ font-size:50px; margin-bottom:14px; line-height:1; }}
  .s7 .big {{ font-size:21px; font-weight:900; color:white; line-height:1.6; margin-bottom:12px; word-break:keep-all; }}
  .s7 .big em {{ color:#4ECDC4; font-style:normal; }}
  .s7 .div2 {{ width:36px; height:2px; background:rgba(255,255,255,0.15); border-radius:2px; margin:0 auto 14px; }}
  .s7 .sub {{ font-size:13px; color:rgba(255,255,255,0.5); line-height:1.85; margin-bottom:22px; word-break:keep-all; }}
  .s7 .cta {{ background:#4ECDC4; color:white; font-size:14px; font-weight:900; padding:12px 26px; border-radius:40px; margin-bottom:8px; text-decoration:none; }}
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
<div class="top-label">사복노트 · {topic_key.upper()} 특강</div>
<div class="card">

  <!-- S1 훅 -->
  <div class="slide s1 on">
    <div class="logo-bar">
      <span class="logo">sano 사복노트</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.25);">1 / 7</span>
    </div>
    <div class="body">
      <div class="pill">{s[0]['badge']}</div>
      <div class="q">{s[0]['title']}</div>
      <div class="words">
        <div class="wrow"><span class="wname">{s[0]['w1']}</span><span class="wq">{s[0]['wq1']}</span></div>
        <div class="wrow"><span class="wname">{s[0]['w2']}</span><span class="wq">{s[0]['wq2']}</span></div>
        <div class="wrow"><span class="wname">{s[0]['w3']}</span><span class="wq">{s[0]['wq3']}</span></div>
      </div>
      <div class="hint">{s[0]['hint']}</div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">1 / 7</span></div>
  </div>

  <!-- S2 공감 -->
  <div class="slide s2">
    <div class="head">
      <div class="head-tag">초보 담당자 공감 200%</div>
      <div class="head-title">머릿속 복잡해지고<br>식은땀 흘린 순간들</div>
    </div>
    <div class="body">
      <div class="scene">
        <div class="scene-top"><span class="s-icon">{s[1]['scene_icon1']}</span><span class="s-when">{s[1]['scene_when1']}</span></div>
        <div class="s-text">{s[1]['scene_text1']}</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">{s[1]['scene_icon2']}</span><span class="s-when">{s[1]['scene_when2']}</span></div>
        <div class="s-text">{s[1]['scene_text2']}</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">{s[1]['scene_icon3']}</span><span class="s-when">{s[1]['scene_when3']}</span></div>
        <div class="s-text">{s[1]['scene_text3']}</div>
      </div>
      <div class="scene">
        <div class="scene-top"><span class="s-icon">{s[1]['scene_icon4']}</span><span class="s-when">{s[1]['scene_when4']}</span></div>
        <div class="s-text">{s[1]['scene_text4']}</div>
      </div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">2 / 7</span></div>
  </div>

  <!-- S3 반전 -->
  <div class="slide s3">
    <div class="body">
      <div class="tag">사복노트 팩트 폭격 ✅</div>
      <div class="ico">💡</div>
      <div class="title">{s[2]['title']}</div>
      <div class="desc">{s[2]['desc']}</div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">3 / 7</span></div>
  </div>

  <!-- S4 실무1 -->
  <div class="slide s4">
    <div class="top">
      <div class="stag">{s[3]['category']}</div>
      <div class="stit">{s[3]['title']}</div>
    </div>
    <div class="body">
      <div class="voca-card">
        <div class="voca-top">
          <span class="voca-cat cat-mint">실무 공식</span>
        </div>
        <div class="voca-name">{s[3]['v1_name']}</div>
        <div class="voca-real">{s[3]['v1_real']}</div>
        <div class="voca-admin">{s[3]['v1_admin']}</div>
      </div>
      <div style="font-size:12.5px;color:#4A5568;line-height:1.7;margin-top:10px;word-break:keep-all;">
        {s[3]['desc']}
      </div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">4 / 7</span></div>
  </div>

  <!-- S5 실무2 -->
  <div class="slide s5">
    <div class="top">
      <div class="stag">{s[4]['category']}</div>
      <div class="stit">{s[4]['title']}</div>
    </div>
    <div class="body">
      <div class="voca-card">
        <div class="voca-top">
          <span class="voca-cat cat-mint" style="background:#EBF2FF;color:#2F6FED;">핵심 수칙</span>
        </div>
        <div class="voca-name">{s[4]['v2_name']}</div>
        <div class="voca-real">{s[4]['v2_real']}</div>
        <div class="voca-admin">{s[4]['v2_admin']}</div>
      </div>
      <div style="font-size:12.5px;color:#4A5568;line-height:1.7;margin-top:10px;word-break:keep-all;">
        {s[4]['desc']}
      </div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">5 / 7</span></div>
  </div>

  <!-- S6 실무3 -->
  <div class="slide s6">
    <div class="top">
      <div class="stag">{s[5]['category']}</div>
      <div class="stit">{s[5]['title']}</div>
    </div>
    <div class="body">
      <div class="voca-card">
        <div class="voca-top">
          <span class="voca-cat cat-blue">꿀팁 가이드</span>
        </div>
        <div class="voca-name">{s[5]['v3_name']}</div>
        <div class="voca-real">{s[5]['v3_real']}</div>
        <div class="voca-admin">{s[5]['v3_admin']}</div>
      </div>
      <div style="font-size:12.5px;color:#4A5568;line-height:1.7;margin-top:10px;word-break:keep-all;">
        {s[5]['desc']}
      </div>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">6 / 7</span></div>
  </div>

  <!-- S7 CTA -->
  <div class="slide s7">
    <div class="inner">
      <div class="emo">{s[6]['emoji']}</div>
      <div class="big">{s[6]['big']}</div>
      <div class="div2"></div>
      <div class="sub">{s[6]['sub']}</div>
      <a href="https://www.saboknote.com/#home/admin" target="_blank" class="cta">{s[6]['cta_text']}</a>
      <span class="url">www.saboknote.com</span>
    </div>
    <div class="foot"><span class="fl">사복노트</span><span class="fr">7 / 7</span></div>
  </div>

</div>

<!-- 내비게이션 바 -->
<div class="nav">
  <button class="nbtn" id="prev" onclick="move(-1)" disabled>&lt;</button>
  <div class="dots">
    <div class="d on" onclick="go(0)"></div>
    <div class="d" onclick="go(1)"></div>
    <div class="d" onclick="go(2)"></div>
    <div class="d" onclick="go(3)"></div>
    <div class="d" onclick="go(4)"></div>
    <div class="d" onclick="go(5)"></div>
    <div class="d" onclick="go(6)"></div>
  </div>
  <button class="nbtn" id="next" onclick="move(1)">&gt;</button>
</div>
<div class="ctr">카드 영역을 터치하거나 마우스 드래그로도 넘길 수 있습니다.</div>

<script>
  let cur = 0;
  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('.d');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');

  function go(idx) {{
    slides[cur].classList.remove('on');
    dots[cur].classList.remove('on');
    cur = idx;
    slides[cur].classList.add('on');
    dots[cur].classList.add('on');

    prevBtn.disabled = (cur === 0);
    nextBtn.disabled = (cur === slides.length - 1);
  }}

  function move(step) {{
    let nextIdx = cur + step;
    if (nextIdx >= 0 && nextIdx < slides.length) {{
      go(nextIdx);
    }}
  }}
</script>
</body>
</html>
"""
    return html

if __name__ == "__main__":
    main()
