import React from 'react';
import Heatmap from './Heatmap';
import TensionIndex from './TensionIndex';

export default function AreaPanel({ areaName, onClose }) {
  return (
    <div className={`area-panel${areaName ? ' visible' : ''}`}>
      <div className="panel-header">
        <h3 id="area-title">{areaName || 'Pays sélectionné'}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        <div id="summary-tab" className="tab-content active">
          {areaName && <Heatmap areaName={areaName} />}
          {areaName && <TensionIndex areaName={areaName} />}
        </div>
      </div>
    </div>
  );
}