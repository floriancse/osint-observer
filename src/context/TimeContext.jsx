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

// Périodes proposées dans le SidePanel (voir PeriodPicker). Les autres valeurs
// gérées plus bas ("1h", "6h", "24h", "7d", "14d", "custom") restent acceptées
// pour ne pas casser d'éventuels liens / UrlStateSync existants.
//
// Périodes en heures GLISSANTES (et non calendaires) :
//   today = 24 h   | week = 168 h (7 jours)   | month = 720 h (30 jours)
// Chaque période couvre donc toujours exactement N heures en arrière à partir
// de maintenant, quel que soit le jour/heure de la sélection.
export const PERIOD_PRESETS = ["today", "week", "month"];
export const DEFAULT_PERIOD = "today";

// Durées (en heures) des périodes glissantes du sélecteur.
export const PERIOD_HOURS = { today: 24, week: 168, month: 720 };

export function TimeProvider({ children }) {
  // Plus de graphique : la période est définitive dès le premier rendu
  // (avant, "24h" n'était qu'un placeholder remplacé par EventsChart).
  const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
  const [customRange, setCustomRange] = useState(null);
  // Incrémenté par refreshRange() : force le recalcul de timeRange (nouveau "maintenant").
  const [nowTick, setNowTick] = useState(0);

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
        // 24 dernières heures glissantes.
        start.setHours(start.getHours() - 24);
        break;
      case "week":
        // 168 dernières heures glissantes (7 jours), et non la semaine calendaire.
        start.setHours(start.getHours() - 168);
        break;
      case "month":
        // 720 dernières heures glissantes (30 jours), et non le mois calendaire.
        start.setHours(start.getHours() - 720);
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
    // nowTick : volontairement dans les dépendances (relance le calcul avec la date du moment)
  }, [selectedPeriod, customRange, nowTick]);

  // Recalcule les périodes relatives ("today", "week", "month"…) avec l'heure actuelle.
  // Sans ça, `end` reste figé à l'instant où la période a été choisie et les tweets arrivés
  // depuis sont filtrés. Une période personnalisée (dates choisies par l'utilisateur) ne bouge pas.
  const refreshRange = useCallback(() => setNowTick((t) => t + 1), []);

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
    <TimeContext.Provider value={{ timeRange, selectedPeriod, changePeriod, setRange, refreshRange, rangeReady: true, markRangeReady: noop }}>
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