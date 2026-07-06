import MapView from "./components/Map/MapView";
import TopBar from "./components/TopBar/TopBar";
import SidePanel from "./components/SidePanel/SidePanel";
import StatusBar from "./components/StatusBar/StatusBar";
import ContentPanel from "./components/ContentPanel/ContentPanel";
import { TimeProvider } from "./context/TimeContext";
import { LayerProvider } from "./context/LayerContext";
import { useState, useEffect, useRef } from "react";
import "./utils/popupUtils.css";
import "./App.css";
import EventsChart from "./components/EventsChart/EventsChart";

export default function App() {
  const [tweets, setTweets] = useState(null);
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const mapRef = useRef(null);
  const [activeLabel, setActiveLabel] = useState(null);
  const [chartOpen, setChartOpen] = useState(true);

  const handleTopicSelect = ({ lng, lat }) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 5, duration: 1500 });
    }
  };

  const handleTweetClick = (feature) => {
    if (mapRef.current) {
      mapRef.current.openTweetPopup(feature);
    }
  };

  const togglePanel = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    return (
      <TimeProvider>
        <LayerProvider>
          <div className="app-mobile">
            <div className="app-mobile__map">
              <TopBar togglePanel={togglePanel} openPanel={openPanel} />
              <div style={{ flex: 1, position: 'relative' }}>
                <MapView ref={mapRef} onTweetsLoaded={setTweets} activeLabel={activeLabel} />
              </div>
              <StatusBar />
            </div>
            <div className={`app-mobile__sidepanel ${sidePanelCollapsed ? 'app-mobile__sidepanel--hidden' : ''}`}>
              <button
                className="app-mobile__toggle"
                onClick={() => setSidePanelCollapsed(v => !v)}
              >
                <svg
                  style={{ transform: sidePanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  width="14" height="14" viewBox="0 0 14 14"
                  fill="none" xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{sidePanelCollapsed}</span>
              </button>
              <SidePanel tweets={tweets} collapsed={sidePanelCollapsed} activeLabel={activeLabel} onLabelChange={setActiveLabel} onTweetClick={handleTweetClick} />
            </div>
          </div>
        </LayerProvider>
      </TimeProvider>
    );
  }

  // Layout desktop
  return (
    <TimeProvider>
      <LayerProvider>
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
              <MapView ref={mapRef} onTweetsLoaded={setTweets} activeLabel={activeLabel} />
            </div>
            <ContentPanel isOpen={contentPanelOpen} onToggle={() => setContentPanelOpen(v => !v)} />
            {/* <EventsChart
              isOpen={chartOpen}
              onToggle={() => {
                setChartOpen(v => !v);
                setTimeout(() => mapRef.current?.resize?.(), 250);
              }}
            /> */}
            {/* <StatusBar /> */}
          </div>

        </div>
      </LayerProvider>
    </TimeProvider>
  );
}