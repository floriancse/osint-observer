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
// Détection de nouveaux événements : on interroge /bootstrap/updates (réponse minuscule,
// lue en mémoire côté serveur) à cet intervalle, et au retour sur l'onglet. Les données
// ne sont PLUS remplacées d'office : l'utilisateur voit un bouton « N nouveaux événements »
// dans le SidePanel et le clic appelle applyUpdates() (re-téléchargement de /bootstrap,
// la carte et le panneau se mettent à jour sans recharger la page).
const UPDATES_POLL_INTERVAL_MS = 60_000;
// Deux contrôles rapprochés (retour sur l'onglet + focus) ne déclenchent qu'une requête.
const MIN_CHECK_INTERVAL_MS = 15_000;

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
  const lastCheckAt = useRef(0);
  // Nombre de tweets apparus côté serveur depuis les données affichées ; bouton « actualiser ».
  const [newCount, setNewCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  // created_at (chaîne brute, telle que reçue) du tweet le plus récent affiché : sert de
  // repère `since`. Chaîne brute et non millisecondes : le serveur la relit comme il l'a écrite.
  const latestCreatedAt = useRef(null);

  const fetchBootstrap = (isInitial = false) => {
    if (isFetching.current) return Promise.resolve();
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

    return request
      .then((json) => {
        setData(json);
        setNewCount(0);
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

    // Détection de nouveautés : léger (quelques octets), uniquement onglet visible.
    const checkUpdates = (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (isFetching.current || !latestCreatedAt.current) return;
      if (!force && Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt.current = Date.now();
      fetchJson(`${API}/bootstrap/updates?since=${encodeURIComponent(latestCreatedAt.current)}`)
        .then((r) => setNewCount(Number(r?.count) || 0))
        .catch(() => {}); // réseau / serveur indisponible : on réessaiera au prochain tour
    };
    const handleVisibility = () => checkUpdates();
    document.addEventListener("visibilitychange", handleVisibility);
    // window focus couvre aussi le cas où l'app est dans sa propre fenêtre
    // (pas un onglet) et reprend le focus.
    window.addEventListener("focus", handleVisibility);
    const intervalId = setInterval(() => checkUpdates(true), UPDATES_POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      clearInterval(intervalId);
    };
  }, []);

  // Met à jour le repère « tweet le plus récent affiché » à chaque changement de données.
  useEffect(() => {
    let bestMs = -Infinity;
    let bestRaw = null;
    for (const f of data?.tweets?.features || []) {
      const raw = f.properties?.created_at;
      const ms = Date.parse(raw);
      if (Number.isFinite(ms) && ms > bestMs) { bestMs = ms; bestRaw = raw; }
    }
    latestCreatedAt.current = bestRaw;
  }, [data]);

  // Clic sur « N nouveaux événements » : recharge /bootstrap en place (pas de rechargement de page).
  const applyUpdates = () => {
    setUpdating(true);
    return fetchBootstrap(false).finally(() => setUpdating(false));
  };

  return (
    <BootstrapContext.Provider
      value={{ data, loading, error, refetch: () => fetchBootstrap(false), newCount, updating, applyUpdates }}
    >
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