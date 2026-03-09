import { useState, useCallback } from 'react';

let cachedUsernames = null;

function get24hRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

export function useUsernames() {
    const [allusernames, setAllusernames] = useState([]);
    const [selectedusernames, setSelectedusernames] = useState(new Set());

    const loadusernames = useCallback(async () => {
        try {
            if (cachedUsernames) {
                setAllusernames(cachedUsernames);
                return cachedUsernames;
            }
            const { start, end } = get24hRange();
            const response = await fetch(
                `${process.env.REACT_APP_API_URL}/api/twitter_conflicts/usernames?start_date=${start}&end_date=${end}`
            );
            const data = await response.json();
            const usernames = data.usernames || [];
            cachedUsernames = usernames;
            setAllusernames(usernames);
            return usernames;
        } catch (err) {
            console.error('Erreur chargement auteurs:', err);
            return [];
        }
    }, []);

    const toggleusername = useCallback((username) => {
        setSelectedusernames(prev => {
            const next = new Set(prev);
            if (next.has(username)) next.delete(username);
            else next.add(username);
            return next;
        });
    }, []);

    return { allusernames, selectedusernames, loadusernames, toggleusername };
}