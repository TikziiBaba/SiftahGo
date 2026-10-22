"""Build the presentation board with the skill script, then translate its fixed labels to Turkish and
export one PNG per slide."""
import os, re, sys, tempfile

sys.path.insert(0, os.environ.get("LOGO_SKILL_SCRIPTS", os.path.expanduser("~/.claude/skills/logo-design/scripts")))
import presentation_board as pb
import render_png

DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sunum")
OUT = os.path.join(DIR, "sunum.html")
REPL = [
    ("lang='en'", "lang='tr'"),
    ("What we heard", "Ne duyduk"), (">The brief<", ">Brief<"),
    ("Final design · in use", "Son tasarım · kullanımda"), (">Final design<", ">Son tasarım<"),
    ("Next steps", "Sonraki adımlar"), (">Notes<", ">Notlar<"),
    ("Final identity", "Son kimlik"), ("final identity", "son kimlik"),
    ("Storefront / signage", "Dükkân tabelası"), ("Social profile", "Sosyal profil"),
    ("Laptop sticker", "Çıkartma"), ("Browser tab", "Tarayıcı sekmesi"), (" — Home", " — Ana sayfa"),
    (">App icon<", ">Uygulama ikonu<"), (">Website<", ">Web sitesi<"),
    ("Business cards", "Kartvizit"), ("Founder", "Kurucu"), ("Alex Morgan", "Ad Soyad"),
]

sys.argv = ["presentation_board.py", os.path.join(DIR, "spec.json"), "-o", OUT]
pb.main()
doc = open(OUT, encoding="utf-8").read()
for a, b in REPL:
    doc = doc.replace(a, b)
open(OUT, "w", encoding="utf-8").write(doc)
left = sorted(set(re.findall(r">([A-Z][a-z]+(?: [a-z]+)*)<", doc)))
print("capitalised text nodes left:", left)

png_dir = os.path.join(DIR, "slaytlar")
os.makedirs(png_dir, exist_ok=True)
solo_css = pb.CSS + "body{background:#fff}.slide{margin:0;box-shadow:none;min-height:800px}"
for i, sl in enumerate(re.findall(r'<section class="slide">.*?</section>', doc, re.S), 1):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as fh:
        fh.write(f"<!doctype html><html lang='tr'><head><meta charset='utf-8'><style>{solo_css}</style></head><body>{sl}</body></html>")
        tmp = fh.name
    try:
        render_png.screenshot_html(tmp, os.path.join(png_dir, f"slayt-{i:02d}.png"), 1280, 800)
    finally:
        os.unlink(tmp)
print("slides", i)
