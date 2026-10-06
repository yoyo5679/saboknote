"""
nanobanana.py — 나노바나나(Gemini 이미지 모델) 이미지 생성 도구

API 키는 제미나이와 같은 GEMINI_API_KEY를 씁니다 (.env → 환경변수 순서).
키는 화면·로그·파일 어디에도 출력하지 않습니다.

사용법:
  python3 nanobanana.py "프롬프트" -o out.png
  python3 nanobanana.py "프롬프트" -o out.png --ref 참고.png --aspect 16:9
  python3 nanobanana.py "프롬프트" -o sprite.png --cutout      # 초록 배경 → 투명 배경

코드에서:
  from nanobanana import generate, cutout
  img = generate("귀여운 사회복지사 캐릭터", aspect="1:1")
"""
import os
import sys
import argparse
from io import BytesIO

from google import genai
from google.genai import types
from PIL import Image

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
ENV_FILE      = os.path.join(BASE_DIR, ".env")
DEFAULT_MODEL = "gemini-3.1-flash-image"   # 나노바나나 2 (고품질은 gemini-3-pro-image)


def get_api_key() -> str:
    """GEMINI_API_KEY: .env → 환경변수"""
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
                    if key:
                        return key
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY가 없어요. .env 파일에 GEMINI_API_KEY=... 를 넣어주세요.")
    return key


_client = None

def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_api_key())
    return _client


def generate(prompt: str, refs=None, aspect: str = "1:1", model: str = DEFAULT_MODEL,
             retries: int = 2) -> Image.Image:
    """프롬프트(+참고 이미지)로 이미지 1장 생성해 PIL Image로 반환"""
    contents = [prompt] + [Image.open(r) if isinstance(r, str) else r for r in (refs or [])]
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=aspect),
    )
    last_err: Exception = RuntimeError("이미지 생성 실패")
    for _ in range(retries + 1):
        try:
            resp = _get_client().models.generate_content(model=model, contents=contents, config=config)
            for part in resp.candidates[0].content.parts:
                if part.inline_data and part.inline_data.data:
                    return Image.open(BytesIO(part.inline_data.data)).convert("RGBA")
            last_err = RuntimeError("응답에 이미지가 없어요")
        except Exception as e:  # 일시 오류는 재시도
            if "limit: 0" in str(e):  # 무료 플랜은 이미지 모델 사용 불가 → 재시도 무의미
                raise SystemExit(
                    "나노바나나는 무료 플랜에서 막혀 있어요 (quota limit 0).\n"
                    "https://aistudio.google.com/apikey 에서 이 키의 프로젝트에 결제(Billing)를 켜주세요.")
            last_err = e
    raise last_err


def cutout(img: Image.Image, tol: int = 90, pad: int = 4) -> Image.Image:
    """단색(크로마키) 배경을 투명하게 지우고 여백을 잘라냄. 배경색은 네 모서리에서 추정."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))  # 모서리 중간값

    data = []
    for r, g, b, a in img.getdata():
        d = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
        if d < tol:
            data.append((r, g, b, 0))
        else:
            if d < tol * 1.6:  # 경계: 반투명 + 초록 번짐 제거
                a = int(255 * (d - tol) / (tol * 0.6))
                g = min(g, max(r, b))
            data.append((r, g, b, a))
    img.putdata(data)

    bbox = img.getbbox()
    if bbox:
        l, t, r, b = bbox
        img = img.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    return img


def main():
    ap = argparse.ArgumentParser(description="나노바나나 이미지 생성")
    ap.add_argument("prompt")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--ref", action="append", help="참고 이미지 (여러 개 가능)")
    ap.add_argument("--aspect", default="1:1", help="1:1, 16:9, 9:16, 4:3, 3:2 ...")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--cutout", action="store_true", help="단색 배경 제거 → 투명 PNG/WebP")
    ap.add_argument("--max", type=int, default=0, help="긴 변 최대 픽셀 (0 = 원본)")
    a = ap.parse_args()

    img = generate(a.prompt, refs=a.ref, aspect=a.aspect, model=a.model)
    if a.cutout:
        img = cutout(img)
    if a.max:
        img.thumbnail((a.max, a.max), Image.LANCZOS)
    img.save(a.out)
    print(f"저장: {a.out} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
