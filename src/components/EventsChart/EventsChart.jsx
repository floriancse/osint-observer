import { useEffect, useMemo, useState, useCallback } from "react";
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

// Durée de chaque bucket du graphique. Passé de 24h (1 jour) à 12h :
// chaque jour est désormais représenté par 2 points (matin / après-midi).
const BUCKET_HOURS = 12;
const BUCKET_MS = BUCKET_HOURS * 60 * 60 * 1000;

const COLOR_SELECTED = "#4f9dff";
const COLOR_UNSELECTED = "#3a3d42";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const date = payload[0]?.payload?.date;
  const count = payload[0]?.value;
  return (
    <div style={{ background: "#0f1524", border: "1px solid #41444a", fontSize: 12, padding: "6px 10px" }}>
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
  const day = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}
function toInputDate(iso) {
  return new Date(iso).toISOString().slice(0, 16); // yyyy-mm-ddTHH:mm pour <input type="datetime-local">
}
// Début exact d'un bucket (utilise la date telle quelle, sans forcer minuit)
function bucketStart(d) {
  return parseAsUTC(d);
}
// Fin exacte d'un bucket : début du bucket suivant, moins 1 ms.
// Utilise d.endDate si le backend le fournit, sinon calcule +12h.
function bucketEnd(point) {
  if (point?.endDate) return parseAsUTC(point.endDate);
  return new Date(parseAsUTC(point.date ?? point).getTime() + BUCKET_MS - 1);
}

export default function EventsChart({ isOpen, onToggle }) {
  const { timeRange, setRange } = useTime();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  // Sélection en cours (glisser-déposer directement sur les barres)
  const [dragLeft, setDragLeft] = useState(null);
  const [dragRight, setDragRight] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Chargement de l'historique du graphique (zero-filled côté backend par bucket
  // de 12h, donc tous les buckets sont présents, matin et après-midi)
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - HISTORY_DAYS);

    fetch(`${API}/graph_events?start_date=${start.toISOString()}&end_date=${end.toISOString()}`)
      .then((r) => r.json())
      .then((json) => setData(json.events || []))
      .catch((err) => console.error("Erreur chargement graph_events :", err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Garde les 2 champs de dates synchronisés avec la plage active (carte + graphique)
  useEffect(() => {
    setDraftStart(toInputDate(timeRange.start));
    setDraftEnd(toInputDate(timeRange.end));
  }, [timeRange.start, timeRange.end]);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        endDate: d.endDate, // fin exacte du bucket 12h, si fournie par le backend
        count: d.count,
      })),
    [data]
  );

  // Un bucket (12h) est "sélectionné" (coloré) s'il CHEVAUCHE la plage active du
  // contexte — et pas seulement si son timestamp de *début* tombe dedans. Sans ça,
  // une plage active plus étroite que 12h (ex: "1h", "6h", ou "24h" tôt le matin)
  // ne matcherait jamais le début d'aucun bucket, même si ce bucket couvre bien
  // toute la plage sélectionnée.
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

  // --- Sélection par glisser-déposer directement sur les barres ---
  const handleMouseDown = (e) => {
    if (!e || e.activeLabel == null) return;
    setIsDragging(true);
    setDragLeft(e.activeLabel);
    setDragRight(e.activeLabel);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !e || e.activeLabel == null) return;
    setDragRight(e.activeLabel);
  };

  const finishDrag = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragLeft == null || dragRight == null) return;

    const leftIdx = chartData.findIndex((d) => d.date === dragLeft);
    const rightIdx = chartData.findIndex((d) => d.date === dragRight);
    if (leftIdx === -1 || rightIdx === -1) return;

    const [fromIdx, toIdx] = leftIdx <= rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];
    const start = bucketStart(chartData[fromIdx].date);
    const end = bucketEnd(chartData[toIdx]);
    setRange(start.toISOString(), end.toISOString());

    setDragLeft(null);
    setDragRight(null);
  }, [isDragging, dragLeft, dragRight, chartData, setRange]);

  // Sélection par saisie directe des 2 dates
  const applyManualRange = () => {
    if (!draftStart || !draftEnd) return;
    // draftStart/draftEnd sont au format "yyyy-mm-ddTHH:mm" (datetime-local)
    const start = new Date(draftStart);
    const end = new Date(draftEnd);
    if (start > end) return;
    setRange(start.toISOString(), end.toISOString());
  };

  // Bornes des champs de dates : alignées sur les 30 jours affichés dans le graphique
  const todayInput = toInputDate(new Date().toISOString());
  const minInput = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - HISTORY_DAYS);
    return toInputDate(d.toISOString());
  }, []);

  // Position (en %) du début/fin de la plage sélectionnée dans le jeu de données,
  // utilisée pour dessiner un dégradé net bleu/gris sur la ligne et la zone remplie.
  // Priorité à la plage en cours de glisser-déposer (drag), sinon la plage active.
  const gradientStops = useMemo(() => {
    const total = chartData.length;
    if (total < 2) return null;

    if (isDragging && dragLeft != null && dragRight != null) {
      const leftIdx = chartData.findIndex((d) => d.date === dragLeft);
      const rightIdx = chartData.findIndex((d) => d.date === dragRight);
      if (leftIdx === -1 || rightIdx === -1) return null;
      const [fromIdx, toIdx] = leftIdx <= rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];
      return {
        startPct: (fromIdx / (total - 1)) * 100,
        endPct: (toIdx / (total - 1)) * 100,
      };
    }

    const selectedIdx = [];
    chartData.forEach((d, i) => {
      if (isBucketSelected(d)) selectedIdx.push(i);
    });
    if (selectedIdx.length === 0) return null;
    const startPct = (Math.min(...selectedIdx) / (total - 1)) * 100;
    const endPct = (Math.max(...selectedIdx) / (total - 1)) * 100;
    return { startPct, endPct };
  }, [chartData, isBucketSelected, isDragging, dragLeft, dragRight]);

  // Espacement des ticks de l'axe X pour rester lisible : avec un pas de 12h,
  // on a ~2x plus de points qu'avant (2 par jour). Diviseur à 60 pour n'afficher
  // qu'environ 7 ticks au total (ajuster ce nombre pour plus/moins de ticks).
  const tickInterval = Math.max(0, Math.ceil(chartData.length / 10) - 1);

  return (
    <div className={`events-chart ${isOpen ? "events-chart--open" : "events-chart--closed"}`}>
      <button className="events-chart__toggle" onClick={onToggle}>
        <svg
          width="11" height="11" viewBox="0 0 14 14" fill="none"
          style={{ transform: isOpen ? "rotate(0deg)" : "rotate(180deg)" }}
        >
          <path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Events timeline</span>
        <span className="events-chart__active-range">
          {formatDateLong(timeRange.start)} → {formatDateLong(timeRange.end)}
        </span>
      </button>

      {isOpen && (
        <div className="events-chart__body">

          <div className="events-chart__graph">
            {loading ? (
              <div className="events-chart__loading">Chargement…</div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={finishDrag}
                  onMouseLeave={finishDrag}
                >
                  <defs>
                    <linearGradient id="eventsLineColor" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={COLOR_UNSELECTED} />
                      <stop offset={`${gradientStops?.startPct ?? 100}%`} stopColor={COLOR_UNSELECTED} />
                      <stop offset={`${gradientStops?.startPct ?? 100}%`} stopColor={COLOR_SELECTED} />
                      <stop offset={`${gradientStops?.endPct ?? 100}%`} stopColor={COLOR_SELECTED} />
                      <stop offset={`${gradientStops?.endPct ?? 100}%`} stopColor={COLOR_UNSELECTED} />
                      <stop offset="100%" stopColor={COLOR_UNSELECTED} />
                    </linearGradient>
                    <linearGradient id="eventsAreaColor" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={COLOR_UNSELECTED} stopOpacity={0.18} />
                      <stop offset={`${gradientStops?.startPct ?? 100}%`} stopColor={COLOR_UNSELECTED} stopOpacity={0.18} />
                      <stop offset={`${gradientStops?.startPct ?? 100}%`} stopColor={COLOR_SELECTED} stopOpacity={0.15} />
                      <stop offset={`${gradientStops?.endPct ?? 100}%`} stopColor={COLOR_SELECTED} stopOpacity={0.15} />
                      <stop offset={`${gradientStops?.endPct ?? 100}%`} stopColor={COLOR_UNSELECTED} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={COLOR_UNSELECTED} stopOpacity={0.18} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    tick={{ fill: "#9aa0a6", fontSize: 10 }}
                    interval={tickInterval}
                    textAnchor="middle"
                    angle={0}
                    height={34}
                  />
                  <YAxis tick={{ fill: "#9aa0a6", fontSize: 10 }} width={30} allowDecimals={false} />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: "#4f9dff", strokeOpacity: 0.3 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="url(#eventsLineColor)"
                    strokeWidth={2}
                    fill="url(#eventsAreaColor)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    dot={false}
                    activeDot={false}
                  />
                  {isDragging && dragLeft != null && dragRight != null && (
                    <ReferenceArea
                      x1={dragLeft}
                      x2={dragRight}
                      strokeOpacity={0.4}
                      stroke="#4f9dff"
                      fill="#4f9dff"
                      fillOpacity={0.15}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}