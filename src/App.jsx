import MapView from "./components/Map/MapView";
import TopBar from "./components/TopBar/TopBar";
import SidePanel from "./components/SidePanel/SidePanel";
import StatusBar from "./components/StatusBar/StatusBar";
import ContentPanel from "./components/ContentPanel/ContentPanel";
import { TimeProvider } from "./context/TimeContext";
import { LayerProvider } from "./context/LayerContext";
import { useState } from "react";
import "./utils/popupUtils.css";

export default function App() {
  const [tweets, setTweets] = useState(null);
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);

  const togglePanel = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

return (
    <TimeProvider>
      <LayerProvider>
        {/* Conteneur principal en Flex */}
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          
          {/* 1. Le SidePanel (Largeur fixe) */}
          <SidePanel tweets={tweets} />

          {/* 2. La zone de droite (Carte + TopBar) */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <TopBar togglePanel={togglePanel} openPanel={openPanel} />
            
            {/* Wrapper pour la carte */}
            <div style={{ flex: 1, position: 'relative' }}>
               <MapView onTweetsLoaded={setTweets} />
            </div>

            <ContentPanel isOpen={contentPanelOpen} onToggle={() => setContentPanelOpen(v => !v)} />
            <StatusBar />
          </div>
        </div>
      </LayerProvider>
    </TimeProvider>
  );
}