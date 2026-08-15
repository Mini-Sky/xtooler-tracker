/* xTooler_Tracker MVP demo
   Map + 3 pin types + clustering + card + log + filters
   UX pass: loading overlay, geo auto-locate, welcome/legend, selected-pin
   highlight, hover tooltip, image lightbox, ESC / outside-click dismissal. */

const COLORS = { machine: "#00c601", creation: "#ff9a3d", event: "#4da3ff" };
const TYPE_LABEL = { machine: "MACHINE", creation: "CREATION", event: "EVENT" };
const CITY_ZOOM = 9;          // below: city badges; at/above: individual pins
const CITY_MERGE_DEG = 0.25;  // merge venue/city labels within ~25km

const state = {
  pins: [],
  activeTypes: new Set(["machine", "creation", "event"]),
  model: "",
  card: { pin: null, mediaIdx: 0 },
  pendingUrl: null,
  geo: null, // {lat,lng} once resolved
};

const $ = (id) => document.getElementById(id);

/* ================= i18n (plan 1: data-i18n + JSON dictionaries) ================= */
const I18N = { lang: "en", dict: {}, fallback: {} };
const LOCALES = { en: "en-US", zh: "zh-CN", de: "de-DE" };

function detectLang() {
  const saved = localStorage.getItem("xt_lang");
  if (saved && LOCALES[saved]) return saved;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("de")) return "de";
  return "en";
}

async function loadLang(lang) {
  if (!Object.keys(I18N.fallback).length) {
    I18N.fallback = await fetch("i18n/en.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
  }
  I18N.dict = lang === "en"
    ? I18N.fallback
    : await fetch(`i18n/${lang}.json`, { cache: "no-store" }).then(r => r.json()).catch(() => I18N.fallback);
  I18N.lang = lang;
  document.documentElement.lang = lang;
}

function t(key) {
  return I18N.dict[key] ?? I18N.fallback[key] ?? key;
}

function applyStatic() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  // html variant only for our own dictionary strings (self-authored markup)
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
}

async function setLang(lang) {
  localStorage.setItem("xt_lang", lang);
  await loadLang(lang);
  applyStatic();
  renderLog();
  renderCounts();
  if (state.card.pin && !$("pin-card").hidden) openCard(state.card.pin, false); // re-render open card
}

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/dark",
  center: [10, 32],
  zoom: 1.8,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
window.__map = map; // debug handle

/* ================= data ================= */
async function loadPins() {
  const res = await fetch("data/pins.json", { cache: "no-store" });
  const json = await res.json();
  state.pins = json.pins.filter(p => p.status !== "hidden");
}

function filteredPins() {
  return state.pins.filter(p =>
    state.activeTypes.has(p.pinType) &&
    (!state.model || (p.machineModels || []).includes(state.model))
  );
}

/* machine tech-category from model name (careful: "F2 Ultra UV" is a UV *laser*, not the O1 UV printer) */
function machineCategory(models) {
  const s = ((models && models[0]) || "").toLowerCase();
  if (s.includes("o1") || s.includes("omni")) return "uv";
  if (s.includes("apparel")) return "dtf";
  if (s.includes("wonderpress") || s.includes("heat press")) return "press";
  if (s.includes("screen")) return "screen";
  return "laser";
}

function pinIconId(p) {
  if (p.pinType === "machine") return "pin-machine-" + machineCategory(p.machineModels);
  return "pin-" + p.pinType;
}

function toGeoJSON(pins) {
  return {
    type: "FeatureCollection",
    features: pins.map(p => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id, pinType: p.pinType, title: p.title,
        icon: pinIconId(p),
        label: p.pinType === "machine" ? ((p.machineModels || [])[0] || "").toUpperCase() : "",
      },
    })),
  };
}

/* ================= runtime canvas pin sprites (no asset files; colors track COLORS) ================= */
const GLYPHS = {
  laser(c) { // downward beam hitting a spark point
    c.beginPath(); c.moveTo(32, 15); c.lineTo(32, 36); c.stroke();
    for (const [dx, dy] of [[-7, -5], [7, -5], [-8, 2], [8, 2]]) {
      c.beginPath(); c.moveTo(32 + dx * 0.45, 40 + dy * 0.45); c.lineTo(32 + dx, 40 + dy); c.stroke();
    }
    c.beginPath(); c.arc(32, 40, 2.6, 0, Math.PI * 2); c.fill();
  },
  uv(c) { // print head + ink droplet
    c.fillRect(23, 15, 18, 9);
    c.beginPath(); c.moveTo(29, 24); c.lineTo(35, 24); c.lineTo(32, 30); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(32, 34); c.quadraticCurveTo(38, 42, 32, 47);
    c.quadraticCurveTo(26, 42, 32, 34); c.fill();
  },
  dtf(c) { // t-shirt
    c.beginPath();
    c.moveTo(25, 16); c.lineTo(17, 24); c.lineTo(22, 30); c.lineTo(25, 27);
    c.lineTo(25, 46) ; c.lineTo(39, 46); c.lineTo(39, 27); c.lineTo(42, 30);
    c.lineTo(47, 24); c.lineTo(39, 16);
    c.quadraticCurveTo(36, 20, 32, 20); c.quadraticCurveTo(28, 20, 25, 16);
    c.closePath(); c.fill();
  },
  press(c) { // top platen pressing down onto base
    c.fillRect(20, 14, 24, 7);
    c.beginPath(); c.moveTo(32, 24); c.lineTo(32, 33); c.stroke();
    c.beginPath(); c.moveTo(27, 30); c.lineTo(32, 36); c.lineTo(37, 30); c.stroke();
    c.fillRect(20, 41, 24, 6);
  },
  screen(c) { // mesh frame + squeegee stroke
    c.strokeRect(20, 16, 24, 19);
    for (const x of [28, 36]) { c.beginPath(); c.moveTo(x, 16); c.lineTo(x, 35); c.stroke(); }
    c.beginPath(); c.moveTo(20, 26); c.lineTo(44, 26); c.stroke();
    c.beginPath(); c.moveTo(22, 44); c.lineTo(42, 44); c.stroke();
  },
  creation(c) { // four-point sparkle
    c.beginPath();
    c.moveTo(32, 13); c.quadraticCurveTo(34, 28, 49, 31); c.quadraticCurveTo(34, 34, 32, 49);
    c.quadraticCurveTo(30, 34, 15, 31); c.quadraticCurveTo(30, 28, 32, 13);
    c.closePath(); c.fill();
  },
  event(c) { // flag on a pole
    c.beginPath(); c.moveTo(24, 14); c.lineTo(24, 48); c.stroke();
    c.beginPath(); c.moveTo(24, 16); c.lineTo(44, 21); c.lineTo(24, 28); c.closePath(); c.fill();
  },
};

function makePinImage(bgColor, glyphFn) {
  const S = 64, ch = 14; // 64px @2x → 32px on map; chamfer 14
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const c = cv.getContext("2d");
  c.beginPath(); // chamfered plate (top-left & bottom-right, matching the UI panels)
  c.moveTo(ch, 2); c.lineTo(S - 2, 2); c.lineTo(S - 2, S - ch);
  c.lineTo(S - ch, S - 2); c.lineTo(2, S - 2); c.lineTo(2, ch);
  c.closePath();
  c.fillStyle = bgColor; c.fill();
  c.lineWidth = 3; c.strokeStyle = "#101413"; c.stroke();
  c.fillStyle = "#ffffff"; c.strokeStyle = "#ffffff";
  c.lineWidth = 3.5; c.lineCap = "round"; c.lineJoin = "round";
  glyphFn(c);
  return c.getImageData(0, 0, S, S);
}

function makePinImages() {
  const imgs = {};
  for (const cat of ["laser", "uv", "dtf", "press", "screen"]) {
    imgs["pin-machine-" + cat] = makePinImage(COLORS.machine, GLYPHS[cat]);
  }
  imgs["pin-creation"] = makePinImage(COLORS.creation, GLYPHS.creation);
  imgs["pin-event"] = makePinImage(COLORS.event, GLYPHS.event);
  return imgs;
}

/* ================= geo locate (#1) ================= */
async function fetchGeo() {
  if (state.geo) return state.geo;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch("https://ipwho.is/", { signal: ctrl.signal });
    const g = await res.json();
    if (g && g.success !== false && typeof g.latitude === "number") {
      state.geo = { lat: g.latitude, lng: g.longitude };
    }
  } catch { /* offline / blocked — keep global view */ }
  clearTimeout(timer);
  return state.geo;
}

async function flyToUser(zoom = 7) {
  const geo = await fetchGeo();
  if (geo) map.flyTo({ center: [geo.lng, geo.lat], zoom, duration: 2200, essential: true });
  return !!geo;
}

/* unified silky pin-to-pin glide: fixed generous duration so nearby hops
   animate instead of snapping; lands deep enough that dots are declustered */
function glideToPin(pin) {
  map.flyTo({
    center: [pin.lng, pin.lat],
    zoom: Math.max(map.getZoom(), 11),
    duration: 1100,
    curve: 1.3,
    essential: true,
  });
}

/* ================= map layers ================= */
function addLayers() {
  map.addSource("pins", {
    type: "geojson",
    data: toGeoJSON(filteredPins()),
    cluster: true,
    clusterRadius: 30,
    clusterMaxZoom: 9, // fully declustered from z10 — badge/log landings show real dots
  });
  map.addSource("selected", { type: "geojson", data: toGeoJSON([]) });

  map.addSource("spider-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "spider-lines",
    type: "line",
    source: "spider-lines",
    paint: { "line-color": "rgba(220,232,242,.45)", "line-width": 1 },
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "pins",
    minzoom: CITY_ZOOM,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#1c2321",
      "circle-stroke-color": "#00c601",
      "circle-stroke-width": 2,
      "circle-radius": ["step", ["get", "point_count"], 17, 5, 21, 10, 27],
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "pins",
    minzoom: CITY_ZOOM,
    filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
    paint: { "text-color": "#dce8f2" },
  });

  // selected-pin highlight ring (#4) — under the dots
  map.addLayer({
    id: "selected-ring",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 15,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "selected-glow",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 22,
      "circle-color": ["match", ["get", "pinType"],
        "machine", COLORS.machine, "creation", COLORS.creation, COLORS.event],
      "circle-opacity": 0.25,
    },
  }, "selected-ring");

  // cluster transition band only (z9–10): plain color dots while clusters still exist
  map.addLayer({
    id: "pin-glow",
    type: "circle",
    source: "pins",
    minzoom: CITY_ZOOM,
    maxzoom: 10,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 13, 10, 15],
      "circle-color": ["match", ["get", "pinType"],
        "machine", COLORS.machine, "creation", COLORS.creation, COLORS.event],
      "circle-opacity": 0.25,
    },
  });
  map.addLayer({
    id: "pin-dot",
    type: "circle",
    source: "pins",
    minzoom: CITY_ZOOM,
    maxzoom: 10,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 10, 7],
      "circle-color": ["match", ["get", "pinType"],
        "machine", COLORS.machine, "creation", COLORS.creation, COLORS.event],
      "circle-stroke-color": "#0d1117",
      "circle-stroke-width": 1.5,
    },
  });

  // close zoom (z≥12): chamfered glyph plates rendered at runtime from canvas
  const pinImages = makePinImages();
  for (const [id, img] of Object.entries(pinImages)) {
    if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
  }
  map.addLayer({
    id: "pin-icons",
    type: "symbol",
    source: "pins",
    minzoom: 10, // matches the decluster point — badge landings (z10.2+) arrive on icons
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.72, 15, 1.1],
      "icon-allow-overlap": true,
    },
  });
  map.addLayer({
    id: "pin-labels",
    type: "symbol",
    source: "pins",
    minzoom: 11.5,
    filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "label"], ""]],
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-offset": [0, 2.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": "#e2ece7",
      "text-halo-color": "#101413",
      "text-halo-width": 1.6,
    },
  });

  // cluster click: small groups fan out in place (plan B), big ones zoom
  map.on("click", "clusters", async (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
    const src = map.getSource("pins");
    const count = f.properties.point_count;
    if (count <= 12) {
      const leaves = await src.getClusterLeaves(f.properties.cluster_id, count, 0);
      spiderfy(f.geometry.coordinates, leaves.map(l => state.pins.find(p => p.id === l.properties.id)).filter(Boolean));
    } else {
      const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom });
    }
  });
  for (const layer of ["pin-dot", "pin-icons"]) {
    map.on("click", layer, (e) => {
      const id = e.features[0].properties.id;
      const pin = state.pins.find(p => p.id === id);
      if (pin) openCard(pin, true);
    });
  }
  // click on empty map dismisses spider legs, then the card (#5)
  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ["pin-dot", "pin-icons", "clusters"] });
    if (hits.length === 0) {
      if (state.spider.legs.length) unspiderfy();
      else closeCard();
    }
  });
  map.on("zoomstart", unspiderfy);
  map.on("dragstart", unspiderfy);
  map.on("zoom", updateBadgeVisibility);
  map.on("moveend", () => { if (map.getZoom() < CITY_ZOOM) cullBadges(); });

  // hover tooltip (#6)
  const tip = $("pin-tooltip");
  for (const layer of ["pin-dot", "pin-icons"]) {
    map.on("mousemove", layer, (e) => {
      const f = e.features[0];
      $("tip-text").textContent = f.properties.title;
      $("tip-dot").style.background = COLORS[f.properties.pinType];
      $("tip-dot").style.boxShadow = `0 0 6px ${COLORS[f.properties.pinType]}`;
      tip.hidden = false;
      const x = Math.min(e.point.x + 14, window.innerWidth - 280);
      tip.style.left = x + "px";
      tip.style.top = (e.point.y - 14) + "px";
    });
    map.on("mouseleave", layer, () => { tip.hidden = true; });
  }

  for (const layer of ["clusters", "pin-dot", "pin-icons"]) {
    map.on("mouseenter", layer, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", layer, () => map.getCanvas().style.cursor = "");
  }

  renderCityBadges(); // plan A: initial badge pass once layers/sources exist
}

function setSelected(pin) {
  const src = map.getSource("selected");
  if (src) src.setData(toGeoJSON(pin ? [pin] : []));
}

function refreshSource() {
  const src = map.getSource("pins");
  if (src) src.setData(toGeoJSON(filteredPins()));
  unspiderfy();
  renderCityBadges();
  renderLog();
  renderCounts();
}

/* ================= city badges (plan A) ================= */
state.badges = [];   // [{marker, el, city}]
state.spider = { legs: [], anchor: null };

function buildCityIndex() {
  // group by displayLocation, then merge groups whose centroids sit within ~25km
  const byLabel = new Map();
  for (const p of filteredPins()) {
    const g = byLabel.get(p.displayLocation) || { pins: [] };
    g.pins.push(p);
    byLabel.set(p.displayLocation, g);
  }
  const groups = [...byLabel.entries()].map(([label, g]) => ({
    label,
    lat: g.pins.reduce((s, p) => s + p.lat, 0) / g.pins.length,
    lng: g.pins.reduce((s, p) => s + p.lng, 0) / g.pins.length,
    pins: g.pins,
  }));
  const merged = [];
  for (const g of groups.sort((a, b) => b.pins.length - a.pins.length)) {
    const host = merged.find(m =>
      Math.abs(m.lat - g.lat) < CITY_MERGE_DEG && Math.abs(m.lng - g.lng) < CITY_MERGE_DEG);
    if (host) host.pins.push(...g.pins);
    else merged.push({ ...g, pins: [...g.pins] });
  }
  for (const m of merged) {
    m.lat = m.pins.reduce((s, p) => s + p.lat, 0) / m.pins.length;
    m.lng = m.pins.reduce((s, p) => s + p.lng, 0) / m.pins.length;
    m.name = m.label.split(",")[0].toUpperCase();
    m.counts = { machine: 0, creation: 0, event: 0 };
    m.pins.forEach(p => m.counts[p.pinType]++);
  }
  return merged;
}

function renderCityBadges() {
  for (const b of state.badges) b.marker.remove();
  state.badges = [];
  if (!map.getSource("pins")) return; // map not ready yet — badges added after layers
  for (const city of buildCityIndex()) {
    const el = document.createElement("button");
    el.className = "city-badge";
    el.setAttribute("aria-label", `${city.name}: ${city.pins.length} items`);
    const name = document.createElement("span");
    name.className = "cb-name"; name.textContent = city.name;
    const count = document.createElement("span");
    count.className = "cb-count"; count.textContent = city.pins.length;
    const dots = document.createElement("span");
    dots.className = "cb-dots";
    for (const t of ["machine", "creation", "event"]) {
      if (!city.counts[t]) continue;
      const d = document.createElement("span");
      d.className = "cb-dot"; d.style.background = COLORS[t];
      dots.appendChild(d);
    }
    el.append(name, count, dots);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      // fit the city's actual pin spread so every dot lands in view, declustered
      const b = new maplibregl.LngLatBounds();
      city.pins.forEach(p => b.extend([p.lng, p.lat]));
      const cam = map.cameraForBounds(b, { padding: 90, maxZoom: 12 });
      const zoom = Math.max(cam ? cam.zoom : 11, 10.8); // land inside the icon band (≥10.5)
      map.flyTo({ center: cam ? cam.center : [city.lng, city.lat], zoom, duration: 1400, essential: true });
      map.once("moveend", showFraming); // B3: laser frames the area on arrival
    });
    const marker = new maplibregl.Marker({ element: el }).setLngLat([city.lng, city.lat]).addTo(map);
    state.badges.push({ marker, el, city });
  }
  updateBadgeVisibility();
}

function updateBadgeVisibility() {
  const show = map.getZoom() < CITY_ZOOM;
  for (const b of state.badges) b.el.style.display = show ? "" : "none";
  if (show) cullBadges();
}

function cullBadges() {
  // greedy collision culling: bigger cities win, losers shrink to presence dots
  const placed = [];
  const sorted = [...state.badges].sort((a, b) => b.city.pins.length - a.city.pins.length);
  for (const b of sorted) {
    const pt = map.project([b.city.lng, b.city.lat]);
    const w = b.city.name.length * 7 + 46, h = 26;
    const box = { l: pt.x - w / 2, r: pt.x + w / 2, t: pt.y - h / 2, b: pt.y + h / 2 };
    const collides = placed.some(o => !(box.r < o.l || box.l > o.r || box.b < o.t || box.t > o.b));
    b.el.classList.toggle("min", collides);
    if (!collides) placed.push(box);
  }
}

/* ================= spiderfy (plan B) ================= */
function spiderfy(centerLngLat, pins) {
  unspiderfy();
  if (!pins.length) return;
  const centerPx = map.project(centerLngLat);
  const n = pins.length;
  const positions = [];
  if (n <= 9) {                       // single ring
    const r = 38 + n * 2;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      positions.push({ x: centerPx.x + r * Math.cos(a), y: centerPx.y + r * Math.sin(a) });
    }
  } else {                            // spiral
    let angle = 0, radius = 30;
    for (let i = 0; i < n; i++) {
      positions.push({ x: centerPx.x + radius * Math.cos(angle), y: centerPx.y + radius * Math.sin(angle) });
      angle += 2.4 / Math.sqrt(radius / 30);
      radius += 7;
    }
  }
  const lines = [];
  pins.forEach((pin, i) => {
    const ll = map.unproject([positions[i].x, positions[i].y]);
    const el = document.createElement("button");
    el.className = "spider-leg";
    el.style.background = COLORS[pin.pinType];
    el.setAttribute("aria-label", pin.title);
    el.addEventListener("click", (e) => { e.stopPropagation(); openCard(pin, false); });
    el.addEventListener("mouseenter", (e) => {
      const tip = $("pin-tooltip");
      $("tip-text").textContent = pin.title;
      $("tip-dot").style.background = COLORS[pin.pinType];
      tip.hidden = false;
      const rect = el.getBoundingClientRect();
      tip.style.left = Math.min(rect.right + 8, innerWidth - 280) + "px";
      tip.style.top = (rect.top - 4) + "px";
    });
    el.addEventListener("mouseleave", () => { $("pin-tooltip").hidden = true; });
    const marker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
    state.spider.legs.push(marker);
    lines.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[centerLngLat[0] ?? centerLngLat.lng, centerLngLat[1] ?? centerLngLat.lat], [ll.lng, ll.lat]] },
    });
  });
  const src = map.getSource("spider-lines");
  if (src) src.setData({ type: "FeatureCollection", features: lines });
  state.spider.anchor = centerLngLat;
}

/* ================= B3: framing preview ================= */
function showFraming() {
  document.querySelector(".framing-box")?.remove();
  const box = document.createElement("div");
  box.className = "framing-box";
  box.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}

/* ================= C3: job-done chime (WebAudio, no asset) ================= */
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [[880, 0], [1318.5, 0.09]];
    for (const [freq, at] of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + at + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + at);
      osc.stop(audioCtx.currentTime + at + 0.4);
    }
  } catch { /* audio unavailable — stay silent */ }
}

/* ================= C1 + C2: easter eggs ================= */
function runEngraveEgg() {
  const egg = $("egg-engrave");
  if (!egg.hidden) return;
  egg.classList.remove("out");
  egg.hidden = false;
  setTimeout(chime, 2400);
  setTimeout(() => egg.classList.add("out"), 3200);
  setTimeout(() => { egg.hidden = true; egg.classList.remove("out"); }, 3900);
}

function initEggs() {
  // C1: 5 quick clicks on the logo, or typing "xtool"
  let clicks = [];
  $("brand-logo-hit").addEventListener("click", () => {
    const now = Date.now();
    clicks = clicks.filter(ts => now - ts < 3000);
    clicks.push(now);
    if (clicks.length >= 5) { clicks = []; runEngraveEgg(); }
  });
  let keyBuf = "";
  document.addEventListener("keydown", (e) => {
    if (e.key.length !== 1) return;
    keyBuf = (keyBuf + e.key.toLowerCase()).slice(-5);
    if (keyBuf === "xtool") { keyBuf = ""; runEngraveEgg(); }
  });

  // C2: double-click leaves a brief laser burn mark, anchored to the map
  map.on("dblclick", (e) => {
    const el = document.createElement("div");
    el.className = "burn-mark";
    const marker = new maplibregl.Marker({ element: el }).setLngLat(e.lngLat).addTo(map);
    setTimeout(() => marker.remove(), 3000);
  });
}

/* ================= B4: engraving reveal on image load ================= */
function initEngraveReveal() {
  const pairs = [["card-img", "card-engrave-line"], ["lb-img", "lb-engrave-line"]];
  for (const [imgId, lineId] of pairs) {
    $(imgId).addEventListener("load", () => {
      const img = $(imgId), line = $(lineId);
      img.classList.remove("engrave"); line.classList.remove("run");
      void img.offsetWidth;
      img.classList.add("engrave"); line.classList.add("run");
    });
  }
}

function unspiderfy() {
  if (!state.spider || !state.spider.legs.length) return;
  for (const m of state.spider.legs) m.remove();
  state.spider.legs = [];
  state.spider.anchor = null;
  const src = map.getSource("spider-lines");
  if (src) src.setData({ type: "FeatureCollection", features: [] });
  $("pin-tooltip").hidden = true;
}

/* ================= filters ================= */
function initFilters() {
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const t = chip.dataset.type;
      if (state.activeTypes.has(t)) { state.activeTypes.delete(t); chip.classList.remove("active"); }
      else { state.activeTypes.add(t); chip.classList.add("active"); }
      refreshSource();
    });
  });

  const models = [...new Set(state.pins.flatMap(p => p.machineModels || []))].sort();
  const sel = $("model-filter");
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m.toUpperCase();
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => { state.model = sel.value; refreshSource(); });
}

function renderCounts() {
  for (const t of ["machine", "creation", "event"]) {
    const n = state.pins.filter(p =>
      p.pinType === t && (!state.model || (p.machineModels || []).includes(state.model))
    ).length;
    $("count-" + t).textContent = n;
  }
}

/* ================= activity log ================= */
function renderLog() {
  const list = $("log-list");
  list.innerHTML = "";
  const pins = filteredPins().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const p of pins) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "log-dot";
    dot.style.background = COLORS[p.pinType];
    dot.style.boxShadow = `0 0 6px ${COLORS[p.pinType]}`;
    const body = document.createElement("div");
    body.className = "log-body";
    const title = document.createElement("div");
    title.className = "log-title";
    title.textContent = p.title;
    const meta = document.createElement("div");
    meta.className = "log-meta";
    meta.textContent = `${p.displayLocation} · ${fmtDate(p.createdAt)}`;
    body.append(title, meta);
    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.style.color = COLORS[p.pinType];
    badge.textContent = t("type." + p.pinType);
    li.append(dot, body, badge);
    li.addEventListener("click", () => {
      openCard(p, true); // glides via the same unified animation as map pin clicks
      if (window.innerWidth <= 640) $("log-panel").hidden = true; // #3 mobile: don't stack panels
    });
    list.appendChild(li);
  }
}

/* ================= pin card ================= */
function openCard(pin, flyTo) {
  state.card = { pin, mediaIdx: 0 };
  $("card-type").textContent = t("type." + pin.pinType);
  $("card-type").style.color = COLORS[pin.pinType];
  const modelsEl = $("card-models");
  modelsEl.innerHTML = "";
  for (const m of pin.machineModels || []) {
    const b = document.createElement("span");
    b.className = "model-badge";
    b.textContent = m.toUpperCase();
    modelsEl.appendChild(b);
  }
  for (const mat of pin.materials || []) {
    const b = document.createElement("span");
    b.className = "material-badge";
    b.textContent = mat.toUpperCase();
    modelsEl.appendChild(b);
  }
  $("card-title").textContent = pin.title;
  $("card-loc").textContent = pin.displayLocation;
  $("card-date").textContent = pin.pinType === "event" && pin.eventDate
    ? t("card.eventPrefix") + fmtDate(pin.eventDate) : fmtDate(pin.createdAt);
  $("card-author").textContent = pin.authorHandle;
  const plat = pin.sourcePlatform || "";
  $("card-platform").textContent =
    plat === "x" ? "X" : plat.includes(".") ? plat : plat ? plat[0].toUpperCase() + plat.slice(1) : "";
  const cta = $("card-cta");
  cta.textContent = pin.pinType === "event" ? t("card.eventDetails") : t("card.viewPost");
  cta.href = pin.sourcePostUrl;
  updateMedia();
  const card = $("pin-card");
  card.hidden = false;
  // retrigger entry animation when switching between pins with the card open
  card.style.animation = "none";
  void card.offsetHeight;
  card.style.animation = "";
  setSelected(pin); // #4
  if (flyTo) glideToPin(pin);
}

function closeCard() {
  $("pin-card").hidden = true;
  setSelected(null);
}

function updateMedia() {
  const { pin, mediaIdx } = state.card;
  $("card-img").src = pin.media[mediaIdx];
  const multi = pin.media.length > 1;
  $("gal-prev").hidden = !multi;
  $("gal-next").hidden = !multi;
}

function stepMedia(dir) {
  const c = state.card;
  if (!c.pin) return;
  c.mediaIdx = (c.mediaIdx + dir + c.pin.media.length) % c.pin.media.length;
  updateMedia();
  if (!$("lightbox").hidden) $("lb-img").src = c.pin.media[c.mediaIdx];
}

function initCard() {
  $("card-close").addEventListener("click", closeCard);
  $("gal-prev").addEventListener("click", (e) => { e.stopPropagation(); stepMedia(-1); });
  $("gal-next").addEventListener("click", (e) => { e.stopPropagation(); stepMedia(1); });

  // image lightbox (#7)
  document.querySelector(".card-media").addEventListener("click", () => {
    const { pin, mediaIdx } = state.card;
    if (!pin) return;
    $("lb-img").src = pin.media[mediaIdx];
    const multi = pin.media.length > 1;
    $("lb-prev").hidden = !multi;
    $("lb-next").hidden = !multi;
    $("lightbox").hidden = false;
  });
  $("lb-close").addEventListener("click", () => $("lightbox").hidden = true);
  $("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("lightbox").hidden = true; });
  $("lb-prev").addEventListener("click", () => stepMedia(-1));
  $("lb-next").addEventListener("click", () => stepMedia(1));

  // safety interstitial on first outbound jump
  $("card-cta").addEventListener("click", (e) => {
    if (localStorage.getItem("xt_safety_ack")) return;
    e.preventDefault();
    state.pendingUrl = e.currentTarget.href;
    $("safety-modal").hidden = false;
  });
  $("safety-cancel").addEventListener("click", () => $("safety-modal").hidden = true);
  $("safety-ok").addEventListener("click", () => {
    localStorage.setItem("xt_safety_ack", "1");
    $("safety-modal").hidden = true;
    chime(); // C3: job done
    if (state.pendingUrl) window.open(state.pendingUrl, "_blank", "noopener,noreferrer");
  });
}

/* ================= panels, modals, dismissal ================= */
function initPanels() {
  const logPanel = $("log-panel");
  $("log-btn").addEventListener("click", () => logPanel.hidden = !logPanel.hidden);
  $("log-close").addEventListener("click", () => logPanel.hidden = true);

  const shareModal = $("share-modal");
  $("share-btn").addEventListener("click", () => shareModal.hidden = false);
  $("share-close").addEventListener("click", () => shareModal.hidden = true);
  $("copy-template").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    await navigator.clipboard.writeText($("share-template").textContent);
    chime(); // C3: job done
    btn.textContent = t("share.copied");
    setTimeout(() => btn.textContent = t("share.copy"), 1500);
  });

  // legend / welcome (#2)
  $("legend-btn").addEventListener("click", () => openLegend("legend.title"));

  // language switcher (i18n plan 1)
  const langSel = $("lang-switch");
  langSel.value = I18N.lang;
  langSel.addEventListener("change", () => setLang(langSel.value));
  $("legend-ok").addEventListener("click", () => {
    localStorage.setItem("xt_welcome_seen", "1");
    $("legend-modal").hidden = true;
  });

  $("locate-btn").addEventListener("click", () => flyToUser(8));

  // click on backdrop closes modals (#5)
  for (const id of ["share-modal", "safety-modal", "legend-modal"]) {
    $(id).addEventListener("click", (e) => {
      if (e.target.id === id) {
        if (id === "legend-modal") localStorage.setItem("xt_welcome_seen", "1");
        $(id).hidden = true;
      }
    });
  }

  // ESC closes topmost layer (#5)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("lightbox").hidden) return void ($("lightbox").hidden = true);
    for (const id of ["share-modal", "safety-modal", "legend-modal"]) {
      if (!$(id).hidden) {
        if (id === "legend-modal") localStorage.setItem("xt_welcome_seen", "1");
        return void ($(id).hidden = true);
      }
    }
    if (state.spider && state.spider.legs.length) return void unspiderfy();
    if (!$("pin-card").hidden) return void closeCard();
    if (!logPanel.hidden) return void (logPanel.hidden = true);
  });
}

function openLegend(titleKey) {
  $("legend-title").textContent = t(titleKey);
  $("legend-modal").hidden = false;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(LOCALES[I18N.lang] || "en-US",
    { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

/* ================= boot (#9 loading, #1 locate, #2 welcome) ================= */
(async function boot() {
  const overlay = $("loading-overlay");
  const mapReady = new Promise(res => map.on("load", res));
  const minDelay = new Promise(res => setTimeout(res, 600));
  const failsafe = new Promise(res => setTimeout(res, 6000)); // never trap the user on the loader

  const geoP = fetchGeo(); // start geo lookup in parallel

  await Promise.all([loadPins(), loadLang(detectLang())]);
  applyStatic();
  initFilters();
  initCard();
  initPanels();
  initEngraveReveal();
  initEggs();
  renderCounts();
  renderLog();

  await Promise.race([Promise.all([mapReady, minDelay]), failsafe]);
  addLayersSafe();

  overlay.classList.add("fade");
  setTimeout(() => overlay.hidden = true, 450);

  // fly to the visitor's area once geo resolves (#1)
  geoP.then(geo => { if (geo) flyToUser(7); });

  // first-visit welcome (#2)
  if (!localStorage.getItem("xt_welcome_seen")) {
    setTimeout(() => openLegend("legend.welcomeTitle"), 700);
  }
})();

function addLayersSafe() {
  if (map.loaded() || map.isStyleLoaded()) { addLayers(); return; }
  map.on("load", addLayers); // failsafe path: style still coming — attach when ready
}
