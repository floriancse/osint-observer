import { useState, useEffect, useRef } from "react";
import "./SidePanel.css";
import { createPopupHTML } from "../../utils/popupUtils";

const API = process.env.REACT_APP_API_URL;

/**
 * Composant interne pour l'icône de tri SVG (plus visible)
 */
const SortIcon = ({ keyId, sortConfig }) => {
    if (sortConfig.key !== keyId) return null;
    if (sortConfig.direction === 'asc') {
        return (
            <svg className="sort-svg-icon sort-svg-active" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
            </svg>
        );
    }
    return (
        <svg className="sort-svg-icon sort-svg-active" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
};

export default function SidePanel({ tweets, collapsed, activeLabel, onLabelChange }) {
    const tweetFeatures = (tweets?.features || []).filter(f => Boolean(f.properties.label));
    const [lastUpdate, setLastUpdate] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        async function fetchLastUpdate() {
            try {
                const response = await fetch(`${API}/last_update`);
                const data = await response.json();
                if (data.last_update) {
                    const date = new Date(data.last_update).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    setLastUpdate(date);
                }
            } catch (error) {
                console.error("Erreur lors du fetch last_update:", error);
            }
        }
        fetchLastUpdate();
    }, []);

    // --- Extraction des labels uniques ---
    const labelCounts = tweetFeatures.reduce((acc, f) => {
        const label = f.properties.label;
        if (label) acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});

    const uniqueLabels = Object.keys(labelCounts).sort((a, b) => labelCounts[b] - labelCounts[a]);

    // --- Gestion du tri ---
    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    // --- Filtrage par label, puis tri ---
    const filteredTweets = activeLabel
        ? tweetFeatures.filter(f => f.properties.label === activeLabel)
        : tweetFeatures;

    const sortedTweets = [...filteredTweets].sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'date') {
            valA = new Date(a.properties.created_at || a.properties.date || 0).getTime();
            valB = new Date(b.properties.created_at || b.properties.date || 0).getTime();
        } else {
            valA = a.properties.importance_score || 0;
            valB = b.properties.importance_score || 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <div className={`sidepanel${collapsed ? " sidepanel--collapsed" : ""}`}>
            <div className="sidepanel-header">
                <div className="header-main-content">
                    <div className="title-row">
                        <h3>OSINT Feed</h3>
                        <span className="tweet-count">{sortedTweets.length} / {tweetFeatures.length} events</span>
                    </div>
                    <div className="subtitle-column">
                        <span className="header-subtitle">Twitter/X stream</span>
                        {lastUpdate && (
                            <div className="last-update-text">
                                Last update: {lastUpdate}
                            </div>
                        )}

                        {/* --- Contrôles de Tri --- */}
                        <div className="sort-controls">
                            <button
                                className={`sort-btn ${sortConfig.key === 'date' ? 'active' : ''}`}
                                onClick={() => handleSort('date')}
                            >
                                Date
                                <SortIcon keyId="date" sortConfig={sortConfig} />
                            </button>
                            <button
                                className={`sort-btn ${sortConfig.key === 'importance_score' ? 'active' : ''}`}
                                onClick={() => handleSort('importance_score')}
                            >
                                Importance
                                <SortIcon keyId="importance_score" sortConfig={sortConfig} />
                            </button>
                        </div>

                        {/* --- Filtre par label (custom dropdown) --- */}
                        {uniqueLabels.length > 0 && (
                            <div className="label-dropdown-wrapper" ref={dropdownRef}>
                                <button
                                    className={`label-dropdown-trigger ${dropdownOpen ? 'label-dropdown-trigger--open' : ''} ${activeLabel ? 'label-dropdown-trigger--active' : ''}`}
                                    onClick={() => setDropdownOpen(o => !o)}
                                >
                                    <span className="label-dropdown-trigger-text">
                                        {activeLabel || 'All topics'}
                                    </span>
                                    <svg className="label-dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                {dropdownOpen && (
                                    <div className="label-dropdown-menu">
                                        <button
                                            className={`label-dropdown-item ${activeLabel === null ? 'label-dropdown-item--active' : ''}`}
                                            onClick={() => { onLabelChange(null); setDropdownOpen(false); }}
                                        >
                                            All topics
                                        </button>
                                        {uniqueLabels.map(label => (
                                            <button
                                                key={label}
                                                className={`label-dropdown-item ${activeLabel === label ? 'label-dropdown-item--active' : ''}`}
                                                onClick={() => { onLabelChange(label); setDropdownOpen(false); }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="sidepanel-content">
                {sortedTweets.length > 0 ? (
                    <div className="osint-tweet-list">
                        {sortedTweets.map((feature, i) => (
                            <div
                                key={feature.properties.id ?? i}
                                className="osint-tweet-card-wrapper"
                                dangerouslySetInnerHTML={{
                                    __html: createPopupHTML(feature.properties, false, 0, 1, true, true)
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="no-data">No events for this label.</div>
                )}
            </div>
        </div>
    );
}