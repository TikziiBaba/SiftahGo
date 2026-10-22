"""SiftahGo logo kiti — "Altın o" yazı logosu.

Yazı (siftahgo), go ikonu, renk sürümleri, ikon + yazı kilidi, web ve mobil ikonları üretir.
Çalıştırma:  python kaynak/uret.py hepsi      (fonttools + brotli gerekir; PNG için logo-design skill'i ve Chrome)
"""
import math, os, re, sys
from functools import lru_cache

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Geist variable font (SIL OFL), Latin subset; `next build` writes it here. Override with SIFTAHGO_FONT.
FONT = os.environ.get("SIFTAHGO_FONT", os.path.join(KIT, "..", "..", "..", "web", ".next", "static", "media",
                                                    "caa3a2e1cccd8315-s.p.0wgildi0cnwt9.woff2"))
SKILL = os.environ.get("LOGO_SKILL_SCRIPTS", os.path.expanduser("~/.claude/skills/logo-design/scripts"))

TEAL = "#0f766e"        # SiftahGo Teal
TEAL_LIGHT = "#2dd4bf"  # Açık teal — koyu zeminde
GOLD = "#f5b544"        # Siftah altını — koyu ve teal zeminde
GOLD_DEEP = "#cc8400"   # Derin altın — beyaz zeminde (3:1)
INK = "#0f1a19"         # Mürekkep
NIGHT = "#060808"       # Gece
LIGHT = "#f1f5f4"       # Kırık beyaz
WHITE, BLACK = "#ffffff", "#000000"

SIZE = 200              # font size of the masters (SVG units)
W_LIGHT, W_DARK = 800, 770   # light-on-dark is set 30 lighter: light shapes look heavier on dark (irradiation)
TRACK = -0.04           # em; heavy display type is set tight
KERN = {"go": -0.03}    # em, on top of TRACK: the ring is narrower than Geist's o, so pull it in
RING = 0.8              # coin-ring weight as a share of the stem (a full-weight ring reads heavier than stems)
NL = "\n"

# scheme: (weight, "siftah" colour, "g" colour, coin-ring colour) — the i's round tittle takes the first colour
SCHEMES = {
    "renkli": (W_LIGHT, INK, TEAL, GOLD_DEEP),
    "koyu": (W_DARK, LIGHT, TEAL_LIGHT, GOLD),
    "teal-zemin": (W_DARK, WHITE, WHITE, GOLD),
    "siyah": (W_LIGHT, BLACK, BLACK, BLACK),
    "beyaz": (W_DARK, WHITE, WHITE, WHITE),
    "teal": (W_LIGHT, TEAL, TEAL, TEAL),
}


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def svg(w, h, body, title, x0=0, y0=0):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{n(x0)} {n(y0)} {n(w)} {n(h)}" width="{n(w)}" '
            f'height="{n(h)}" role="img">{NL}  <title>{title}</title>{NL}{body}{NL}</svg>{NL}')


def write(rel, content):
    p = os.path.join(KIT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(content)
    return p


@lru_cache(None)
def font_at(weight):
    return instancer.instantiateVariableFont(TTFont(FONT), {"wght": weight})


def contour_bounds(gs, name):
    rp = DecomposingRecordingPen(gs)
    gs[name].draw(rp)
    out, cur = [], []
    for op, args in rp.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            bp = BoundsPen(gs)
            for o, a in cur:
                getattr(bp, o)(*a)
            out.append(bp.bounds)
            cur = []
    return out


def circle(cx, cy, r, ccw=False):
    s = 0 if ccw else 1
    return (f"M{n(cx - r)} {n(cy)} A{n(r)} {n(r)} 0 1 {s} {n(cx + r)} {n(cy)} "
            f"A{n(r)} {n(r)} 0 1 {s} {n(cx - r)} {n(cy)} Z")


def word(text, weight, colours, ring_col, size=SIZE, track=TRACK, lig_ft=True):
    """Outlined text on baseline 0. 'i' → dotless ı + round tittle (colour of the ı); a final 'o' → a true
    circular ring (the coin) in ring_col; f and t crossbars joined. Returns (svg body, bounds)."""
    f = font_at(weight)
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
    s = size / upm
    bp = BoundsPen(gs)
    parts, x, prev, fbar = [], 0.0, None, None
    extra = []
    stem = contour_bounds(gs, cmap[0x131])[0]
    stem = (stem[2] - stem[0]) * s
    for k, ch in enumerate(text):
        name = cmap[0x131] if ch == "i" else cmap[ord(ch)]
        if prev:
            x += KERN.get(prev + ch, 0) * size
        t = (s, 0, 0, -s, x, 0)
        col = colours[k]
        if ch == "o" and k == len(text) - 1:
            outer = max(contour_bounds(gs, name), key=lambda b: b[2] - b[0])
            cx, cy = x + (outer[0] + outer[2]) / 2 * s, -(outer[1] + outer[3]) / 2 * s
            ro = (outer[3] - outer[1]) / 2 * s
            parts.append((f"{circle(cx, cy, ro)} {circle(cx, cy, ro - RING * stem, ccw=True)}", ring_col))
            extra.append((cx - ro, cy - ro, cx + ro, cy + ro))
        else:
            pen = SVGPathPen(gs, ntos=n)
            gs[name].draw(TransformPen(pen, t))
            gs[name].draw(TransformPen(bp, t))
            d = pen.getCommands()
            if lig_ft and ch == "t" and prev == "f" and fbar:
                tb = min(contour_bounds(gs, name), key=lambda b: b[3] - b[1] if b[1] > 0 else 1e9)
                x1, x2 = fbar[0] - 2 * s, x + (tb[0] + 2) * s
                d += f"M{n(x1)} {n(-fbar[1] * s)}L{n(x1)} {n(-fbar[2] * s)}L{n(x2)} {n(-fbar[2] * s)}L{n(x2)} {n(-fbar[1] * s)}Z"
            if ch == "f":
                fb = min(contour_bounds(gs, name), key=lambda b: b[3] - b[1] if b[1] > 0 else 1e9)
                fbar = (x + fb[2] * s, fb[1], fb[3])
            if ch == "i":
                top = max(contour_bounds(gs, cmap[ord("i")]), key=lambda b: b[1])
                r = (top[2] - top[0] + top[3] - top[1]) / 4 * s * 1.02
                cx, cy = x + (top[0] + top[2]) / 2 * s, -(top[1] + top[3]) / 2 * s
                d += " " + circle(cx, cy, r)
                extra.append((cx - r, cy - r, cx + r, cy + r))
            parts.append((d, col))
        x += gs[name].width * s + track * size
        prev = ch
    # merge consecutive runs of one colour into one path
    merged = []
    for d, c in parts:
        if merged and merged[-1][1] == c:
            merged[-1] = (merged[-1][0] + " " + d, c)
        else:
            merged.append((d, c))
    body = NL.join(f'  <path fill="{c}" d="{d}"/>' for d, c in merged)
    b = list(bp.bounds) if bp.bounds else [1e9, 1e9, -1e9, -1e9]
    for e in extra:
        b = [min(b[0], e[0]), min(b[1], e[1]), max(b[2], e[2]), max(b[3], e[3])]
    return body, b


def wordmark(scheme, small=False):
    w, c1, c2, ring = SCHEMES[scheme]
    if small:   # small-size cut: lighter and looser so counters stay open below ~120 px
        return word("siftahgo", w - 60, [c1] * 6 + [c2, c2], ring, track=-0.01)
    return word("siftahgo", w, [c1] * 6 + [c2, c2], ring)


def go(scheme_or_cols, weight=None):
    if isinstance(scheme_or_cols, str):
        w, _, c2, ring = SCHEMES[scheme_or_cols]
    else:
        c2, ring = scheme_or_cols
        w = weight
    return word("go", weight or w, [c2, c2], ring, lig_ft=False)


def place(body, b, frac, canvas=256, lift=0.0):
    """Scale + centre a body with bounds b so its longer side is frac × canvas."""
    w, h = b[2] - b[0], b[3] - b[1]
    k = canvas * frac / max(w, h)
    tx = canvas / 2 - (b[0] + w / 2) * k
    ty = canvas / 2 - (b[1] + h / 2) * k - lift * canvas
    return f'  <g transform="translate({n(tx)} {n(ty)}) scale({n(k, )})">{NL}{body}{NL}  </g>'


def tight(body, b, title):
    """viewBox snapped outward to whole units, so the canvas is easy to grid and place."""
    x0, y0 = math.floor(b[0]), math.floor(b[1])
    return svg(math.ceil(b[2]) - x0, math.ceil(b[3]) - y0, body, title, x0, y0)


def tile_svg(bg, body, b, frac, rx=56, title="SiftahGo uygulama ikonu", lift=0.0):
    rect = f'  <rect width="256" height="256" rx="{n(rx)}" fill="{bg}"/>{NL}' if bg else ""
    return svg(256, 256, rect + place(body, b, frac, lift=lift), title)


def combo(scheme):
    """App-icon tile + wordmark: tile spans the wordmark's ascender-to-descender height."""
    body, b = wordmark(scheme)
    th = b[3] - b[1]
    gb, gbx = go((WHITE, GOLD), 780)
    gap = 0.16 * SIZE
    k = th / 256
    tile = (f'  <g transform="translate({n(b[0] - gap - th)} {n(b[1])}) scale({n(k)})">{NL}'
            f'  <rect width="256" height="256" rx="56" fill="{TEAL}"/>{NL}{place(gb, gbx, 0.62)}{NL}  </g>')
    bb = [b[0] - gap - th, b[1], b[2], b[3]]
    return tight(tile + NL + body, bb, "SiftahGo logosu")


# ---------------------------------------------------------------- build
def build_all():
    sys.path.insert(0, SKILL)
    import render_png as rp

    files = {}
    for sc in SCHEMES:
        body, b = wordmark(sc)
        files[f"svg/siftahgo-yazi-{sc}.svg"] = tight(body, b, "SiftahGo logosu")
        body, b = wordmark(sc, small=True)
        files[f"svg/siftahgo-yazi-kucuk-{sc}.svg"] = tight(body, b, "SiftahGo logosu (küçük boyut)")
        gbody, gb = go(sc)
        files[f"svg/siftahgo-go-{sc}.svg"] = svg(256, 256, place(gbody, gb, 0.8), "SiftahGo go işareti")
    for sc in ("renkli", "koyu"):
        files[f"svg/siftahgo-ikon-yazi-{sc}.svg"] = combo(sc)
    ab, abx = go((WHITE, GOLD), 780)
    files["svg/siftahgo-uygulama-ikonu.svg"] = tile_svg(TEAL, ab, abx, 0.62)
    # favicon: heavier cut, bigger on the tile so g and ring stay apart at 16 px
    fb, fbx = go((WHITE, GOLD), 860)
    files["web/favicon.svg"] = tile_svg(TEAL, fb, fbx, 0.8, rx=56)
    files["web/icon.svg"] = files["web/favicon.svg"]
    files["calisma/ikon-kare.svg"] = tile_svg(TEAL, ab, abx, 0.6, rx=0)
    files["calisma/ikon-maskable.svg"] = tile_svg(TEAL, ab, abx, 0.5, rx=0)
    files["calisma/android-on.svg"] = tile_svg(None, ab, abx, 0.48)
    mb, mbx = go((WHITE, WHITE), 780)
    files["calisma/android-tek.svg"] = tile_svg(None, mb, mbx, 0.48)
    files["calisma/android-arka.svg"] = svg(256, 256, f'  <rect width="256" height="256" fill="{TEAL}"/>', "arka plan")
    nb, nbx = go((WHITE, WHITE), 820)
    files["calisma/bildirim.svg"] = tile_svg(None, nb, nbx, 0.84)
    kb, kbx = go("koyu")
    files["calisma/acilis.svg"] = tile_svg(None, kb, kbx, 0.84)
    paths = {rel: write(rel, c) for rel, c in files.items()}

    jobs = [
        ("web/favicon.svg", "web/favicon-16.png", 16, 16), ("web/favicon.svg", "web/favicon-32.png", 32, 32),
        ("web/favicon.svg", "web/favicon-48.png", 48, 48),
        ("calisma/ikon-kare.svg", "web/apple-icon.png", 180, 180),
        ("calisma/ikon-kare.svg", "web/icon-192.png", 192, 192),
        ("calisma/ikon-kare.svg", "web/icon-512.png", 512, 512),
        ("calisma/ikon-maskable.svg", "web/icon-maskable-512.png", 512, 512),
        ("calisma/ikon-kare.svg", "mobil/icon.png", 1024, 1024),
        ("calisma/android-on.svg", "mobil/android-icon-foreground.png", 1024, 1024),
        ("calisma/android-arka.svg", "mobil/android-icon-background.png", 1024, 1024),
        ("calisma/android-tek.svg", "mobil/android-icon-monochrome.png", 1024, 1024),
        ("calisma/bildirim.svg", "mobil/notification-icon.png", 96, 96),
        ("calisma/acilis.svg", "mobil/splash-icon.png", 512, 512),
        ("web/favicon.svg", "mobil/favicon.png", 48, 48),
        ("svg/siftahgo-uygulama-ikonu.svg", "png/siftahgo-uygulama-ikonu-1024.png", 1024, 1024),
    ]
    for sc in ("renkli", "koyu", "beyaz", "siyah"):
        jobs.append((f"svg/siftahgo-go-{sc}.svg", f"png/siftahgo-go-{sc}-1024.png", 1024, 1024))
    for kind, scs in (("yazi", ("renkli", "koyu", "beyaz", "siyah", "teal-zemin")), ("ikon-yazi", ("renkli", "koyu"))):
        for sc in scs:
            src = f"svg/siftahgo-{kind}-{sc}.svg"
            m = re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"', files[src])
            vw, vh = float(m.group(1)), float(m.group(2))
            jobs.append((src, f"png/siftahgo-{kind}-{sc}-1600.png", 1600, round(1600 * vh / vw)))
    for src, dst, w, h in jobs:
        out = os.path.join(KIT, dst)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if not rp.render(paths[src], out, w, h):
            print("FAILED", dst)
    rp.write_ico([os.path.join(KIT, f"web/favicon-{s}.png") for s in (16, 32, 48)], os.path.join(KIT, "web/favicon.ico"))
    print("built", len(files), "svg,", len(jobs), "png")


if __name__ == "__main__":
    if sys.argv[1:] == ["hepsi"]:
        build_all()
    elif sys.argv[1:] == ["svg"]:
        for sc in SCHEMES:
            body, b = wordmark(sc)
            write(f"svg/siftahgo-yazi-{sc}.svg", tight(body, b, "SiftahGo logosu"))
        print("svg ok")
