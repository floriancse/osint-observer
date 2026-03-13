import React, { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import TensionIndex from './TensionIndex';
import DailySummaries from './DailySummaries';
import TensionHistory from './TensionHistory';
import PanelSkeleton from './PanelSkeleton';

export default function AreaPanel({ areaName, onClose, onLocate, onDayClick, selectedDate }) {
  const [niveauTension, setNiveauTension] = useState(null);
  const [indexLoaded, setIndexLoaded] = useState(false);

  useEffect(() => {
    setIndexLoaded(false);
    setNiveauTension(null);
  }, [areaName]);

  return (
    <div className={`area-panel${areaName ? ' visible' : ''}`}>
      <div className="panel-header">
        <h3 id="area-title">{areaName || 'Selected country'}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div className="panel-content">
        <div id="summary_text-tab" className="tab-content active">
          {areaName ? (
            <>
              {!indexLoaded && <PanelSkeleton />}
              <div style={{ display: indexLoaded ? 'contents' : 'none' }}>
                <TensionIndex
                  areaName={areaName}
                  onLocate={onLocate}
                  onDataLoaded={(d) => setNiveauTension(d.tension_level ?? 'Low Tension / Stable')}
                  onLoaded={() => setIndexLoaded(true)}
                />
                <TensionHistory areaName={areaName} niveauTension={niveauTension} />
                <Heatmap
                  areaName={areaName}
                  niveauTension={niveauTension}
                  onDayClick={onDayClick}
                  selectedDate={selectedDate}
                />
                <DailySummaries areaName={areaName} tensionLevel={niveauTension} />
              </div>
            </>
          ) : (
            <div className="empty-state"></div>
          )}
        </div>
      </div>
    </div>
  );
}