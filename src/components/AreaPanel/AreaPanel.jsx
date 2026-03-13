import React, { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import ThreatIndex from './ThreatIndex';
import DailySummaries from './DailySummaries';
import ThreatHistory from './ThreatHistory';
import PanelSkeleton from './PanelSkeleton';

export default function AreaPanel({ areaName, onClose, onLocate, onDayClick, selectedDate }) {
  const [niveauThreat, setNiveauThreat] = useState('Calm');
  const [indexLoaded, setIndexLoaded] = useState(false);

  useEffect(() => {
    setIndexLoaded(false);
    setNiveauThreat('Calm');
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
                <ThreatIndex
                  areaName={areaName}
                  onLocate={onLocate}
                  onDataLoaded={(d) => setNiveauThreat(d.threat_level ?? 'Calm')} // ← corrigé
                  onLoaded={() => setIndexLoaded(true)}
                />
                <ThreatHistory areaName={areaName} niveauThreat={niveauThreat} />
                <Heatmap
                  areaName={areaName}
                  niveauThreat={niveauThreat}           // ← corrigé
                  onDayClick={onDayClick}
                  selectedDate={selectedDate}
                />
                <DailySummaries areaName={areaName} threatLevel={niveauThreat} />
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