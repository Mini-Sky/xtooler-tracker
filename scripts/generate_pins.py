# -*- coding: utf-8 -*-
"""Generate demo/data/pins.json from assets/manifest.json.

One pin per machine/creation image; event images grouped by eventName into
gallery pins, then padded with community-meetup pins to enrich the event layer.
Deterministic (seeded) so regeneration is stable.
"""
import json, random, re, sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
random.seed(42)

CITIES = [
    # (city label, lat, lng, country-code)
    ("Seattle, WA, USA", 47.6062, -122.3321, "us"), ("Portland, OR, USA", 45.5152, -122.6784, "us"),
    ("San Francisco, CA, USA", 37.7749, -122.4194, "us"), ("Los Angeles, CA, USA", 34.0522, -118.2437, "us"),
    ("San Diego, CA, USA", 32.7157, -117.1611, "us"), ("Phoenix, AZ, USA", 33.4484, -112.074, "us"),
    ("Denver, CO, USA", 39.7392, -104.9903, "us"), ("Austin, TX, USA", 30.2672, -97.7431, "us"),
    ("Dallas, TX, USA", 32.7767, -96.797, "us"), ("Houston, TX, USA", 29.7604, -95.3698, "us"),
    ("Kansas City, MO, USA", 39.0997, -94.5786, "us"), ("St. Louis, MO, USA", 38.627, -90.1994, "us"),
    ("Chicago, IL, USA", 41.8781, -87.6298, "us"), ("Minneapolis, MN, USA", 44.9778, -93.265, "us"),
    ("Detroit, MI, USA", 42.3314, -83.0458, "us"), ("Columbus, OH, USA", 39.9612, -82.9988, "us"),
    ("Nashville, TN, USA", 36.1627, -86.7816, "us"), ("Atlanta, GA, USA", 33.749, -84.388, "us"),
    ("Charlotte, NC, USA", 35.2271, -80.8431, "us"), ("Raleigh, NC, USA", 35.7796, -78.6382, "us"),
    ("Orlando, FL, USA", 28.5383, -81.3792, "us"), ("Miami, FL, USA", 25.7617, -80.1918, "us"),
    ("Tampa, FL, USA", 27.9506, -82.4572, "us"), ("Philadelphia, PA, USA", 39.9526, -75.1652, "us"),
    ("Pittsburgh, PA, USA", 40.4406, -79.9959, "us"), ("New York, NY, USA", 40.7128, -74.006, "us"),
    ("Boston, MA, USA", 42.3601, -71.0589, "us"), ("Baltimore, MD, USA", 39.2904, -76.6122, "us"),
    ("Salt Lake City, UT, USA", 40.7608, -111.891, "us"), ("Las Vegas, NV, USA", 36.1699, -115.1398, "us"),
    ("Sacramento, CA, USA", 38.5816, -121.4944, "us"), ("Boise, ID, USA", 43.615, -116.2023, "us"),
    ("Toronto, Canada", 43.6532, -79.3832, "ca"), ("Vancouver, Canada", 49.2827, -123.1207, "ca"),
    ("Montreal, Canada", 45.5019, -73.5674, "ca"), ("Calgary, Canada", 51.0447, -114.0719, "ca"),
    ("London, UK", 51.5074, -0.1278, "uk"), ("Manchester, UK", 53.4808, -2.2426, "uk"),
    ("Birmingham, UK", 52.4862, -1.8904, "uk"), ("Dublin, Ireland", 53.3498, -6.2603, "eu"),
    ("Berlin, Germany", 52.52, 13.405, "de"), ("Munich, Germany", 48.1351, 11.582, "de"),
    ("Hamburg, Germany", 53.5511, 9.9937, "de"), ("Cologne, Germany", 50.9375, 6.9603, "de"),
    ("Stuttgart, Germany", 48.7758, 9.1829, "de"), ("Vienna, Austria", 48.2082, 16.3738, "de"),
    ("Zurich, Switzerland", 47.3769, 8.5417, "de"), ("Paris, France", 48.8566, 2.3522, "fr"),
    ("Lyon, France", 45.764, 4.8357, "fr"), ("Amsterdam, Netherlands", 52.3676, 4.9041, "eu"),
    ("Rotterdam, Netherlands", 51.9244, 4.4777, "eu"), ("Brussels, Belgium", 50.8503, 4.3517, "eu"),
    ("Madrid, Spain", 40.4168, -3.7038, "es"), ("Barcelona, Spain", 41.3851, 2.1734, "es"),
    ("Valencia, Spain", 39.4699, -0.3763, "es"), ("Milan, Italy", 45.4642, 9.19, "it"),
    ("Rome, Italy", 41.9028, 12.4964, "it"), ("Copenhagen, Denmark", 55.6761, 12.5683, "eu"),
    ("Stockholm, Sweden", 59.3293, 18.0686, "eu"), ("Oslo, Norway", 59.9139, 10.7522, "eu"),
    ("Warsaw, Poland", 52.2297, 21.0122, "eu"), ("Prague, Czechia", 50.0755, 14.4378, "eu"),
    ("Sydney, Australia", -33.8688, 151.2093, "au"), ("Melbourne, Australia", -37.8136, 144.9631, "au"),
    ("Brisbane, Australia", -27.4698, 153.0251, "au"), ("Auckland, New Zealand", -36.8485, 174.7633, "au"),
]

CN_CITIES = [
    ("深圳", 22.5431, 114.0579), ("广州", 23.1291, 113.2644), ("东莞", 23.0207, 113.7518),
    ("佛山", 23.0218, 113.1219), ("厦门", 24.4798, 118.0894), ("福州", 26.0745, 119.2965),
    ("上海", 31.2304, 121.4737), ("杭州", 30.2741, 120.1551), ("苏州", 31.2989, 120.5853),
    ("南京", 32.0603, 118.7969), ("宁波", 29.8683, 121.544), ("无锡", 31.4912, 120.3119),
    ("北京", 39.9042, 116.4074), ("天津", 39.3434, 117.3616), ("青岛", 36.0671, 120.3826),
    ("济南", 36.6512, 117.1201), ("郑州", 34.7466, 113.6254), ("西安", 34.3416, 108.9398),
    ("成都", 30.5728, 104.0668), ("重庆", 29.563, 106.5516), ("武汉", 30.5928, 114.3055),
    ("长沙", 28.2282, 112.9388), ("合肥", 31.8206, 117.2272), ("昆明", 24.8801, 102.8329),
    ("大连", 38.914, 121.6147), ("沈阳", 41.8057, 123.4315), ("哈尔滨", 45.8038, 126.534),
]
CN_MEETUP_TITLES = [
    "xTooler 线下面基·作品交流会", "激光创作工作坊·新手体验日", "创客市集摆摊招募",
    "开放工作室日·欢迎来看机器", "同城 xTooler 交流聚会", "亲子激光创作体验课",
]

IG_BY_COUNTRY = {
    "de": "https://www.instagram.com/xtool_de/", "fr": "https://www.instagram.com/xtool_france/",
    "es": "https://www.instagram.com/xtool_es/", "it": "https://www.instagram.com/xtool_it/",
    "ca": "https://www.instagram.com/xtool_ca/",
}
IG_DEFAULT = "https://www.instagram.com/xtool.official/"
X_URL = "https://x.com/xToolOfficial"
FB_URL = "https://www.facebook.com/xToolOfficial"

HANDLE_A = ["maker", "laser", "craft", "grain", "spark", "burn", "etch", "forge", "studio", "wood",
            "pixel", "beam", "glow", "cut", "mark", "press", "print", "ink", "shop", "works"]
HANDLE_B = ["lab", "co", "works", "haus", "den", "loft", "shed", "garage", "atelier", "collective",
            "goods", "supply", "andco", "made", "craftco", "designs", "studio", "workshop", "bros", "sis"]

# Known official events -> fixed venue coords (real locations)
EVENT_VENUES = {
    "CES": ("Las Vegas Convention Center, NV, USA", 36.1716, -115.1391, "2026-01-06"),
    "MakerFest Mountain View": ("Mountain View, CA, USA", 37.3894, -122.0819, "2026-04-18"),
    "MakerFest St. Louis": ("St. Louis, MO, USA", 38.6270, -90.1994, "2026-05-17"),
    "MakerFest Shelby": ("Shelby, NC, USA", 35.2924, -81.5357, "2026-06-21"),
    "MakerFest Pensacola": ("Pensacola, FL, USA", 30.4213, -87.2169, "2026-09-12"),
    "Maker Faire Hannover": ("Hannover Congress Centrum, Germany", 52.3778, 9.7681, "2026-08-23"),
    "Maker Faire Bay Area": ("Mare Island, Vallejo, CA, USA", 38.0908, -122.2711, "2026-10-03"),
    "FABTECH": ("McCormick Place, Chicago, IL, USA", 41.8512, -87.6172, "2026-09-08"),
    "GRAPHICS PRO EXPO": ("Long Beach Convention Center, CA, USA", 33.7647, -118.1893, "2026-08-21"),
    "Member's Day": ("Los Angeles, CA, USA", 34.0522, -118.2437, "2026-07-19"),
    "FAB26": ("Boston, MA, USA", 42.3601, -71.0589, "2026-08-03"),
    "TCT": ("国家会展中心, 上海", 31.1932, 121.3013, "2026-09-15"),
}

CN_BY_NAME = {name: (lat, lng) for name, lat, lng in [
    ("深圳", 22.5431, 114.0579), ("广州", 23.1291, 113.2644), ("东莞", 23.0207, 113.7518),
    ("佛山", 23.0218, 113.1219), ("厦门", 24.4798, 118.0894), ("福州", 26.0745, 119.2965),
    ("上海", 31.2304, 121.4737), ("杭州", 30.2741, 120.1551), ("苏州", 31.2989, 120.5853),
    ("南京", 32.0603, 118.7969), ("宁波", 29.8683, 121.544), ("无锡", 31.4912, 120.3119),
    ("北京", 39.9042, 116.4074), ("天津", 39.3434, 117.3616), ("青岛", 36.0671, 120.3826),
    ("济南", 36.6512, 117.1201), ("郑州", 34.7466, 113.6254), ("西安", 34.3416, 108.9398),
    ("成都", 30.5728, 104.0668), ("重庆", 29.563, 106.5516), ("武汉", 30.5928, 114.3055),
    ("长沙", 28.2282, 112.9388), ("合肥", 31.8206, 117.2272), ("昆明", 24.8801, 102.8329),
    ("大连", 38.914, 121.6147), ("沈阳", 41.8057, 123.4315), ("哈尔滨", 45.8038, 126.534),
]}

# IP属地(省级) -> 省会坐标；displayLocation 显示省名（不臆造具体城市）
PROVINCE_COORDS = {
    "广东": (23.1291, 113.2644), "浙江": (30.2741, 120.1551), "江苏": (32.0603, 118.7969),
    "上海": (31.2304, 121.4737), "北京": (39.9042, 116.4074), "四川": (30.5728, 104.0668),
    "湖北": (30.5928, 114.3055), "湖南": (28.2282, 112.9388), "福建": (26.0745, 119.2965),
    "山东": (36.6512, 117.1201), "河南": (34.7466, 113.6254), "陕西": (34.3416, 108.9398),
    "重庆": (29.563, 106.5516), "天津": (39.3434, 117.3616), "安徽": (31.8206, 117.2272),
    "云南": (24.8801, 102.8329), "辽宁": (41.8057, 123.4315), "河北": (38.0428, 114.5149),
    "山西": (37.8706, 112.5489), "江西": (28.6829, 115.8582), "广西": (22.817, 108.3665),
    "贵州": (26.6477, 106.6302), "黑龙江": (45.8038, 126.534), "吉林": (43.8171, 125.3235),
}

def province_city(prov):
    if prov and prov in PROVINCE_COORDS:
        lat, lng = PROVINCE_COORDS[prov]
        return (prov, lat, lng, "cn")
    return None

def city_from_text(*texts):
    """If the content itself names a city, the pin MUST live there (truth beats random)."""
    t = " ".join(x or "" for x in texts)
    for name, (lat, lng) in CN_BY_NAME.items():
        if name in t:
            return (name, lat, lng, "cn")
    for c in CITIES:
        short = c[0].split(",")[0]
        if re.search(r"\b" + re.escape(short) + r"\b", t):
            return c
    return None

MEETUP_TITLES = [
    "xTooler Meetup — show & tell night", "Laser crafts swap meet", "Open workshop day for xToolers",
    "Beginner laser class by local xToolers", "xTooler market pop-up", "Makers brunch: bring your builds",
]

def pick_handle(used):
    while True:
        h = "@" + random.choice(HANDLE_A) + "." + random.choice(HANDLE_B)
        if h not in used:
            used.add(h)
            return h

def rand_date(start="2026-06-01", end="2026-08-10"):
    s = datetime.fromisoformat(start); e = datetime.fromisoformat(end)
    t = s + timedelta(seconds=random.randint(0, int((e - s).total_seconds())))
    return t.strftime("%Y-%m-%dT%H:%M:00Z")

def jitter(lat, lng):
    return round(lat + random.uniform(-0.06, 0.06), 4), round(lng + random.uniform(-0.06, 0.06), 4)

def platform_and_url(country):
    r = random.random()
    if r < 0.72:
        return "instagram", IG_BY_COUNTRY.get(country, IG_DEFAULT)
    if r < 0.88:
        return "x", X_URL
    return "facebook", FB_URL

def source_link(item, fallback_platform, fallback_url):
    """Link to the actual content page the image came from (post/article), never an account page."""
    url = item.get("sourceUrl")
    if not url:
        return fallback_platform, fallback_url
    host = re.sub(r"^www\.", "", re.sub(r"^https?://", "", url).split("/")[0])
    return host, url

MATERIAL_WORDS = ["wood", "acrylic", "leather", "glass", "metal", "slate", "paper", "fabric", "ceramic", "stone"]
PROCESS_WORDS = {"uv": "UV print", "dtf": "DTF print", "screen": "screen print", "press": "heat press",
                 "sublimation": "sublimation"}

def infer_materials(name, desc):
    text = (name + " " + (desc or "")).lower()
    mats = [m for m in MATERIAL_WORDS if m in text]
    for k, v in PROCESS_WORDS.items():
        if k in text:
            mats.append(v)
    return mats[:3] or ["mixed"]

def match_event_venue(event_name, desc):
    text = ((event_name or "") + " " + (desc or "")).lower()
    for key, venue in EVENT_VENUES.items():
        probe = key.lower().replace("makerfest ", "")
        if probe in text or key.lower() in text:
            return key, venue
    return None, None

def main():
    manifest = json.loads((ROOT / "assets" / "manifest.json").read_text(encoding="utf-8"))
    items = manifest["items"]
    cn_path = ROOT / "assets" / "manifest_cn.json"
    if cn_path.exists():
        items = items + json.loads(cn_path.read_text(encoding="utf-8"))["items"]
    # keep only files that actually exist
    items = [it for it in items if (ROOT / "assets" / it["file"]).exists()]
    used_handles = set()
    pins = []
    cities = CITIES[:]
    random.shuffle(cities)
    # weighted city pool: a few maker hotspots absorb most pins (realistic clustering,
    # also gives city badges meaningful counts and spiderfy something to fan out)
    weights = [8] * 6 + [4] * 10 + [2] * 16 + [1] * (len(cities) - 32)

    def next_city():
        return random.choices(cities, weights=weights, k=1)[0]

    cn_weights = [8] * 4 + [4] * 8 + [2] * (len(CN_CITIES) - 12)

    def next_cn_city():
        name, lat, lng = random.choices(CN_CITIES, weights=cn_weights, k=1)[0]
        return (name, lat, lng, "cn")

    # --- machines & creations: one pin per image (strict, no image reuse) ---
    for it in items:
        if it["category"] not in ("machine", "creation"):
            continue
        is_cn = it.get("region") == "cn"
        desc = (it.get("desc") or Path(it["file"]).stem.replace("-", " ")).strip()
        hinted = city_from_text(desc, it.get("eventName")) or province_city(it.get("ipProvince"))
        label, lat0, lng0, country = hinted or (next_cn_city() if is_cn else next_city())
        lat, lng = jitter(lat0, lng0)
        platform, url = source_link(it, *platform_and_url(country))
        pin = {
            "id": f"demo-{it['category'][0]}-{len(pins)+1:03d}",
            "pinType": it["category"],
            "lat": lat, "lng": lng,
            "locationPrecision": random.choice(["city", "city", "city", "neighborhood"]),
            "displayLocation": label,
            "title": desc[:60],
            "media": ["/assets/" + it["file"]],
            "sourcePlatform": platform, "sourcePostUrl": url,
            "authorHandle": (it.get("author") or pick_handle(used_handles)) if is_cn else pick_handle(used_handles),
            "machineModels": [it["model"]] if it.get("model") else [],
            "createdAt": rand_date(),
            "demo": True,
        }
        if it["category"] == "creation":
            pin["materials"] = infer_materials(it["file"], desc)
        pins.append(pin)

    # --- events: group official events by eventName into gallery pins ---
    ev_items = [it for it in items if it["category"] == "event"]
    groups = {}
    for it in ev_items:
        key, venue = match_event_venue(it.get("eventName"), it.get("desc"))
        gkey = key or (it.get("eventName") or "community")
        groups.setdefault(gkey, {"venue": venue, "media": [], "descs": [], "srcs": [], "cn": False})
        groups[gkey]["media"].append("/assets/" + it["file"])
        groups[gkey]["descs"].append(it.get("desc") or "")
        groups[gkey]["srcs"].append(it.get("sourceUrl") or "")
        groups[gkey].setdefault("evnames", []).append(it.get("eventName") or "")
        if it.get("ipProvince") and not groups[gkey].get("prov"):
            groups[gkey]["prov"] = it["ipProvince"]
        if it.get("region") == "cn":
            groups[gkey]["cn"] = True

    ev_media_pool = []  # leftover unique (media, sourceUrl, is_cn, desc) beyond each gallery's 4-media cap
    for gkey, g in groups.items():
        ev_media_pool.extend((m, s, g["cn"], d + " " + n)
                             for m, s, d, n in zip(g["media"][4:], g["srcs"][4:], g["descs"][4:], g["evnames"][4:]))
        if g["venue"]:
            label, lat, lng, date = g["venue"]
            title = f"xTool @ {gkey}" if not gkey.lower().startswith("makerfest") else f"xTool MakerFest Tour — {gkey.split(' ',1)[1]}"
        else:
            hinted = city_from_text(gkey, *g["descs"]) or province_city(g.get("prov"))
            label, lat0, lng0, country = hinted or (next_cn_city() if g["cn"] else next_city())
            lat, lng = jitter(lat0, lng0)
            date = rand_date("2026-08-15", "2026-10-30")[:10]
            title = (g["descs"][0] or gkey)[:60]
        first_src = next((s for s in g["srcs"] if s), "")
        platform, url = source_link({"sourceUrl": first_src}, "instagram",
                                    "https://www.xtool.com/collections/xtool-creative-hub")
        pins.append({
            "id": f"demo-e-{len(pins)+1:03d}", "pinType": "event",
            "lat": round(lat, 4), "lng": round(lng, 4),
            "locationPrecision": "exact", "displayLocation": label,
            "title": title, "media": g["media"][:4],
            "sourcePlatform": platform, "sourcePostUrl": url,
            "authorHandle": "@xtool.official", "machineModels": [],
            "eventDate": date, "createdAt": rand_date("2026-05-01", "2026-08-10"),
            "demo": True,
        })

    # --- community meetups: each consumes ONE unused unique image, never reused ---
    MAX_EVENT_PINS = 60
    def ev_count():
        return sum(1 for p in pins if p["pinType"] == "event")
    mi = 0
    while ev_count() < MAX_EVENT_PINS and ev_media_pool:
        media, src, is_cn, mdesc = ev_media_pool.pop(0)
        platform, url = source_link({"sourceUrl": src}, "facebook", FB_URL)
        hinted = city_from_text(mdesc)
        label, lat0, lng0, country = hinted or (next_cn_city() if is_cn else next_city())
        lat, lng = jitter(lat0, lng0)
        date = rand_date("2026-08-12", "2026-11-15")
        titles = CN_MEETUP_TITLES if is_cn else MEETUP_TITLES
        pins.append({
            "id": f"demo-e-{len(pins)+1:03d}", "pinType": "event",
            "lat": lat, "lng": lng, "locationPrecision": "exact",
            "displayLocation": label,
            "title": titles[mi % len(titles)],
            "media": [media],
            "sourcePlatform": platform, "sourcePostUrl": url,
            "authorHandle": pick_handle(used_handles), "machineModels": [],
            "eventDate": date[:10], "createdAt": rand_date("2026-07-01", "2026-08-10"),
            "demo": True,
        })
        mi += 1

    out = ROOT / "demo" / "data" / "pins.json"
    out.write_text(json.dumps({"pins": pins}, indent=1, ensure_ascii=False), encoding="utf-8")
    by_type = {}
    for p in pins:
        by_type[p["pinType"]] = by_type.get(p["pinType"], 0) + 1
    print(f"wrote {len(pins)} pins -> {out}")
    print("by type:", by_type)

if __name__ == "__main__":
    sys.exit(main())
