import MapView from "./components/Map/MapView";
import LoadingGlobe from "./components/Map/LoadingGlobe";
import SidePanel from "./components/SidePanel/SidePanel";
import ContentPanel from "./components/ContentPanel/ContentPanel";
import { TimeProvider } from "./context/TimeContext";
import { LayerProvider } from "./context/LayerContext";
import { BootstrapProvider } from "./context/BootstrapContext";
import { useState, useEffect, useRef } from "react";
import "./utils/popupUtils.css";
import "./App.css";
import EventsChart from "./components/EventsChart/EventsChart";
import MapFilters from "./components/MapFilters/MapFilters"
export default function App() {
  const [tweets, setTweets] = useState(null);
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const mapRef = useRef(null);
  const [activeLabel, setActiveLabel] = useState(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeWeaponTypes, setActiveWeaponTypes] = useState([]);
  const [activeObjectiveTypes, setActiveObjectiveTypes] = useState([]);
  const [dotCount, setDotCount] = useState(0);
  // searchText est débouncé (300ms) à la source, directement dans MapView
  // (l'input local n'y remonte la valeur qu'après une pause de frappe). Donc
  // ici, App reçoit déjà une valeur "stable" : pas besoin d'un second
  // debounce avant de la transmettre à EventsChart.
  const [searchText, setSearchText] = useState("");
  // Rectangle spatial tracé sur la carte (cf. MapView "Draw area"), levé ici
  // pour pouvoir aussi filtrer le graphique EventsChart en plus de la carte.
  const [spatialRectangle, setSpatialRectangle] = useState(null);
  // Écran de chargement plein page : reste affiché tant que MapView n'a pas
  // fini de charger les données (bootstrap + sources MapLibre).
  const [appLoading, setAppLoading] = useState(true);

  const handleTweetClick = (feature) => {
    if (mapRef.current) {
      mapRef.current.openTweetPopup(feature);
    }
  };
  const [availableWeaponTypes, setAvailableWeaponTypes] = useState([]);
  const [availableObjectiveTypes, setAvailableObjectiveTypes] = useState([]);
  const togglePanel = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  // Overlay plein page affiché tant que appLoading est true. En "fixed" avec
  // un zIndex élevé, il masque tout le reste de l'UI (carte, panneaux,
  // barres) quel que soit le layout (mobile ou desktop) en dessous.
  const loadingOverlay = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: '#0f1524',
        opacity: appLoading ? 1 : 0,
        pointerEvents: appLoading ? 'auto' : 'none',
        transition: 'opacity 0.4s ease',
      }}
    >
      <LoadingGlobe size="clamp(200px, 40vmin, 480px)" />
      <span style={{ color: '#e1e1e1', fontSize: 14, letterSpacing: 0.3, minWidth: '110px', textAlign: 'center' }}>
        Loading OSINT Observer{'.'.repeat(dotCount)}
      </span>
    </div>
  );



  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(d => (d + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tweets) return;
    // Priorité à la liste calculée par MapView pour la période courante
    // (indépendante du filtre armes actif, donc elle ne se réduit pas
    // quand on coche un filtre).
    if (tweets.availableWeaponTypesForTimeRange) {
      setAvailableWeaponTypes(tweets.availableWeaponTypesForTimeRange);
      return;
    }
    // Fallback (ex: tout premier chargement, avant que MapView n'ait
    // injecté les métadonnées de période).
    if (tweets.features) {
      const uniqueTypes = [...new Set(
        tweets.features
          .map(f => f.properties?.weapon_type)
          .filter(Boolean)
      )].sort();
      setAvailableWeaponTypes(uniqueTypes);
    }
  }, [tweets]);

  useEffect(() => {
    if (!tweets) return;
    // Priorité à la liste calculée par MapView pour la période courante
    // (indépendante du filtre objectifs actif, donc elle ne se réduit pas
    // quand on coche un filtre).
    if (tweets.availableObjectiveTypesForTimeRange) {
      setAvailableObjectiveTypes(tweets.availableObjectiveTypesForTimeRange);
      return;
    }
    // Fallback (ex: tout premier chargement, avant que MapView n'ait
    // injecté les métadonnées de période).
    if (tweets.features) {
      const uniqueTypes = [...new Set(
        tweets.features
          .map(f => f.properties?.objective_type)
          .filter(Boolean)
      )].sort();
      setAvailableObjectiveTypes(uniqueTypes);
    }
  }, [tweets]);
  return (
    <BootstrapProvider>
      <TimeProvider>
        <LayerProvider>
          {loadingOverlay}
          <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>

            {/* 1. SidePanel — le bouton toggle est à l'intérieur quand il est ouvert */}
            <SidePanel
              tweets={tweets}
              collapsed={sidePanelCollapsed}
              activeLabel={activeLabel}
              onLabelChange={setActiveLabel}
              onTweetClick={handleTweetClick}
              onToggle={() => setSidePanelCollapsed(true)}
            />

            {/* 2. Zone de droite */}
            <div style={{
              flex: 1,
              minWidth: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}>

              {/* Bouton rouvrir — visible UNIQUEMENT quand le panel est fermé */}
              {sidePanelCollapsed && openPanel !== "topics" && (
                <button
                  onClick={() => setSidePanelCollapsed(false)}
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: 6,
                    zIndex: 200,
                    width: 28,
                    height: 28,
                    border: 'transparent',
                    background: 'transparent',
                    borderRadius: '100%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#e2e8f0',
                    padding: 0,
                    transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#41444a';
                    e.currentTarget.style.color = '#e2e8f0';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#e2e8f0';
                  }}
                >
                  {/* Icône ←| (miroir de |→) pour indiquer "ouvrir vers la droite" */}
                  <svg
                    width="16" height="16" viewBox="0 0 16 16"
                    fill="none" xmlns="http://www.w3.org/2000/svg"
                    style={{ display: 'block', transform: 'scaleX(-1)' }}
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
                  <MapFilters
                    activeWeaponTypes={activeWeaponTypes}
                    setActiveWeaponTypes={setActiveWeaponTypes}
                    availableWeaponTypes={availableWeaponTypes}
                    activeObjectiveTypes={activeObjectiveTypes}
                    setActiveObjectiveTypes={setActiveObjectiveTypes}
                    availableObjectiveTypes={availableObjectiveTypes}
                    onClose={() => setFiltersOpen(false)}
                  />
                )}
                <MapView
                  ref={mapRef}
                  onTweetsLoaded={setTweets}
                  activeLabel={activeLabel}
                  activeWeaponTypes={activeWeaponTypes}
                  activeObjectiveTypes={activeObjectiveTypes}
                  searchText={searchText}
                  onSearchTextChange={setSearchText}
                  searchBarLeftOffset={sidePanelCollapsed && openPanel !== "topics" ? 44 : 5}
                  filtersOpen={filtersOpen}
                  onToggleFilters={() => setFiltersOpen(v => !v)}
                  onRectangleDrawn={setSpatialRectangle}
                  onLoadingChange={setAppLoading}
                />
              </div>
              <ContentPanel isOpen={contentPanelOpen} onToggle={() => setContentPanelOpen(v => !v)} />
              <EventsChart
                activeWeaponTypes={activeWeaponTypes}
                activeObjectiveTypes={activeObjectiveTypes}
                activeLabel={activeLabel}
                searchText={searchText}
                spatialRectangle={spatialRectangle}
                isOpen={chartOpen}
                onToggle={() => {
                  setChartOpen(v => !v);
                  setTimeout(() => mapRef.current?.resize?.(), 250);
                }}
              />
              {/* <StatusBar /> */}
            </div>

          </div>
        </LayerProvider>
      </TimeProvider>
    </BootstrapProvider>
  );
}