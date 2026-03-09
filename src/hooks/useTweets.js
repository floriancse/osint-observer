import { useState, useCallback, useRef } from 'react';

const cachedData = {};

// Même logique que getTodayOverride dans App.jsx — 00:00:00 → 23:59:59 du jour actuel
export function getTodayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

function makeCacheKey({ start, end }) {
    // Clé basée sur la date complète (jour + heure) pour éviter les collisions entre jours
    return `${start.substring(0, 10)}__${end.substring(0, 10)}`;
}

export function useTweets() {
    const [tweets, setTweets] = useState({ type: 'FeatureCollection', features: [] });
    const [tweetCount, setTweetCount] = useState(0);
    const lastFilterParams = useRef(null);

    const filterAndSetTweets = useCallback((data, allusernames, selectedusernames, currentSearch) => {
        let features = data.features || [];

        if (allusernames.length === 0) {
            const filtered = { ...data, features };
            setTweets(filtered);
            setTweetCount(features.length);
            return filtered;
        }

        const usernamesToShow = allusernames.filter(a => !selectedusernames.has(a));

        if (selectedusernames.size === allusernames.length) {
            features = [];
        } else {
            features = features.filter(f => {
                const usernameMatch =
                    usernamesToShow.length === 0 ||
                    usernamesToShow.length === allusernames.length ||
                    usernamesToShow.includes(f.properties.username);
                const searchMatch =
                    !currentSearch.trim() ||
                    f.properties.text.toLowerCase().includes(currentSearch.toLowerCase());
                return usernameMatch && searchMatch;
            });
        }

        const filtered = { ...data, features };
        setTweets(filtered);
        setTweetCount(features.length);
        return filtered;
    }, []);

    const fetchAndCache = useCallback(async (range) => {
        const key = makeCacheKey(range);
        if (cachedData[key]) return cachedData[key];
        const { start, end } = range;
        const response = await fetch(
            `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`
        );
        const data = await response.json();
        cachedData[key] = data;
        return data;
    }, []);

    // dateOverride optionnel — si null, utilise le range du jour
    const loadTweets = useCallback(async (allusernames, selectedusernames, currentSearch, dateOverride = null) => {
        lastFilterParams.current = { allusernames, selectedusernames, currentSearch };
        try {
            const range = dateOverride ?? getTodayRange();
            const data = await fetchAndCache(range);
            return filterAndSetTweets(data, allusernames, selectedusernames, currentSearch);
        } catch (err) {
            console.error('Erreur chargement tweets:', err);
        }
    }, [fetchAndCache, filterAndSetTweets]);

    // Précharge le range du jour — même clé que getTodayOverride dans App
    const preloadAll = useCallback(async () => {
        try {
            const data = await fetchAndCache(getTodayRange());
            filterAndSetTweets(data, [], new Set(), '');
        } catch (err) {
            console.error('Erreur préchargement:', err);
        }
    }, [fetchAndCache, filterAndSetTweets]);

    const getRawData = useCallback((dateOverride = null) => {
        const range = dateOverride ?? getTodayRange();
        return cachedData[makeCacheKey(range)] ?? null;
    }, []);

    return { tweets, tweetCount, loadTweets, preloadAll, getRawData };
}