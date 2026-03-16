import React, { useState, useCallback, useRef } from 'react';

const IconSearch = () => (
    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const IconCrosshair = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="22" y1="12" x2="18" y2="12" />
        <line x1="6" y1="12" x2="2" y2="12" />
        <line x1="12" y1="6" x2="12" y2="2" />
        <line x1="12" y1="22" x2="12" y2="18" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

export const ARMED_GROUPS = [
    {
        id: 'africa_corps',
        name: 'Africa Corps',
        aka: 'ex-Wagner',
        region: 'Sahel / Central Africa',
        color: '#e05c5c',
        flag: 'RU',
    },
    {
        id: 'jnim',
        name: 'JNIM',
        aka: "Jama'at Nusrat al-Islam",
        region: 'Sahel',
        color: '#e08f3a',
        flag: 'IS',
    },
    {
        id: 'iswap',
        name: 'ISWAP',
        aka: 'IS West Africa Province',
        region: 'Lake Chad Basin',
        color: '#c94040',
        flag: 'IS',
    },
    {
        id: 'taliban',
        name: 'Taliban',
        aka: 'Islamic Emirate of Afghanistan',
        region: 'Afghanistan',
        color: '#5a9e5a',
        flag: 'AF',
    },
    {
        id: 'hezbollah',
        name: 'Hezbollah',
        aka: 'Party of God',
        region: 'Lebanon / Middle East',
        color: '#4a8f4a',
        flag: 'LB',
    },
    {
        id: 'houthis',
        name: 'Houthis',
        aka: 'Ansar Allah',
        region: 'Yemen / Red Sea',
        color: '#b8473d',
        flag: 'YE',
    },
];

export const TIME_PERIODS = [
    { id: '12h',  label: '12h',  hours: 12  },
    { id: '24h',  label: '24h',  hours: 24  },
    { id: '3d',   label: '3j',   hours: 72  },
    { id: '7d',   label: '7j',   hours: 168 },
];

/**
 * Builds a dateOverride object compatible with useTweets / App
 * from a period definition { hours }.
 */
export function buildPeriodOverride(period) {
    const now = new Date();
    const start = new Date(now.getTime() - period.hours * 60 * 60 * 1000);
    // dateKey = today (for display / heatmap compatibility)
    const dateKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return {
        dateKey,
        start: start.toISOString(),
        end: now.toISOString(),
        periodId: period.id,
    };
}

function ArmedGroupsMenu({ activeGroups, onToggle, onClose }) {
    const ref = useRef(null);

    return (
        <div className="armed-groups-dropdown" ref={ref}>
            <div className="armed-groups-header">
                <span className="armed-groups-title">ARMED GROUPS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="armed-groups-count">{activeGroups.length}/{ARMED_GROUPS.length} active</span>
                    <button className="topbar-cal-nav" onClick={onClose}>✕</button>
                </div>
            </div>
            <div className="armed-groups-list">
                {ARMED_GROUPS.map(group => {
                    const isActive = activeGroups.includes(group.id);
                    return (
                        <div
                            key={group.id}
                            className={`armed-group-item${isActive ? ' active' : ''}`}
                            onClick={() => onToggle(group.id)}
                            style={{ '--group-color': group.color }}
                        >
                            <div className="armed-group-indicator" />
                            <div className="armed-group-info">
                                <div className="armed-group-name">{group.name}</div>
                                <div className="armed-group-meta">
                                    <span className="armed-group-aka">{group.aka}</span>
                                    <span className="armed-group-region">{group.region}</span>
                                </div>
                            </div>
                            <div className="armed-group-check">
                                {isActive ? (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function TopBar({
    tweetCount,
    onSearchChange,
    isFeedOpen,
    onFeedToggle,
    isRotating,
    onRotationToggle,
    activePeriodId,
    onPeriodChange,
    activeGroups = [],
    onGroupToggle,
}) {
    const [searchValue, setSearchValue] = useState('');
    const [searchTimeout, setSearchTimeout] = useState(null);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const groupsRef = useRef(null);

    const handleSearch = useCallback((e) => {
        const value = e.target.value;
        setSearchValue(value);
        clearTimeout(searchTimeout);
        setSearchTimeout(setTimeout(() => onSearchChange(value), 140));
    }, [searchTimeout, onSearchChange]);

    const hasActiveGroups = activeGroups.length > 0;

    return (
        <div className="top-bar">
            <div className="left-controls">

                {/* 1. Armed Groups */}
{/*                 <div style={{ position: 'relative' }} ref={groupsRef}>
                    <button
                        className={`armed-groups-btn${groupsOpen ? ' open' : ''}${hasActiveGroups ? ' has-active' : ''}`}
                        onClick={() => setGroupsOpen(v => !v)}
                        title="Filter by armed group"
                    >
                        <IconCrosshair />
                        <span>Groups</span>
                    </button>

                    {groupsOpen && (
                        <ArmedGroupsMenu
                            activeGroups={activeGroups}
                            onToggle={(id) => onGroupToggle && onGroupToggle(id)}
                            onClose={() => setGroupsOpen(false)}
                        />
                    )}
                </div> */}

                {/* 2. Period selector */}
                <div className="time-group">
                    {TIME_PERIODS.map(period => (
                        <button
                            key={period.id}
                            className={`time-btn${activePeriodId === period.id ? ' active' : ''}`}
                            onClick={() => onPeriodChange && onPeriodChange(period)}
                            title={`Last ${period.label}`}
                        >
                            {period.label}
                        </button>
                    ))}
                </div>

                {/* 3. OSINT Feed */}
                <div
                    className={`banner-label${isFeedOpen ? ' active' : ''}`}
                    id="tweets-feed-toggle"
                    onClick={onFeedToggle}
                >
                    <i className="fa-brands fa-x-twitter"></i>
                    OSINT
                </div>

                {/* 4. Events */}
                <div id="tweet-count">
                    <i className="fas fa-eye eye-icon"></i>
                    {' '}{tweetCount} event{tweetCount > 1 ? 's' : ''}
                </div>

            </div>

            <div className="right-controls">
                <button
                    id="rotationToggleBtn"
                    className={`rotation-btn${isRotating ? ' active' : ''}`}
                    onClick={onRotationToggle}
                >
                    {isRotating ? '⏸' : '▶'}
                </button>

                <div className="search-input-wrapper">
                    <input
                        type="text"
                        id="tweet-search"
                        placeholder="Filter events by keyword"
                        autoComplete="off"
                        value={searchValue}
                        onChange={handleSearch}
                    />
                    <IconSearch />
                </div>
            </div>
        </div>
    );
}