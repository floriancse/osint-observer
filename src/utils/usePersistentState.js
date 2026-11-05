import { useState, useEffect } from "react";

// Comme useState, mais la valeur est relue / réécrite dans localStorage.
// preferInitial = true : on ignore la valeur sauvegardée (ex. l'URL porte déjà
// un état : un permalien doit gagner sur la dernière session).
export default function usePersistentState(key, initial, preferInitial = false) {
  const [value, setValue] = useState(() => {
    if (!preferInitial) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) return JSON.parse(raw);
      } catch { /* localStorage indisponible ou JSON invalide */ }
    }
    return typeof initial === "function" ? initial() : initial;
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);

  return [value, setValue]; // setValue = setter de useState : référence stable (memo OK)
}