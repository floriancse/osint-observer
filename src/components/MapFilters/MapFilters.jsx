import React from 'react';
import './MapFilters.css';

export default function MapFilters({
    activeWeaponTypes, setActiveWeaponTypes, availableWeaponTypes,
    activeObjectiveTypes, setActiveObjectiveTypes, availableObjectiveTypes,
}) {
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

    const renderLeaves = (types, activeTypes, onToggle) => {
        return types.map((type) => {
            const isActive = activeTypes.includes(type);
            return (
                <button
                    key={type}
                    className={`tree-leaf ${isActive ? 'active' : ''}`}
                    onClick={() => onToggle(type)}
                >
                    <span className="tree-indent">   </span>
                    <span className="tree-checkbox">[{isActive ? 'x' : ' '}]</span>
                    <span className="tree-label">{type}</span>
                </button>
            );
        });
    };

    return (
        <div className="map-floating-filters">
            <div className="terminal-body">
                <div className="filter-tree">
                    <div className="tree-branch">
                        <span className="tree-connector">└─ </span>
                        <span className="tree-dir">weapons</span>
                    </div>
                    {renderLeaves(availableWeaponTypes, activeWeaponTypes, toggleWeaponType)}

                    <div className="tree-branch">
                        <span className="tree-connector">└─ </span>
                        <span className="tree-dir">targets</span>
                    </div>
                    {renderLeaves(availableObjectiveTypes, activeObjectiveTypes, toggleObjectiveType)}
                </div>

            </div>
        </div>
    );
}