import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/Map/MapView';
import TopBar from './components/TopBar/TopBar';
import TweetsFeedPanel from './components/TweetsFeedPanel/TweetsFeedPanel';
import AreaPanel from './components/AreaPanel/AreaPanel';
import { useUsernames } from './hooks/useUsernames';
import { useTweets, getTodayRange } from './hooks/useTweets';

function getTodayOverride() {
    const now = new Date();
    // dateKey calculé depuis la date LOCALE, pas depuis l'ISO string
    const dateKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const range = getTodayRange();
    return { dateKey, start: range.start, end: range.end };
}

export default function App() {
    const [currentSearch, setCurrentSearch] = useState('');
    const [isFeedOpen, setIsFeedOpen] = useState(false);
    const [isRotating, setIsRotating] = useState(true);
    const [selectedAreaName, setSelectedAreaName] = useState(null);
    const [selectedLayers, setSelectedLayers] = useState(new Set());
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [dateOverride, setDateOverride] = useState(getTodayOverride);

    const { allusernames, selectedusernames, loadusernames, toggleusername } = useUsernames();
    const { tweets, tweetCount, loadTweets, preloadAll, getRawData } = useTweets();
    const locateHandlerRef = useRef(null);

    useEffect(() => {
        preloadAll().then(async () => {
            const usernames = await loadusernames();
            loadTweets(usernames, new Set(), '', getTodayOverride());
        });
    }, []); // eslint-disable-line

    useEffect(() => {
        loadTweets(allusernames, selectedusernames, currentSearch, dateOverride);
    }, [allusernames, selectedusernames, currentSearch, dateOverride]); // eslint-disable-line

    const handleDayClick = useCallback((range) => {
        console.log('handleDayClick', range);
        setDateOverride(range ?? getTodayOverride());
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
            />
            <TopBar
                tweetCount={tweetCount}
                onSearchChange={setCurrentSearch}
                isFeedOpen={isFeedOpen}
                onFeedToggle={() => setIsFeedOpen(v => !v)}
                isRotating={isRotating}
                onRotationToggle={() => setIsRotating(v => !v)}
                selectedDate={dateOverride?.dateKey ?? null}
                onDayClick={handleDayClick}
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
                onDayClick={handleDayClick}
                selectedDate={dateOverride?.dateKey ?? null}
            />

        </div>
    );
}