import React, { useState, useCallback, useRef, useEffect } from 'react';

const IconSearch = () => (
    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const IconCalendar = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

function toDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MiniCalendar({ selectedDate, onDayClick, onClose }) {
    const today = new Date();
    const todayKey = toDateKey(today);
    const [monthOffset, setMonthOffset] = useState(0);

    const refDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const isCurrentMonth = monthOffset === 0;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const monthName = refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
    }
    while (days.length % 7 !== 0) days.push(null);

    const handleClick = (d) => {
        const key = toDateKey(d);
        if (selectedDate === key) {
            onDayClick(null);
        } else {
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
            const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
            onDayClick({ dateKey: key, start: start.toISOString(), end: end.toISOString() });
        }
        onClose();
    };

    return (
        <div className="topbar-calendar-dropdown">
            <div className="topbar-cal-header">
                <button className="topbar-cal-nav" onClick={() => setMonthOffset(o => o - 1)}>‹</button>
                <span className="topbar-cal-month">{monthName}</span>
                <button
                    className="topbar-cal-nav"
                    disabled={isCurrentMonth}
                    onClick={() => setMonthOffset(o => Math.min(o + 1, 0))}
                >›</button>
            </div>

            <div className="topbar-cal-grid">
                {DOW.map((d, i) => (
                    <div key={i} className="topbar-cal-dow">{d}</div>
                ))}
                {days.map((d, i) =>
                    d === null
                        ? <div key={i} className="topbar-cal-day empty" />
                        : (() => {
                            const key = toDateKey(d);
                            const isToday = key === todayKey;
                            const isSelected = key === selectedDate;
                            const isFuture = d > today;
                            return (
                                <div
                                    key={i}
                                    className={[
                                        'topbar-cal-day',
                                        isToday ? 'today' : '',
                                        isSelected ? 'selected' : '',
                                        isFuture ? 'future' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => !isFuture && handleClick(d)}
                                >
                                    {d.getDate()}
                                </div>
                            );
                        })()
                )}
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
    selectedDate,
    onDayClick,
}) {
    const [searchValue, setSearchValue] = useState('');
    const [searchTimeout, setSearchTimeout] = useState(null);
    const [calOpen, setCalOpen] = useState(false);
    const calRef = useRef(null);

    const handleSearch = useCallback((e) => {
        const value = e.target.value;
        setSearchValue(value);
        clearTimeout(searchTimeout);
        setSearchTimeout(setTimeout(() => onSearchChange(value), 140));
    }, [searchTimeout, onSearchChange]);

    // Ferme le calendrier si clic en dehors
    useEffect(() => {
        if (!calOpen) return;
        const handler = (e) => {
            if (calRef.current && !calRef.current.contains(e.target)) setCalOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [calOpen]);

    const isFiltered = selectedDate && selectedDate !== toDateKey(new Date());

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
                                {/* Calendrier */}
                <div className="topbar-cal-wrapper" ref={calRef}>
                    <button
                        className={`topbar-cal-btn${calOpen ? ' open' : ''}${isFiltered ? ' filtered' : ''}`}
                        onClick={() => setCalOpen(v => !v)}
                        title={isFiltered ? `Filtered: ${selectedDate}` : 'Filter by date'}
                    >
                        <IconCalendar />
                        <span className="topbar-cal-btn-label">
                            {isFiltered ? selectedDate : 'Today'}
                        </span>
                        {isFiltered && <span className="topbar-cal-dot" />}
                    </button>

                    {calOpen && (
                        <MiniCalendar
                            selectedDate={selectedDate}
                            onDayClick={onDayClick}
                            onClose={() => setCalOpen(false)}
                        />
                    )}
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