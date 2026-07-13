import os
import shutil

BASE = "/Users/hong-eunseong/Documents/안티그래비티/saboksnote"
ORDER_DIR = os.path.join(BASE, "카드뉴스순서")

MAPPING = [
  ("cardnews/saboknote-card1", "01_계정소개_사회복지사도AI씁니다"),
  ("cardnews/saboknote-card2", "02_공감_오늘도야근"),
  ("cardnews/saboknote-card3", "03_현실밈_직업설명하기"),
  ("cardnews/saboknote-card4", "04_번아웃자가진단"),
  ("cardnews/saboknote-card7", "05_선배가신입에게"),
  ("cardnews/saboknote-card8", "06_중간관리자에게"),
  ("cardnews/saboknote-voca-v2", "07_생존단어장"),
  ("cardnews/saboknote-card5", "08_기록문장10개"),
  ("cardnews/saboknote-prompt", "09_비밀프롬프트_AI기록30초"),
  ("cardnews/saboknote-accounting-master", "10_행정회계마스터"),
  ("honeydata/카드뉴스/files/nlm-00-intro", "11_NotebookLM_소개"),
  ("honeydata/카드뉴스/files/nlm-01-briefing", "12_NotebookLM_브리핑"),
  ("honeydata/카드뉴스/files/nlm-02-mindmap", "13_NotebookLM_마인드맵"),
  ("honeydata/카드뉴스/files/nlm-03-compare", "14_NotebookLM_제도비교"),
  ("honeydata/카드뉴스/files/nlm-04-collab", "15_NotebookLM_팀협업"),
  ("honeydata/카드뉴스/files/nlm-05-audio", "16_NotebookLM_오디오"),
  ("honeydata/카드뉴스/files/nlm-06-casemanage", "17_NotebookLM_사례관리"),
]

for src_folder, dst_folder in MAPPING:
    src_dir = os.path.join(BASE, src_folder)
    dst_dir = os.path.join(ORDER_DIR, dst_folder)
    
    if not os.path.exists(src_dir):
        print(f"Source not found: {src_dir}")
        continue
    if not os.path.exists(dst_dir):
        os.makedirs(dst_dir, exist_ok=True)
        
    for file in os.listdir(src_dir):
        if file.startswith("slide_") and file.endswith(".png"):
            src_file = os.path.join(src_dir, file)
            dst_file = os.path.join(dst_dir, file)
            shutil.copy2(src_file, dst_file)
            print(f"Copied {file} to {dst_folder}")

print("All images restored.")
