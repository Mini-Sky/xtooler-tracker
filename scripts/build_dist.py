# -*- coding: utf-8 -*-
"""Build dist/ from demo/ + assets/ for deployment.

- copies demo/* into dist/ (vendor/ is preserved)
- rewrites index.html to use vendored MapLibre + local fonts (China-friendly)
- mirrors assets/ into dist/assets/ excluding internal records (sources/manifest)
"""
import re, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO, DIST, ASSETS = ROOT / "demo", ROOT / "dist", ROOT / "assets"

def main():
    DIST.mkdir(exist_ok=True)
    # 1) demo sources -> dist root
    for item in DEMO.iterdir():
        dest = DIST / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest)

    # 2) localize external deps in index.html
    html_path = DIST / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
    html = html.replace(
        'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&display=swap',
        "vendor/fonts.css")
    html = html.replace("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css", "vendor/maplibre-gl.css")
    html = html.replace("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js", "vendor/maplibre-gl.js")
    html_path.write_text(html, encoding="utf-8")
    assert "unpkg.com" not in html and "googleapis" not in html, "external deps still referenced!"
    assert (DIST / "vendor" / "maplibre-gl.js").exists(), "vendor files missing!"

    # 3) assets -> dist/assets, excluding internal records
    for sub in ASSETS.iterdir():
        if sub.is_dir():
            shutil.copytree(sub, DIST / "assets" / sub.name, dirs_exist_ok=True)
    for junk in (DIST / "assets").glob("sources*.md"):
        junk.unlink()
    for junk in (DIST / "assets").glob("manifest*.json"):
        junk.unlink()

    print("dist build OK")

if __name__ == "__main__":
    main()
