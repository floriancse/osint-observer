import { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";

const TimeContext = createContext();

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

export function TimeProvider({ children }) {
  const [selectedPeriod, setSelectedPeriod] = useState("24h");
  const [customRange, setCustomRange] = useState(null);

  // Premier chargement → on force les dernières 24h GLISSANTES (maintenant - 24h → maintenant),
  // pas le jour calendaire (qui ne couvrait que depuis minuit, donc parfois
  // seulement quelques minutes de données juste après minuit).
  useEffect(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setHours(yesterday.getHours() - 24);

    setRange(yesterday.toISOString(), now.toISOString());
  }, []); // une seule fois

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
    <TimeContext.Provider value={{ timeRange, selectedPeriod, changePeriod, setRange }}>
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