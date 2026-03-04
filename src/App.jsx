import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/Map/MapView';
import TopBar from './components/TopBar/TopBar';
import TweetsFeedPanel from './components/TweetsFeedPanel/TweetsFeedPanel';
import AreaPanel from './components/AreaPanel/AreaPanel';
import OptionsMenu from './components/OptionsMenu/OptionsMenu';
import { useUsernames } from './hooks/useUsernames';
import { useTweets } from './hooks/useTweets';

const API = process.env.REACT_APP_API_URL;

export default function App() {
    const [currentDays, setCurrentDays] = useState(1);
    const [currentSearch, setCurrentSearch] = useState('');
    const [isFeedOpen, setIsFeedOpen] = useState(false);
    const [isRotating, setIsRotating] = useState(true);
    const [selectedAreaName, setSelectedAreaName] = useState(null);
    const [selectedLayers, setSelectedLayers] = useState(new Set());
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [militaryActionsData, setMilitaryActionsData] = useState(null);
    const [aggressorRangeData, setAggressorRangeData] = useState(null);

    const { allusernames, selectedusernames, loadusernames, toggleusername } = useUsernames();
    const { tweets, tweetCount, loadTweets, preloadAll, getRawData } = useTweets();
    const locateHandlerRef = useRef(null);

    // Préchargement initial
    useEffect(() => {
        preloadAll().then(async () => {
            const usernames = await loadusernames(1);
            loadTweets(1, usernames, new Set(), '');
        });
    }, []);

    // Rechargement quand les filtres changent
    useEffect(() => {
        loadTweets(currentDays, allusernames, selectedusernames, currentSearch);
    }, [currentDays, allusernames, selectedusernames, currentSearch]); // eslint-disable-line

    // Fetch military actions quand l'area ou les jours changent
    useEffect(() => {
        if (!selectedAreaName) {
            setMilitaryActionsData(null);
            setAggressorRangeData(null);
            return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - currentDays);

        const params = new URLSearchParams({
            aggressor: selectedAreaName,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
        });

        fetch(`${API}/api/twitter_conflicts/military_actions.geojson?${params}`)
            .then(res => res.json())
            .then(setMilitaryActionsData)
            .catch(err => console.error('Erreur military actions:', err));

        fetch(`${API}/api/twitter_conflicts/aggressor_range.geojson?aggressor=${encodeURIComponent(selectedAreaName)}`)
            .then(res => res.json())
            .then(setAggressorRangeData)
            .catch(err => console.error('Erreur aggressor range:', err));

    }, [selectedAreaName, currentDays]);

    const handleAreaSelect = useCallback((name) => {
        setSelectedAreaName(name);
        if (isFeedOpen) setIsFeedOpen(false);
        if (!name) setMilitaryActionsData(null);
    }, [isFeedOpen]);

    const handleDaysChange = useCallback(async (days) => {
        setCurrentDays(days);
        await loadusernames(days);
    }, [loadusernames]);

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
                militaryActionsData={militaryActionsData}
                selectedLayers={selectedLayers}
                onAreaSelect={handleAreaSelect}
                isRotating={isRotating}
                onRotationChange={setIsRotating}
                aggressorRangeData={aggressorRangeData}
                registerLocateHandler={registerLocateHandler}
            />
            <TopBar
                currentDays={currentDays}
                onDaysChange={handleDaysChange}
                tweetCount={tweetCount}
                onSearchChange={setCurrentSearch}
                isFeedOpen={isFeedOpen}
                onFeedToggle={() => setIsFeedOpen(v => !v)}
                isRotating={isRotating}
                onRotationToggle={() => setIsRotating(v => !v)}
            />
            <TweetsFeedPanel
                isOpen={isFeedOpen}
                onClose={() => setIsFeedOpen(false)}
                currentDays={currentDays}
                allusernames={allusernames}
                selectedusernames={selectedusernames}
                currentSearch={currentSearch}
                selectedAreaName={selectedAreaName}
                cachedData={getRawData(currentDays)}
                onLocate={handleLocateTweet}
            />
            <AreaPanel
                areaName={selectedAreaName}
                onClose={() => setSelectedAreaName(null)}
                onLocate={handleLocateTweet}
            />
            <OptionsMenu
                isOpen={isOptionsOpen}
                onClose={() => setIsOptionsOpen(v => !v)}
                allusernames={allusernames}
                selectedusernames={selectedusernames}
                onToggleusername={toggleusername}
                selectedLayers={selectedLayers}
                onToggleLayer={handleToggleLayer}
            />
        </div>
    );
}