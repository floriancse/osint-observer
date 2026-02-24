import { useState, useCallback, useRef } from 'react';
import { getDateRange } from '../utils/helpers';

const cachedData = { 1: null, 7: null, 30: null };

export function useTweets() {
    const [tweets, setTweets] = useState({ type: 'FeatureCollection', features: [] });
    const [tweetCount, setTweetCount] = useState(0);
    const lastFilterParams = useRef(null);

    const filterAndSetTweets = useCallback((data, allusernames, selectedusernames, currentSearch) => {
        let features = data.features || [];

        // Si pas encore de usernames chargés, on affiche tout sans filtrer
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

    const fetchAndCache = useCallback(async (days) => {
        if (cachedData[days]) return cachedData[days];
        const { start, end } = getDateRange(days);
        const response = await fetch(
            `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tweets.geojson?start_date=${start}&end_date=${end}`
        );
        const data = await response.json();
        cachedData[days] = data;
        return data;
    }, []);

    const loadTweets = useCallback(async (days, allusernames, selectedusernames, currentSearch) => {
        // Sauvegarde les derniers paramètres de filtre pour les préchargements
        lastFilterParams.current = { allusernames, selectedusernames, currentSearch };
        try {
            const data = await fetchAndCache(days);
            return filterAndSetTweets(data, allusernames, selectedusernames, currentSearch);
        } catch (err) {
            console.error('Erreur chargement tweets:', err);
        }
    }, [fetchAndCache, filterAndSetTweets]);

    const preloadAll = useCallback(async () => {
        // 1. Charge et affiche le 1j immédiatement
        try {
            const data1j = await fetchAndCache(1);
            // Extrait les usernames depuis les données 1j pour useUsernames
            cachedData['usernames_1'] = data1j.usernames || [];
            // Affiche les tweets 1j sans attendre le reste
            filterAndSetTweets(data1j, [], new Set(), '');
        } catch (err) {
            console.error('Erreur chargement 1j:', err);
            cachedData[1] = { type: 'FeatureCollection', features: [] };
        }

        // 2. Précharge 7j et 30j en arrière-plan, sans bloquer
        const backgroundLoad = async (days) => {
            try {
                const data = await fetchAndCache(days);
                cachedData[`usernames_${days}`] = data.usernames || [];
            } catch (err) {
                console.error(`Erreur préchargement ${days}j:`, err);
                cachedData[days] = { type: 'FeatureCollection', features: [] };
            }
        };

        // Lance les deux en parallèle, sans await ici → non bloquant
        Promise.all([backgroundLoad(7), backgroundLoad(30)]).then(() => {
            // Si l'utilisateur a déjà changé de filtre pendant le chargement,
            // on ne re-affiche rien ici (loadTweets s'en charge à la demande)
            console.log('Préchargement 7j et 30j terminé');
        });
    }, [fetchAndCache, filterAndSetTweets]);

    const getRawData = useCallback((days) => cachedData[days], []);

    return { tweets, tweetCount, loadTweets, preloadAll, getRawData };
}