import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/Map/MapView';
import TopBar, { TIME_PERIODS, buildPeriodOverride } from './components/TopBar/TopBar';
import TweetsFeedPanel from './components/TweetsFeedPanel/TweetsFeedPanel';
import AreaPanel from './components/AreaPanel/AreaPanel';
import { useUsernames } from './hooks/useUsernames';
import { useTweets } from './hooks/useTweets';
import DailySummaries from './components/AreaPanel/DailySummaries';

// Default period: last 24h
const DEFAULT_PERIOD = TIME_PERIODS.find(p => p.id === '24h');

export default function App() {
    const [activeGroups, setActiveGroups] = useState([]);
    const [currentSearch, setCurrentSearch] = useState('');
    const [isFeedOpen, setIsFeedOpen] = useState(false);
    const [isRotating, setIsRotating] = useState(true);
    const [selectedAreaName, setSelectedAreaName] = useState(null);
    const [selectedLayers, setSelectedLayers] = useState(new Set());
    const [activePeriod, setActivePeriod] = useState(DEFAULT_PERIOD);
    const [dateOverride, setDateOverride] = useState(() => buildPeriodOverride(DEFAULT_PERIOD));

    const { allusernames, selectedusernames, loadusernames, toggleusername } = useUsernames();
    const { tweets, tweetCount, loadTweets, preloadAll, getRawData } = useTweets();
    const locateHandlerRef = useRef(null);

    // Refresh dateOverride every minute so the window stays current
    useEffect(() => {
        const id = setInterval(() => {
            setDateOverride(buildPeriodOverride(activePeriod));
        }, 60_000);
        return () => clearInterval(id);
    }, [activePeriod]);

    useEffect(() => {
        preloadAll().then(async () => {
            const usernames = await loadusernames();
            loadTweets(usernames, new Set(), '', buildPeriodOverride(DEFAULT_PERIOD));
        });
    }, []); // eslint-disable-line

    useEffect(() => {
        loadTweets(allusernames, selectedusernames, currentSearch, dateOverride);
    }, [allusernames, selectedusernames, currentSearch, dateOverride]); // eslint-disable-line

    const handlePeriodChange = useCallback((period) => {
        setActivePeriod(period);
        setDateOverride(buildPeriodOverride(period));
    }, []);

    const handleAreaSelect = useCallback((name) => {
        setSelectedAreaName(name);
        if (isFeedOpen) setIsFeedOpen(false);
    }, [isFeedOpen]);

    const handleToggleLayer = useCallback((layerId) => {
        setSelectedLayers(prev => {
            const next = new Set(prev);
            if (next.has(layerId)) next.delete(layerId);
            else next.add(layerId);
            return next;
        });
    }, []);

    const handleLocateTweet = useCallback((feature) => {
        if (locateHandlerRef.current) locateHandlerRef.current(feature);
        if (window.innerWidth <= 640) setIsFeedOpen(false);
    }, []);

    const registerLocateHandler = useCallback((fn) => {
        locateHandlerRef.current = fn;
    }, []);

    const handleGroupToggle = useCallback((groupId) => {
        setActiveGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    }, []);

    return (
        <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
            <MapView
                tweetsData={tweets}
                selectedLayers={selectedLayers}
                onAreaSelect={handleAreaSelect}
                isRotating={isRotating}
                onRotationChange={setIsRotating}
                registerLocateHandler={registerLocateHandler}
                dateOverride={dateOverride}
                activeGroups={activeGroups}
            />
            <TopBar
                tweetCount={tweetCount}
                onSearchChange={setCurrentSearch}
                isFeedOpen={isFeedOpen}
                onFeedToggle={() => setIsFeedOpen(v => !v)}
                isRotating={isRotating}
                onRotationToggle={() => setIsRotating(v => !v)}
                activePeriodId={activePeriod.id}
                onPeriodChange={handlePeriodChange}
                activeGroups={activeGroups}
                onGroupToggle={handleGroupToggle}
            />
            <TweetsFeedPanel
                isOpen={isFeedOpen}
                onClose={() => setIsFeedOpen(false)}
                allusernames={allusernames}
                selectedusernames={selectedusernames}
                currentSearch={currentSearch}
                selectedAreaName={selectedAreaName}
                cachedData={getRawData(dateOverride)}
                onLocate={handleLocateTweet}
                dateOverride={dateOverride}
            />
            <AreaPanel
                areaName={selectedAreaName}
                onClose={() => setSelectedAreaName(null)}
                onLocate={handleLocateTweet}
                selectedDate={dateOverride?.dateKey ?? null}
            />
        </div>
    );
}