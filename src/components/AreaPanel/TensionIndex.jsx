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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const fillRef = useRef(null);

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);
    setError(false);
    setTensionData(null);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tension_index?area=${encodeURIComponent(areaName)}`)
      .then(r => r.json())
      .then(data => {
        setTensionData(data);
        setLoading(false);
        onDataLoaded?.(data);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [areaName]);

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
    <div className="tension-index-container" style={{ '--event-dot-color': color }}>
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
    </div>
  );
}