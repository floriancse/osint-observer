import React, { useEffect, useState, useCallback } from 'react';
import TweetItem from './TweetItem';
import { getTodayRange } from '../../hooks/useTweets';

export default function TweetsFeedPanel({
  isOpen,
  onClose,
  allusernames,
  selectedusernames,
  currentSearch,
  selectedAreaName,
  cachedData,
  onLocate,
  dateOverride,
}) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // ← ici, pas dans le useCallback

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      const { start, end } = dateOverride ?? getTodayRange();

      if (selectedAreaName) {
        const url = `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}&area=${encodeURIComponent(selectedAreaName)}`;
        const response = await fetch(url);
        data = await response.json();
      } else if (cachedData) {
        data = cachedData;
      } else {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`
        );
        data = await response.json();
      }

      const usernamesToShow = allusernames.filter(a => !selectedusernames.has(a));

      let filtered = (data.features || []).filter(f => {
        const usernameMatch =
          usernamesToShow.length === 0 ||
          usernamesToShow.length === allusernames.length ||
          usernamesToShow.includes(f.properties.username);
        const searchMatch =
          !currentSearch.trim() ||
          f.properties.text.toLowerCase().includes(currentSearch.toLowerCase());
        return usernameMatch && searchMatch;
      });

      filtered.sort((a, b) => {
        if (sortBy === 'score') {
          return (b.properties.importance_score ?? 0) - (a.properties.importance_score ?? 0)
            || new Date(b.properties.created_at) - new Date(a.properties.created_at);
        }
        return new Date(b.properties.created_at) - new Date(a.properties.created_at);
      });

      setFeatures(filtered);
    } catch (err) {
      console.error('Erreur feed:', err);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [dateOverride, allusernames, selectedusernames, currentSearch, selectedAreaName, cachedData, sortBy]);

  useEffect(() => {
    if (isOpen) loadFeed();
  }, [isOpen, loadFeed]);

  return (
    <div className={`tweets-feed-panel${isOpen ? ' visible' : ''}`}>
      <div className="panel-header">
        <div className="panel-titles">
          <h2>OSINT Feed</h2>
          <h3>Last events</h3>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="feed-sort-toggle">
        <button
          className={`feed-sort-btn${sortBy === 'date' ? ' active' : ''}`}
          onClick={() => setSortBy('date')}
        >
          Date
        </button>
        <button
          className={`feed-sort-btn${sortBy === 'score' ? ' active' : ''}`}
          onClick={() => setSortBy('score')}
        >
          Importance
        </button>
      </div>

      <div className="tweets-feed-content">
        {loading && <div className="feed-loading">Loading tweets...</div>}
        {!loading && features.length === 0 && (
          <div className="feed-empty">No tweets found for this period</div>
        )}
        {!loading && features.map((feature, i) => (
          <TweetItem
            key={feature.properties.id || i}
            feature={feature}
            onLocate={onLocate}
          />
        ))}
      </div>
    </div>
  );
}