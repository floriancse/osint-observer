// ImportanceDistribution.jsx
import React, { useState, useEffect } from 'react';

const SCORE_LABELS = {
    1: 'Negligible',
    2: 'Minor',
    3: 'Moderate',
    4: 'Significant',
    5: 'Critical',
};

const THREAT_COLORS = {
    'Open warfare':   '#ed3f3f',
    'Active conflict':'#edb33f',
    'High threat':    '#3fedbc',
    'Moderate threat':'#4a8fff',
    'Calm':           '#6d6d6d',
};

// Génère 5 teintes du plus sombre au plus vif selon la couleur threat
function buildScoreColors(hex) {
    // Parse hex → r,g,b
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Score 1 = très atténué, score 5 = pleine couleur + glow
    const alphas = [0.20, 0.35, 0.52, 0.72, 1.0];
    return alphas.map(a => {
        const rr = Math.round(r * a + 17 * (1 - a)); // blend sur #111418 ≈ rgb(17,20,24)
        const gg = Math.round(g * a + 20 * (1 - a));
        const bb = Math.round(b * a + 24 * (1 - a));
        return `rgb(${rr},${gg},${bb})`;
    });
}

export default function ImportanceDistribution({ areaName, threatLevel = 'Calm' }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const baseColor = THREAT_COLORS[threatLevel] ?? '#6d6d6d';
    const scoreColors = buildScoreColors(baseColor);

    useEffect(() => {
        if (!areaName) return;
        setLoading(true);
        setError(null);
        setData(null);

        fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/importance_distribution?country=${encodeURIComponent(areaName)}`)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(json => {
                setData(json.distribution);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [areaName]);

    const total = data ? data.reduce((s, d) => s + d.count, 0) : 0;
    const maxCount = data ? Math.max(...data.map(d => d.count), 1) : 1;

    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'var(--surface, #111418)',
            borderRadius: 4,
            padding: '20px 24px',
            marginBottom: 8,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{
                    fontFamily: 'var(--mono, monospace)',
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'var(--dim, #7a839f)',
                }}>
                    OSINT Signals · 14 days
                </span>
                {!loading && data && (
                    <span style={{
                        fontFamily: 'var(--mono, monospace)',
                        fontSize: 10,
                        color: 'var(--dim, #7a839f)',
                    }}>
                        {total} events
                    </span>
                )}
            </div>

            {loading && (
                <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, color: 'var(--dim, #7a839f)', textAlign: 'center', padding: '20px 0', letterSpacing: '0.1em' }}>
                    LOADING…
                </div>
            )}

            {error && (
                <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, color: '#ff2d2d', textAlign: 'center', padding: '20px 0' }}>
                    {error}
                </div>
            )}

            {data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.map(({ importance_score, count }) => {
                        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                        // score 1→index 0, score 5→index 4
                        const color = count > 0 ? scoreColors[importance_score - 1] : 'rgba(255,255,255,0.04)';
                        const label = SCORE_LABELS[importance_score];
                        const isCritical = importance_score === 5 && count > 0;

                        return (
                            <div key={importance_score} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {/* Score badge */}
                                <span style={{
                                    fontFamily: 'var(--mono, monospace)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: count > 0 ? scoreColors[importance_score - 1] : '#7a839f',
                                    width: 14,
                                    flexShrink: 0,
                                    textAlign: 'right',
                                }}>
                                    {importance_score}
                                </span>

                                {/* Bar track */}
                                <div style={{
                                    flex: 1,
                                    height: 20,
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: 2,
                                    border: '1px solid rgba(255,255,255,0.04)',
                                    overflow: 'hidden',
                                    position: 'relative',
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: `${pct}%`,
                                        background: color,
                                        borderRadius: 2,
                                        transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                                        ...(isCritical ? {
                                            boxShadow: `0 0 8px ${baseColor}66`,
                                        } : {}),
                                    }} />
                                    <span style={{
                                        position: 'absolute',
                                        left: 8,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        fontFamily: 'var(--mono, monospace)',
                                        fontSize: 10,
                                        color: count > 0 ? 'var(--text-bright, #eef0f5)' : 'var(--dim, #7a839f)',
                                        letterSpacing: '0.04em',
                                        pointerEvents: 'none',
                                    }}>
                                        {label}
                                    </span>
                                </div>

                                {/* Count */}
                                <span style={{
                                    fontFamily: 'var(--display, sans-serif)',
                                    fontSize: 18,
                                    color: count > 0 ? 'var(--text-bright, #eef0f5)' : 'var(--dim, #7a839f)',
                                    width: 38,
                                    textAlign: 'right',
                                    flexShrink: 0,
                                    lineHeight: 1,
                                }}>
                                    {count}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {data && total === 0 && (
                <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11, color: 'var(--dim, #7a839f)', textAlign: 'center', marginTop: 12 }}>
                    No events in the last 14 days
                </div>
            )}
        </div>
    );
}