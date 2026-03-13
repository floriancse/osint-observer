import React, { useEffect, useRef } from 'react';

function getThreatColor(niveau) {
    const map = {
        'Open warfare': '#ed3f3f',
        'Active conflict': '#edb33f',
        'High threat': '#3fedbc',
        'Moderate threat': '#4a8fff',
        'Calm': '#6d6d6d',
    };
    return map[niveau] ?? '#6d6d6d';
}

export default function ThreatIndex({ areaName, onLocate, onDataLoaded, onLoaded }) {
  const [threatData, setThreatData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const fillRef = useRef(null);

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);
    setError(false);
    setThreatData(null);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/threat_index?area=${encodeURIComponent(areaName)}`)
      .then(r => r.json())
      .then(data => {
        setThreatData(data);
        setLoading(false);
        onDataLoaded?.(data);
        onLoaded?.();  
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [areaName]);

  useEffect(() => {
    if (!threatData || !fillRef.current) return;
    const pct = Math.min(100, threatData.threat_score);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (fillRef.current) fillRef.current.style.width = pct + '%';
      });
    });
  }, [threatData]);

  if (loading) return <div className="t-loading"></div>;
  if (error || !threatData) return <div className="t-error"></div>;

  const score = threatData.threat_score;
  const color = getThreatColor(threatData. threat_level);
  const ticks = Array(20).fill(0);

  return (
    <div className="threat-index-container" style={{ '--event-dot-color': color }}>
      <div className="t-header">
        <div className="t-region-label">Conflict zone · Threat index</div>
        <div className="t-gauge-row">
          <div className="t-score-block">
            <div className="t-score-value" style={{ color }}>{score.toFixed(0)}</div>
            <div className="t-score-max">/ 100</div>
          </div>
          <div className="t-gauge-bar-wrap">
            <div className="t-niveau" style={{ color }}>{threatData. threat_level}</div>
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