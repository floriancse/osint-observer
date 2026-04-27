import { createContext, useContext, useState } from "react";

const LayerContext = createContext();

export const LAYERS = [
    { ids: ["tweets-ballistic", "tweets-ballistic-halo"], label: "Ballistic Missile", group: "Geolocalized Events", color: "#ff3355", default: true },
    { ids: ["tweets-unidentified", "tweets-unidentified-halo"], label: "Unidentified Weapon", group: "Geolocalized Events", color: "#ff9900", default: true },
    { ids: ["tweets-bombing", "tweets-bombing-halo"], label: "Bombing / Airstrike", group: "Geolocalized Events", color: "#ff6b35", default: true },
    { ids: ["tweets-drone", "tweets-drone-halo"], label: "Drone", group: "Geolocalized Events", color: "#00e5ff", default: true },
    { ids: ["tweets-mine", "tweets-mine-halo"], label: "Mine", group: "Geolocalized Events", color: "#ffdd00", default: true },
    { ids: ["current-frontline"], label: "Front Line", group: "Intelligence", color: "#ff3355", default: true },
    { ids: ["shipping-lanes"], label: "Shipping Lanes", group: "Intelligence", color: "#00e5ff", default: true },
    { ids: ["seas-conflicts-outline", "seas-conflicts-fill"], label: "Seas Conflicts", group: "Intelligence", color: "#aa1c1c", default: true },
    { ids: ["chokepoints"], label: "Chokepoints", group: "Intelligence", color: "#ff9900", default: true },
];

export function LayerProvider({ children }) {
    const [visibility, setVisibility] = useState(
        Object.fromEntries(LAYERS.map((l) => [l.ids[0], l.default]))
    );
    const [counts, setCounts] = useState({});

    const toggle = (id) =>
        setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));

    return (
        <LayerContext.Provider value={{ visibility, toggle, counts, setCounts }}>
            {children}
        </LayerContext.Provider>
    );
}

export function useLayer() {
    return useContext(LayerContext);
}