import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/Map/MapView';
import TopBar from './components/TopBar/TopBar';
import TweetsFeedPanel from './components/TweetsFeedPanel/TweetsFeedPanel';
import AreaPanel from './components/AreaPanel/AreaPanel';
import OptionsMenu from './components/OptionsMenu/OptionsMenu';
import { useAuthors } from './hooks/useAuthors';
import { useTweets } from './hooks/useTweets';

export default function App() {
  console.log('API URL:', process.env.REACT_APP_API_URL);

  const [currentDays, setCurrentDays] = useState(1);
  const [currentSearch, setCurrentSearch] = useState('');
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [selectedAreaName, setSelectedAreaName] = useState(null);
  const [selectedLayers, setSelectedLayers] = useState(new Set());
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  const { allAuthors, selectedAuthors, loadAuthors, toggleAuthor } = useAuthors();
  const { tweets, tweetCount, loadTweets, preloadAll, getRawData } = useTweets();

  const locateHandlerRef = useRef(null);

  // Préchargement initial
  useEffect(() => {
    preloadAll().then(() => {
      loadAuthors(1);
      loadTweets(1, [], new Set(), '');
    });
  }, []); // eslint-disable-line

  // Rechargement quand les filtres changent
  useEffect(() => {
    loadTweets(currentDays, allAuthors, selectedAuthors, currentSearch);
  }, [currentDays, allAuthors, selectedAuthors, currentSearch]); // eslint-disable-line

  const handleDaysChange = useCallback(async (days) => {
    setCurrentDays(days);
    await loadAuthors(days);
  }, [loadAuthors]);

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
        allAuthors={allAuthors}
        selectedAuthors={selectedAuthors}
        currentSearch={currentSearch}
        selectedAreaName={selectedAreaName}
        cachedData={getRawData(currentDays)}
        onLocate={handleLocateTweet}
      />

      <AreaPanel
        areaName={selectedAreaName}
        onClose={() => setSelectedAreaName(null)}
      />

      <OptionsMenu
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(v => !v)}
        allAuthors={allAuthors}
        selectedAuthors={selectedAuthors}
        onToggleAuthor={toggleAuthor}
        selectedLayers={selectedLayers}
        onToggleLayer={handleToggleLayer}
      />

    </div>
  );
}