import React, { useEffect, useState, useCallback } from 'react';
import TweetItem from './TweetItem';
import { getDateRange } from '../../utils/helpers';

export default function TweetsFeedPanel({
  isOpen,
  onClose,
  currentDays,
  allAuthors,
  selectedAuthors,
  currentSearch,
  selectedAreaName,
  cachedData,
  onLocate,
}) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      let data;

      if (selectedAreaName) {
        const { start, end } = getDateRange(currentDays);
        const url = `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}&area=${encodeURIComponent(selectedAreaName)}`;
        const response = await fetch(url);
        data = await response.json();
      } else if (cachedData) {
        data = cachedData;
      } else {
        const { start, end } = getDateRange(currentDays);
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`
        );
        data = await response.json();
      }

      const authorsToShow = allAuthors.filter(a => !selectedAuthors.has(a));

      let filtered = (data.features || []).filter(f => {
        const authorMatch =
          authorsToShow.length === 0 ||
          authorsToShow.length === allAuthors.length ||
          authorsToShow.includes(f.properties.author);
        const searchMatch =
          !currentSearch.trim() ||
          f.properties.body.toLowerCase().includes(currentSearch.toLowerCase());
        return authorMatch && searchMatch;
      });

      filtered.sort((a, b) =>
        new Date(b.properties.date_published) - new Date(a.properties.date_published)
      );

      setFeatures(filtered);
    } catch (err) {
      console.error('Erreur feed:', err);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [currentDays, allAuthors, selectedAuthors, currentSearch, selectedAreaName, cachedData]);

  // Recharge le feed à chaque fois qu'il s'ouvre ou que les filtres changent
  useEffect(() => {
    if (isOpen) loadFeed();
  }, [isOpen, loadFeed]);

  return (
    <div className={`tweets-feed-panel${isOpen ? ' visible' : ''}`}>
      <div className="panel-header">
        <div className="panel-titles">
          <h2>Feed OSINT</h2>
          <h3>Derniers événements</h3>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="tweets-feed-content">
        {loading && (
          <div className="feed-loading">Chargement des tweets...</div>
        )}
        {!loading && features.length === 0 && (
          <div className="feed-empty">Aucun tweet trouvé pour cette période</div>
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