import React, { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import TensionIndex from './TensionIndex';

function getTensionColor(score) {
  if (score >= 100) return '#ff2d2d';
  if (score >= 40) return '#ff7b00';
  if (score >= 20) return '#ffd600';
  if (score >= 2) return '#4a8fff';
  return '#6d6d6d';
}

export default function AreaPanel({ areaName, onClose }) {
  const [tensionColor, setTensionColor] = useState('#6d6d6d');
  const [tensionScore, setTensionScore] = useState(0);
  const [loadingTension, setLoadingTension] = useState(true);

  useEffect(() => {
    if (!areaName) {
      setTensionColor('#6d6d6d');
      setTensionScore(0);
      setLoadingTension(false);
      return;
    }

    setLoadingTension(true);

    fetch(`${process.env.REACT_APP_API_URL}/api/twitter_conflicts/tension_index?area=${encodeURIComponent(areaName)}`)
      .then(r => {
        if (!r.ok) throw new Error('Tension fetch failed');
        return r.json();
      })
      .then(data => {
        const score = Number(data.tension_score) || 0;
        setTensionScore(score);
        setTensionColor(getTensionColor(score));
      })
      .catch(err => {
        console.warn('Could not load tension index:', err);
        setTensionColor('#6d6d6d');
        setTensionScore(0);
      })
      .finally(() => setLoadingTension(false));

  }, [areaName]);

  return (
    <div className={`area-panel${areaName ? ' visible' : ''}`}>
      <div className="panel-header">
        <h3 id="area-title">{areaName || 'Pays sélectionné'}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        <div id="summary-tab" className="tab-content active">
          {areaName && (
            <>
              <Heatmap
                areaName={areaName}
                tensionScore={tensionScore}     // ← nouveau
              // tensionColor={tensionColor}  // plus besoin
              /> 

              <TensionIndex
                areaName={areaName}
              />
            </>
          )}

          {!areaName && (
            <div className="empty-state">
            </div>
          )}
        </div>
      </div>
    </div>
  );
}