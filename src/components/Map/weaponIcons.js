import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WEAPON_ICON_CONFIG } from '../shared/weaponIconConfig';

export const WEAPON_TYPE_COLORS = {
    'Ballistic missile': '#D94F4F', // Rouge moyen — visible sans agresser
    'Bombing / airstrike': '#3a60c9', // Ocre brûlé
    'Gunfire / small arms': '#D4A843', // Kaki doré
    'Drone': '#67b89c', // Bleu-gris acier
    'Mine': '#9B6BBF', // Mauve sobre
    'Unidentified weapon': '#7f8a95', // Gris ardoise (+ contour #8FA3BF optionnel)
};

/**
 * Charge toutes les icônes Phosphor dans une instance Mapbox/MapLibre.
 *
 * @param {mapboxgl.Map} map     - Instance de la carte
 * @param {string}       color   - Couleur de l'icône (défaut : '#ff3b5c')
 * @param {number}       size    - Taille du canvas en px (défaut : 48)
 *                                 Conseil : utiliser 48-64px pour un rendu net,
 *                                 puis laisser Mapbox downscaler via icon-size.
 */

export function getWeaponTypePatternExpression(defaultPattern = 'hatch-pattern-default') {
    const cases = [];
    Object.keys(WEAPON_TYPE_COLORS).forEach(type => {
        cases.push(type);
        cases.push(`hatch-pattern-${type}`);
    });
    return ['match', ['get', 'weapon_type'], ...cases, defaultPattern];
}

export function getWeaponTypeLineColorExpression(defaultColor = '#ff3b5c') {
    const cases = [];

    Object.entries(WEAPON_TYPE_COLORS).forEach(([type, color]) => {
        cases.push(type);
        cases.push(color);
    });

    return [
        'match',
        ['get', 'weapon_type'],
        ...cases,
        defaultColor
    ];
}

export function weaponTypeToIconId(weaponType) {
    return `weapon-${(weaponType ?? 'unknown').replace(/[\s\/]/g, '_')}`;
}

export async function loadWeaponIconsToMap(map, size = 48) {
    await Promise.all(
        Object.entries(WEAPON_ICON_CONFIG).map(([weaponType, { icon: IconComponent, weight }]) => {
            return new Promise((resolve) => {
                const iconId = weaponTypeToIconId(weaponType);
                if (map.hasImage(iconId)) { resolve(); return; }

                // Couleur spécifique au type, fallback sur gris
                const color = WEAPON_TYPE_COLORS[weaponType] ?? '#bdc3c7';

                const svgString = renderToStaticMarkup(
                    createElement(IconComponent, { size, color: '#ffffff', weight })  // ← icône blanche
                );

                const blob = new Blob([svgString], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const img = new Image(size, size);

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    const cx = size / 2;

                    // Fond circulaire avec la couleur du type
                    ctx.beginPath();
                    ctx.arc(cx, cx, cx - 2, 0, Math.PI * 2);
                    ctx.fillStyle = color;  // ← couleur du type weapon
                    ctx.fill();

                    const pad = size * 0.15;
                    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

                    URL.revokeObjectURL(url);

                    const imageData = ctx.getImageData(0, 0, size, size);
                    map.addImage(iconId, { width: size, height: size, data: imageData.data });
                    resolve();
                };

                img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                img.src = url;
            });
        })
    );
}