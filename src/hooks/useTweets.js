import { useState, useCallback, useRef } from 'react';
import { getDateRange } from '../utils/helpers';

const cachedData = { 1: null, 7: null, 30: null };

export function useTweets() {
    const [tweets, setTweets] = useState({ type: 'FeatureCollection', features: [] });
    const [tweetCount, setTweetCount] = useState(0);

    const filterAndSetTweets = useCallback((data, allAuthors, selectedAuthors, currentSearch) => {
        const authorsToShow = allAuthors.filter(a => !selectedAuthors.has(a));

        let features = data.features || [];

        if (selectedAuthors.size === allAuthors.length) {
            features = [];
        } else {
            features = features.filter(f => {
                const authorMatch =
                    authorsToShow.length === 0 ||
                    authorsToShow.length === allAuthors.length ||
                    authorsToShow.includes(f.properties.author);
                const searchMatch =
                    !currentSearch.trim() ||
                    f.properties.body.toLowerCase().includes(currentSearch.toLowerCase());
                return authorMatch && searchMatch;
            });
        }

        const filtered = { ...data, features };
        setTweets(filtered);
        setTweetCount(features.length);
        return filtered;
    }, []);

    const loadTweets = useCallback(async (days, allAuthors, selectedAuthors, currentSearch) => {
        try {
            let data;
            if (cachedData[days]) {
                data = cachedData[days];
            } else {
                const { start, end } = getDateRange(days);
                const response = await fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`)

                data = await response.json();
                cachedData[days] = data;
            }
            return filterAndSetTweets(data, allAuthors, selectedAuthors, currentSearch);
        } catch (err) {
            console.error('Erreur chargement tweets:', err);
        }
    }, [filterAndSetTweets]);

    const preloadAll = useCallback(async () => {
        const periods = [1, 7, 30];
        for (const days of periods) {
            const { start, end } = getDateRange(days);
            const [authRes, tweetsRes] = await Promise.all([
                fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`)
                    .catch(() => null),
                fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`)
                    .catch(() => null),
            ]);
            if (authRes?.ok) {
                const d = await authRes.json();
                // On stocke dans le cache de useAuthors via export partagé
                cachedData[`authors_${days}`] = d.authors || [];
            }
            if (tweetsRes?.ok) {
                cachedData[days] = await tweetsRes.json();
            } else {
                cachedData[days] = { type: 'FeatureCollection', features: [] };
            }
        }
    }, []);

    // Expose le cache brut pour la carte MapLibre
    const getRawData = useCallback((days) => cachedData[days], []);

    return { tweets, tweetCount, loadTweets, preloadAll, getRawData };
}