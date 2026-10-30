import { useEffect, useId, useMemo, useState } from "react";

// Mini-carte des pays d'un théâtre : SVG pur (projection Mercator maison), sans tuiles
// ni librairie de carte => léger, rapide, et rendu identique au thème de la page.
// Données : GET /country-outlines?countries=A&countries=B (voir main.py).

const API = process.env.REACT_APP_API_URL;
const W = 480;
const H = 360; // ratio 4:3, identique à `aspect-ratio` de .tp-map

const cache = new Map(); // names.join("|") -> Promise<payload>

function fetchOutlines(names) {
  const key = names.join("|");
  if (!cache.has(key)) {
    const qs = new URLSearchParams();
    names.forEach((n) => qs.append("countries", n));
    const p = fetch(`${API}/country-outlines?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        cache.delete(key); // on pourra réessayer
        throw err;
      });
    cache.set(key, p);
  }
  return cache.get(key);
}

const rad = (deg) => (deg * Math.PI) / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-80, Math.min(80, lat))) / 2));

// bbox [minx, miny, maxx, maxy] en degrés -> projection vers le repère SVG (W x H).
function makeProjection([minx, miny, maxx, maxy]) {
  const x0 = rad(minx), x1 = rad(maxx);
  const y0 = mercY(miny), y1 = mercY(maxy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let w = Math.max((x1 - x0) * 1.2, 0.02);
  let h = Math.max((y1 - y0) * 1.2, 0.02);
  if (w / h > W / H) h = (w * H) / W;
  else w = (h * W) / H;
  const scale = W / w;
  const left = cx - w / 2;
  const top = cy + h / 2;
  const project = ([lon, lat]) => [(rad(lon) - left) * scale, (top - mercY(lat)) * scale];
  return { project, left, top, w, h, scale };
}

const deg = (r) => (r * 180) / Math.PI;
const invMercY = (y) => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
const NICE_STEPS = [0.5, 1, 2, 5, 10, 15, 20, 30];

// Graticule (méridiens / parallèles) : ~4 lignes par axe, pas « rond » adapté à l'échelle.
function graticulePath({ left, top, w, h, scale }) {
  const lonMin = deg(left), lonMax = deg(left + w);
  const latMax = invMercY(top), latMin = invMercY(top - h);
  const target = Math.max(lonMax - lonMin, latMax - latMin) / 4;
  const step = NICE_STEPS.find((s) => s >= target) || 30;
  const d = [];
  for (let i = Math.ceil(lonMin / step); i * step <= lonMax && d.length < 14; i++) {
    const x = (rad(i * step) - left) * scale;
    d.push(`M${x.toFixed(1)} 0V${H}`);
  }
  for (let i = Math.ceil(latMin / step); i * step <= latMax && d.length < 28; i++) {
    const y = (top - mercY(i * step)) * scale;
    d.push(`M0 ${y.toFixed(1)}H${W}`);
  }
  return d.join("");
}

const ring = (coords, project) =>
  coords
    .map((pt, i) => {
      const [x, y] = project(pt);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("") + "Z";

function geometryPath(geometry, project) {
  if (!geometry) return "";
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates
    : [];
  return polys.map((rings) => rings.map((r) => ring(r, project)).join("")).join("");
}

// Point d'ancrage d'une étiquette : centroïde (formule du lacet) du plus grand polygone,
// plus sa largeur à l'écran pour décider si le nom y tient.
function labelAnchor(geometry, project) {
  if (!geometry) return null;
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates
    : [];
  let best = null;
  for (const rings of polys) {
    const pts = (rings[0] || []).map(project);
    if (pts.length < 3) continue;
    let a = 0, cx = 0, cy = 0;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const f = x1 * y2 - x2 * y1;
      a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x1);
    }
    const area = Math.abs(a) / 2;
    if (!area || (best && area <= best.area)) continue;
    best = { area, x: cx / (3 * a), y: cy / (3 * a), w: maxX - minX };
  }
  return best;
}

const LABEL_FS = 12; // taille du texte, en unités du viewBox

// Palette reprise de MapView (fond --ox-bg, rouge des théâtres / tweets MIL, bleu des autres
// tweets). Appliquée en style inline : elle l'emporte sur d'éventuelles règles .tp-map-* du CSS.
const MAP_BG = "#0d1320";
const MAP_RED = "#ED0C0C";
const MAP_BLUE = "#4f9dff";
const MAP_LAND = "#161f31";
const MAP_LAND_STROKE = "#2a3750";
const MAP_GRID = "#1a2438";

// Interpolation linéaire par paliers [[score, valeur], ...] (comme les expressions MapLibre).
const byImportance = (score, stops) => {
  const s = Number.isFinite(Number(score)) ? Number(score) : 1;
  if (s <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (s <= stops[i][0]) {
      const [x0, y0] = stops[i - 1];
      const [x1, y1] = stops[i];
      return y0 + ((s - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return stops[stops.length - 1][1];
};
// Mêmes paliers que tweets-mil / tweets-mil-halo (importance 1 → 3 → 5), rayon agrandi
// car la carte est plus petite que l'écran principal.
const POINT_R = [[1, 3.5], [3, 4.5], [5, 6.5]];
const HALO_W = [[1, 2], [3, 5], [5, 10]];

const POINT_CSS = `
.tp-map-pulse { transform-box: fill-box; transform-origin: center; animation: tp-map-pulse 1.8s ease-out infinite; }
@keyframes tp-map-pulse { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .tp-map-pulse { display: none; } }
`;

/**
 * @param names     noms bruts des pays (WORLD_AREAS.entity_name, ex. theater.COUNTRIES)
 * @param title     titre de la carte (texte alternatif accessible)
 * @param lang      langue de la page ("fr", "en", "es"...) pour la légende
 * @param translate repli de traduction (ex. translateEntity de LangContext)
 * @param href      lien du bouton rond (ex. "/?topic=...")
 * @param linkLabel aria-label du lien
 * @param points    tweets à marquer sur la carte : [{ id, lat, lon, typology, importance }]
 *                  (ex. sources du résumé survolé) ; rendu identique à MapView (MIL rouge, autres bleu)
 *
 * Rend la carte ET la légende (liste des pays) : les noms traduits viennent de l'API
 * (WORLD_AREAS.entity_name_fr / _es), `translate` ne sert qu'en repli.
 */
export default function CountryMap({ names, title, lang, translate, href, linkLabel, points }) {
  const key = (names || []).join("|");
  const uid = useId().replace(/:/g, "");
  const blurId = `tp-blur-${uid}`;
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setState({ status: "loading", data: null });
    fetchOutlines(key.split("|"))
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch(() => !cancelled && setState({ status: "error", data: null }));
    return () => { cancelled = true; };
  }, [key]);

  const paths = useMemo(() => {
    const { data } = state;
    if (!data?.bbox || !data.features?.length) return null;
    const proj = makeProjection(data.bbox);
    const { project } = proj;
    const build = (selected) =>
      data.features
        .filter((f) => !!f.properties?.selected === selected)
        .map((f) => ({ name: f.properties.name, d: geometryPath(f.geometry, project), geometry: f.geometry }))
        .filter((p) => p.d);
    const selected = build(true);

    // Étiquettes : pays sélectionnés du plus grand au plus petit ; on n'affiche un nom que
    // s'il tient dans le pays et ne chevauche pas une étiquette déjà placée.
    const nameOf = (n) => (lang !== "en" && data.names?.[n]?.[lang]) || translate?.(n) || n;
    const placed = [];
    const labels = [];
    selected
      .map((p) => ({ name: p.name, a: labelAnchor(p.geometry, project) }))
      .filter((p) => p.a)
      .sort((p, q) => q.a.area - p.a.area)
      .forEach(({ name, a }) => {
        const text = String(nameOf(name)).toLocaleUpperCase(lang);
        const tw = text.length * LABEL_FS * 0.7;
        if (tw > a.w * 0.9) return;
        const box = [a.x - tw / 2, a.y - LABEL_FS / 2, a.x + tw / 2, a.y + LABEL_FS / 2];
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
        placed.push(box);
        labels.push({ name, text, x: a.x, y: a.y });
      });

    return { land: build(false), selected, labels, grid: graticulePath(proj), project };
  }, [state, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Points des tweets : projetés avec la même projection que les contours ; on ignore
  // ceux qui sortent du cadre (la carte est cadrée sur les pays du théâtre).
  const dots = useMemo(() => {
    if (!paths?.project || !points?.length) return [];
    return points
      .map((p) => {
        const [x, y] = paths.project([p.lon, p.lat]);
        return { id: p.id, x, y, mil: p.typology === "MIL", importance: p.importance };
      })
      .filter((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H)
      .sort((a, b) => (Number(a.importance) || 0) - (Number(b.importance) || 0)); // les plus importants dessus
  }, [paths, points]);

  const translated = state.data?.names;
  const display = (names || []).map(
    (n) => (lang !== "en" && translated?.[n]?.[lang]) || translate?.(n) || n
  );
  const caption = display.join(", ");

  const Tag = href ? "a" : "div";

  return (
    <>
    {/* la carte est un plus : en cas d'erreur réseau on garde seulement la légende */}
    {state.status !== "error" && (
    <Tag
      className={`tp-map${paths ? "" : " tp-map--loading"}`}
      {...(href ? { href, "aria-label": linkLabel } : {})}
    >
      {paths && (
        <svg
          className="tp-map-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={`${title} : ${caption}`}
        >
          <defs>
            <style>{POINT_CSS}</style>
            <filter id={blurId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
          </defs>
          <rect width={W} height={H} fill={MAP_BG} />
          <path className="tp-map-grid" d={paths.grid} style={{ fill: "none", stroke: MAP_GRID, strokeWidth: 0.5 }} />
          <g className="tp-map-land" style={{ fill: MAP_LAND, stroke: MAP_LAND_STROKE, strokeWidth: 0.6, strokeLinejoin: "round" }}>
            {paths.land.map((p) => <path key={p.name} d={p.d} fillRule="evenodd" />)}
          </g>
          {/* pays du théâtre : aplat rouge léger + contour fin, comme conflict-theaters-fill */}
          <g
            className="tp-map-sel"
            style={{ fill: MAP_RED, fillOpacity: 0.2, stroke: MAP_RED, strokeOpacity: 0.9, strokeWidth: 1, strokeLinejoin: "round" }}
          >
            {paths.selected.map((p) => (
              <path key={p.name} d={p.d} fillRule="evenodd"><title>{p.name}</title></path>
            ))}
          </g>
          <g className="tp-map-labels" aria-hidden="true">
            {paths.labels.map((l) => (
              <text
                key={l.name}
                x={l.x.toFixed(1)}
                y={l.y.toFixed(1)}
                fontSize={LABEL_FS}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: "#dfe5ef", fillOpacity: 0.85, fontWeight: 650, letterSpacing: "0.02em", stroke: MAP_BG, strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" }}
              >
                {l.text}
              </text>
            ))}
          </g>
          {dots.length > 0 && (
            <g className="tp-map-points" aria-hidden="true" pointerEvents="none">
              {dots.map((p) => {
                const cx = p.x.toFixed(1);
                const cy = p.y.toFixed(1);
                const color = p.mil ? MAP_RED : MAP_BLUE;
                const r = p.mil ? byImportance(p.importance, POINT_R) : 5.5;
                return (
                  <g key={p.id}>
                    {/* onde qui s'estompe (comme tweet-highlight-pulse) */}
                    <circle className="tp-map-pulse" cx={cx} cy={cy} r={r + 2} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
                    {p.mil ? (
                      <>
                        {/* halo flou (tweets-mil-halo) puis point blanc cerclé de rouge (tweets-mil) */}
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity="0.6" strokeWidth={byImportance(p.importance, HALO_W)} filter={`url(#${blurId})`} />
                        <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke={color} strokeWidth="1.5" />
                      </>
                    ) : (
                      <circle cx={cx} cy={cy} r={r} fill="rgba(79,157,255,0.18)" stroke={color} strokeOpacity="0.9" strokeWidth="1.5" />
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {/* repères d'angle (pas en bas à droite : occupé par le bouton rond) */}
          <path className="tp-map-ticks" d="M12 26V12H26M454 12H468V26M26 348H12V334" style={{ fill: "none", stroke: "#4a588e", strokeOpacity: 0.7, strokeWidth: 1.2 }} />
        </svg>
      )}
      {href && (
        <span className="tp-map-go" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12 12 4M5.5 4H12v6.5" />
          </svg>
        </span>
      )}
    </Tag>
    )}
    <p className="tp-map-caption">{caption}</p>
    </>
  );
}