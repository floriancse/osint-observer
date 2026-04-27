import { createContext, useContext, useState, useMemo } from "react";

const TimeContext = createContext();

export function TimeProvider({ children }) {
  const [selectedPeriod, setSelectedPeriod] = useState("24h");

  // Calcul des dates start et end selon la période sélectionnée
  const timeRange = useMemo(() => {
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
      case "7d":
        start.setDate(start.getDate() - 7);
        break;
      case "14d":
        start.setDate(start.getDate() - 14);
        break;
      default:
        start.setHours(start.getHours() - 24);
    }

    return {
      start: start.toISOString(),
      end: now.toISOString(),
      label: selectedPeriod,
    };
  }, [selectedPeriod]);

  const changePeriod = (newPeriod) => {
    setSelectedPeriod(newPeriod);
  };

  return (
    <TimeContext.Provider value={{ timeRange, selectedPeriod, changePeriod }}>
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