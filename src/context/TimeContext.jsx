import { createContext, useContext, useState, useMemo, useCallback } from "react";

const TimeContext = createContext();

// Conservés pour compatibilité avec le code qui lisait encore rangeReady / markRangeReady.
const noop = () => {};

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d) {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

// Lundi 00:00 de la semaine en cours (semaine à la française).
function startOfWeek(d) {
  const copy = startOfDay(d);
  const sinceMonday = (copy.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  copy.setDate(copy.getDate() - sinceMonday);
  return copy;
}

// 1er du mois en cours, 00:00.
function startOfMonth(d) {
  const copy = startOfDay(d);
  copy.setDate(1);
  return copy;
}

// Périodes proposées dans le SidePanel (voir PeriodPicker). Les autres valeurs
// gérées plus bas ("1h", "6h", "24h", "7d", "14d", "custom") restent acceptées
// pour ne pas casser d'éventuels liens / UrlStateSync existants.
export const PERIOD_PRESETS = ["today", "week", "month"];
export const DEFAULT_PERIOD = "today";

export function TimeProvider({ children }) {
  // Plus de graphique : la période est définitive dès le premier rendu
  // (avant, "24h" n'était qu'un placeholder remplacé par EventsChart).
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [customRange, setCustomRange] = useState(null);

  const timeRange = useMemo(() => {
    if (selectedPeriod === "custom" && customRange) {
      return {
        start: customRange.start.toISOString(),
        end: customRange.end.toISOString(),
        label: "custom",
      };
    }

    const now = new Date();
    let start = new Date(now);

    switch (selectedPeriod) {
      case "today":
        // "Aujourd'hui" = les dernières 24 h glissantes (et non le jour calendaire).
        start.setHours(start.getHours() - 24);
        break;
      case "week":
        start = startOfWeek(now);
        break;
      case "month":
        start = startOfMonth(now);
        break;
      case "1h":
        start.setHours(start.getHours() - 1);
        break;
      case "6h":
        start.setHours(start.getHours() - 6);
        break;
      case "24h":
        start.setHours(start.getHours() - 24);
        break;
      case "1d":
        // "1d" reste le jour calendaire (00:00 → maintenant), distinct de "24h"
        // qui est glissant. Si ce n'est pas la distinction voulue, alignez ce
        // case sur "24h" ci-dessus.
        start = startOfDay(new Date());
        break;
      case "7d":
        start.setDate(start.getDate() - 7);
        break;
      case "14d":
        start.setDate(start.getDate() - 14);
        break;
      default:
        start = startOfDay(new Date());
    }

    return {
      start: start.toISOString(),
      end: now.toISOString(),
      label: selectedPeriod,
    };
  }, [selectedPeriod, customRange]);

  const changePeriod = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
  }, []);

  const setRange = useCallback((start, end) => {
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return;

    setCustomRange({ start: s, end: e });
    setSelectedPeriod("custom");
  }, []);

  return (
    <TimeContext.Provider value={{ timeRange, selectedPeriod, changePeriod, setRange, rangeReady: true, markRangeReady: noop }}>
      {children}
    </TimeContext.Provider>
  );
}

export const useTime = () => {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error("useTime must be used within a TimeProvider");
  }
  return context;
};