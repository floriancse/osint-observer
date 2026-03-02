import React, { useState } from 'react';
import Heatmap from './Heatmap';
import TensionIndex from './TensionIndex';

export default function AreaPanel({ areaName, onClose, onLocate }) {
  const [niveauTension, setNiveauTension] = useState('Stable / faible');

  return (
    <div className={`area-panel${areaName ? ' visible' : ''}`}>
      <div className="panel-header">
        <h3 id="area-title">{areaName || 'Selected country'}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div className="panel-content">
        <div id="summary_text-tab" className="tab-content active">
          {areaName && (
            <>
              <Heatmap areaName={areaName} niveauTension={niveauTension} />
              <TensionIndex
                areaName={areaName}
                onLocate={onLocate}
                onDataLoaded={(d) => setNiveauTension(d.tension_level ?? 'Stable / faible')}
              />
            </>
          )}
          {!areaName && <div className="empty-state"></div>}
        </div>
      </div>
    </div>
  );
}