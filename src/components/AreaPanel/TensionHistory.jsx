import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

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

export default function TensionHistory({ areaName, niveauTension, onLoaded }) {

    const color = getTensionColor(niveauTension);
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!areaName) return;

        fetch(
            `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tension_history` +
            `?country=${encodeURIComponent(areaName)}`
        )
            .then(r => r.json())
            .then(({ history }) => {
                if (!history?.length) { setError(true); return; }
                onLoaded?.();
                const labels = history.map(h =>
                    new Date(h.snapshot_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                );
                const scores = history.map(h => h.tension_score);

                if (chartRef.current) chartRef.current.destroy();

                chartRef.current = new Chart(canvasRef.current, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            data: scores,
                            borderColor: color,
                            backgroundColor: `${color}14`,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            pointBackgroundColor: color,
                            fill: true,
                            tension: 0.3,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                        },
                        scales: {
                            y: {
                                min: 0,
                                max: 100,
                                ticks: {
                                    stepSize: 25,
                                    font: { family: "'Roboto Mono', monospace", size: 10 },
                                    color: '#7a839f',
                                },
                                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                                border: { display: false }
                            },
                            x: {
                                ticks: {
                                    font: { family: "'Roboto Mono', monospace", size: 10 },
                                    color: '#7a839f',
                                    maxRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 7
                                },
                                grid: { display: false },
                                border: { display: false }
                            }
                        }
                    }
                });
            })
            .catch(() => setError(true));

        return () => { if (chartRef.current) chartRef.current.destroy(); };
    }, [areaName, niveauTension]);

    if (error) return null;

    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: '#111418',
            borderRadius: '4px',
            padding: '20px 24px',
            marginBottom: '8px',
        }}>
            <p style={{
                fontFamily: "'Roboto Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#7a839f',
                margin: '0 0 14px 0',
            }}>
                Tension history
            </p>
            {/* Le wrapper avec height explicite est critique pour Chart.js */}
            <div style={{ position: 'relative', width: '100%', height: 120 }}>
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
}