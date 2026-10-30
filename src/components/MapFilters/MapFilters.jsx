import React from 'react';
import { useLang } from '../../context/LangContext';
import './MapFilters.css';

export default function MapFilters({
    activeWeaponTypes, setActiveWeaponTypes, availableWeaponTypes, weaponCounts,
    activeObjectiveTypes, setActiveObjectiveTypes, availableObjectiveTypes, objectiveCounts,
}) {
    const { t, translateWeaponType, translateObjectiveType } = useLang();

    const toggleWeaponType = (typeId) => {
        setActiveWeaponTypes(prev =>
            prev.includes(typeId)
                ? prev.filter(t => t !== typeId)
                : [...prev, typeId]
        );
    };

    const toggleObjectiveType = (typeId) => {
        setActiveObjectiveTypes(prev =>
            prev.includes(typeId)
                ? prev.filter(t => t !== typeId)
                : [...prev, typeId]
        );
    };

    // Une section = un titre (avec le nombre de filtres actifs) + des puces à bascule.
    const renderSection = (kind, title, types, activeTypes, onToggle, translateFn, counts) => {
        if (!types || types.length === 0) return null;
        const activeCount = types.filter(type => activeTypes.includes(type)).length;

        return (
            <section className={`mf-section mf-section--${kind}`}>
                <h4 className="mf-title">
                    {title}
                    {activeCount > 0 && <span className="mf-count">{activeCount}</span>}
                </h4>
                <div className="mf-chips" role="group" aria-label={title}>
                    {types.map((type) => {
                        const isActive = activeTypes.includes(type);
                        // null tant que les compteurs ne sont pas calculés : on n'affiche rien plutôt que des 0
                        const count = counts ? (counts[type] ?? 0) : null;
                        return (
                            <button
                                key={type}
                                type="button"
                                className="mf-chip"
                                aria-pressed={isActive}
                                data-empty={count === 0 && !isActive ? 'true' : undefined}
                                onClick={() => onToggle(type)}
                            >
                                {/* Toujours rendu : l'emplacement est réservé, la largeur de la puce ne change pas au clic */}
                                <span className="mf-box" aria-hidden="true">
                                    <svg className="mf-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                </span>
                                <span className="mf-label">{translateFn(type)}</span>
                                {count !== null && <span className="mf-n">{count.toLocaleString()}</span>}
                            </button>
                        );
                    })}
                </div>
            </section>
        );
    };

    return (
        <div className="map-floating-filters">
            <div className="mf-body">
                {renderSection('weapon', t.filterWeapons, availableWeaponTypes, activeWeaponTypes, toggleWeaponType, translateWeaponType, weaponCounts)}
                {renderSection('objective', t.filterTargets, availableObjectiveTypes, activeObjectiveTypes, toggleObjectiveType, translateObjectiveType, objectiveCounts)}
            </div>
        </div>
    );
}