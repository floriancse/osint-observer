import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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

// Durée de chaque bucket du graphique : 24h, soit 1 point par jour.
const BUCKET_HOURS = 24;
const BUCKET_MS = BUCKET_HOURS * 60 * 60 * 1000;

const COLOR_SELECTED = "#4f9dff";
const COLOR_UNSELECTED = "#3a3d42";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const date = payload[0]?.payload?.date;
  const count = payload[0]?.value;
  return (
    <div style={{ background: "#0f1524", border: "1px solid #41444a", fontSize: ".6rem", padding: "6px 10px" }}>
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
// Utilise d.endDate si le backend le fournit, sinon calcule +24h.
function bucketEnd(point) {
  if (point?.endDate) return parseAsUTC(point.endDate);
  return new Date(parseAsUTC(point.date ?? point).getTime() + BUCKET_MS - 1);
}

export default function EventsChart({ isOpen, onToggle, activeWeaponTypes, activeObjectiveTypes }) {
  const { timeRange, setRange } = useTime();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const anchorRef = useRef(null);
  if (anchorRef.current === null) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - HISTORY_DAYS);
    anchorRef.current = { start, end };
  }
  // Sélection en cours (glisser-déposer directement sur les barres).
  // dragStateRef est la source de vérité "temps réel" (lue/écrite dans les
  // handlers mousedown/mousemove/mouseup) : elle évite tout souci de closure
  // React périmée sur un clic très rapide (mousedown immédiatement suivi de
  // mouseup). Les states ci-dessous ne servent qu'à piloter le rendu visuel
  // (couleur des barres, ReferenceArea).
  const dragStateRef = useRef({ isDragging: false, left: null, right: null });
  const [dragLeft, setDragLeft] = useState(null);
  const [dragRight, setDragRight] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Chargement de l'historique du graphique (zero-filled côté backend par bucket
  // de 24h, donc tous les jours sont présents)
  const hasLoadedOnce = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    if (!hasLoadedOnce.current) setLoading(true);
    const { start, end } = anchorRef.current;

    const params = new URLSearchParams({
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    });
    activeWeaponTypes.forEach((t) => params.append('weapon_type', t));
    activeObjectiveTypes.forEach((t) => params.append('objective_type', t));

    fetch(`${API}/graph_events?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setData(json.events || []))
      .catch((err) => console.error("Erreur chargement graph_events :", err))
      .finally(() => {
        setLoading(false);
        hasLoadedOnce.current = true;
      });
  }, [isOpen, activeWeaponTypes, activeObjectiveTypes]);

  // Garde les 2 champs de dates synchronisés avec la plage active (carte + graphique)
  useEffect(() => {
    setDraftStart(toInputDate(timeRange.start));
    setDraftEnd(toInputDate(timeRange.end));
  }, [timeRange.start, timeRange.end]);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        endDate: d.endDate, // fin exacte du bucket 24h, si fournie par le backend
        count: d.count,
      })),
    [data]
  );

  // Un bucket (24h) est "sélectionné" (coloré) s'il CHEVAUCHE la plage active du
  // contexte — et pas seulement si son timestamp de *début* tombe dedans. Sans ça,
  // une plage active plus étroite que 24h (ex: "1h" ou "6h")
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
  // Un simple clic (mousedown puis mouseup sur la même barre, sans déplacement)
  // sélectionne le jour cliqué. Un drag (mousedown, déplacement, mouseup)
  // sélectionne la plage de jours parcourue.
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

  // Couleur de chaque barre : bleu (sélectionné) ou gris (non sélectionné).
  // Priorité à la plage en cours de glisser-déposer (drag), sinon la plage active.
  const barColors = useMemo(() => {
    if (isDragging && dragLeft != null && dragRight != null) {
      const leftIdx = chartData.findIndex((d) => d.date === dragLeft);
      const rightIdx = chartData.findIndex((d) => d.date === dragRight);
      if (leftIdx === -1 || rightIdx === -1) return chartData.map(() => COLOR_UNSELECTED);
      const [fromIdx, toIdx] = leftIdx <= rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];
      return chartData.map((_, i) => (i >= fromIdx && i <= toIdx ? COLOR_SELECTED : COLOR_UNSELECTED));
    }

    return chartData.map((d) => (isBucketSelected(d) ? COLOR_SELECTED : COLOR_UNSELECTED));
  }, [chartData, isBucketSelected, isDragging, dragLeft, dragRight]);

  // Espacement des ticks de l'axe X pour rester lisible : avec un pas de 24h,
  // on a 1 point par jour. Diviseur à 10 pour n'afficher qu'environ 10 ticks
  // au total (ajuster ce nombre pour plus/moins de ticks).
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
              <div className="events-chart__loading" style={{ height: 80 }}></div>
            ) : (
              <ResponsiveContainer width="100%" height={80}>
                <BarChart
                  data={chartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={finishDrag}
                  onMouseLeave={finishDrag}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    tick={{ fill: "#9aa0a6", fontSize: ".55rem" }}
                    interval={tickInterval}
                    textAnchor="middle"
                    angle={0}
                    height={34}
                  />
                  <YAxis tick={{ fill: "#9aa0a6", fontSize: ".55rem" }} width={30} allowDecimals={false} />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "#4f9dff", fillOpacity: 0.1 }}
                  />
                  <Bar dataKey="count" isAnimationActive={false}>
                    {chartData.map((d, i) => (
                      <Cell key={d.date ?? i} fill={barColors[i] ?? COLOR_UNSELECTED} />
                    ))}
                  </Bar>
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
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}