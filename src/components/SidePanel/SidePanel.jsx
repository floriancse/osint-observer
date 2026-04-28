import { useState, useEffect } from "react";
import "./SidePanel.css";
import { createPopupHTML } from "../../utils/popupUtils";

const API = process.env.REACT_APP_API_URL;

/**
 * Composant interne pour l'icône de tri SVG (plus visible)
 */
const SortIcon = ({ keyId, sortConfig }) => {
    // Si ce n'est pas la clé de tri active : icône de double sens neutre
    if (sortConfig.key !== keyId) {
        return null
    }
    // Si tri ascendant : flèche vers le haut
    if (sortConfig.direction === 'asc') {
        return (
            <svg className="sort-svg-icon sort-svg-active" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
            </svg>
        );
    }
    // Si tri descendant : flèche vers le bas
    return (
        <svg className="sort-svg-icon sort-svg-active" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
};

export default function SidePanel({ tweets, collapsed }) {
    const tweetFeatures = tweets?.features || [];
    const [lastUpdate, setLastUpdate] = useState(null);

    // --- État pour le tri (Date / Descendant par défaut) ---
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

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

    // --- Gestion du changement de tri ---
    const handleSort = (key) => {
        let direction = 'desc';
        // Si on clique sur la même clé, on inverse le sens
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    // --- Application du tri sur les données ---
    const sortedTweets = [...tweetFeatures].sort((a, b) => {
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
                        <span className="tweet-count">{tweetFeatures.length} events</span>
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
                    <div className="no-data"></div>
                )}
            </div>
        </div>
    );
}