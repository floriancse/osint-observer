//AreaPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ThreatIndex from './ThreatIndex';
import PanelSkeleton from './PanelSkeleton';
import TargetBreakdown from './TargetBreakdown';
import ImportanceDistribution from './ImportanceDistribution';

export default function AreaPanel({ areaName, onClose, onLocate, onDayClick, selectedDate }) {
  const [niveauThreat, setNiveauThreat] = useState('Calm');
  const [indexLoaded, setIndexLoaded] = useState(false);
  const handleDataLoaded = useCallback(d => setNiveauThreat(d.threat_level ?? 'Calm'), []);
  const handleLoaded = useCallback(() => setIndexLoaded(true), []);

  useEffect(() => {
    setIndexLoaded(false);
    setNiveauThreat('Calm');
  }, [areaName]);

  return (
    <div className={`area-panel${areaName ? ' visible' : ''}`}>
      <div className="panel-header" style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h3 id="area-title" style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, letterSpacing: '0.06em', color: '#eef0f5', textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>
            {areaName || '—'}
          </h3>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        {areaName ? (
          <>
            {!indexLoaded && <PanelSkeleton />}
            <div style={{ display: indexLoaded ? 'contents' : 'none' }}>
              <ThreatIndex
                areaName={areaName}
                onDataLoaded={handleDataLoaded}
                onLoaded={handleLoaded}
              />
              <TargetBreakdown areaName={areaName} />
              <ImportanceDistribution areaName={areaName} />

            </div>
          </>
        ) : (
          <div className="empty-state" />
        )}
      </div>
    </div>
  );
}