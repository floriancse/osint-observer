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
// En dessous de cette durée depuis le dernier fetch réussi, on ne relance pas
// de requête réseau au retour sur l'onglet (évite les rafales de fetch si
// l'utilisateur change d'onglet en boucle). Alignée sur le TTL serveur
// (BOOTSTRAP_TTL = 60s côté API) pour ne jamais redemander des données que
// le serveur n'a de toute façon pas encore regénérées.
const MIN_REFRESH_INTERVAL_MS = 60_000;
// Filet de sécurité : si l'onglet reste ouvert et au premier plan très
// longtemps sans jamais être quitté/repris, on force quand même un
// rafraîchissement à intervalle régulier.
const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60_000;

// Chargement en deux temps (voir /bootstrap/lite et /tweets/older dans main.py) :
//  1. /bootstrap/lite : tout, mais seulement les tweets / lignes des derniers jours
//     (la vue par défaut = 24 h) => payload ~5x plus léger, l'interface s'affiche vite ;
//  2. /tweets/older : le reste des 30 jours, chargé en arrière-plan puis fusionné.
// Les rafraîchissements périodiques (retour sur l'onglet, intervalle) utilisent
// /bootstrap complet, comme avant.
const fetchJson = (url) =>
  fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    return r.json();
  });

// Fusionne /tweets/older dans le payload lite. On écarte de `older` tout ce qui est
// plus récent que la coupure du lite (recoupement possible si le cache serveur a
// été reconstruit entre les deux requêtes) : l'union reste complète, sans doublon.
const mergeOlder = (prev, older) => {
  if (!prev || !prev.partial) return prev; // un /bootstrap complet est passé entre-temps
  const cutoff = new Date(prev.recent_cutoff).getTime();
  const merge = (recent, old) => ({
    ...(recent || { type: "FeatureCollection" }),
    features: [
      ...(recent?.features || []),
      ...(old?.features || []).filter((f) => !(new Date(f.properties?.created_at).getTime() >= cutoff)),
    ],
  });
  return {
    ...prev,
    tweets: merge(prev.tweets, older?.tweets),
    military_lines: merge(prev.military_lines, older?.military_lines),
    partial: false,
    merged: true, // signal pour MapView : le jeu complet de tweets est disponible
  };
};

// `initialData` (optionnel) : données déjà disponibles (page /content/<slug>/, où
// inject-seo.js les embarque dans le HTML). Dans ce cas on les utilise telles
// quelles et on ne télécharge pas /bootstrap : ni au montage, ni au retour sur
// l'onglet, ni en rafraîchissement périodique.
export function BootstrapProvider({ children, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const hasFetched = useRef(false); // évite le double-fetch en dev (React StrictMode)
  const lastFetchedAt = useRef(0);
  const isFetching = useRef(false);

  const fetchBootstrap = (isInitial = false) => {
    if (isFetching.current) return;
    isFetching.current = true;
    if (isInitial) setLoading(true);

    // cache: "no-cache" force la revalidation auprès du serveur (ETag/304) au lieu
    // de réutiliser une réponse gardée par le navigateur.
    // Premier chargement : version lite (repli sur le bootstrap complet si le
    // backend ne la fournit pas encore) ; ensuite : bootstrap complet.
    const request = isInitial
      ? fetchJson(`${API}/bootstrap/lite`).catch((err) => {
          console.warn("/bootstrap/lite indisponible, repli sur /bootstrap :", err);
          return fetchJson(`${API}/bootstrap`);
        })
      : fetchJson(`${API}/bootstrap`);

    request
      .then((json) => {
        setData(json);
        setLoading(false);
        setError(null);
        lastFetchedAt.current = Date.now();
        if (json.partial) loadOlderWhenIdle();
      })
      .catch((err) => {
        console.error("Erreur chargement /bootstrap :", err);
        setError(err);
        setLoading(false);
      })
      .finally(() => {
        isFetching.current = false;
      });
  };

  // Récupère le reste des 30 jours quand le navigateur est inactif (ou au plus tard
  // après 6 s), pour ne pas concurrencer le premier affichage.
  const loadOlderWhenIdle = () => {
    const run = () =>
      fetchJson(`${API}/tweets/older`)
        .then((older) => setData((prev) => mergeOlder(prev, older)))
        .catch((err) => console.warn("Tweets plus anciens indisponibles :", err));
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 6000 });
    } else {
      setTimeout(run, 2500);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    if (initialData) return; // données embarquées : rien à télécharger
    fetchBootstrap(true);

    // Redemande les données fraîches dès que l'utilisateur revient sur
    // l'onglet (changement d'onglet, minimisation, retour depuis une autre
    // appli) : c'est le vrai correctif au problème "données vieilles de
    // 10h tant qu'on n'a pas fait de hard refresh".
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchedAt.current < MIN_REFRESH_INTERVAL_MS) return;
      fetchBootstrap(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    // window focus couvre aussi le cas où l'app est dans sa propre fenêtre
    // (pas un onglet) et reprend le focus.
    window.addEventListener("focus", handleVisibility);

    // Filet de sécurité si l'onglet reste ouvert et visible sans jamais
    // être quitté.
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") fetchBootstrap(false);
    }, BACKGROUND_REFRESH_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <BootstrapContext.Provider value={{ data, loading, error, refetch: () => fetchBootstrap(false) }}>
      {children}
    </BootstrapContext.Provider>
  );
}

/**
 * Traductions du panneau "Théâtres" (TheatersDrawer).
 * Pour ajouter un texte : ajoute la clé dans fr ET en, puis lis-la
 * dans le composant via ui.<clé>.
 */
export const THEATERS_LABELS = {
  fr: {
    title: "Théâtres",
    active: (n) => `${n} théâtre${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""}`,
    fallback: "Théâtre",
    summary: "Résumé de la situation",
    events: "Résumés quotidiens",
    noEvents: "Aucun événement significatif trouvé pour ce théâtre.",
    empty: "Aucun théâtre disponible.",
    back: "Retour",
    close: "Fermer",
    eventsCount: (n) => `${n} résumé${n > 1 ? "s" : ""}`,
    ago: { min: (n) => `il y a ${n} min`, h: (n) => `il y a ${n} h`, d: (n) => `il y a ${n} j` },
  },
  en: {
    title: "Theaters",
    active: (n) => `${n} active theater${n > 1 ? "s" : ""}`,
    fallback: "Theater",
    summary: "Situation summary",
    events: "Daily summaries",
    noEvents: "No significant events found for this theater.",
    empty: "No theater available.",
    back: "Back",
    close: "Close",
    eventsCount: (n) => `${n} summar${n > 1 ? "ies" : "y"}`,
    ago: { min: (n) => `${n} min ago`, h: (n) => `${n} h ago`, d: (n) => `${n} d ago` },
  },
};

export const getTheatersLabels = (lang) => THEATERS_LABELS[lang] || THEATERS_LABELS.fr;

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
export const useChokepointsAreas = () => useBootstrap().data?.chokepoints_areas ?? emptyGeoJSON;
export const useConflictBorders = () => useBootstrap().data?.conflict_borders ?? emptyGeoJSON;
export const useConflictTheaters= () => useBootstrap().data?.conflict_theaters ?? emptyGeoJSON;
export const useWorldAreas      = () => useBootstrap().data?.world_areas      ?? emptyGeoJSON;
export const useTopicsLocation  = () => useBootstrap().data?.topics_location  ?? emptyGeoJSON;
export const useTopicsAreas     = () => useBootstrap().data?.topics_areas     ?? emptyGeoJSON;
export const useLastUpdate     = () => useBootstrap().data?.last_update     ?? emptyGeoJSON;
export const useKeywords     = () => useBootstrap().data?.keywords     ?? [];
export const useMilitaryLines     = () => useBootstrap().data?.military_lines     ?? emptyGeoJSON;
export const useTweets   = () => useBootstrap().data?.tweets     ?? emptyGeoJSON;
export const useTopics   = () => useBootstrap().data?.topics     ?? [];
export const useConflictZones = () => useBootstrap().data?.conflict_zones ?? emptyGeoJSON;