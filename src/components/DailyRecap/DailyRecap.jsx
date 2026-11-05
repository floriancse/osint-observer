import { useEffect, useMemo, useState } from "react";
import { IoClose, IoChevronForward, IoCopyOutline, IoArrowUpOutline } from "react-icons/io5";
import { useBootstrap } from "../../context/BootstrapContext";
import { useLang } from "../../context/LangContext";
import TopBar from "../TopBar/TopBar";
import "./DailyRecap.css";

const API = process.env.REACT_APP_API_URL;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MIL_COLOR = "#ED0C0C";   // même rouge que les points MIL de la carte
const OTHER_COLOR = "#4f9dff"; // même bleu que les autres tweets

// ── Pays : point-in-polygon (même logique que MapView.buildCountryIndex) ─────────
const ringContains = (ring, x, y) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const buildCountryIndex = (fc) => {
  const list = [];
  for (const f of fc?.features ?? []) {
    const name = f.properties?.name;
    const g = f.geometry;
    if (!name || !g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polys) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of rings[0]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      list.push({ name, bbox: [minX, minY, maxX, maxY], rings });
    }
  }
  return list;
};

const countryOf = (index, x, y) => {
  for (const p of index) {
    if (x < p.bbox[0] || x > p.bbox[2] || y < p.bbox[1] || y > p.bbox[3]) continue;
    if (ringContains(p.rings[0], x, y) && !p.rings.slice(1).some((h) => ringContains(h, x, y))) return p.name;
  }
  return null;
};

// ── Fond de carte « matrice de points » (projection équirectangulaire, 1° = 1 unité) ──
const LAT_MAX = 80;
const LAT_MIN = -58;
const VIEWBOX = `-180 ${-LAT_MAX} 360 ${LAT_MAX - LAT_MIN}`;
const DOT_STEP = 2.6; // espacement des points (degrés) : plus petit = plus dense (et plus lourd)

// Un seul <path> de points (« M x y h0 » + traits arrondis) : bien plus léger que des milliers de <circle>.
const buildDotPath = (index) => {
  let d = "";
  for (let lat = LAT_MAX - DOT_STEP / 2; lat > LAT_MIN; lat -= DOT_STEP) {
    for (let lng = -180 + DOT_STEP / 2; lng < 180; lng += DOT_STEP) {
      if (countryOf(index, lng, lat) !== null) d += `M${lng.toFixed(1)} ${(-lat).toFixed(1)}h0`;
    }
  }
  return d;
};

const isVerified = (p) => p?.verified === true || p?.verified === "true";
const isMil = (p) => p?.conflict_typology === "MIL";

// asPage : page autonome /content/<lang>/brief (topbar, sans croix ni Échap) ;
// sinon : calque plein écran fermable avec `onClose`.
export default function DailyRecap({ onClose, asPage = false }) {
  const { t, dateLocale, lang } = useLang();
  const { data, loading } = useBootstrap();
  const [countries, setCountries] = useState(null);
  const [countriesFailed, setCountriesFailed] = useState(false);
  // Résumé global : undefined = chargement, null = indisponible / vide, objet = données
  const [daily, setDaily] = useState(undefined);
  const r = t.recap;
  const close = onClose ?? (() => { window.location.href = "/"; });
  const Title = asPage ? "h1" : "h2";
  const langCode = String(lang || dateLocale || "en").slice(0, 2).toLowerCase();

  // Échap ferme la page
  useEffect(() => {
    if (asPage) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, asPage]);

  // Contours des pays : chargés seulement à l'ouverture de la page
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/countries`)
      .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then((fc) => { if (!cancelled) setCountries(fc); })
      .catch(() => { if (!cancelled) setCountriesFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Résumé global du jour (généré par llm_global_summary.py) : chargé à l'ouverture
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/daily-summary`)
      .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then((d) => { if (!cancelled) setDaily(d?.date ? d : null); })
      .catch(() => { if (!cancelled) setDaily(null); });
    return () => { cancelled = true; };
  }, []);

  // Texte dans la langue de l'interface, repli sur l'anglais
  const dailyText = useMemo(() => {
    const tr = daily?.translations;
    return tr ? tr[langCode] || tr.en || null : null;
  }, [daily, langCode]);

  // Le résumé couvre la veille : on affiche sa date (sans mot à traduire)
  const dailyDate = useMemo(() => {
    if (!daily?.date) return "";
    const d = new Date(`${daily.date}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? daily.date
      : d.toLocaleDateString(dateLocale, { day: "numeric", month: "long" });
  }, [daily, dateLocale]);

  // Événements des dernières 24 h (le bootstrap lite couvre déjà cette fenêtre)
  const events = useMemo(() => {
    const since = Date.now() - WINDOW_MS;
    return (data?.tweets?.features ?? []).filter((f) => {
      const ms = Date.parse(f.properties?.created_at);
      return Number.isFinite(ms) && ms >= since && f.geometry?.type === "Point";
    });
  }, [data]);

  const countryIndex = useMemo(() => (countries ? buildCountryIndex(countries) : null), [countries]);
  const dotPath = useMemo(() => (countryIndex ? buildDotPath(countryIndex) : ""), [countryIndex]);

  const stats = useMemo(() => {
    let verified = 0, military = 0;
    const touched = new Set();
    for (const f of events) {
      if (isVerified(f.properties)) verified++;
      if (isMil(f.properties)) military++;
      if (countryIndex) {
        const [x, y] = f.geometry.coordinates;
        const c = countryOf(countryIndex, x, y);
        if (c) touched.add(c);
      }
    }
    return {
      total: events.length,
      verified,
      military,
      other: events.length - military,
      countries: countryIndex ? touched.size : null,
    };
  }, [events, countryIndex]);

  const ready = !loading && Boolean(data);
  const fmt = (n) => (!ready || n == null ? "…" : n.toLocaleString(dateLocale));
  const dateLabel = new Date().toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      className="recap"
      role={asPage ? undefined : "dialog"}
      aria-modal={asPage ? undefined : "true"}
      aria-labelledby="recap-title"
    >
      {asPage ? (
        <TopBar variant="bar" active="brief" />
      ) : (
        <button type="button" className="recap-close" onClick={close} aria-label={r.close} title={r.close}>
          <IoClose size={20} aria-hidden="true" />
        </button>
      )}

      <div className="recap-page">
        {/* Fil d'Ariane (inutile en page : la topbar fait office de navigation) */}
        {!asPage && (
          <nav className="recap-crumbs" aria-label="breadcrumb">
            <button type="button" className="recap-crumb" onClick={close}>{r.crumbMap}</button>
            <IoChevronForward size={12} aria-hidden="true" />
            <span className="recap-crumb recap-crumb--current">{r.crumbBrief}</span>
          </nav>
        )}

        <div className="recap-top">
          {/* Gauche : titre + texte */}
          <header className="recap-head">
            <p className="recap-mono recap-kicker">{r.kicker} • {dateLabel}</p>
            <Title id="recap-title" className="recap-title">{r.title}</Title>
            <p className="recap-meta">{r.meta}</p>
            <div className="recap-body">
              {daily === undefined ? (
                <div aria-hidden="true">
                  <div className="recap-skel" />
                  <div className="recap-skel" />
                  <div className="recap-skel recap-skel--short" />
                </div>
              ) : dailyText ? (
                <>
                  <p>{dailyText.summary}</p>
                  {dailyDate && <p className="recap-mono recap-body-date">{dailyDate}</p>}
                </>
              ) : (
                <p>{r.body}</p> // repli : texte statique si aucun résumé n'est disponible
              )}
            </div>
            <div className="recap-actions">
              <button type="button" className="recap-btn recap-btn--primary" onClick={close}>
                {r.openMap}
              </button>
              <button type="button" className="recap-btn recap-btn--ghost">
                <IoCopyOutline size={15} aria-hidden="true" /> {r.copyThread}
              </button>
              <button type="button" className="recap-btn recap-btn--link">
                {r.fullReport} <IoArrowUpOutline size={13} style={{ transform: "rotate(45deg)" }} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Droite : carte de chiffres */}
          <aside className="recap-card" aria-label={r.cardTitle}>
            <div className="recap-card-top">
              <span className="recap-mono">{r.cardTitle}</span>
              <span className="recap-mono">{r.cardWindow}</span>
            </div>
            <div className="recap-big">
              <strong>{fmt(stats.total)}</strong>
              <span>{r.inCountries(stats.countries == null || !ready ? "…" : stats.countries.toLocaleString(dateLocale))}</span>
            </div>
            <div className="recap-cols">
              <div className="recap-col">
                <span className="recap-col-label"><i className="recap-sym recap-sym--verified" />{r.verified}</span>
                <b>{fmt(stats.verified)}</b>
              </div>
              <div className="recap-col">
                <span className="recap-col-label"><i className="recap-sym recap-sym--mil" />{r.military}</span>
                <b>{fmt(stats.military)}</b>
              </div>
              <div className="recap-col">
                <span className="recap-col-label"><i className="recap-sym recap-sym--other" />{r.other}</span>
                <b>{fmt(stats.other)}</b>
              </div>
            </div>
            <ul className="recap-rows">
              {r.rows.map((label) => (
                <li key={label}><span>{label}</span><b className="recap-mono-num">0</b></li>
              ))}
            </ul>
          </aside>
        </div>

        {/* Carte 2D statique : aucun survol, aucun clic, aucune popup */}
        <figure className="recap-mapwrap">
          <div className="recap-map" aria-hidden="true">
            <svg viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
              <path d={dotPath} className="recap-dots" />
              {events.map((f, i) => {
                const [x, y] = f.geometry.coordinates;
                if (y > LAT_MAX || y < LAT_MIN) return null;
                const mil = isMil(f.properties);
                return (
                  <g key={f.properties?.id ?? i}>
                    <circle cx={x} cy={-y} r={1.5} fill={mil ? MIL_COLOR : OTHER_COLOR} fillOpacity={0.85} />
                    {isVerified(f.properties) && (
                      <circle cx={x} cy={-y} r={2.5} fill="none" stroke="#fff" strokeWidth={0.45} strokeOpacity={0.9} />
                    )}
                  </g>
                );
              })}
            </svg>
            {countriesFailed && <p className="recap-map-note">{r.mapUnavailable}</p>}
          </div>
          <figcaption className="recap-caption">
            <span className="recap-mono">{r.mapCaption}</span>
          </figcaption>
        </figure>

        {/* Points clés du résumé global, sous la carte */}
        {dailyText?.key_points?.length > 0 && (
          <ul className="recap-points recap-points--page">
            {dailyText.key_points.map((kp, i) => (
              <li key={i}>
                {kp.theme && <span className="recap-mono recap-point-theme">{kp.theme}</span>}
                <span>{kp.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}