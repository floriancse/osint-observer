// TargetBreakdown.jsx
import React, { useState, useEffect } from 'react';
import { WEAPON_ICON_CONFIG } from '../shared/weaponIconConfig';

const DIM    = '#7a839f';
const RED    = '#ff2d2d';
const RED_LT = '#ff6b6b';

export default function TargetBreakdown({ areaName }) {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(null); // target name currently expanded

    useEffect(() => {
        if (!areaName) return;
        setLoading(true);
        setData(null);
        setExpanded(null);

        fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/target_breakdown?country=${encodeURIComponent(areaName)}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(json => { setData(json); setLoading(false); })
            .catch(() => setLoading(false));
    }, [areaName]);

    if (loading) return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.label}>ATTACKS BREAKDOWN</span>
                <span style={styles.meta}>14 days</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[80, 60, 45, 35].map((w, i) => (
                    <div key={i} style={{ ...styles.skeleton, width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
            </div>
            <style>{`@keyframes skeletonPulse { 0%,100%{opacity:.3} 50%{opacity:.7} }`}</style>
        </div>
    );

    if (!data?.targets?.length) return null;

    const grandTotal = data.targets.reduce((s, t) => s + t.total, 0);
    const maxTotal   = data.targets[0].total;

    return (
        <div style={styles.container}>
            <style>{`
                @keyframes growBar { from { width: 0% } }
                @keyframes skeletonPulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
                @keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <span style={styles.label}>ATTACKS BREAKDOWN</span>
                <span style={styles.meta}>14 days · {grandTotal} events · {data.targets.length} targets</span>
            </div>

            {/* Target rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.targets.map((target, i) => {
                    const isOpen = expanded === target.target;
                    const barW   = Math.round((target.total / maxTotal) * 100);
                    const pct    = Math.round((target.total / grandTotal) * 100);

                    return (
                        <div key={target.target}>
                            {/* Target row — clickable */}
                            <div
                                style={{
                                    ...styles.targetRow,
                                    background: isOpen
                                        ? 'rgba(255,45,45,0.06)'
                                        : 'rgba(255,255,255,0.03)',
                                    borderColor: isOpen
                                        ? 'rgba(255,45,45,0.15)'
                                        : 'rgba(255,255,255,0.06)',
                                }}
                                onClick={() => setExpanded(isOpen ? null : target.target)}
                                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                            >
                                {/* Left : dot + country chip */}
                                <div style={styles.targetLeft}>
                                    <span style={styles.dot} />
                                    <span style={styles.arrow}>→</span>
                                    <span style={styles.chip}>{target.target}</span>
                                </div>

                                {/* Right : bar + count + pct */}
                                <div style={styles.targetRight}>
                                    <div style={styles.miniBarBg}>
                                        <div style={{
                                            ...styles.miniBarFill,
                                            width: `${barW}%`,
                                            animationDelay: `${i * 0.06}s`,
                                        }} />
                                    </div>
                                    <span style={styles.targetCount}>{target.total}</span>
                                    <span style={styles.targetPct}>{pct}%</span>
                                    <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                                </div>
                            </div>

                            {/* Action breakdown — expanded */}
                            {isOpen && (
                                <div style={styles.actionList}>
                                    {target.actions.map((item, j) => {
                                        const cfg  = WEAPON_ICON_CONFIG[item.action] ?? WEAPON_ICON_CONFIG['Other'];
                                        const Icon = cfg.icon;
                                        const aPct = Math.round((item.count / target.total) * 100);
                                        const aBar = Math.round((item.count / target.actions[0].count) * 100);

                                        return (
                                            <div key={item.action} style={{ ...styles.actionRow, animationDelay: `${j * 0.05}s` }}>
                                                <div style={styles.actionLeft}>
                                                    <div style={styles.iconWrap}>
                                                        <Icon size={15} color={DIM} weight={cfg.weight} />
                                                    </div>
                                                    <span style={styles.actionName}>{item.action}</span>
                                                </div>
                                                <div style={styles.actionRight}>
                                                    <div style={styles.actionBarBg}>
                                                        <div style={{
                                                            ...styles.actionBarFill,
                                                            width: `${aBar}%`,
                                                            animationDelay: `${j * 0.07}s`,
                                                        }} />
                                                    </div>
                                                    <span style={styles.actionCount}>{item.count}</span>
                                                    <span style={styles.actionPct}>{aPct}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const styles = {
    container: {
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--surface)',
        borderRadius: 4,
        padding: '16px 20px',
        marginBottom: 8,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    label: {
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--dim)',
    },
    meta: {
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--dim)',
    },
    skeleton: {
        height: 28,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.05)',
        animation: 'skeletonPulse 1.4s ease infinite',
    },

    /* Target row */
    targetRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 2,
    },
    targetLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        minWidth: 0,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'rgba(255,45,45,0.5)',
        flexShrink: 0,
    },
    arrow: {
        color: 'rgba(255,45,45,0.5)',
        fontSize: 13,
        flexShrink: 0,
    },
    chip: {
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    targetRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        marginLeft: 12,
    },
    miniBarBg: {
        width: 60,
        height: 3,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    miniBarFill: {
        height: '100%',
        borderRadius: 2,
        background: RED,
        animation: 'growBar 0.6s cubic-bezier(0.16,1,0.3,1) both',
    },
    targetCount: {
        fontFamily: 'var(--display)',
        fontSize: 15,
        fontWeight: 700,
        color: RED_LT,
        lineHeight: 1,
    },
    targetPct: {
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--dim)',
        minWidth: 28,
        textAlign: 'right',
    },
    chevron: {
        color: 'var(--dim)',
        fontSize: 16,
        lineHeight: 1,
        transition: 'transform 0.2s',
        userSelect: 'none',
    },

    /* Action breakdown (expanded) */
    actionList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px 10px 24px',
        borderLeft: `1px solid rgba(255,45,45,0.12)`,
        marginLeft: 12,
        marginBottom: 4,
        animation: 'fadeIn 0.2s ease both',
    },
    actionRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: 'fadeIn 0.25s ease both',
    },
    actionLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
    },
    iconWrap: {
        width: 20,
        height: 20,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
    },
    actionName: {
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: DIM,
    },
    actionRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    actionBarBg: {
        width: 50,
        height: 2,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    actionBarFill: {
        height: '100%',
        borderRadius: 2,
        background: DIM,
        animation: 'growBar 0.5s cubic-bezier(0.16,1,0.3,1) both',
    },
    actionCount: {
        fontFamily: 'var(--display)',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--text)',
        lineHeight: 1,
    },
    actionPct: {
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--dim)',
        minWidth: 28,
        textAlign: 'right',
    },
};