"""SiftahGo tasarım kalitesi puanı (0-100). Karpathy döngüsünün puan dosyası: DOKUNMAYIN.

Çalıştırma (repo kökünden):  python dongu/tasarim/puan.py
Çıktı: yalnızca tek sayı. Ayrıntılar dongu/tasarim/.cache/rapor.json dosyasına yazılır.

Bileşenler:
  A  %35  Web Lighthouse: 5 herkese açık sayfa, erişilebilirlik + en iyi uygulamalar + SEO (telefon)
  B  %25  Mobil uygulama (web derlemesi) Lighthouse erişilebilirlik: 6 ekran
  C  %15  Kontrast: tema metin renkleri x zeminler, WCAG AA (4.5:1) geçen çiftlerin oranı
  D  %15  Mobil kod: erişilebilirlik rolü olan Pressable oranı, tema dışı renk ve yazı boyutu sayısı
  E  %10  Web kod: sınıf adlarındaki keyfi hex renkler ve keyfi yazı boyutları
"""

import hashlib
import http.server
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
WEB = ROOT / "web"
MOBILE = ROOT / "mobile"
LIGHTHOUSE = "npx --yes lighthouse@12.8.2"

WEB_PAGES = ["/", "/kesfet", "/giris", "/kayit", "/sifremi-unuttum"]
MOBILE_PAGES = ["/", "/hesap", "/randevular", "/giris", "/kayit", "/sifremi-unuttum"]
WEB_PORT, MOBILE_PORT = 3100, 3101


def log(*a):
    print(*a, file=sys.stderr)


def run(cmd, cwd, timeout=900):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd} başarısız:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")
    return r.stdout


def tree_hash(paths):
    h = hashlib.sha256()
    for base in paths:
        files = [base] if base.is_file() else sorted(p for p in base.rglob("*") if p.is_file())
        for p in files:
            h.update(str(p.relative_to(ROOT)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_port(port, seconds=90):
    end = time.time() + seconds
    while time.time() < end:
        if port_open(port):
            return
        time.sleep(1)
    raise RuntimeError(f"{port} portu açılmadı")


def cached_build(name, sources, build):
    """Kaynaklar değişmediyse önceki derlemeyi kullanır."""
    stamp = CACHE / f"{name}.hash"
    digest = tree_hash(sources)
    if stamp.exists() and stamp.read_text() == digest:
        return
    build()
    stamp.write_text(digest)


def lighthouse(url, categories, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    cmd = (
        f'{LIGHTHOUSE} "{url}" --quiet --output=json --output-path="{out}" '
        f"--only-categories={','.join(categories)} --form-factor=mobile --throttling-method=provided "
        f'--max-wait-for-load=60000 --chrome-flags="--headless=new --no-first-run"'
    )
    # Windows'ta Lighthouse geçici klasörü silerken hata verebilir; rapor yazıldıysa geçerlidir.
    subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, timeout=300)
    if not out.exists():
        raise RuntimeError(f"Lighthouse raporu yok: {url}")
    report = json.loads(out.read_text(encoding="utf-8"))
    scores, failed = {}, []
    for cid in categories:
        cat = report["categories"][cid]
        if cat["score"] is None:
            raise RuntimeError(f"Lighthouse puanı yok: {url} {cid}")
        scores[cid] = cat["score"]
        for ref in cat["auditRefs"]:
            audit = report["audits"][ref["id"]]
            if ref["weight"] > 0 and audit["score"] is not None and audit["score"] < 1:
                failed.append(f"{cid}:{ref['id']}")
    return scores, failed


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    """Expo'nun tek sayfalık web çıktısı: bilinmeyen yol index.html'e düşer."""

    def translate_path(self, path):
        p = super().translate_path(path)
        return p if os.path.exists(p) else os.path.join(self.directory, "index.html")

    def log_message(self, *a):
        pass


# --- A: web -----------------------------------------------------------------
def score_web(rapor):
    def build():
        run("npx next build", WEB)

    cached_build("web", [WEB / "src", WEB / "next.config.ts", WEB / "package.json"], build)
    server = subprocess.Popen(f"npx next start -p {WEB_PORT}", cwd=WEB, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_port(WEB_PORT)
        values = []
        for page in WEB_PAGES:
            s, failed = lighthouse(f"http://localhost:{WEB_PORT}{page}", ["accessibility", "best-practices", "seo"], CACHE / "lh" / f"web{page.replace('/', '_')}.json")
            values += s.values()
            rapor["web"][page] = {"puan": s, "eksik": failed}
        return sum(values) / len(values)
    finally:
        subprocess.run(f"taskkill /pid {server.pid} /t /f", shell=True, capture_output=True)


# --- B: mobil (web derlemesi) ------------------------------------------------
def score_mobile(rapor):
    out = CACHE / "mobile-web"

    def build():
        run(f'npx expo export --platform web --output-dir "{out}" --clear', MOBILE)

    cached_build("mobile", [MOBILE / "src", MOBILE / "app.json", MOBILE / "package.json", MOBILE / "assets"], build)
    handler = lambda *a, **k: SpaHandler(*a, directory=str(out), **k)  # noqa: E731
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", MOBILE_PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        values = []
        for page in MOBILE_PAGES:
            s, failed = lighthouse(f"http://localhost:{MOBILE_PORT}{page}", ["accessibility"], CACHE / "lh" / f"mobile{page.replace('/', '_')}.json")
            values.append(s["accessibility"])
            rapor["mobil"][page] = {"puan": s, "eksik": failed}
        return sum(values) / len(values)
    finally:
        httpd.shutdown()


# --- C: kontrast --------------------------------------------------------------
def luminance(hex_color):
    h = hex_color.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b):
    la, lb = sorted([luminance(a), luminance(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def score_contrast(rapor):
    theme = (MOBILE / "src/lib/theme.ts").read_text(encoding="utf-8")
    mob = dict(re.findall(r"^\s*(\w+):\s*'(#[0-9a-fA-F]{6})'", theme, re.M))
    css = (WEB / "src/app/globals.css").read_text(encoding="utf-8")
    web = dict(re.findall(r"--color-([\w-]+):\s*(#[0-9a-fA-F]{6})", css))
    pairs = []
    for fg in ["ink", "ink2", "ink3", "ink4", "brand300", "gold", "danger", "success", "warning", "info"]:
        for bg in ["bg", "surface", "surface2"]:
            if fg in mob and bg in mob:
                pairs.append((f"mobil {fg}/{bg}", contrast(mob[fg], mob[bg])))
    for fg in ["ink", "ink-2", "ink-3", "ink-4", "brand-300", "gold"]:
        for bg in ["bg", "surface", "surface-2"]:
            if fg in web and bg in web:
                pairs.append((f"web {fg}/{bg}", contrast(web[fg], web[bg])))
    if len(pairs) < 30:
        raise RuntimeError(f"Kontrast için yeterli renk çifti bulunamadı ({len(pairs)})")
    failing = [f"{n} {r:.2f}" for n, r in pairs if r < 4.5]
    rapor["kontrast"] = {"cift": len(pairs), "gecmeyen": failing}
    return 1 - len(failing) / len(pairs)


# --- D, E: kod tutarlılığı ------------------------------------------------------
def sources(base, exts, skip=()):
    for p in base.rglob("*"):
        if p.suffix in exts and not any(s in p.as_posix() for s in skip):
            yield p, p.read_text(encoding="utf-8")


def opening_tags(text, tag):
    """<Tag ...> açılış etiketleri; süslü parantez içindeki '>' atlanır."""
    for m in re.finditer(rf"<{tag}\b", text):
        depth, i = 0, m.end()
        while i < len(text):
            c = text[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif c == ">" and depth == 0:
                break
            i += 1
        yield text[m.start() : i]


def score_mobile_code(rapor):
    files = list(sources(MOBILE / "src", {".ts", ".tsx"}, skip=("src/lib/theme.ts",)))
    tags = [t for _, text in files for t in opening_tags(text, "Pressable")]
    with_role = sum(1 for t in tags if re.search(r"accessibilityRole|\brole=", t))
    colors = [(p.name, m) for p, text in files for m in re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", text)]
    sizes = [(p.name, m) for p, text in files for m in re.findall(r"fontSize:\s*\d+", text)]
    rapor["mobil_kod"] = {
        "pressable": f"{with_role}/{len(tags)} rollü",
        "renk": [f"{f}: {m}" for f, m in colors],
        "yazi_boyutu": [f"{f}: {m}" for f, m in sizes],
    }
    parts = [with_role / len(tags) if tags else 1, max(0, 1 - len(colors) / 60), max(0, 1 - len(sizes) / 30)]
    return sum(parts) / len(parts)


def score_web_code(rapor):
    files = list(sources(WEB / "src", {".tsx"}))
    colors = [(p.name, m) for p, text in files for m in re.findall(r"\[#[0-9a-fA-F]{3,8}\]", text)]
    sizes = [(p.name, m) for p, text in files for m in re.findall(r"text-\[[0-9.]+(?:px|rem)\]", text)]
    rapor["web_kod"] = {"renk": [f"{f}: {m}" for f, m in colors], "yazi_boyutu": [f"{f}: {m}" for f, m in sizes]}
    return (max(0, 1 - len(colors) / 20) + max(0, 1 - len(sizes) / 40)) / 2


def main():
    CACHE.mkdir(exist_ok=True)
    rapor = {"web": {}, "mobil": {}}
    parts = {
        "A_web_lighthouse": (0.35, score_web(rapor)),
        "B_mobil_lighthouse": (0.25, score_mobile(rapor)),
        "C_kontrast": (0.15, score_contrast(rapor)),
        "D_mobil_kod": (0.15, score_mobile_code(rapor)),
        "E_web_kod": (0.10, score_web_code(rapor)),
    }
    total = 100 * sum(w * v for w, v in parts.values())
    rapor["bilesenler"] = {k: round(100 * v, 1) for k, (_, v) in parts.items()}
    rapor["toplam"] = round(total, 1)
    (CACHE / "rapor.json").write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{total:.1f}")


if __name__ == "__main__":
    main()
