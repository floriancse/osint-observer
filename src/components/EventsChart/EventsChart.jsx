import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import { useTime } from "../../context/TimeContext";
import { useLang } from "../../context/LangContext";
import { hasUrlTimeRange } from "../../utils/urlState";
import "./EventsChart.css";

const API = process.env.REACT_APP_API_URL;

// Nombre minimum d'entités visées sur la carte au premier chargement.
// On remonte bucket par bucket (12h) depuis le plus récent jusqu'à
// atteindre ce total (ou jusqu'à épuiser les données disponibles).
const MIN_ENTITIES = 100;

// Durée de chaque bucket du graphique : 12h, soit 1 point par jour.
const BUCKET_HOURS = 12;
const BUCKET_MS = BUCKET_HOURS * 60 * 60 * 1000;

const COLOR_SELECTED = "#5aa2ff";   // = --ox-accent (popupUtils.css)
const COLOR_MUTED = "#8392a7";      // = --ox-muted
const COLOR_GRID = "rgba(255, 255, 255, 0.06)";

// Largeur de l'axe Y : sert aussi à calculer la zone de tracé pour convertir
// la position du doigt/souris en index de bucket (voir indexFromClientX).
const Y_AXIS_WIDTH = 30;

const MOBILE_QUERY = "(max-width: 768px)";

// Sur mobile, on n'affiche que les 7 derniers jours : buckets plus larges,
// donc plus faciles à sélectionner au doigt.
const MOBILE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function CustomTooltip({ active, payload, label }) {
  const { t, dateLocale } = useLang();
  if (!active || !payload || !payload.length) return null;
  const date = payload[0]?.payload?.date;
  const count = payload[0]?.value;
  return (
    <div className="events-chart__tooltip">
      <div className="events-chart__tooltip-date">{date ? formatDateLong(date, dateLocale) : label}</div>
      <div className="events-chart__tooltip-count">{t.eventsCount(count)}</div>
    </div>
  );
}

// Le backend renvoie les dates de bucket sans indicateur de fuseau
// (ex: "2026-07-20T00:00:00"), ce que `new Date(...)` interprète comme une
// heure LOCALE du navigateur. Ces dates sont en réalité en UTC côté backend,
// donc on force l'UTC explicitement pour éviter tout décalage avec
// `timeRange` (qui, lui, vient toujours de `.toISOString()` donc déjà en UTC).
function parseAsUTC(input) {
  if (input instanceof Date) return input;
  if (typeof input === "string" && !/Z$|[+-]\d{2}:?\d{2}$/.test(input)) {
    return new Date(`${input}Z`);
  }
  return new Date(input);
}
function formatDateShort(iso, locale = "fr-FR") {
  const d = parseAsUTC(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}
function formatDateLong(iso, locale = "fr-FR") {
  const d = parseAsUTC(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
// Début exact d'un bucket (utilise la date telle quelle, sans forcer minuit)
function bucketStart(d) {
  return parseAsUTC(d);
}
// Fin exacte d'un bucket : début du bucket suivant, moins 1 ms.
// Utilise d.endDate si le backend le fournit, sinon calcule +24h.
function bucketEnd(point) {
  if (point?.endDate) return parseAsUTC(point.endDate);
  return new Date(parseAsUTC(point.date ?? point).getTime() + BUCKET_MS - 1);
}

// Convertit le rectangle (polygone fermé à 5 points) tracé sur la carte en
// bbox min/max lng/lat, exactement comme isPointInsideRectangle côté MapView.
// Retourne null si aucun rectangle n'est actif.
function rectangleToBBox(rectangleFeature) {
  const ring = rectangleFeature?.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return null;
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

export default function EventsChart({ isOpen, onToggle, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle, selectedCountry }) {
  const { timeRange, setRange, markRangeReady } = useTime();
  const { t, dateLocale, lang } = useLang();
  // La langue n'influence le résultat que s'il y a une recherche active :
  // sans ça, changer de langue ne relance pas de fetch inutile.
  const searchLang = searchText?.trim() ? lang : null;
  const [data, setData] = useState([]);
  const dragStateRef = useRef({ isDragging: false, left: null, right: null });
  const [dragLeft, setDragLeft] = useState(null);
  const [dragRight, setDragRight] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const graphRef = useRef(null);

  // Mobile : graphique plus haut (cible plus grande pour le doigt) et limité
  // aux MOBILE_DAYS derniers jours.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const chartHeight = isMobile ? 110 : 80;

  // Si l'URL fournit déjà une période (permalink), on saute la sélection
  // automatique "MIN_ENTITIES" : UrlStateSync applique la période de l'URL.
  const initialSelectionDone = useRef(hasUrlTimeRange());
  useEffect(() => {
    // NOTE : ce fetch (et surtout le calcul de la plage initiale basé sur
    // MIN_ENTITIES ci-dessous) ne doit PAS dépendre de `isOpen`. EventsChart
    // est monté dès le chargement de l'app (juste masqué visuellement tant
    // que le panneau est fermé) — si on bloque cet effet sur `isOpen`, le
    // SidePanel affiche d'abord un compteur basé sur le timeRange par
    // défaut, puis "saute" au bon chiffre seulement quand l'utilisateur
    // ouvre le panneau. En laissant l'effet tourner dès le montage, la
    // bonne période (et donc le bon compteur partout) est déjà en place au
    // tout premier rendu. Seul l'affichage du graphique lui-même reste
    // conditionné par `isOpen` (voir le JSX plus bas).
    const params = new URLSearchParams({});
    activeWeaponTypes.forEach((t) => params.append('weapon_type', t));
    activeObjectiveTypes.forEach((t) => params.append('objective_type', t));
    if (activeLabel) params.append('label', activeLabel);
    if (searchText?.trim()) {
      params.append('search', searchText.trim());
      // La carte cherche dans la traduction de la langue active + le texte
      // d'origine ; on transmet la langue pour que le graphique fasse pareil.
      params.append('lang', lang);
    }

    // Pays isolé sur la carte (clic sur un pays) : filtré côté serveur sur sa géométrie
    if (selectedCountry) params.append('country', selectedCountry);

    const bbox = rectangleToBBox(spatialRectangle);
    if (bbox) {
      params.append('min_lng', bbox.minLng);
      params.append('min_lat', bbox.minLat);
      params.append('max_lng', bbox.maxLng);
      params.append('max_lat', bbox.maxLat);
    }

    fetch(`${API}/graph_events?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        const events = json.events || [];
        setData(events);

        if (!initialSelectionDone.current && events.length > 0) {
          initialSelectionDone.current = true;

          // Sur mobile, on ne remonte pas au-delà de la fenêtre affichée.
          const mobile = window.matchMedia(MOBILE_QUERY).matches;
          const minTime = mobile
            ? bucketEnd(events[events.length - 1]).getTime() - MOBILE_DAYS * DAY_MS
            : -Infinity;

          let total = 0;
          let fromIdx = events.length - 1;
          for (let i = events.length - 1; i >= 0; i--) {
            if (bucketStart(events[i].date).getTime() < minTime) break;
            total += events[i].count || 0;
            fromIdx = i;
            if (total >= MIN_ENTITIES) break;
          }

          const start = bucketStart(events[fromIdx].date);
          const end = bucketEnd(events[events.length - 1]);
          setRange(start.toISOString(), end.toISOString());
        } else {
          // Rien à poser (période déjà fixée par l'URL, ou aucun événement) : la
          // période en cours est définitive, le compteur peut s'afficher.
          markRangeReady();
        }
      })
      .catch((err) => {
        console.error("Erreur chargement graph_events :", err);
        markRangeReady(); // on garde la période par défaut plutôt que de masquer le compteur
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, searchLang, spatialRectangle, selectedCountry, setRange]);

  const chartData = useMemo(() => {
    const points = data.map((d) => ({
      date: d.date,
      endDate: d.endDate,
      count: d.count,
    }));
    if (!isMobile || points.length === 0) return points;

    const lastEnd = bucketEnd(points[points.length - 1]).getTime();
    const cutoff = lastEnd - MOBILE_DAYS * DAY_MS;
    return points.filter((p) => bucketEnd(p).getTime() > cutoff);
  }, [data, isMobile]);

  const isBucketSelected = useCallback(
    (point) => {
      const bStart = bucketStart(point.date).getTime();
      const bEnd = bucketEnd(point).getTime();
      const rangeStart = new Date(timeRange.start).getTime();
      const rangeEnd = new Date(timeRange.end).getTime();
      return bStart <= rangeEnd && bEnd >= rangeStart;
    },
    [timeRange.start, timeRange.end]
  );

  const finishDrag = useCallback(() => {
    const { isDragging: wasDragging, left, right } = dragStateRef.current;
    dragStateRef.current = { isDragging: false, left: null, right: null };
    setIsDragging(false);
    setDragLeft(null);
    setDragRight(null);
    if (!wasDragging || left == null || right == null) return;

    const leftIdx = chartData.findIndex((d) => d.date === left);
    const rightIdx = chartData.findIndex((d) => d.date === right);
    if (leftIdx === -1 || rightIdx === -1) return;

    const [fromIdx, toIdx] = leftIdx <= rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];
    const start = bucketStart(chartData[fromIdx].date);
    const end = bucketEnd(chartData[toIdx]);
    setRange(start.toISOString(), end.toISOString());
  }, [chartData, setRange]);

  // ── Tracé de la sélection : Pointer Events (souris + tactile + stylet) ──
  // On convertit la position X du pointeur en index de bucket nous-mêmes,
  // au lieu de dépendre des événements souris de Recharts (qui ne gèrent pas
  // bien le tactile et annulent le tracé dès que le curseur quitte le graphe).
  // Le graphique est un AreaChart : le 1er point est au bord gauche de la zone
  // de tracé et le dernier au bord droit.
  const indexFromClientX = (clientX) => {
    const el = graphRef.current;
    const n = chartData.length;
    if (!el || n === 0) return null;
    if (n === 1) return 0;
    const rect = el.getBoundingClientRect();
    const plotWidth = rect.width - Y_AXIS_WIDTH;
    if (plotWidth <= 0) return null;
    const ratio = (clientX - (rect.left + Y_AXIS_WIDTH)) / plotWidth;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  };

  const cancelDrag = () => {
    dragStateRef.current = { isDragging: false, left: null, right: null };
    setIsDragging(false);
    setDragLeft(null);
    setDragRight(null);
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const idx = indexFromClientX(e.clientX);
    if (idx == null) return;
    // Capture : le tracé continue même si le doigt/curseur sort du graphique
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const date = chartData[idx].date;
    dragStateRef.current = { isDragging: true, left: date, right: date };
    setIsDragging(true);
    setDragLeft(date);
    setDragRight(date);
  };

  const handlePointerMove = (e) => {
    if (!dragStateRef.current.isDragging) return;
    const idx = indexFromClientX(e.clientX);
    if (idx == null) return;
    const date = chartData[idx].date;
    if (date === dragStateRef.current.right) return; // rien à mettre à jour
    dragStateRef.current.right = date;
    setDragRight(date);
  };

  const handlePointerUp = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    finishDrag(); // un simple tap = sélection d'un seul bucket
  };

  const handlePointerCancel = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    cancelDrag(); // geste interrompu par le système : on n'applique rien
  };

  const selectionBounds = useMemo(() => {
    if (isDragging && dragLeft != null && dragRight != null) {
      return { x1: dragLeft, x2: dragRight };
    }
    const selectedIdx = chartData.reduce((acc, d, i) => {
      if (isBucketSelected(d)) acc.push(i);
      return acc;
    }, []);
    if (selectedIdx.length === 0) return null;
    return {
      x1: chartData[selectedIdx[0]].date,
      x2: chartData[selectedIdx[selectedIdx.length - 1]].date,
    };
  }, [chartData, isBucketSelected, isDragging, dragLeft, dragRight]);

  // Pendant le tracé, la pastille affiche la plage en cours de sélection :
  // le doigt masque le graphique, ce retour visuel est donc indispensable.
  const liveRange = (() => {
    if (!isDragging || dragLeft == null || dragRight == null) return null;
    const a = chartData.findIndex((d) => d.date === dragLeft);
    const b = chartData.findIndex((d) => d.date === dragRight);
    if (a === -1 || b === -1) return null;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return { start: bucketStart(chartData[lo].date), end: bucketEnd(chartData[hi]) };
  })();
  const shownRange = liveRange || { start: timeRange.start, end: timeRange.end };

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 10) - 1);

  return (
    <section className={`events-chart ${isOpen ? "events-chart--open" : "events-chart--closed"}`}>
      <h2 className="events-chart__heading">
      <button className="events-chart__toggle" onClick={onToggle} aria-expanded={isOpen}>
        <span className="events-chart__title">{t.timeline}</span>
        <span className={`events-chart__active-range${liveRange ? " events-chart__active-range--live" : ""}`}>
          <span>{formatDateLong(shownRange.start, dateLocale)} → {formatDateLong(shownRange.end, dateLocale)}</span>
        </span>
        <svg
          className="events-chart__chevron"
          viewBox="0 0 14 14" fill="none" aria-hidden="true"
        >
          <path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      </h2>

      {isOpen && (
        <div className="events-chart__body">
          <div
            className="events-chart__graph"
            role="img"
            aria-label={t.timeline}
            ref={graphRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="eventsChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_SELECTED} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={COLOR_SELECTED} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COLOR_GRID} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(iso) => formatDateShort(iso, dateLocale)}
                  tick={{ fill: COLOR_MUTED, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                  interval={tickInterval}
                  textAnchor="middle"
                  angle={0}
                  height={28}
                />
                <YAxis tick={{ fill: COLOR_MUTED, fontSize: 10 }} width={Y_AXIS_WIDTH} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: COLOR_SELECTED, strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  isAnimationActive={false}
                  stroke={COLOR_SELECTED}
                  strokeWidth={2}
                  fill="url(#eventsChartFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: COLOR_SELECTED, stroke: "#0d1320", strokeWidth: 2 }}
                />
                {selectionBounds && (
                  <ReferenceArea
                    key={`${selectionBounds.x1}__${selectionBounds.x2}`}
                    x1={selectionBounds.x1}
                    x2={selectionBounds.x2}
                    ifOverflow="visible"
                    strokeOpacity={0.35}
                    stroke={COLOR_SELECTED}
                    fill={COLOR_SELECTED}
                    fillOpacity={0.14}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}