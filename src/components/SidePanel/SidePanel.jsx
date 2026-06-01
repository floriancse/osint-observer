import { useState, useEffect, useRef } from "react";
import "./SidePanel.css";
import { createPopupHTML } from "../../utils/popupUtils";

const API = process.env.REACT_APP_API_URL;

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

const SkeletonLoader = () => (
    <div className="skeleton-list">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="skeleton-header">
                    <div className="skeleton-avatar" />
                    <div className="skeleton-meta">
                        <div className="skeleton-line skeleton-line--name" />
                        <div className="skeleton-line skeleton-line--handle" />
                    </div>
                    <div className="skeleton-badge" />
                </div>
                <div className="skeleton-body">
                    <div className="skeleton-line skeleton-line--full" />
                    <div className="skeleton-line skeleton-line--full" />
                    <div className="skeleton-line skeleton-line--short" />
                </div>
                <div className="skeleton-footer">
                    <div className="skeleton-line skeleton-line--date" />
                </div>
            </div>
        ))}
    </div>
);

export default function SidePanel({ tweets, collapsed, activeLabel, onLabelChange, onTweetClick, onToggle }) {
    const isLoading = !tweets;

    const tweetFeatures = (tweets?.features || []).filter(f => Boolean(f.properties.label));
    const [lastUpdate, setLastUpdate] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const sortDropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
            if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
                setSortDropdownOpen(false);
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
            } catch (error) { }
        }
        fetchLastUpdate();
    }, []);

    const labelCounts = tweetFeatures.reduce((acc, f) => {
        const label = f.properties.label;
        if (label) acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});

    const uniqueLabels = Object.keys(labelCounts).sort((a, b) => labelCounts[b] - labelCounts[a]);

    const SORT_OPTIONS = [
        { key: 'date', direction: 'desc', label: 'Recent' },
        { key: 'importance_score', direction: 'desc', label: 'Relevant' },
    ];

    const activeSortOption = SORT_OPTIONS.find(
        o => o.key === sortConfig.key && o.direction === sortConfig.direction
    ) || SORT_OPTIONS[0];

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="tweet-count">
                                {isLoading ? '' : `${sortedTweets.length} / ${tweetFeatures.length} events`}
                            </span>
                            {/* Bouton toggle — visible uniquement quand le panel est ouvert */}
                            <button className="sidepanel-toggle" onClick={onToggle} >
                                <svg
                                    width="16" height="16" viewBox="0 0 16 16"
                                    fill="none" xmlns="http://www.w3.org/2000/svg"
                                    style={{ display: 'block', transform: 'scaleX(1)' }}
                                >
                                    <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                    <path d="M9 8 L3 8 M6 5 L3 8 L6 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="subtitle-column">
                        <span className="header-subtitle">Twitter/X stream</span>
                        {lastUpdate && (
                            <div className="last-update-text">
                                Last update: {lastUpdate}
                            </div>
                        )}

                        <div className="filter-controls-row">
                            <div className="sort-dropdown-wrapper" ref={sortDropdownRef}>
                                <button
                                    className={`label-dropdown-trigger label-dropdown-trigger--active${sortDropdownOpen ? ' label-dropdown-trigger--open' : ''}`}
                                    onClick={() => setSortDropdownOpen(o => !o)}
                                    disabled={isLoading}
                                >
                                    <span className="label-dropdown-trigger-text">{activeSortOption.label}</span>
                                    <svg className="label-dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                {sortDropdownOpen && (
                                    <div className="sort-dropdown-menu">
                                        {SORT_OPTIONS.map(opt => (
                                            <button
                                                key={opt.key}
                                                className={`sort-dropdown-item${sortConfig.key === opt.key ? ' active' : ''}`}
                                                onClick={() => { setSortConfig({ key: opt.key, direction: opt.direction }); setSortDropdownOpen(false); }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {!isLoading && uniqueLabels.length > 0 && (
                                <div className="label-dropdown-wrapper" ref={dropdownRef}>
                                    <button
                                        className={`label-dropdown-trigger label-dropdown-trigger--active${dropdownOpen ? ' label-dropdown-trigger--open' : ''}`}
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
            </div>

            <div className="sidepanel-content">
                {isLoading ? (
                    <SkeletonLoader />
                ) : sortedTweets.length > 0 ? (
                    <div className="osint-tweet-list">
                        {sortedTweets.map((feature, i) => (
                            <div
                                key={feature.properties.id ?? i}
                                className="osint-tweet-card-wrapper"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                    if (e.target.closest('.tweet-card-link')) return;
                                    onTweetClick?.(feature);
                                }}
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