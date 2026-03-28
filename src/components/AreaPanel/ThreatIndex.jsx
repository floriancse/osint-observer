//ThreatIndex.jsx
import React, { useEffect, useRef, useState } from 'react';

const THREAT_COLORS = {
  'Open warfare': '#ed3f3f',
  'Active conflict': '#edb33f',
  'High threat': '#3fedbc',
  'Moderate threat': '#4a8fff',
  'Calm': '#6d6d6d',
};

function getThreatColor(niveau) {
  return THREAT_COLORS[niveau] ?? '#6d6d6d';
}

function StatItem({ value, label, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: color ?? '#eef0f5', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#7a839f', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  );
}

function RadialScore({ score, color, circleRef }) {
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle ref={circleRef} cx="48" cy="48" r={radius}
          fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={circ}
          strokeLinecap="round" transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#7a839f' }}>/ 100</span>
      </div>
    </div>
  );
}

export default function ThreatIndex({ areaName, onDataLoaded, onLoaded }) {
  const [threatData, setThreatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const circleRef = useRef(null);

  useEffect(() => {
    if (!areaName) return;
    setLoading(true);
    setError(false);
    setThreatData(null);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/threat_index?area=${encodeURIComponent(areaName)}`)
      .then(r => r.json())
      .then(data => {
        const latest = data.history?.[data.history.length - 1] ?? data;
        setThreatData(latest);
        setLoading(false);
        onDataLoaded?.(latest);
        onLoaded?.();
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [areaName]);

  useEffect(() => {
    if (!threatData || !circleRef.current) return;
    const radius = 38;
    const circ = 2 * Math.PI * radius;
    const offset = circ * (1 - threatData.threat_score / 100);
    requestAnimationFrame(() => {
      if (circleRef.current) circleRef.current.style.strokeDashoffset = offset;
    });
  }, [threatData]);

  if (loading) return <div className="t-loading" />;
  if (error || !threatData) return <div className="t-error" />;

  const color = getThreatColor(threatData.threat_level);

  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.06)',
      background: '#111418',
      borderRadius: 4,
      padding: '20px 24px',
      marginBottom: 8,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7a839f', marginBottom: 16 }}>
        Conflict zone · Threat index
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <RadialScore score={threatData.threat_score} color={color} circleRef={circleRef} />

        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 4, marginBottom: 16,
            background: `${color}1a`, border: `1px solid ${color}40`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: color,
              animation: 'blink 1.4s ease-in-out infinite', flexShrink: 0,
            }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>
              {threatData.threat_level}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <StatItem value={threatData.event_count} label="Events" />
            <StatItem value={threatData.attacks_launched} label="Initiated" />
            <StatItem value={threatData.attacks_received} label="Sustained"  />
          </div>
        </div>
      </div>
    </div>
  );
}