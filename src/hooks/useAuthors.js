import { useState, useCallback } from 'react';
import { getDateRange } from '../utils/helpers';

const cachedAuthors = { 1: null, 7: null, 30: null };

export function useAuthors() {
  const [allAuthors, setAllAuthors] = useState([]);
  const [selectedAuthors, setSelectedAuthors] = useState(new Set());

  const loadAuthors = useCallback(async (days) => {
    try {
      if (cachedAuthors[days]) {
        setAllAuthors(cachedAuthors[days]);
        return;
      }
      const { start, end } = getDateRange(days);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/authors?start_date=${start}&end_date=${end}`)

      const data = await response.json();
      const authors = data.authors || [];
      cachedAuthors[days] = authors;
      setAllAuthors(authors);
    } catch (err) {
      console.error('Erreur chargement auteurs:', err);
    }
  }, []);

  const toggleAuthor = useCallback((author) => {
    setSelectedAuthors(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }, []);

  return { allAuthors, selectedAuthors, loadAuthors, toggleAuthor };
}