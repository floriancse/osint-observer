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
import "./EventsChart.css";

const API = process.env.REACT_APP_API_URL;

// Fenêtre d'historique chargée pour le graphique (indépendante de la plage
// actuellement sélectionnée pour la carte) — limitée aux 30 derniers jours.
const HISTORY_DAYS = 30;

// Nombre minimum d'entités visées sur la carte au premier chargement.
// On remonte bucket par bucket (12h) depuis le plus récent jusqu'à
// atteindre ce total (ou jusqu'à épuiser les HISTORY_DAYS disponibles).
const MIN_ENTITIES = 200;

// Durée de chaque bucket du graphique : 12h, soit 1 point par jour.
const BUCKET_HOURS = 12;
const BUCKET_MS = BUCKET_HOURS * 60 * 60 * 1000;

const COLOR_SELECTED = "#4f9dff";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const date = payload[0]?.payload?.date;
  const count = payload[0]?.value;
  return (
    <div style={{ background: "#0f1524", border: "1px solid #1e2d45", borderRadius: 8, boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)", fontSize: ".6rem", padding: "6px 10px" }}>
      <div style={{ color: "#e2e8f0" }}>{date ? formatDateLong(date) : label}</div>
      <div style={{ color: "#e2e8f0" }}>{count} events</div>
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
function formatDateShort(iso) {
  const d = parseAsUTC(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function formatDateLong(iso) {
  const d = parseAsUTC(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function toInputDate(iso) {
  return new Date(iso).toISOString().slice(0, 16); // yyyy-mm-ddTHH:mm pour <input type="datetime-local">
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

export default function EventsChart({ isOpen, onToggle, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle }) {
  const { timeRange, setRange } = useTime();
  const [data, setData] = useState([]);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const anchorRef = useRef(null);
  if (anchorRef.current === null) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - HISTORY_DAYS);
    anchorRef.current = { start, end };
  }
  
  const dragStateRef = useRef({ isDragging: false, left: null, right: null });
  const [dragLeft, setDragLeft] = useState(null);
  const [dragRight, setDragRight] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const initialSelectionDone = useRef(false);
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
    const { start, end } = anchorRef.current;

    const params = new URLSearchParams({});
    activeWeaponTypes.forEach((t) => params.append('weapon_type', t));
    activeObjectiveTypes.forEach((t) => params.append('objective_type', t));
    if (activeLabel) params.append('label', activeLabel);
    if (searchText?.trim()) params.append('search', searchText.trim());

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

          let total = 0;
          let fromIdx = events.length - 1;
          for (let i = events.length - 1; i >= 0; i--) {
            total += events[i].count || 0;
            fromIdx = i;
            if (total >= MIN_ENTITIES) break;
          }

          const start = bucketStart(events[fromIdx].date);
          const end = bucketEnd(events[events.length - 1]);
          setRange(start.toISOString(), end.toISOString());
        }
      })
      .catch((err) => console.error("Erreur chargement graph_events :", err));
  }, [activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle, setRange]);

  useEffect(() => {
    setDraftStart(toInputDate(timeRange.start));
    setDraftEnd(toInputDate(timeRange.end));
  }, [timeRange.start, timeRange.end]);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        endDate: d.endDate,
        count: d.count,
      })),
    [data]
  );

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

  const handleMouseDown = (e) => {
    if (!e || e.activeLabel == null) return;
    dragStateRef.current = { isDragging: true, left: e.activeLabel, right: e.activeLabel };
    setIsDragging(true);
    setDragLeft(e.activeLabel);
    setDragRight(e.activeLabel);
  };

  const handleMouseMove = (e) => {
    if (!dragStateRef.current.isDragging || !e || e.activeLabel == null) return;
    dragStateRef.current.right = e.activeLabel;
    setDragRight(e.activeLabel);
  };

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

  const applyManualRange = () => {
    if (!draftStart || !draftEnd) return;
    const start = new Date(draftStart);
    const end = new Date(draftEnd);
    if (start > end) return;
    setRange(start.toISOString(), end.toISOString());
  };

  const todayInput = toInputDate(new Date().toISOString());
  const minInput = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - HISTORY_DAYS);
    return toInputDate(d.toISOString());
  }, []);

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

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 10) - 1);

  // Total d'événements pour la période actuellement sélectionnée (timeRange),
  // et non pour toute la fenêtre de 30 jours chargée par /graph_events.
  // C'est ce chiffre qu'il faut comparer au compteur du SidePanel / de la
  // carte, pas la somme de toutes les barres du graphique.
  const selectedTotal = useMemo(
    () => chartData.reduce((sum, d) => (isBucketSelected(d) ? sum + (d.count || 0) : sum), 0),
    [chartData, isBucketSelected]
  );

  return (
    <div className={`events-chart ${isOpen ? "events-chart--open" : "events-chart--closed"}`}>
      <button className="events-chart__toggle" onClick={onToggle}>
        <svg
          width="11" height="11" viewBox="0 0 14 14" fill="none"
          style={{ transform: isOpen ? "rotate(0deg)" : "rotate(180deg)" }}
        >
          <path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Timeline</span>
        <span className="events-chart__active-range">
          {formatDateLong(timeRange.start)} → {formatDateLong(timeRange.end)}
        </span>
      </button>

      {isOpen && (
        <div className="events-chart__body">
          <div className="events-chart__graph">
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={finishDrag}
                onMouseLeave={finishDrag}
              >
                <defs>
                  <linearGradient id="eventsChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_SELECTED} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLOR_SELECTED} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fill: "#8b949e", fontSize: ".55rem" }}
                  interval={tickInterval}
                  textAnchor="middle"
                  angle={0}
                  height={34}
                />
                <YAxis tick={{ fill: "#8b949e", fontSize: ".55rem" }} width={30} allowDecimals={false} />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: COLOR_SELECTED, strokeWidth: 1, strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  isAnimationActive={false}
                  stroke={COLOR_SELECTED}
                  strokeWidth={1.5}
                  fill="url(#eventsChartFill)"
                  dot={false}
                  activeDot={{ r: 3, fill: COLOR_SELECTED, stroke: "#0f1524", strokeWidth: 1 }}
                />
                {selectionBounds && (
                  <ReferenceArea
                    key={`${selectionBounds.x1}__${selectionBounds.x2}`}
                    x1={selectionBounds.x1}
                    x2={selectionBounds.x2}
                    ifOverflow="visible"
                    strokeOpacity={0.5}
                    stroke="#4f9dff"
                    fill="#4f9dff"
                    fillOpacity={0.18}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}