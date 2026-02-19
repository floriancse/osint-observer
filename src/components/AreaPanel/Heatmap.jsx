import React, { useEffect, useState } from 'react';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getTensionColor(score) {
  if (score >= 100) return '#ff2d2d';
  if (score >= 40) return '#ff7b00';
  if (score >= 15) return '#ffd600';
  if (score >= 2) return '#4a8fff';
  return '#6d6d6d';
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

export default function Heatmap({ areaName, tensionScore = 0 }){
  const tensionColor = getTensionColor(tensionScore);
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?area=${encodeURIComponent(areaName)}&start_date=${start.toISOString()}&end_date=${now.toISOString()}`)
      .then(r => r.json())
      .then(data => {
        const now2 = new Date();
        const year = now2.getFullYear();
        const month = now2.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const getKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        const counts = {};
        for (let i = 1; i <= daysInMonth; i++) counts[getKey(new Date(year, month, i))] = 0;
        (data.features || []).forEach(f => {
          const k = getKey(new Date(f.properties.date_published));
          if (k in counts) counts[k]++;
        });
        setDayData(counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [areaName]);

  if (loading) return <div className="t-loading">— CHARGEMENT —</div>;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const getKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayKey = getKey(now);
  const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <span className="heatmap-region-label">Activité mensuelle</span>
        <span className="heatmap-month">{monthName}</span>
      </div>

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
              : (
                <div
                  key={di}
                  className={`heatmap-day${day.date === todayKey ? ' today' : ''}`}
                  style={styleStringToObj(getLevelStyle(day.level, tensionColor))}
                  onMouseEnter={e => {
                    const [y, m, d2] = day.date.split('-');
                    const date = new Date(y, m - 1, d2);
                    const weekday = capitalize(date.toLocaleDateString('fr-FR', { weekday: 'long' }));
                    const mon = capitalize(date.toLocaleDateString('fr-FR', { month: 'long' }));
                    setTooltip({
                      visible: true,
                      text: `${weekday} ${date.getDate()} ${mon}`,
                      count: day.count,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onMouseMove={e => setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
                  onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                />
              )
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
          <div className="heatmap-stat-label">Pic / jour</div>
        </div>
        <div className="heatmap-stat-divider" />
        <div className="heatmap-stat">
          <div className="heatmap-stat-value">{avgEvents.toFixed(1)}</div>
          <div className="heatmap-stat-label">Moy. / jour</div>
        </div>
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Moins</span>
        {[0,1,2,3,4].map(l => (
          <div key={l} className="heatmap-legend-box"
            style={styleStringToObj(getLevelStyle(l, tensionColor) + ';width:10px;height:10px;border-radius:2px')} />
        ))}
        <span className="heatmap-legend-label">Plus</span>
      </div>

      {tooltip.visible && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y - 8 }}>
          {tooltip.text}{'\n'}
          <span className="tt-count" style={{ color: tensionColor }}>
            {tooltip.count} événement{tooltip.count > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}