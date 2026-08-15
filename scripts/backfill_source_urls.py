# -*- coding: utf-8 -*-
"""Backfill per-image sourceUrl into assets/manifest.json by parsing the
markdown tables in assets/sources.md (columns: 文件名 | 描述 | 来源页面 URL | 直链 | 版权).
Items that already carry sourceUrl are left untouched.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

def parse_sources():
    """file basename -> source page url"""
    mapping = {}
    for line in (ASSETS / "sources.md").read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 3 or cells[0] in ("文件名", "---") or set(cells[0]) <= {"-"}:
            continue
        fname = cells[0].split("/")[-1]
        url = re.search(r"https?://[^\s)]+", cells[2])
        if fname and url:
            mapping[fname] = url.group(0)
    return mapping

def main():
    mapping = parse_sources()
    mf_path = ASSETS / "manifest.json"
    mf = json.loads(mf_path.read_text(encoding="utf-8"))
    filled = missing = kept = 0
    for it in mf["items"]:
        if it.get("sourceUrl"):
            kept += 1
            continue
        url = mapping.get(Path(it["file"]).name)
        if url:
            it["sourceUrl"] = url
            filled += 1
        else:
            missing += 1
    mf_path.write_text(json.dumps(mf, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"sources.md entries: {len(mapping)} | already had: {kept} | backfilled: {filled} | still missing: {missing}")

if __name__ == "__main__":
    main()
