"""
야근탈출 RUN! 게임 이미지 일괄 생성 (나노바나나)

  python3 sabok-game/sabok-escape/make_assets.py          # 없는 것만 생성
  python3 sabok-game/sabok-escape/make_assets.py --force  # 전부 다시 생성
  python3 sabok-game/sabok-escape/make_assets.py boss jump # 특정 것만

결과: sabok-game/sabok-escape/img/*.webp
게임(overtime-escape.html)은 이미지가 있으면 이미지로, 없으면 기존 코드 그림으로 그립니다.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)
from nanobanana import generate, cutout  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

OUT = os.path.join(HERE, "img")


def ref_path(name):
    """기준 이미지 경로. '_ref_xxx'는 img/_ref_xxx.png, 'boss.webp'처럼 확장자가 있으면 img/ 안의 그 파일"""
    return os.path.join(OUT, name if "." in name else name + ".png")


REF = ref_path("_ref_player")  # 캐릭터 일관성용 기준 이미지 (게임엔 안 씀)

STYLE = ("Style: polished cute Korean mobile game art (like Cookie Run), thick clean dark-navy outline, "
         "soft cel shading, vibrant warm colors, readable at small size, night-office lighting. ")
SPRITE = ("Single isolated game sprite, full object visible, side view, centered. "
          "Background must be ONE flat solid pure chroma green color (#00FF00) with no gradient, "
          "no shadow, no floor, no text, no frame. Do not use any green color on the subject. ")
HERO = ("cute chibi young Korean social worker, big head small body (2.5 heads tall), short dark hair, "
        "sky-blue cardigan over white shirt, ID card lanyard, navy pants, white sneakers, orange tote bag")
ADMIN = ("cute chibi Korean male social worker in charge of administration, big head small body (2.5 heads tall), "
         "neat short black hair with a side part, round black glasses, white shirt with rolled sleeves, navy knit vest, "
         "mustard-yellow tie, ID card lanyard, dark gray pants, brown shoes, holding a clipboard and a red approval stamp")
PR = ("cute chibi young Korean female social worker in charge of PR and social media, big head small body (2.5 heads tall), "
      "wavy brown bob hair with a yellow hair clip, coral-pink hoodie, white wide pants, chunky white sneakers, "
      "ID card lanyard, holding a smartphone, small white earbuds")
SAME = "Same character as the reference image: identical face, hair, outfit and colors. "
NEWCHAR = "A NEW, different character drawn in exactly the same art style as the reference image. "

# 직렬 캐릭터 포즈 (게임 파일명: {접두어}_run1 ...)
POSES = {
    "run1": ("Running facing RIGHT, left leg forward, right leg back, arms swinging. ", "1:1", 300),
    "run2": ("Running facing RIGHT, right leg forward, left leg back (opposite stride), arms swinging. ", "1:1", 300),
    "jump": ("Jumping high facing RIGHT, knees tucked, arms up, excited face. ", "1:1", 300),
    "slide": ("Baseball-style slide facing RIGHT: body almost horizontal and low, leaning back, feet forward "
              "to the right. Very wide and short shape. ", "16:9", 360),
    "fall": ("Falling down in panic, arms flailing, shocked face with spiral eyes. ", "1:1", 300),
}

# name: (prompt, aspect, kind, 긴 변 최대 px[, 참조 이미지 이름])
#   kind: "ref" = 기준 캐릭터, "pose" = 기준 캐릭터 참조 스프라이트, "sprite" = 일반 스프라이트, "bg" = 배경
#   참조 이미지 기본값: pose는 _ref_player, sprite는 그림체 참고용 _ref_player
ASSETS = {
    "_ref_player": (f"Character reference: {HERO}, tired but determined face, running pose facing RIGHT. "
                    + STYLE + SPRITE, "1:1", "ref", 1024),
    "run1": (SAME + "Running facing RIGHT, left leg forward, right leg back, arms swinging, small sweat drop. "
             + STYLE + SPRITE, "1:1", "pose", 300),
    "run2": (SAME + "Running facing RIGHT, right leg forward, left leg back (opposite stride), arms swinging. "
             + STYLE + SPRITE, "1:1", "pose", 300),
    "jump": (SAME + "Jumping high facing RIGHT, knees tucked, arms up, excited sparkling eyes. "
             + STYLE + SPRITE, "1:1", "pose", 300),
    "slide": (SAME + "Baseball-style slide facing RIGHT: body almost horizontal and low, leaning back, "
              "feet forward to the right, determined face. Very wide and short shape. "
              + STYLE + SPRITE, "16:9", "pose", 360),
    "fall": (SAME + "Falling down in panic, arms flailing, shocked face with spiral eyes. "
             + STYLE + SPRITE, "1:1", "pose", 300),
    "tired": (SAME + "Game over pose: slumped exhausted on the floor, soul leaving body as a small ghost, "
              "comic sadness. " + STYLE + SPRITE, "1:1", "pose", 400),
    "hero": (SAME + "Victory pose facing viewer, holding the tote bag over shoulder, waving goodbye happily, "
             "'off work!' mood, small sparkles. " + STYLE + SPRITE, "1:1", "pose", 400),

    # 바닥 장애물 (점프로 피함)
    "papers": ("A tall wobbly tower of piled paper documents and folders, about to topple, a red "
               "'rejected' stamp mark on the top sheet. " + STYLE + SPRITE, "3:4", "sprite", 240),
    "phone": ("A ringing old office desk phone shaking violently, handset jumping off, motion lines, "
              "small screen showing many missed calls. " + STYLE + SPRITE, "1:1", "sprite", 240),
    "boss": ("A grumpy chibi middle-aged Korean team leader in a dark suit and red tie, arms crossed, "
             "angry eyebrows, anger vein mark, standing facing LEFT, full body. "
             + STYLE + SPRITE, "3:4", "sprite", 280),
    "boxes": ("Two stacked cardboard boxes, the top one slightly tilted, papers sticking out, "
              "a red 'URGENT' sticker. " + STYLE + SPRITE, "1:1", "sprite", 240),

    # 공중 장애물 (슬라이드로 피함)
    "minwon": ("A flying red spiky explosion-shaped angry speech bubble with an anger symbol inside, "
               "speed lines trailing to the right, flying LEFT. " + STYLE + SPRITE, "3:2", "sprite", 280),
    "nag": ("A flying purple oval speech bubble with a scribbly angry squiggle inside (no letters), "
            "tail pointing right, speed lines, flying LEFT. " + STYLE + SPRITE, "3:2", "sprite", 280),
    "fax": ("Three flying fanned-out office documents with a red deadline clock icon, fluttering, "
            "speed lines to the right, flying LEFT. " + STYLE + SPRITE, "3:2", "sprite", 260),

    # 젤리 & 아이템
    "jelly_pink": ("A glossy round pink gummy jelly candy with a cute shine highlight. "
                   + STYLE + SPRITE, "1:1", "sprite", 96),
    "jelly_yellow": ("A glossy round yellow gummy jelly candy with a cute shine highlight. "
                     + STYLE + SPRITE, "1:1", "sprite", 96),
    "jelly_blue": ("A glossy round sky-blue gummy jelly candy with a cute shine highlight. "
                   + STYLE + SPRITE, "1:1", "sprite", 96),
    "drink": ("A can of energy drink with a lightning bolt logo, glowing aura, sparkles. "
              + STYLE + SPRITE, "3:4", "sprite", 140),
    "barrier": ("A small yellow and black striped construction barrier with a warning sign. "
                + STYLE + SPRITE, "3:2", "sprite", 180),

    # 배경 (가로로 반복됨 — 좌우 끝이 이어지도록 요청, 게임에서 좌우 반전 타일링으로 이음새 제거)
    "bg_office": ("2D side-scrolling game background, wide panoramic side view of a Korean welfare center "
                  "office late at night: big windows showing a dark blue night sky with moon and lit city "
                  "buildings, rows of desks with glowing blue monitors, piles of documents, office chairs, "
                  "partitions, a wall clock showing 11 PM, some flickering ceiling lights. Dim moody blue "
                  "palette with warm yellow highlights. No people, no text. The bottom 8% is the floor line. "
                  "Left and right edges should continue seamlessly. " + STYLE, "21:9", "bg", 1600),
    "floor": ("Seamless texture, flat orthographic side-view cross-section of a dark navy office floor for a "
              "2D side-scrolling game ground strip: a thin glossy light-blue top edge line at the very top, "
              "below it dark navy floor tiles with soft reflections. The texture fills the ENTIRE image edge to "
              "edge: no border, no frame, no rounded corners, no white areas, no background, no objects, no text. "
              + STYLE, "21:9", "bg", 1200),

    # ----- 직렬 캐릭터 (행정 · 홍보) -----
    "_ref_admin": (NEWCHAR + f"Character reference: {ADMIN}, calm confident face, running pose facing RIGHT. "
                   + STYLE + SPRITE, "1:1", "ref", 1024),
    "_ref_pr": (NEWCHAR + f"Character reference: {PR}, bright cheerful face, running pose facing RIGHT. "
                + STYLE + SPRITE, "1:1", "ref", 1024),

    # ----- 새 아이템 -----
    "americano": ("A takeaway iced americano cup with a straw, ice cubes, glowing speed aura and motion lines. "
                  + STYLE + SPRITE, "3:4", "sprite", 140),
    "leave_ticket": ("A shiny golden ticket with a beach umbrella and sun icon (a day-off pass), sparkles, no letters. "
                     + STYLE + SPRITE, "3:2", "sprite", 160),
    "corp_card": ("A shiny navy and gold credit card with sparkling magnetic aura arcs around it, no letters. "
                  + STYLE + SPRITE, "3:2", "sprite", 160),
    "chicken": ("An open box of Korean fried chicken with crispy golden drumsticks and a few soft white steam puffs. "
                + STYLE + SPRITE, "1:1", "sprite", 150),

    # ----- 보스 & 엔딩 -----
    "boss_throw": ("The same grumpy team leader as the reference image (identical face, hair, suit and red tie), "
                   "now throwing a stack of documents forward to the LEFT with one arm, angry shouting face, "
                   "papers flying, full body facing LEFT. " + STYLE + SPRITE, "3:4", "sprite", 320, "boss.webp"),
    "subway": ("A Korean subway train car seen from the side, doors wide open with warm light inside, empty seats, "
               "late night last train, the front of the train on the LEFT, no logos, no letters. "
               + STYLE + SPRITE, "21:9", "sprite", 900),
}

# 직렬 캐릭터 포즈를 자동으로 추가: admin_run1 ... pr_fall
for _prefix, _ref in (("admin", "_ref_admin"), ("pr", "_ref_pr")):
    for _pose, (_desc, _aspect, _px) in POSES.items():
        ASSETS[f"{_prefix}_{_pose}"] = (SAME + _desc + STYLE + SPRITE, _aspect, "pose", _px, _ref)


def make(name, force=False):
    prompt, aspect, kind, max_px, *rest = ASSETS[name]
    out = ref_path(name) if kind == "ref" else os.path.join(OUT, name + ".webp")
    if os.path.exists(out) and not force:
        print(f"  건너뜀  {name} (이미 있음)")
        return
    if kind == "pose":
        refs = [ref_path(rest[0] if rest else "_ref_player")]
    elif kind == "sprite" and rest:  # 특정 이미지와 같은 대상 (예: 보스 다른 포즈)
        refs = [ref_path(rest[0])]
    elif kind in ("sprite", "ref") and name != "_ref_player" and os.path.exists(REF):
        refs = [REF]  # 그림체만 맞춤
        if kind == "sprite":
            prompt = "Match the art style of the reference image (not the character). " + prompt
    else:
        refs = None
    print(f"  생성중  {name} ...", flush=True)
    img = generate(prompt, refs=refs, aspect=aspect)
    if kind != "bg":
        img = cutout(img)
    img.thumbnail((max_px, max_px), Image.LANCZOS)
    if kind == "ref":
        img.save(out)
    else:
        img.save(out, "WEBP", quality=88, method=6)
    print(f"  완료    {name} → {os.path.relpath(out, ROOT)} {img.size}")


def main():
    os.makedirs(OUT, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    names = args or list(ASSETS)
    # 포즈는 기준 캐릭터가 먼저 있어야 함
    for n in list(names):
        spec = ASSETS.get(n)
        if spec and spec[2] == "pose":
            r = spec[4] if len(spec) > 4 else "_ref_player"
            if not os.path.exists(ref_path(r)) and r not in names:
                names.insert(0, r)
    names.sort(key=lambda n: 0 if ASSETS.get(n, ("", "", ""))[2] == "ref" else 1)
    for n in names:
        if n not in ASSETS:
            sys.exit(f"모르는 이름: {n}  (가능: {', '.join(ASSETS)})")
        make(n, force=force or (n in args))


if __name__ == "__main__":
    main()
