import { useState, useEffect, useRef } from "react";
import "./EventsChart.css";

const API = process.env.REACT_APP_API_URL;

const W = 1000; // SVG viewBox width
const H = 50;   // SVG viewBox height
const PAD = { top: 6, right: 8, bottom: 2, left: 4 };

export default function EventsChart({ isOpen, onToggle }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch(`${API}/graph_events`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error fetching graph_events:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const values = entries.map(([, v]) => v);
  const maxVal = values.length ? Math.max(...values) : 1;
  const minVal = values.length ? Math.min(...values) : 0;
  const avgVal = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const n = entries.length;

  const formatDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  // Map value → SVG Y coordinate (with small padding so line doesn't clip)
  const toY = (v) => PAD.top + (1 - (v - minVal) / (maxVal - minVal || 1)) * (H - PAD.top - PAD.bottom);
  const toX = (i) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);

  // Build SVG polyline points
  const points = entries.map(([, v], i) => `${toX(i)},${toY(v)}`).join(" ");

  // Build area fill path (line + close at bottom)
  const areaPath = entries.length
    ? `M ${toX(0)},${toY(entries[0][1])} ` +
      entries.slice(1).map(([, v], i) => `L ${toX(i + 1)},${toY(v)}`).join(" ") +
      ` L ${toX(n - 1)},${H} L ${toX(0)},${H} Z`
    : "";

  // Avg line Y
  const avgY = toY(avgVal);

  // Label every ~4 days
  const labelEvery = Math.ceil(n / 7);

  // Hovered point
  const hovered = hoveredIndex !== null ? entries[hoveredIndex] : null;

  const handleMouseMove = (e) => {
    if (!svgRef.current || !n) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * W;
    const idx = Math.round(((svgX - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1));
    setHoveredIndex(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div className={`events-chart ${isOpen ? "events-chart--open" : "events-chart--closed"}`}>
      {/* Toggle handle */}
      <button className="events-chart__toggle" onClick={onToggle}>
        <span className="events-chart__toggle-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          ACTIVITY
        </span>
        <svg
          className="events-chart__toggle-chevron"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {isOpen && (
        <div className="events-chart__body">
          {loading ? (
            <div className="events-chart__loading">
              <span className="topics-loading-dot" />
              <span className="topics-loading-dot" />
              <span className="topics-loading-dot" />
            </div>
          ) : (
            <div className="events-chart__inner">
              {/* Y-axis */}
              <div className="events-chart__y-axis">
                <span>{maxVal}</span>
                <span>{avgVal}</span>
                <span>{minVal}</span>
              </div>

              {/* SVG line chart */}
              <div className="events-chart__svg-wrap">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  preserveAspectRatio="none"
                  className="events-chart__svg"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <defs>
                    <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff3355" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="#ff3355" stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  {/* Grid lines */}
                  <line x1={PAD.left} y1={toY(maxVal)} x2={W - PAD.right} y2={toY(maxVal)} stroke="#0f1625" strokeWidth="0.8" />
                  <line x1={PAD.left} y1={toY(minVal)} x2={W - PAD.right} y2={toY(minVal)} stroke="#0f1625" strokeWidth="0.8" />

                  {/* Avg dashed line */}
                  <line
                    x1={PAD.left} y1={avgY}
                    x2={W - PAD.right} y2={avgY}
                    stroke="rgba(30,64,175,0.4)"
                    strokeWidth="0.8"
                    strokeDasharray="4 3"
                  />

                  {/* Area fill */}
                  <path d={areaPath} fill="url(#lineAreaGrad)" />

                  {/* Line */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#ff3355"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />

                  {/* Hovered vertical rule */}
                  {hoveredIndex !== null && (
                    <>
                      <line
                        x1={toX(hoveredIndex)} y1={PAD.top}
                        x2={toX(hoveredIndex)} y2={H}
                        stroke="#1e3a5f"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                      />
                      <circle
                        cx={toX(hoveredIndex)}
                        cy={toY(values[hoveredIndex])}
                        r="3"
                        fill="#ff3355"
                        stroke="#ffffff"
                        strokeWidth="1"
                      />
                    </>
                  )}
                </svg>

                {/* X-axis labels — positioned absolutely below SVG */}
                <div className="events-chart__x-labels">
                  {entries.map(([date], i) =>
                    i % labelEvery === 0 ? (
                      <span
                        key={date}
                        className="events-chart__x-label"
                        style={{ left: `${(i / (n - 1)) * 100}%` }}
                      >
                        {formatDate(date)}
                      </span>
                    ) : null
                  )}
                </div>

                {/* Tooltip */}
                {hovered && (
                  <div
                    className="events-chart__tooltip"
                    style={{
                      left: `${(hoveredIndex / (n - 1)) * 100}%`,
                      transform: hoveredIndex > n * 0.75
                        ? "translateX(-100%) translateX(-8px)"
                        : hoveredIndex < n * 0.25
                        ? "translateX(8px)"
                        : "translateX(-50%)",
                    }}
                  >
                    <span className="events-chart__tooltip-date">{formatDate(hovered[0])}</span>
                    <span className="events-chart__tooltip-val">{hovered[1]} events</span>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="events-chart__legend">
                <span className="events-chart__legend-avg">
                  <span className="events-chart__legend-dash" />
                  avg {avgVal}/day
                </span>
                <span className="events-chart__legend-total">
                  {values.reduce((a, b) => a + b, 0).toLocaleString()} events · 30 days
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}