import React, { useEffect, useRef } from 'react';

function getTensionColor(niveau) {
  const map = {
    'Guerre ouverte':             '#ff2d2d',
    'Conflit actif majeur':       '#ff7b00',
    'Haute tension stratégique':  '#ffd600',
    'Tension notable':            '#00ffb7',
    'Activité modérée':           '#4a8fff',
    'Stable / faible':            '#6d6d6d',
  };
  return map[niveau] ?? '#6d6d6d';
}

export default function TensionIndex({ areaName }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const fillRef = useRef(null);

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);
    setError(false);
    setData(null);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tension_index?area=${encodeURIComponent(areaName)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [areaName]);

  // Animation de la barre
  useEffect(() => {
    if (!data || !fillRef.current) return;
    const pct = Math.min(100, data.tension_score);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (fillRef.current) fillRef.current.style.width = pct + '%';
      });
    });
  }, [data]);

  if (loading) return <div className="t-loading"></div>;
  if (error || !data) return <div className="t-error"></div>;

  const score = data.tension_score;
  const color = getTensionColor(data.niveau_tension);
  const events = (data.evenements || []).filter(ev => ev.SUMMARY_TEXT?.trim() || ev.text?.trim());
  const maxContrib = Math.max(...events.map(e => parseFloat(e.score_contribution_normalized)), 0) || 1;
  const ticks = Array(20).fill(0);

  return (
    <div className="tension-index-container">
      {/* Partie haute fixe : jauge + score */}
      <div className="t-header">
        <div className="t-region-label">Zone de conflit · Indice de tension</div>
        <div className="t-gauge-row">
          <div className="t-score-block">
            <div className="t-score-value" style={{ color }}>{score.toFixed(0)}</div>
            <div className="t-score-max">/ 100</div>
          </div>
          <div className="t-gauge-bar-wrap">
            <div className="t-niveau" style={{ color }}>{data.niveau_tension}</div>
            <div className="t-bar-bg">
              <div
                ref={fillRef}
                className="t-bar-fill"
                style={{ width: '0%', background: `linear-gradient(90deg, ${color}99, ${color})` }}
              />
            </div>
            <div className="t-bar-ticks">
              {ticks.map((_, i) => <div key={i} className="t-tick" />)}
            </div>
          </div>
        </div>
      </div>

      {/* Partie basse : scrollable */}
      <div className="t-events-section">
        <div className="t-events-header">
          <span className="t-events-label">Événements récents</span>
          <span className="t-events-count">{events.length} entrées</span>
        </div>

        <ul className="t-timeline">
          {events.map((ev, i) => {
            const contrib = parseFloat(ev.score_contribution_normalized);
            const opacity = 0.3 + (contrib / maxContrib) * 0.7;
            const intensityColor = contrib >= 1 ? '#ff2d2d' : contrib >= 0.5 ? '#ff7b00' : '#ffd60055';
            const scoreClass = contrib < 0.5 ? 'low' : '';

            return (
              <li key={i} className="t-event" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="t-event-intensity" style={{ background: intensityColor, opacity }} />

                <div className="t-event-meta">
                  {/* Ligne 1 : date + score */}
                  <div className="t-event-line t-event-line--header">
                    <span className="t-event-date">{ev.date}</span>
                    <span className={`t-event-score ${scoreClass}`}>+{contrib.toFixed(2)}</span>
                  </div>

                  {/* Ligne 2 : lieu */}
                  <div className="t-event-line">
                    <span className="t-event-location_name">{ev.location_name}</span>
                  </div>

                  {/* Ligne 3 : coordonnées */}
                  <div className="t-event-line">
                    <span className="t-event-coordinates">
                      {ev.latitude}° {ev.longitude}°
                    </span>
                  </div>
                </div>

                <p className="t-event-text">"{ev.SUMMARY_TEXT || ev.text}"</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}