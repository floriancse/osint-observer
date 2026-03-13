import React, { useEffect, useState, useCallback, useMemo } from 'react';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getTensionColor(niveau) {
  const map = {
    'Open Warfare': '#ed3f3f',
    'High Strategic Tension': '#edb33f',
    'Significant Tension': '#3fedbc',
    'Moderate Tension': '#4a8fff',
    'Low Tension / Stable': '#6d6d6d',
  };
  return map[niveau] ?? '#6d6d6d';
}

function getLevelStyle(level, color) {
  const styles = [
    `background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.04)`,
    `background:${hexToRgba(color, 0.12)};border-color:${hexToRgba(color, 0.15)}`,
    `background:${hexToRgba(color, 0.28)};border-color:${hexToRgba(color, 0.30)}`,
    `background:${hexToRgba(color, 0.55)};border-color:${hexToRgba(color, 0.50)}`,
    `background:${color};border-color:${color};box-shadow:0 0 6px ${hexToRgba(color, 0.4)}`,
  ];
  return styles[level];
}

function styleStringToObj(str) {
  return Object.fromEntries(
    str.split(';').filter(Boolean).map(s => {
      const [k, ...v] = s.split(':');
      const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return [key, v.join(':').trim()];
    })
  );
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fetchCache = {};

export default function Heatmap({ areaName, niveauTension = 'Stable / faible', onDayClick, selectedDate, onLoaded }) {
  const tensionColor = getTensionColor(niveauTension);

  const [monthOffset, setMonthOffset] = useState(0);
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  const refDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const isCurrentMonth = monthOffset === 0;

  const getKey = useCallback((d) => toDateKey(d), []);

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);

    const cacheKey = `${areaName}__${year}-${String(month + 1).padStart(2, '0')}`;
    if (fetchCache[cacheKey]) {
      setDayData(fetchCache[cacheKey]);
      setLoading(false);
      onLoaded?.();
      return;
    }

    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = isCurrentMonth ? new Date() : new Date(year, month + 1, 0, 23, 59, 59, 999);

    fetch(
      `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson` +
      `?area=${encodeURIComponent(areaName)}&start_date=${start.toISOString()}&end_date=${end.toISOString()}`
    )
      .then(r => r.json())
      .then(data => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const counts = {};
        for (let i = 1; i <= daysInMonth; i++) counts[getKey(new Date(year, month, i))] = 0;
        (data.features || []).forEach(f => {
          const k = getKey(new Date(f.properties.created_at));
          if (k in counts) counts[k]++;
        });
        fetchCache[cacheKey] = counts;
        setDayData(counts);
        setLoading(false);
        onLoaded?.()

      })
      .catch(() => setLoading(false));
  }, [areaName, year, month, isCurrentMonth, getKey]);

  const handleDayClick = (dateKey) => {
    if (!onDayClick) return;
    if (selectedDate === dateKey) { onDayClick(null); return; }
    const [y, m, d] = dateKey.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    onDayClick({ dateKey, start: start.toISOString(), end: end.toISOString() });
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const values = Object.values(dayData);
  const totalEvents = values.reduce((a, b) => a + b, 0);
  const maxEvents = Math.max(...values, 0);
  const avgEvents = daysInMonth ? totalEvents / daysInMonth : 0;

  const getLevel = (count) => {
    if (!count || !maxEvents) return 0;
    const r = count / maxEvents;
    if (r <= 0.25) return 1;
    if (r <= 0.50) return 2;
    if (r <= 0.75) return 3;
    return 4;
  };

  const dates = Object.keys(dayData).sort();
  const weeks = [];
  let currentWeek = Array(firstDay).fill(null);
  dates.forEach(dateKey => {
    currentWeek.push({ date: dateKey, count: dayData[dateKey], level: getLevel(dayData[dateKey]) });
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  });
  if (currentWeek.length) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  const monthName = refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const navBtn = (disabled) => ({
    background: 'transparent',
    border: '1px solid rgba(136, 136, 136, 0.5)',
    borderRadius: 4,
    color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)',
    width: 22, height: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 13, lineHeight: 1,
    transition: 'all 0.15s',
    flexShrink: 0,
    pointerEvents: disabled ? 'none' : 'auto',
  });

  return (
    <div className="heatmap-container">

      <div className="heatmap-header">
        {/* Gauche : label + date sélectionnée */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="heatmap-region-label">Monthly activity</span>

        </div>

        {/* Droite : navigation mois */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={navBtn(false)} onClick={() => setMonthOffset(o => o - 1)}>‹</button>
          <span className="heatmap-month" style={{ minWidth: 120, textAlign: 'center' }}>
            {monthName}
          </span>
          <button style={navBtn(isCurrentMonth)} onClick={() => setMonthOffset(o => Math.min(o + 1, 0))}>›</button>
        </div>
      </div>

      {loading ? <div className="t-loading">— LOADING —</div> : (
        <>
          <div className="heatmap-dow-row">
            <div />
            {DOW.map((d, i) => <div key={i} className="heatmap-dow-label">{d}</div>)}
          </div>

          <div className="heatmap-calendar">
            {weeks.map((week, wi) => (
              <React.Fragment key={wi}>
                <div className="heatmap-week-label">S{wi + 1}</div>
                {week.map((day, di) => day === null
                  ? <div key={di} className="heatmap-day empty" />
                  : (() => {
                    const isSelected = selectedDate === day.date;
                    const isToday = day.date === todayKey;
                    const baseStyle = styleStringToObj(getLevelStyle(day.level, tensionColor));
                    const selectedStyle = isSelected ? {
                      outline: '2px solid #ffffff',
                      outlineOffset: '2px',
                      boxShadow: '0 0 8px rgba(255,255,255,0.5)',
                    } : {};
                    return (
                      <div
                        key={di}
                        className={`heatmap-day${isToday ? ' today' : ''}`}
                        style={{ ...baseStyle, ...selectedStyle, cursor: 'pointer' }}
                        onMouseEnter={e => {
                          const [y, m, d2] = day.date.split('-');
                          const date = new Date(y, m - 1, d2);
                          const weekday = capitalize(date.toLocaleDateString('en-US', { weekday: 'long' }));
                          const mon = capitalize(date.toLocaleDateString('en-US', { month: 'long' }));
                          setTooltip({ visible: true, text: `${weekday} ${date.getDate()} ${mon}`, count: day.count, x: e.clientX, y: e.clientY });
                        }}
                        onClick={() => handleDayClick(day.date)}
                        onMouseMove={e => setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
                        onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                      />
                    );
                  })()
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="heatmap-stats">
            <div className="heatmap-stat">
              <div className="heatmap-stat-value">{totalEvents}</div>
              <div className="heatmap-stat-label">Total</div>
            </div>
            <div className="heatmap-stat-divider" />
            <div className="heatmap-stat">
              <div className="heatmap-stat-value">{maxEvents}</div>
              <div className="heatmap-stat-label">Peak / day</div>
            </div>
            <div className="heatmap-stat-divider" />
            <div className="heatmap-stat">
              <div className="heatmap-stat-value">{avgEvents.toFixed(1)}</div>
              <div className="heatmap-stat-label">Avg. / day</div>
            </div>
          </div>

          <div className="heatmap-legend">
            <span className="heatmap-legend-label">Less</span>
            {[0, 1, 2, 3, 4].map(l => (
              <div key={l} className="heatmap-legend-box"
                style={styleStringToObj(getLevelStyle(l, tensionColor) + ';width:10px;height:10px;border-radius:2px')} />
            ))}
            <span className="heatmap-legend-label">More</span>
          </div>
        </>
      )}

      {tooltip.visible && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y - 8 }}>
          {tooltip.text}{'\n'}
          <span className="tt-count" style={{ color: tensionColor }}>
            {tooltip.count} event{tooltip.count > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}