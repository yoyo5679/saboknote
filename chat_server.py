#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Saboknote Chat Server
브라우저 채팅으로 에이전트 파이프라인을 트리거하는 로컬 서버

실행:
  python3 chat_server.py
그 다음:
  http://localhost:7788 열기

API 키 설정 (우선순위 순):
  1) 채팅창에  /key AIzaSy...  입력  (메모리 전용, 로그 저장 안 됨)
  2) .env 파일  GEMINI_API_KEY=AIzaSy...
  3) 환경변수   export GEMINI_API_KEY=AIzaSy...
"""

import os
import re
import sys
import json
import time
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from urllib.parse import urlparse

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "live_status.json")
CHAT_FILE   = os.path.join(BASE_DIR, "chat_log.json")
ENV_FILE    = os.path.join(BASE_DIR, ".env")
PORT        = 7788

pipeline_lock    = threading.Lock()
pipeline_running = False
stop_requested   = False
current_proc: subprocess.Popen | None = None

# 메모리 전용 키 (채팅 입력 시 저장, 디스크에 절대 기록 안 함)
_runtime_key: str | None = None

# ─── API 키 관리 ──────────────────────────────────────────────

def get_api_key() -> str | None:
    """GEMINI_API_KEY 우선순위: 채팅 입력 > .env > 환경변수"""
    if _runtime_key:
        return _runtime_key
    # .env 파일 파싱
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                        return line.split("=", 1)[1].strip().strip("\"'")
        except Exception:
            pass
    return os.environ.get("GEMINI_API_KEY")

def set_runtime_key(key: str):
    global _runtime_key
    _runtime_key = key

# ─── Chat helpers ─────────────────────────────────────────────

def now_str():
    return datetime.now().strftime("%H:%M")

def read_chat():
    try:
        with open(CHAT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def write_chat(messages):
    with open(CHAT_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

def add_chat(frm, msg):
    messages = read_chat()
    messages.append({"from": frm, "msg": msg, "time": now_str()})
    write_chat(messages)

def read_status():
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

# ─── Pipeline status watcher ─────────────────────────────────

def status_watcher(stop_event):
    last_agents   = {}
    last_progress = -1

    ACTIVE_MSGS = {
        "Planning":  "📊 기획 브리프 작성 중이에요! 잠깐만요~",
        "Trending":  "📣 인스타 바이럴 타이틀 뽑는 중이에요!",
        "Writing":   "✍️ 원고 집필 시작! 사복이 감성으로 쓸게요",
        "Designing": "🎨 HTML 카드뉴스 조립 중이에요!",
        "Approving": "👑 마지막 품질 검토 들어갑니다!",
    }
    DONE_MSGS = {
        "Lenner": "✅ 기획 완료! Cater한테 바통 넘길게요~",
        "Cater":  "✅ 타이틀 확정! Ry 이어받아~",
        "Ry":     "✅ 원고 완성! Inner 디자인 부탁해!",
        "Inner":  "✅ HTML 완성! Yoyo 검토해줘요~",
    }

    while not stop_event.is_set():
        try:
            status   = read_status()
            agents   = status.get("agents", {})
            progress = status.get("progress", 0)

            for name, info in agents.items():
                state = info.get("status", "Idle")
                prev  = last_agents.get(name, "Idle")
                if state != prev:
                    if state != "Idle":
                        add_chat(name, ACTIVE_MSGS.get(state, f"{state} 시작!"))
                    elif prev != "Idle" and name in DONE_MSGS:
                        add_chat(name, DONE_MSGS[name])

            if progress == 100 and last_progress != 100:
                status_msg = status.get("status_message", "")
                viral = ""
                if "'" in status_msg:
                    try:
                        viral = status_msg.split("'")[1]
                    except Exception:
                        pass
                if viral:
                    add_chat("Yoyo", f"🎉 완료! '{viral}' 카드뉴스가 cardnews 폴더에 저장됐어요! 우리 팀 최고~ ✨")
                else:
                    add_chat("Yoyo", "🎉 카드뉴스 저장 완료! 잘했다 우리 팀~ ✨")
                stop_event.set()

            last_agents   = {k: v.get("status", "Idle") for k, v in agents.items()}
            last_progress = progress
        except Exception:
            pass
        time.sleep(0.7)

# ─── Pipeline runner ──────────────────────────────────────────

def stop_pipeline():
    """실행 중인 파이프라인 강제 종료"""
    global pipeline_running, current_proc, stop_requested
    stop_requested = True
    # 서브프로세스 종료
    if current_proc and current_proc.poll() is None:
        current_proc.terminate()
        try:
            current_proc.wait(timeout=3)
        except Exception:
            current_proc.kill()
    # 혹시 남아있는 cardmaker 프로세스도 정리
    subprocess.run(["pkill", "-f", "cardmaker_agent.py"], capture_output=True)
    current_proc = None
    pipeline_running = False
    # 상태 초기화
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "active_agent": "None", "step": 0, "total_steps": 5,
                "progress": 0, "status_message": "",
                "agents": {k: {"status": "Idle"} for k in ["Lenner","Cater","Ry","Inner","Yoyo"]},
                "result_draft": None,
            }, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def run_pipeline_bg(topic):
    global pipeline_running, current_proc, stop_requested
    stop_requested = False  # 새 작업 시작 시 초기화
    stop_event = threading.Event()
    threading.Thread(target=status_watcher, args=(stop_event,), daemon=True).start()

    try:
        env = os.environ.copy()
        key = get_api_key()
        if key:
            env["GEMINI_API_KEY"] = key

        current_proc = subprocess.Popen(
            [sys.executable, os.path.join(BASE_DIR, "cardmaker_agent.py"),
             "--topic", topic, "--fast"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=BASE_DIR,
            env=env,
        )
        current_proc.wait()

        # 중단 요청이 아닌데 완료가 안 됐으면 에러
        if not stop_requested:
            status = read_status()
            if status.get("progress", 0) < 100:
                stop_event.set()
                add_chat("Yoyo", "⚠️ 파이프라인이 완료되지 않았어요. API 키를 확인해주세요! (채팅창에 /key AIza... 입력)")

    except Exception as e:
        if not stop_requested:
            add_chat("Yoyo", f"오류가 발생했어요 😢 {str(e)[:80]}")
    finally:
        stop_event.set()
        current_proc = None
        pipeline_running = False

# ─── HTTP Handler ─────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        routes = {
            "/":                    (os.path.join(BASE_DIR, "office_monitor.html"), "text/html; charset=utf-8"),
            "/office_monitor.html": (os.path.join(BASE_DIR, "office_monitor.html"), "text/html; charset=utf-8"),
            "/live_monitor.html":   (os.path.join(BASE_DIR, "live_monitor.html"),   "text/html; charset=utf-8"),
            "/live_status.json":    (STATUS_FILE, "application/json"),
            "/chat_log.json":       (CHAT_FILE,   "application/json"),
        }
        if path == "/api/busy":
            self._json({"busy": pipeline_running}); return

        if path in routes:
            self._serve_file(*routes[path])
        elif path.startswith("/icons/"):
            self._serve_file(os.path.join(BASE_DIR, "icons", path[8:]), "image/png")
        elif path.startswith("/cardnews/"):
            self._serve_file(os.path.join(BASE_DIR, path[1:]), "text/html; charset=utf-8")
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path != "/command":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            data = json.loads(body)
            msg  = (data.get("msg") or "").strip()
            self._handle_command(msg)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 400)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _handle_command(self, msg):
        global pipeline_running

        if not msg:
            self._json({"ok": False, "error": "empty"}); return

        # ── /stop 명령 ────────────────────────────────────────
        if msg.lower() in ("/stop", "중단", "멈춰", "스탑", "stop"):
            if pipeline_running:
                stop_pipeline()
                add_chat("Yoyo", "🛑 작업 중단했어요! 에이전트들 쉬게 해줬어요 😮‍💨")
            else:
                add_chat("Yoyo", "지금 작업 중인 게 없어요 🦁")
            self._json({"ok": True, "stopped": True}); return

        # ── /key 명령 처리 (로그 저장 안 함) ──────────────────
        key_match = re.match(r'^/key\s+(\S+)$', msg, re.I)
        if key_match:
            key = key_match.group(1)
            set_runtime_key(key)
            # 채팅 로그에는 키 없이 확인 메시지만
            add_chat("Yoyo", "🔑 API 키 설정 완료! 메모리에만 저장됐어요 🔒\n서버 껐다 켜면 다시 입력해야 해요. 이제 카드뉴스 주제를 입력해보세요!")
            print(f"  🔑 API 키 설정됨 (메모리, {len(key)}자)")
            self._json({"ok": True, "key_set": True}); return

        # ── 일반 주제 명령 ────────────────────────────────────
        add_chat("user", msg)

        if pipeline_running:
            add_chat("Yoyo", "아직 작업 중이에요! 잠깐만 기다려주세요 🦁")
            self._json({"ok": False, "busy": True}); return

        if not get_api_key():
            add_chat("Yoyo", "🔑 API 키가 없어요!\n채팅창에  /key AIzaSy...  를 입력해주세요.")
            self._json({"ok": False, "no_key": True}); return

        with pipeline_lock:
            pipeline_running = True

        add_chat("Yoyo", f"알겠어요! '{msg}' 카드뉴스 만들기 시작할게요 🦁✨")
        threading.Thread(target=run_pipeline_bg, args=(msg,), daemon=True).start()
        self._json({"ok": True, "topic": msg})

    def _serve_file(self, filepath, ctype):
        try:
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type",   ctype)
            self.send_header("Content-Length", len(data))
            self.send_header("Cache-Control",  "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_response(404); self.end_headers()

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

# ─── Init & Main ─────────────────────────────────────────────

def init():
    if not os.path.exists(CHAT_FILE):
        write_chat([{
            "from": "Yoyo",
            "msg":  "안녕하세요! 사복노트 AI 오피스에 오신 걸 환영해요 🦁\n\n먼저 채팅창에  /key AIzaSy...  로 API 키를 입력하고\n주제를 입력하시면 팀원들이 바로 카드뉴스 만들어드려요!",
            "time": now_str(),
        }])

    if not os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "active_agent": "None", "step": 0, "total_steps": 5,
                "progress": 0, "status_message": "",
                "agents": {k: {"status": "Idle"} for k in ["Lenner","Cater","Ry","Inner","Yoyo"]},
                "result_draft": None,
            }, f, ensure_ascii=False, indent=2)

    # 시작 시 키 소스 알림
    key = get_api_key()
    if key:
        print(f"  🔑 API 키 로드됨 ({'메모리' if _runtime_key else '.env/환경변수'})")
    else:
        print(f"  ⚠️  API 키 없음 → 채팅창에서  /key AIzaSy...  입력 필요")


if __name__ == "__main__":
    init()
    print(f"\n{'━'*50}")
    print(f"  🏢  Saboknote Chat Server  →  http://localhost:{PORT}")
    print(f"{'━'*50}")
    print(f"  Ctrl+C 로 종료\n")

    server = HTTPServer(("", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 서버 종료")
