import React, { useEffect, useRef } from 'react';

const ALL_LAYERS = [
  { id: 'disputed', name: 'Zone contestée' },
  { id: 'heatmap', name: 'Événements' },
];

export default function OptionsMenu({
  isOpen,
  onClose,
  allusernames,
  selectedusernames,
  onToggleusername,
  selectedLayers,
  onToggleLayer,
}) {
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  // Ferme le menu si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div className="bottom-right-controls">
      <div className="username-filter-container">

        <button
          ref={btnRef}
          className="option-change-btn"
          onClick={onClose}
          title="Options et filtres"
        >
          <i className="fa-solid fa-gear"></i>
        </button>

        <div
          ref={menuRef}
          className={`options-menu vertical${isOpen ? ' visible' : ''}`}
        >
          {/* Couches */}
          <div className="menu-section">
            <div className="section-title">
              <i className="fas fa-layer-group"></i> Couches
            </div>
            <div className="checkbox-list">
              {ALL_LAYERS.map(layer => (
                <div
                  key={layer.id}
                  className="layer-item username-item"
                  onClick={() => onToggleLayer(layer.id)}
                >
                  <input
                    type="checkbox"
                    checked={!selectedLayers.has(layer.id)}
                    onChange={() => onToggleLayer(layer.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <label style={{ flex: 1, cursor: 'pointer' }}>{layer.name}</label>
                </div>
              ))}
            </div>
          </div>

          <hr className="menu-divider" />

          {/* Sources / Auteurs */}
          <div className="menu-section">
            <div className="section-title">
              <i className="fas fa-rss"></i> Sources
            </div>
            <div className="checkbox-list">
              {allusernames.map(username => (
                <div
                  key={username}
                  className="username-item"
                  onClick={() => onToggleusername(username)}
                >
                  <input
                    type="checkbox"
                    checked={!selectedusernames.has(username)}
                    onChange={() => onToggleusername(username)}
                    onClick={e => e.stopPropagation()}
                  />
                  <label style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={`img/${username}.jpg`}
                      style={{ width: 20, height: 20, borderRadius: '50%' }}
                      onError={e => { e.target.style.display = 'none'; }}
                      alt={username}
                    />
                    <span>{username}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}