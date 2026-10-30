import { buildEnrichedTweets } from "./utils/tweetFilters";
import BootScreen from "./components/BootScreen/BootScreen";
import SidePanelBase from "./components/SidePanel/SidePanel";
import ContentPanelBase from "./components/ContentPanel/ContentPanel";
import { TimeProvider, useTime } from "./context/TimeContext";
import { LayerProvider } from "./context/LayerContext";
import { BootstrapProvider, useBootstrap } from "./context/BootstrapContext";
import { useLang } from "./context/LangContext";
import { useState, useEffect, useRef, useMemo, useCallback, memo, lazy, Suspense } from "react";
import "./utils/popupUtils.css";
import "./App.css";
import "./components/Map/MapControls.css";
import MapSpinner, { SHOW_MAP_SPINNER } from "./components/Map/MapSpinner";
import "./seo-headings.css";
import UrlStateSync from "./components/UrlStateSync/UrlStateSync";
import { readUrlState } from "./utils/urlState";

// MapFilters chargé en différé : fermé par défaut, inutile de le télécharger avant le premier affichage.
// memo() appliqué dans le then() : le composant ne se re-rend que si ses props changent.
const MapFilters = lazy(() =>
  import("./components/MapFilters/MapFilters").then((m) => ({ default: memo(m.default) }))
);

// Composants lourds mémoïsés : MapApp se re-rend à chaque changement d'état
// (panneaux, sélection, overlay...) et, sans memo, re-rendrait MapView (~3000
// lignes) et SidePanel à chaque fois. Toutes les props passées plus bas sont
// stables (setters, useCallback, valeurs primitives) pour que memo serve.
// MapView (MapTiler/MapLibre + toute la logique carte) est chargé EN DIFFÉRÉ : son
// téléchargement, son analyse et surtout l'initialisation de la carte représentaient
// l'essentiel des ~7 s de CPU mesurées sur mobile.
const MapView = lazy(() =>
  import("./components/Map/MapView").then((m) => ({ default: memo(m.default) }))
);

// Sur mobile (<= 768px), le SidePanel occupe tout l'écran : la carte est dessous,
// invisible. Tant que l'utilisateur ne l'a pas demandée (fermeture du panneau, clic sur
// un tweet) ou que l'URL ne porte pas d'état de carte (vue, tweet, rectangle), on ne la
// charge pas. Mettre à false pour revenir au comportement d'origine (carte toujours chargée).
const DEFER_MAP_ON_MOBILE = true;
const MOBILE_QUERY = "(max-width: 768px)";

// Robots d'indexation (Googlebot smartphone, outil d'inspection d'URL, Bing) : on leur monte
// toujours la carte, même en largeur mobile. TheatersDrawer, qui contient les liens vers les
// pages /content/<lang>/<slug>/, vit dans MapView : sans MapView dans le DOM, Google ne voit
// aucun lien interne. Le contenu est le même que pour un utilisateur desktop (pas de cloaking).
const IS_SEARCH_BOT =
  typeof navigator !== "undefined" &&
  /Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|YandexBot/i.test(navigator.userAgent || "");

// Affiché pendant le téléchargement du chunk de la carte (même spinner que MapView : voir MapSpinner).
function MapLoadingPlaceholder() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ox-bg, #0d1320)",
      }}
    >
      {SHOW_MAP_SPINNER && <MapSpinner />}
    </div>
  );
}
const SidePanel = memo(SidePanelBase);
const ContentPanel = memo(ContentPanelBase);

// Tableau vide partagé (référence stable) pour les listes de types disponibles.
const NO_TYPES = [];

// Délai avant de retirer l'overlay de chargement même si la carte n'a rien
// renvoyé (voir le garde-fou plus bas). Était 6000.
const LOADING_GUARD_MS = 3000;

// false = pas d'écran de chargement plein page : le SidePanel s'affiche dès que la
// liste de tweets est prête, puis la carte. true = comportement d'origine.
const SHOW_BOOT_SCREEN = false;

// Calcule la liste de tweets du SidePanel dès que /bootstrap est arrivé, SANS
// attendre le chargement de la carte (style MapTiler + tuiles), qui sur mobile
// retardait l'affichage du premier tweet (= le LCP) de plusieurs secondes.
// Actif tant que MapView n'a pas fini son propre chargement (`enabled`) : MapView
// reprend ensuite la main (même calcul, plus le rectangle dessiné éventuel).
// Doit être rendu DANS TimeProvider / BootstrapProvider.
function EarlyTweets({ enabled, onTweets, onReady, activeLabel, weapons, objectives, search }) {
  const { timeRange } = useTime();
  const { data } = useBootstrap();
  const { lang } = useLang();
  useEffect(() => {
    if (!enabled || !data?.tweets) return;
    // Période pas encore posée (ou invalide) : on attend plutôt que d'afficher une liste vide.
    if (!timeRange || !Number.isFinite(new Date(timeRange.start).getTime())
      || !Number.isFinite(new Date(timeRange.end).getTime())) return;
    onTweets(buildEnrichedTweets(data.tweets, timeRange, weapons, objectives, activeLabel, search, undefined, lang));
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, data, timeRange?.start, timeRange?.end, activeLabel, weapons, objectives, search, lang]);
  return null;
}

// Application cartographique (carte + SidePanel + tweets).
// Chargée en lazy depuis App.jsx : n'est PAS téléchargée sur /content/<slug>/.
export default function MapApp() {
  const { t, lang, toggleLang } = useLang();
  const [tweets, setTweets] = useState(null);
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const mapRef = useRef(null);
  // État initial lu UNE SEULE FOIS depuis l'URL (permalinks), voir utils/urlState.js.
  // UrlStateSync nettoie ensuite la barre d'adresse : on fige donc la lecture
  // pour ne plus dépendre de window.location aux rendus suivants.
  const initialUrlState = useRef(null);
  if (initialUrlState.current === null) initialUrlState.current = readUrlState();
  const init = initialUrlState.current;
  const [activeLabel, setActiveLabel] = useState(() => init.label);
  const [filtersOpen, setFiltersOpen] = useState(
    () => init.weapons.length > 0 || init.objectives.length > 0
  );
  const [activeWeaponTypes, setActiveWeaponTypes] = useState(() => init.weapons);
  const [activeObjectiveTypes, setActiveObjectiveTypes] = useState(() => init.objectives);
  // searchText est débouncé (300ms) à la source, directement dans MapView
  // (l'input local n'y remonte la valeur qu'après une pause de frappe). Donc
  // ici, App reçoit déjà une valeur "stable".
  const [searchText, setSearchText] = useState(() => init.search);
  // Rectangle / pays remontés par MapView : plus lus ici depuis la suppression du graphique
  // (on garde seulement les setters car MapView les appelle).
  const [, setSpatialRectangle] = useState(() => init.rectangle);
  const [, setSelectedCountry] = useState(null);
  // La carte est-elle montée ? Toujours sur desktop ; sur mobile seulement sur demande
  // (voir DEFER_MAP_ON_MOBILE).
  const [mapRequested, setMapRequested] = useState(() => {
    if (!DEFER_MAP_ON_MOBILE || IS_SEARCH_BOT || typeof window === "undefined") return true;
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    return !mobile || Boolean(init.view || init.tweetId || init.rectangle);
  });
  // Le panneau est replié (bouton, ou clic sur un tweet qui le referme sur mobile) :
  // l'utilisateur veut voir la carte.
  
  useEffect(() => {
    if (sidePanelCollapsed) setMapRequested(true);
  }, [sidePanelCollapsed]);
  // Passage en largeur "desktop" (rotation, redimensionnement) : la carte est visible.
  useEffect(() => {
    if (mapRequested) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => { if (!mq.matches) setMapRequested(true); };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [mapRequested]);
  // Écran de chargement plein page : reste affiché tant que MapView n'a pas
  // fini de charger les données (bootstrap + sources MapLibre).
  const [appLoading, setAppLoading] = useState(true);
  // true dès que MapView a fini de charger les données (ou échoué). Distinct de
  // appLoading : le garde-fou retire l'overlay à LOADING_GUARD_MS, mais le
  // graphique ne doit se monter qu'une fois la carte réellement prête, pour ne
  // pas concurrencer son chargement sur le thread principal.
  const [dataReady, setDataReady] = useState(false);
  // Liste de tweets prête (calcul précoce) : on peut retirer l'overlay sans attendre la carte.
  const handleEarlyReady = useCallback(() => setAppLoading(false), []);
  const handleLoadingChange = useCallback((loading) => {
    setAppLoading(loading);
    if (!loading) setDataReady(true);
  }, []);
  // Garde-fou : si la carte n'a pas fini de charger au bout de LOADING_GUARD_MS (clé MapTiler
  // refusée, réseau lent, rendu Googlebot / Search Console...), on retire
  // l'overlay quand même. Sans ça, l'écran de chargement reste affiché
  // indéfiniment et les crawlers ne voient jamais le reste de l'UI.
  // Si MapView a déjà appelé onLoadingChange(false), c'est un no-op.
  useEffect(() => {
    const id = setTimeout(() => setAppLoading(false), LOADING_GUARD_MS);
    return () => clearTimeout(id);
  }, []);
  // Une fois le chargement terminé, on laisse le fondu (0.4s) se jouer puis on
  // DÉMONTE l'overlay : sinon il reste par-dessus la carte (opacity 0) et
  // LoadingGlobe continue de tourner en arrière-plan pour rien.
  const [showOverlay, setShowOverlay] = useState(true);
  useEffect(() => {
    if (appLoading) return;
    const id = setTimeout(() => setShowOverlay(false), 500);
    return () => clearTimeout(id);
  }, [appLoading]);

  // Id du tweet actuellement sélectionné depuis le SidePanel (clic sur une
  // carte). Sert à la fois à surligner la carte dans le SidePanel et à
  // afficher l'indicateur correspondant sur la carte.
  const [selectedTweetId, setSelectedTweetId] = useState(() => init.tweetId);

  const handleTweetClick = useCallback((feature) => {
    const id = feature.properties.id;

    // Re-clic sur le tweet déjà sélectionné => on le désélectionne.
    // String() car l'id lu depuis l'URL (permalink) est une chaîne, alors que
    // feature.properties.id peut être un nombre.
    if (selectedTweetId != null && String(id) === String(selectedTweetId)) {
      setSelectedTweetId(null);              // UrlStateSync retire alors "tweet=" de l'URL
      mapRef.current?.clearTweetHighlight?.(); // ferme la popup mobile + retire le cercle
      return;
    }

    setSelectedTweetId(id);
    mapRef.current?.highlightTweet(feature);
  }, [selectedTweetId]);

  // Types d'armes / d'objectifs disponibles : dérivés de `tweets` via useMemo
  // (avant : 2 useEffect + 2 useState => un rendu supplémentaire à chaque
  // changement de tweets). Priorité à la liste calculée par MapView pour la
  // période courante (indépendante du filtre actif, donc elle ne se réduit pas
  // quand on coche un filtre) ; sinon repli sur un calcul depuis les features.
  const availableWeaponTypes = useMemo(() => {
    if (!tweets) return NO_TYPES;
    if (tweets.availableWeaponTypesForTimeRange) return tweets.availableWeaponTypesForTimeRange;
    if (!tweets.features) return NO_TYPES;
    return [...new Set(
      tweets.features.map((f) => f.properties?.weapon_type).filter(Boolean)
    )].sort();
  }, [tweets]);

  const availableObjectiveTypes = useMemo(() => {
    if (!tweets) return NO_TYPES;
    if (tweets.availableObjectiveTypesForTimeRange) return tweets.availableObjectiveTypesForTimeRange;
    if (!tweets.features) return NO_TYPES;
    return [...new Set(
      tweets.features.map((f) => f.properties?.objective_type).filter(Boolean)
    )].sort();
  }, [tweets]);

  // Compteurs par type (calculés dans buildEnrichedTweets, "facettés" : ils
  // ignorent le filtre de leur propre section pour ne pas tomber à 0 au clic)
  const weaponCounts = useMemo(() => tweets?.weaponCountsForFilters, [tweets]);
  const objectiveCounts = useMemo(() => tweets?.objectiveCountsForFilters, [tweets]);

  const togglePanel = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  // Callbacks stables passés aux composants mémoïsés
  const handleSidePanelToggle = useCallback(() => setSidePanelCollapsed(true), []);
  const handleMapResize = useCallback(() => mapRef.current?.resize?.(), []);
  const handleCloseFilters = useCallback(() => setFiltersOpen(false), []);
  const handleToggleFilters = useCallback(() => setFiltersOpen((v) => !v), []);
  const handleTweetPopupClose = useCallback(() => setSelectedTweetId(null), []);
  const handleToggleContentPanel = useCallback(() => setContentPanelOpen((v) => !v), []);

  return (
    <BootstrapProvider>
      <TimeProvider>
        <LayerProvider>
          {/* Même écran que le fallback Suspense d'App.jsx : pas de second écran de chargement */}
          {SHOW_BOOT_SCREEN && showOverlay && <BootScreen visible={appLoading} />}
          <EarlyTweets
            enabled={!dataReady}
            onTweets={setTweets}
            onReady={handleEarlyReady}
            activeLabel={activeLabel}
            weapons={activeWeaponTypes}
            objectives={activeObjectiveTypes}
            search={searchText}
          />
          {/* Titre principal de la page (masqué visuellement, lu par Google et les lecteurs d'écran) */}
          <h1 className="visually-hidden">{t.pageTitle}</h1>
          <div className="app-shell">

            {/* 1. SidePanel — le bouton toggle est à l'intérieur quand il est ouvert */}
            <SidePanel
              tweets={tweets}
              collapsed={sidePanelCollapsed}
              activeLabel={activeLabel}
              onLabelChange={setActiveLabel}
              onTweetClick={handleTweetClick}
              selectedTweetId={selectedTweetId}
              onToggle={handleSidePanelToggle}
              onResize={handleMapResize}
            />

            {/* 2. Zone de droite */}
            <div style={{
              flex: 1,
              minWidth: 0,
              position: 'relative',
              // Crée un contexte d'empilement (< z-index du SidePanel = 100) :
              // tout ce qui est dans la zone carte (popups bottom sheet à
              // z-index 1000, boutons, tiroirs...) reste DERRIÈRE le SidePanel.
              zIndex: 0,
              display: 'flex',
              flexDirection: 'column'
            }}>

              {/* Bouton rouvrir — visible UNIQUEMENT quand le panel est fermé */}
              {sidePanelCollapsed && openPanel !== "topics" && (
                <button
                  type="button"
                  className="map-ctrl-btn map-ctrl-btn--float sidepanel-reopen"
                  onClick={() => setSidePanelCollapsed(false)}
                  aria-label={t.expandPanel ?? "Expand panel"}
                  style={{ left: 8 }}
                >
                  {/* Icône ←| (miroir de |→) pour indiquer "ouvrir vers la droite" */}
                  <svg
                    width="16" height="16" viewBox="0 0 16 16"
                    fill="none" xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M9 8 L3 8 M6 5 L3 8 L6 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              
              {/* 
            <TopBar
              togglePanel={togglePanel}
              openPanel={openPanel}
              sidePanelCollapsed={sidePanelCollapsed}
            /> */}
              <div style={{ flex: 1, position: 'relative' }}>
                {filtersOpen && (
                  <Suspense fallback={null}>
                    <MapFilters
                      activeWeaponTypes={activeWeaponTypes}
                      setActiveWeaponTypes={setActiveWeaponTypes}
                      availableWeaponTypes={availableWeaponTypes}
                      weaponCounts={weaponCounts}
                      activeObjectiveTypes={activeObjectiveTypes}
                      setActiveObjectiveTypes={setActiveObjectiveTypes}
                      availableObjectiveTypes={availableObjectiveTypes}
                      objectiveCounts={objectiveCounts}
                      onClose={handleCloseFilters}
                    />
                  </Suspense>
                )}
                {mapRequested && (
                <Suspense fallback={<MapLoadingPlaceholder />}>
                <MapView
                  ref={mapRef}
                  onTweetsLoaded={setTweets}
                  activeLabel={activeLabel}
                  activeWeaponTypes={activeWeaponTypes}
                  activeObjectiveTypes={activeObjectiveTypes}
                  searchText={searchText}
                  onSearchTextChange={setSearchText}
                  searchBarLeftOffset={sidePanelCollapsed && openPanel !== "topics" ? 50 : 8}
                  filtersOpen={filtersOpen}
                  onToggleFilters={handleToggleFilters}
                  onRectangleDrawn={setSpatialRectangle}
                  onCountryChange={setSelectedCountry}
                  onLoadingChange={handleLoadingChange}
                  onTweetPopupClose={handleTweetPopupClose}
                  selectedTweetId={selectedTweetId}
                  sidePanelOpen={!sidePanelCollapsed}
                  initialView={init.view}
                  initialRectangle={init.rectangle}
                  initialTweetId={selectedTweetId}
                />
                </Suspense>
                )}
                {/* Applique la période de l'URL au démarrage (l'URL n'est plus réécrite) */}
                <UrlStateSync />
              </div>
              <ContentPanel isOpen={contentPanelOpen} onToggle={handleToggleContentPanel} />
              {/* <StatusBar /> */}
            </div>

          </div>
        </LayerProvider>
      </TimeProvider>
    </BootstrapProvider>
  );
}