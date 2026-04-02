import React, { useState, useEffect } from 'react';
import './TheatersPanel.css';

function TheaterCard({ theater, isActive, onToggle }) {
    const campA = theater.camp_a ? theater.camp_a.split(', ').filter(Boolean) : [];
    const campB = theater.camp_b ? theater.camp_b.split(', ').filter(Boolean) : [];
    const hasCamps = campA.length > 0 || campB.length > 0;

    return (
        <div className={`tc-card${isActive ? ' tc-card--active' : ''}`}>
            <div className="tc-card__header">
                <div className="tc-card__meta">
                    <span className="tc-card__name">{theater.name}</span>
                    <div className="tc-card__meta-row">
                        <span className="tc-card__date">{theater.snapshot_date}</span>
                        <span className="tc-card__actors-count">
                            {theater.nb_actors} actor{theater.nb_actors > 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {hasCamps && (
                <div className="tc-card__body">
                    <div className="tc-camp tc-camp--a">

                        <div className="tc-card__tags">
                            {campA.map((actor, i) => (
                                <span key={i} className="tc-tag tc-tag--a">{actor}</span>
                            ))}
                        </div>
                    </div>

                    <div className="tc-camp tc-camp--b">

                        <div className="tc-card__tags">
                            {campB.map((actor, i) => (
                                <span key={i} className="tc-tag tc-tag--b">{actor}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isActive && <div className="tc-card__active-bar" />}
        </div>
    );
}

export default function TheatersPanel({ isOpen, onClose, activeTheaters = [], onTheaterToggle }) {
    const [theaters, setTheaters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTheaters = async () => {
            try {
                const response = await fetch(
                    `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/conflict_theaters`
                );
                if (!response.ok) throw new Error('Failed to load theaters');

                const data = await response.json();
                setTheaters(data.theaters || data);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTheaters();
    }, []);

    if (loading) return <div className="tp-loading">Loading theaters of conflict...</div>;
    if (error) return <div className="tp-error">Error: {error}</div>;

    const activeCount = activeTheaters.length;

    return (
        <>
            {isOpen && <div className="tp-backdrop" onClick={onClose} />}

            <div className={`tp-panel${isOpen ? ' tp-panel--open' : ''}`}>



                {/* Liste des théâtres */}
                <div className="tp-list">
                    {theaters.map(theater => (
                        <TheaterCard
                            key={theater.theater_id}
                            theater={theater}
                            isActive={activeTheaters.includes(theater.theater_id)}
                            onToggle={onTheaterToggle}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}