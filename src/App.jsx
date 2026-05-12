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

export default function App() {
  const [tweets, setTweets] = useState(null);
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const mapRef = useRef(null);
  const [activeLabel, setActiveLabel] = useState(null);

  const handleTopicSelect = ({ lng, lat }) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 5, duration: 1500 });
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
          {/* Layout mobile : colonne verticale */}
          <div className="app-mobile">

            {/* Carte + TopBar (zone principale) */}
            <div className="app-mobile__map">
              <TopBar togglePanel={togglePanel} openPanel={openPanel} onTopicSelect={handleTopicSelect} />
              <div style={{ flex: 1, position: 'relative' }}>
                <MapView ref={mapRef} onTweetsLoaded={setTweets} activeLabel={activeLabel} />              </div>
              <StatusBar />
            </div>

            {/* SidePanel en bas — togglable */}
            <div className={`app-mobile__sidepanel ${sidePanelCollapsed ? 'app-mobile__sidepanel--hidden' : ''}`}>
              {/* Handle / bouton toggle */}
              <button
                className="app-mobile__toggle"
                onClick={() => setSidePanelCollapsed(v => !v)}
              >
                <svg
                  style={{ transform: sidePanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  width="14" height="14" viewBox="0 0 14 14"
                  fill="none" xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Chevron bas quand ouvert, haut quand fermé */}
                  <path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{sidePanelCollapsed}</span>
              </button>
              <SidePanel tweets={tweets} collapsed={sidePanelCollapsed} activeLabel={activeLabel} onLabelChange={setActiveLabel} />            </div>

          </div>
        </LayerProvider>
      </TimeProvider>
    );
  }

  // Layout desktop (inchangé)
  return (
    <TimeProvider>
      <LayerProvider>
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>

          {/* 1. SidePanel + bouton toggle dans un wrapper commun */}
          <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
            <SidePanel tweets={tweets} collapsed={sidePanelCollapsed} activeLabel={activeLabel} onLabelChange={setActiveLabel} />
            <button
              onClick={() => setSidePanelCollapsed(v => !v)}
              style={{
                position: 'absolute',
                right: -27,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 200,
                width: 28,
                height: 52,
                background: '#0a0f1c',
                border: '1px solid #1e2d3d',
                borderLeft: 'none',
                borderRadius: '0 6px 6px 0',
                cursor: 'pointer',
                display: openPanel === "topics" ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4a6a8a',
                padding: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#111927'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0a0f1c'; e.currentTarget.style.color = '#4a6a8a'; }}
            >
              <svg
                style={{
                  transition: 'transform 0s cubic-bezier(0.4,0,0.2,1)',
                  transform: sidePanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
                width="14" height="14" viewBox="0 0 14 14"
                fill="none" xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* 2. Zone de droite (Carte + TopBar) */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <TopBar
              togglePanel={togglePanel}
              openPanel={openPanel}
              onTopicSelect={handleTopicSelect}
            />
            <div style={{ flex: 1, position: 'relative' }}>
              <MapView ref={mapRef} onTweetsLoaded={setTweets} activeLabel={activeLabel} />            </div>
            <ContentPanel isOpen={contentPanelOpen} onToggle={() => setContentPanelOpen(v => !v)} />
            <StatusBar />
          </div>

        </div>
      </LayerProvider>
    </TimeProvider>
  );
}