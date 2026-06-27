#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
instagram_post.py — 사복노트 카드뉴스 인스타그램 자동 업로드
흐름: HTML → PNG (Puppeteer) → Cloudinary (공개 URL) → Instagram Graph API

환경변수 (.env 또는 export):
    CLOUDINARY_CLOUD_NAME  = your_cloud_name
    CLOUDINARY_API_KEY     = your_api_key
    CLOUDINARY_API_SECRET  = your_api_secret
    INSTAGRAM_ACCESS_TOKEN = your_long_lived_user_token
    INSTAGRAM_USER_ID      = your_instagram_business_account_id

사용법:
    python3 instagram_post.py --html cardnews/saboknote-kpi.html
    python3 instagram_post.py --html cardnews/saboknote-kpi.html --caption "직접 쓴 캡션"
    python3 instagram_post.py --png cardnews/saboknote-kpi.png  # PNG 이미 있을 때
"""

import os, sys, argparse, subprocess, json, time
import urllib.request, urllib.parse, urllib.error
from pathlib import Path

# ── 환경변수 로드 (.env 파일 지원) ──────────────────────────────────────────
def load_dotenv(path=".env"):
    env_file = Path(path)
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

CLOUD_NAME     = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
CLOUD_API_KEY  = os.environ.get("CLOUDINARY_API_KEY", "")
CLOUD_API_SEC  = os.environ.get("CLOUDINARY_API_SECRET", "")
IG_TOKEN       = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID     = os.environ.get("INSTAGRAM_USER_ID", "")

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
PUPPETEER_SCRIPT = os.path.join(BASE_DIR, "html_to_png.js")

# ── 1. HTML → PNG (Puppeteer) ────────────────────────────────────────────────
def html_to_png(html_path: str) -> str:
    """html_to_png.js로 HTML을 1080x1080 PNG로 변환. PNG 경로 반환."""
    html_path = os.path.abspath(html_path)
    png_path  = html_path.replace(".html", "_ig.png")

    if not os.path.exists(PUPPETEER_SCRIPT):
        raise FileNotFoundError(f"html_to_png.js 없음: {PUPPETEER_SCRIPT}")

    print(f"🖼  Puppeteer: {os.path.basename(html_path)} → PNG 변환 중...")
    result = subprocess.run(
        ["node", PUPPETEER_SCRIPT, html_path, png_path, "1080", "1080"],
        capture_output=True, text=True, cwd=BASE_DIR
    )
    if result.returncode != 0:
        raise RuntimeError(f"Puppeteer 실패:\n{result.stderr}")

    print(f"   ✓ PNG 생성: {png_path}")
    return png_path

# ── 2. PNG → Cloudinary (공개 URL) ──────────────────────────────────────────
def upload_to_cloudinary(png_path: str, public_id: str = None) -> str:
    """Cloudinary에 PNG 업로드 후 공개 URL 반환."""
    import hashlib, hmac

    if not all([CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SEC]):
        raise EnvironmentError("CLOUDINARY_* 환경변수가 설정되지 않았습니다.")

    timestamp   = str(int(time.time()))
    folder      = "saboknote"
    pid         = public_id or f"card_{timestamp}"

    # 서명 생성
    sign_str    = f"folder={folder}&public_id={pid}&timestamp={timestamp}{CLOUD_API_SEC}"
    signature   = hashlib.sha1(sign_str.encode()).hexdigest()

    upload_url  = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload"

    print(f"☁️  Cloudinary 업로드 중...")
    with open(png_path, "rb") as f:
        png_data = f.read()

    # multipart/form-data 수동 구성
    boundary = "----CloudinaryBoundary7MA4YWxkTrZu0gW"
    def field(name, value):
        return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
                f"{value}\r\n").encode()
    def file_field(name, filename, data):
        return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                f"filename=\"{filename}\"\r\nContent-Type: image/png\r\n\r\n").encode() + data + b"\r\n"

    body = (field("api_key",   CLOUD_API_KEY)
          + field("timestamp", timestamp)
          + field("folder",    folder)
          + field("public_id", pid)
          + field("signature", signature)
          + file_field("file", os.path.basename(png_path), png_data)
          + f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        upload_url, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    url = result.get("secure_url", "")
    if not url:
        raise RuntimeError(f"Cloudinary 업로드 실패: {result}")

    print(f"   ✓ 공개 URL: {url}")
    return url

# ── 3. Instagram Graph API ───────────────────────────────────────────────────
def _ig_api(method: str, endpoint: str, data: dict = None) -> dict:
    url = f"https://graph.facebook.com/v21.0/{endpoint}"
    if data:
        body = urllib.parse.urlencode(data).encode()
        req  = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    else:
        req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def post_to_instagram(image_url: str, caption: str) -> str:
    """Instagram Graph API로 단일 이미지 게시물 업로드. 게시물 ID 반환."""
    if not all([IG_TOKEN, IG_USER_ID]):
        raise EnvironmentError("INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID 환경변수 필요")

    # Step A: 미디어 컨테이너 생성
    print("📸 Instagram 미디어 컨테이너 생성 중...")
    container = _ig_api("POST", f"{IG_USER_ID}/media", {
        "image_url":    image_url,
        "caption":      caption,
        "access_token": IG_TOKEN,
    })
    container_id = container.get("id")
    if not container_id:
        raise RuntimeError(f"컨테이너 생성 실패: {container}")
    print(f"   ✓ 컨테이너 ID: {container_id}")

    # Step B: 처리 완료 대기 (최대 30초)
    print("   ⏳ 업로드 처리 대기 중...")
    for _ in range(10):
        time.sleep(3)
        status = _ig_api("GET",
            f"{container_id}?fields=status_code&access_token={IG_TOKEN}")
        if status.get("status_code") == "FINISHED":
            break
        if status.get("status_code") == "ERROR":
            raise RuntimeError(f"미디어 처리 오류: {status}")
    else:
        raise TimeoutError("미디어 처리 시간 초과 (30초)")

    # Step C: 게시
    print("   📤 게시물 발행 중...")
    publish = _ig_api("POST", f"{IG_USER_ID}/media_publish", {
        "creation_id":  container_id,
        "access_token": IG_TOKEN,
    })
    post_id = publish.get("id")
    if not post_id:
        raise RuntimeError(f"발행 실패: {publish}")

    print(f"   ✅ 게시 완료! Post ID: {post_id}")
    return post_id

# ── 기본 캡션 생성기 ──────────────────────────────────────────────────────────
def make_caption(topic: str = "") -> str:
    base = topic or "사복 실무 꿀팁"
    return (
        f"✅ {base}\n\n"
        "사회복지 실무에서 헷갈리는 것들,\n"
        "사복노트가 정리해드립니다 📋\n\n"
        "👉 링크에서 무료 계산기 바로 써보세요!\n\n"
        "#사복노트 #사회복지사 #사복실무 #복지계산기\n"
        "#사회복지 #사복스타그램 #복지꿀팁 #실무팁"
    )

# ── CLI 진입점 ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="사복노트 카드뉴스 인스타 자동 업로드")
    group  = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--html",    help="카드뉴스 HTML 파일 경로")
    group.add_argument("--png",     help="이미 변환된 PNG 파일 경로")
    parser.add_argument("--caption",default="", help="인스타 캡션 (기본값: 자동 생성)")
    parser.add_argument("--topic",  default="", help="캡션 자동 생성 시 사용할 주제")
    parser.add_argument("--dry-run",action="store_true",
                        help="Cloudinary까지만 업로드하고 인스타 발행은 생략")
    args = parser.parse_args()

    print("\n🚀 사복노트 인스타 자동 업로드 시작\n" + "─"*50)

    # 1. HTML → PNG
    if args.html:
        png_path = html_to_png(args.html)
    else:
        png_path = os.path.abspath(args.png)
        if not os.path.exists(png_path):
            sys.exit(f"❌ PNG 파일 없음: {png_path}")
        print(f"🖼  PNG 파일 사용: {png_path}")

    # 2. Cloudinary 업로드
    public_id  = Path(png_path).stem
    image_url  = upload_to_cloudinary(png_path, public_id)

    # 3. 캡션
    caption = args.caption or make_caption(args.topic)

    if args.dry_run:
        print("\n🔍 Dry-run 모드 — 인스타 발행 생략")
        print(f"   이미지 URL : {image_url}")
        print(f"   캡션 미리보기:\n{caption}")
        return

    # 4. Instagram 게시
    post_id = post_to_instagram(image_url, caption)

    print("\n" + "─"*50)
    print(f"🎉 완료! 인스타 게시물 ID: {post_id}")
    print(f"   https://www.instagram.com/p/{post_id}/")

if __name__ == "__main__":
    main()
