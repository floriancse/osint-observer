import React, { useState, useCallback, useRef } from 'react';
import { Crosshair } from '@phosphor-icons/react';

const IconSearch = () => (
    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

export const TIME_PERIODS = [
    { id: '24h', label: '24h', hours: 24 },
    { id: '3d', label: '3d', hours: 72 },
    { id: '7d', label: '7d', hours: 168 },
    { id: '14d', label: '14d', hours: 336 },
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
    isTheatersOpen,
    onTheatersToggle,
    activeTheaterCount = 0,
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


    return (
        <div className="top-bar">
            <div className="left-controls">

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
                {/* Theaters of War button */}
                <div
                    className={`banner-label${isTheatersOpen ? ' active' : ''}`}
                    id="war-theater"
                    onClick={onTheatersToggle}
                    title="Theaters of War"
                    style={{ position: 'relative' }}
                >
                    <Crosshair size={17} weight="bold" />   {/* ou "regular" / "fill" */}
                    Wars
                    {activeTheaterCount > 0 && (
                        <span >
                            {activeTheaterCount}
                        </span>
                    )}
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