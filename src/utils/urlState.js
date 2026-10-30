// Permalinks : (dé)sérialisation de l'état de l'appli dans l'URL.
//
// Paramètres :
//   from, to   période (ISO UTC, ex: 2026-09-24T00:00:00Z)
//   weapon     type d'arme (répétable)
//   obj        type d'objectif (répétable)
//   topic      label / théâtre actif
//   q          recherche texte
//   rect       rectangle tracé : minLng,minLat,maxLng,maxLat
//   tweet      id du tweet sélectionné
//   view       vue de la carte : lat,lng,zoom
//
// L'URL est lue UNE SEULE FOIS au démarrage (readUrlState est mémoïsé),
// puis écrite en continu via history.replaceState (pas d'entrée d'historique).

const round = (n, d) => Number(n.toFixed(d));

function parseNumbers(str, expected) {
  if (!str) return null;
  const nums = str.split(",").map(Number);
  if (nums.length !== expected || nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function rectangleFromBBox([minLng, minLat, maxLng, maxLat]) {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

function rectangleToBBoxArray(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return null;
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

let cached = null;

export function readUrlState() {
  if (cached) return cached;
  const p = new URLSearchParams(window.location.search);

  let from = parseDate(p.get("from"));
  let to = parseDate(p.get("to"));
  if (!from || !to || new Date(from) > new Date(to)) {
    from = null;
    to = null;
  }

  const bbox = parseNumbers(p.get("rect"), 4);
  const view = parseNumbers(p.get("view"), 3); // lat,lng,zoom

  cached = {
    from,
    to,
    weapons: p.getAll("weapon"),
    objectives: p.getAll("obj"),
    label: p.get("topic") || null,
    search: p.get("q") || "",
    rectangle: bbox ? rectangleFromBBox(bbox) : null,
    tweetId: p.get("tweet") || null,
    view: view ? { center: [view[1], view[0]], zoom: view[2] } : null,
  };
  return cached;
}

export const hasUrlTimeRange = () => {
  const s = readUrlState();
  return Boolean(s.from && s.to);
};

// encodeURIComponent, mais en gardant ":" et "," lisibles dans l'URL
const enc = (v) => encodeURIComponent(v).replace(/%3A/g, ":").replace(/%2C/g, ",");

export function buildSearch({ timeRange, weapons, objectives, label, search, rectangle, tweetId, view }) {
  const parts = [];
  const add = (k, v) => parts.push(`${k}=${enc(v)}`);

  if (timeRange?.start && timeRange?.end) {
    const iso = (s) => new Date(s).toISOString().slice(0, 19) + "Z";
    add("from", iso(timeRange.start));
    add("to", iso(timeRange.end));
  }
  (weapons || []).forEach((w) => add("weapon", w));
  (objectives || []).forEach((o) => add("obj", o));
  if (label) add("topic", label);
  if (search?.trim()) add("q", search.trim());

  const bbox = rectangleToBBoxArray(rectangle);
  if (bbox) add("rect", bbox.map((n) => round(n, 4)).join(","));

  if (tweetId) add("tweet", String(tweetId));
  if (view) add("view", [round(view.center[1], 3), round(view.center[0], 3), round(view.zoom, 2)].join(","));

  return parts.length ? `?${parts.join("&")}` : "";
}

export function writeSearchToUrl(search) {
  const next = `${window.location.pathname}${search}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  // On conserve history.state (un routeur peut y stocker des données).
  if (next !== current) window.history.replaceState(window.history.state, "", next);
}