import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/Map/MapView';
import TopBar from './components/TopBar/TopBar';
import TweetsFeedPanel from './components/TweetsFeedPanel/TweetsFeedPanel';
import AreaPanel from './components/AreaPanel/AreaPanel';
import TensionIndex from './components/AreaPanel/TensionIndex';
import OptionsMenu from './components/OptionsMenu/OptionsMenu';
import { useUsernames } from './hooks/useUsernames';
import { useTweets } from './hooks/useTweets';

export default function App() {

  const [currentDays, setCurrentDays] = useState(1);
  const [currentSearch, setCurrentSearch] = useState('');
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [selectedAreaName, setSelectedAreaName] = useState(null);
  const [selectedLayers, setSelectedLayers] = useState(new Set());
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  const { allusernames, selectedusernames, loadusernames, toggleusername } = useUsernames();
  const { tweets, tweetCount, loadTweets, preloadAll, getRawData } = useTweets();

  const locateHandlerRef = useRef(null);

  // Préchargement initial
  useEffect(() => {
    preloadAll().then(async () => {
      const usernames = await loadusernames(1); // ← loadusernames doit retourner les usernames
      loadTweets(1, usernames, new Set(), '');
    });
  }, []);


  // Rechargement quand les filtres changent
  useEffect(() => {
    loadTweets(currentDays, allusernames, selectedusernames, currentSearch);
  }, [currentDays, allusernames, selectedusernames, currentSearch]); // eslint-disable-line

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
        selectedLayers={selectedLayers}
        onAreaSelect={(name) => {
          setSelectedAreaName(name);
          if (isFeedOpen) setIsFeedOpen(false);
        }}
        isRotating={isRotating}
        onRotationChange={setIsRotating}
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

      <TensionIndex
        areaName={selectedAreaName}
        onLocate={handleLocateTweet}           // ← AJOUTE ÇA SI C'EST ABSENT
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