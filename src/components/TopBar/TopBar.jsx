import React, { useState, useCallback } from 'react';

const IconSearch = () => (
    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

export default function TopBar({
    tweetCount,
    onSearchChange,
    isFeedOpen,
    onFeedToggle,
    isRotating,
    onRotationToggle,
}) {
    const [searchValue, setSearchValue] = useState('');
    const [searchTimeout, setSearchTimeout] = useState(null);

    const handleSearch = useCallback((e) => {
        const value = e.target.value;
        setSearchValue(value);
        clearTimeout(searchTimeout);
        setSearchTimeout(setTimeout(() => onSearchChange(value), 140));
    }, [searchTimeout, onSearchChange]);

    return (
        <div className="top-bar">
            <div className="left-controls">

                <div
                    className={`banner-label${isFeedOpen ? ' active' : ''}`}
                    id="tweets-feed-toggle"
                    onClick={onFeedToggle}
                >
                    <i className="fa-brands fa-x-twitter"></i>
                    OSINT
                </div>

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