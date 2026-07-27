import { createContext, useContext, useEffect, useRef, useState } from "react";

const API = process.env.REACT_APP_API_URL;

const BootstrapContext = createContext();

/**
 * Fetch /bootstrap UNE SEULE FOIS (au montage) et partage le résultat à tous
 * les composants enfants via le contexte. Aucun composant n'a besoin de
 * refaire son propre fetch("/bootstrap") : ils lisent simplement les données
 * déjà en mémoire via useBootstrap() ou l'un des hooks dérivés ci-dessous.
 *
 * À placer haut dans l'arbre (ex: dans App.jsx, autour de <TimeProvider> et
 * de tes autres composants) :
 *
 *   <BootstrapProvider>
 *     <TimeProvider>
 *       <MapView />
 *       <SidePanel />
 *       <ActivityGraph />
 *     </TimeProvider>
 *   </BootstrapProvider>
 */
export function BootstrapProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetched = useRef(false); // évite le double-fetch en dev (React StrictMode)

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const end = new Date();
    const start = new Date(end);
    start.setHours(start.getHours() - 36);

    const params = new URLSearchParams({
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    });

    fetch(`${API}/bootstrap?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erreur chargement /bootstrap :", err);
        setError(err);
        setLoading(false);
      });
  }, []);

  return (
    <BootstrapContext.Provider value={{ data, loading, error }}>
      {children}
    </BootstrapContext.Provider>
  );
}

/**
 * Accès brut à tout le payload /bootstrap + état de chargement.
 * Utilise ceci si un composant a besoin de plusieurs couches à la fois.
 */
export function useBootstrap() {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error("useBootstrap must be used within a BootstrapProvider");
  }
  return context; // { data, loading, error }
}

/**
 * Hooks dérivés : un composant qui n'a besoin que d'une seule couche peut
 * l'importer directement, sans se soucier du reste du payload.
 * Ex: const shippingLanes = useShippingLanes();
 */
const emptyGeoJSON = { type: "FeatureCollection", features: [] };

export const useShippingLanes   = () => useBootstrap().data?.shipping_lanes   ?? emptyGeoJSON;
export const useChokepoints     = () => useBootstrap().data?.chokepoints     ?? emptyGeoJSON;
export const useConflictBorders = () => useBootstrap().data?.conflict_borders ?? emptyGeoJSON;
export const useConflictTheaters= () => useBootstrap().data?.conflict_theaters ?? emptyGeoJSON;
export const useConflictAreas   = () => useBootstrap().data?.conflict_areas   ?? emptyGeoJSON;
export const useWorldAreas      = () => useBootstrap().data?.world_areas      ?? emptyGeoJSON;
export const useTopicsLocation  = () => useBootstrap().data?.topics_location  ?? emptyGeoJSON;
export const useTopicsAreas     = () => useBootstrap().data?.topics_areas     ?? emptyGeoJSON;
export const useLastUpdate     = () => useBootstrap().data?.last_update     ?? emptyGeoJSON;
