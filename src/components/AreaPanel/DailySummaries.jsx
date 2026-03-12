import React, { useEffect, useState } from 'react';

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

export default function DailySummaries({ areaName, tensionLevel }) {
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);

    const color = getTensionColor(tensionLevel);

    useEffect(() => {
        if (!areaName) return;
        setLoading(true);
        setSummaries([]);

        fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/daily_summaries?country=${encodeURIComponent(areaName)}`)
            .then(r => r.json())
            .then(data => { setSummaries(data.summaries ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [areaName]);

    if (loading) return <div className="t-loading"></div>;

    return (
        <div className="t-events-section" style={{ '--event-dot-color': color }}>
            <div className="t-events-header">
                <span className="t-events-label">Daily activities</span>
                <span className="t-events-count">{summaries.length} entries</span>
            </div>

            {summaries.length === 0 ? (
                <div className="t-empty">No summaries available.</div>
            ) : (
                <ul className="t-timeline">
                    {summaries.map((s, i) => {
                        const date = s.date
                            ? new Date(s.date).toLocaleDateString('en-CA')
                            : '—';
                        return (
                            <li
                                key={i}
                                className={`t-event${i === 0 ? ' active' : ''}`}
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
    );
}