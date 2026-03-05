import React, { useEffect, useRef } from 'react';

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

export default function TensionIndex({ areaName, onLocate, onDataLoaded }) {
  const [tensionData, setTensionData] = React.useState(null);
  const [summaries, setSummaries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const fillRef = useRef(null);

  // Fetch tension index (inchangé)
  useEffect(() => {
    if (!areaName) return;
    setLoading(true);
    setError(false);
    setTensionData(null);
    setSummaries([]);

    const tensionUrl = `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tension_index?area=${encodeURIComponent(areaName)}`;
    const summaryUrl = `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/daily_summaries?country=${encodeURIComponent(areaName)}`;

    Promise.all([
      fetch(tensionUrl).then(r => r.json()),
      fetch(summaryUrl).then(r => r.json()),
    ])
      .then(([tension, summary]) => {
        setTensionData(tension);
        setSummaries(summary.summaries ?? []);
        setLoading(false);
        onDataLoaded?.(tension);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [areaName]);

  // Animation barre
  useEffect(() => {
    if (!tensionData || !fillRef.current) return;
    const pct = Math.min(100, tensionData.tension_score);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (fillRef.current) fillRef.current.style.width = pct + '%';
      });
    });
  }, [tensionData]);

  if (loading) return <div className="t-loading"></div>;
  if (error || !tensionData) return <div className="t-error"></div>;

  const score = tensionData.tension_score;
  const color = getTensionColor(tensionData.tension_level);
  const ticks = Array(20).fill(0);

  return (
    <div
      className="tension-index-container"
      style={{ '--event-dot-color': color }}
    >
      {/* Header : jauge + score (inchangé) */}
      <div className="t-header">
        <div className="t-region-label">Conflict zone · Tension index</div>
        <div className="t-gauge-row">
          <div className="t-score-block">
            <div className="t-score-value" style={{ color }}>{score.toFixed(0)}</div>
            <div className="t-score-max">/ 100</div>
          </div>
          <div className="t-gauge-bar-wrap">
            <div className="t-niveau" style={{ color }}>{tensionData.tension_level}</div>
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

      {/* Daily summaries */}
      <div className="t-events-section">
        <div className="t-events-header">
          <span className="t-events-label">Daily summaries</span>
          <span className="t-events-count">{summaries.length} entries</span>
        </div>

        {summaries.length === 0 ? (
          <div className="t-empty">No summaries available.</div>
        ) : (
          <ul className="t-timeline">
            {summaries.map((s, i) => {
              const date = s.date
                ? new Date(s.date).toLocaleDateString('en-CA')  // en-CA produit nativement YYYY/MM/DD
                : '—';

              return (
                <li
                  key={i}
                  className="t-event"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="t-event-meta">
                    <div className="t-event-line t-event-line--header">
                      <span className="t-event-date">{date}</span>
                    </div>
                  </div>
                  <p className="t-event-text">"{s.summary}"</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}