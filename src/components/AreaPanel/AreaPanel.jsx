import React, { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import TensionIndex from './TensionIndex';

function getTensionColor(niveau) {
  const map = {
    'Guerre ouverte': '#ff2d2d',
    'Conflit actif majeur': '#ff7b00',
    'Haute tension stratégique': '#ffd600',
    'Tension notable': '#00ffb7',
    'Activité modérée': '#4a8fff',
    'Stable / faible': '#6d6d6d',
  };
  return map[niveau] ?? '#6d6d6d';
}

export default function AreaPanel({ areaName, onClose, onLocate }) {
  const [tensionColor, setTensionColor] = useState('#6d6d6d');
  const [tensionScore, setTensionScore] = useState(0);
  const [loadingTension, setLoadingTension] = useState(true);
  const [niveauTension, setNiveauTension] = useState('Stable / faible');

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
        setNiveauTension(data.niveau_tension ?? 'Stable / faible'); // ← ajouter
        setTensionColor(getTensionColor(data.niveau_tension));
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
        <div id="summary_text-tab" className="tab-content active">
          {areaName && (
            <>
              <Heatmap areaName={areaName} niveauTension={niveauTension} />

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