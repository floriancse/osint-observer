import { useState, useCallback } from 'react';
import { getDateRange } from '../utils/helpers';

const cachedusernames = { 1: null, 7: null, 30: null };

export function useusernames() {
  const [allusernames, setAllusernames] = useState([]);
  const [selectedusernames, setSelectedusernames] = useState(new Set());

  const loadusernames = useCallback(async (days) => {
    try {
      if (cachedusernames[days]) {
        setAllusernames(cachedusernames[days]);
        return;
      }
      const { start, end } = getDateRange(days);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/usernames?start_date=${start}&end_date=${end}`)

      const data = await response.json();
      const usernames = data.usernames || [];
      cachedusernames[days] = usernames;
      setAllusernames(usernames);
    } catch (err) {
      console.error('Erreur chargement auteurs:', err);
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