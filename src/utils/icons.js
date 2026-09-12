// utils/icons.js
import { FaInfoCircle } from "react-icons/fa";
import { FaJetFighterUp } from "react-icons/fa6";
import { PiDroneBold } from "react-icons/pi";
import { GiAk47, GiArtilleryShell, GiGreekTemple } from "react-icons/gi";

// --- Configuration unifiée ---
export const ICONS = {
    // Political
    POL: {
        component: GiGreekTemple,
        color: "#64748b",
        label: "Political",
        shape: "diamond",
        category: "pol",
    },
    // Military
    MISSILES: {
        component: GiArtilleryShell,
        color: "#64748b",
        weaponType: "Missiles",
        shape: "circle",
        category: "mil",
    },
    DRONES: {
        component: PiDroneBold,
        color: "#64748b",
        weaponType: "Drones",
        shape: "circle",
        category: "mil",
    },
    MILITARY_AVIATION: {
        component: FaJetFighterUp,
        color: "#64748b",
        weaponType: "Military Aviation",
        shape: "circle",
        category: "mil",
    },
    SMALL_ARMS: {
        component: GiAk47,
        color: "#64748b",
        weaponType: "Small Arms",
        shape: "circle",
        category: "mil",
    },
    UNKNOWN: {
        component: FaInfoCircle,
        color: "#64748b",
        weaponType: null,
        shape: "circle",
        category: "mil",
    },
};

// --- Fonction commune pour extraire les paths SVG ---
function extractSVGData(IconComponent) {
    const element = IconComponent({ size: 1 });
    const viewBox = element.props.viewBox || "0 0 512 512";
    const paths = [];

    function walk(node) {
        if (!node) return;
        if (node.type === "path" && node.props?.d) {
            paths.push(node.props.d);
        }
        const children = node.props?.children;
        if (Array.isArray(children)) children.forEach(walk);
        else if (children) walk(children);
    }

    walk(element);
    return { viewBox, paths };
}

// --- Fonction générique pour créer une icône ---
function makeIcon(key, config) {
    const SIZE = 128;
    const { component: Icon, color, shape } = config;
    const { viewBox, paths } = extractSVGData(Icon);

    if (!paths.length) {
        console.warn(`[icons] Aucun path SVG trouvé pour ${key}`);
        return null;
    }

    const [, , vbW, vbH] = viewBox.split(" ").map(Number);

    // Mesure des bounds de TOUS les paths
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = vbW;
    tempCanvas.height = vbH;
    const tempCtx = tempCanvas.getContext("2d");
    paths.forEach((d) => tempCtx.fill(new Path2D(d)));
    const data = tempCtx.getImageData(0, 0, vbW, vbH).data;

    let minX = vbW, maxX = 0, minY = vbH, maxY = 0;
    for (let y = 0; y < vbH; y++) {
        for (let x = 0; x < vbW; x++) {
            if (data[(y * vbW + x) * 4 + 3] > 0) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
    }

    const realW = maxX - minX + 1;
    const realH = maxY - minY + 1;

    const PADDING = 30;
    const drawSize = SIZE - PADDING * 2;
    const scale = Math.min(drawSize / realW, drawSize / realH);
    const offsetX = (SIZE - realW * scale) / 2 - minX * scale;
    const offsetY = (SIZE - realH * scale) / 2 - minY * scale;

    // Rendu final
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    const C = SIZE / 2;
    const R = SIZE / 2 - 1;
    ctx.beginPath();
    if (shape === "diamond") {
        ctx.moveTo(C, C - R);
        ctx.lineTo(C + R, C);
        ctx.lineTo(C, C + R);
        ctx.lineTo(C - R, C);
        ctx.closePath();
    } else {
        ctx.arc(C, C, R, 0, Math.PI * 2);
        ctx.closePath();
    }
    ctx.fillStyle = "#0f1524";
    ctx.fill();

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    paths.forEach((d) => ctx.fill(new Path2D(d)));

    return ctx.getImageData(0, 0, SIZE, SIZE);
}

// --- Exports ---
export function loadIcons(map) {
    Object.entries(ICONS).forEach(([key, config]) => {
        const imageKey = `${config.category}-${key}`;
        if (map.hasImage(imageKey)) return;
        const imageData = makeIcon(key, config);
        if (imageData) {
            map.addImage(imageKey, imageData, { pixelRatio: 2 });
        }
    });
}

export function getIconHTML(iconKey) {
    const config = ICONS[iconKey];
    if (!config) return '';

    const { component: Icon, color } = config;
    const { viewBox, paths } = extractSVGData(Icon);

    const svgPaths = paths.map(d => `<path d="${d}" fill="currentColor"/>`).join('');
    return `<svg viewBox="${viewBox}" style="width:14px;height:14px;color:${color};flex:none;">${svgPaths}</svg>`;
}

// Mapping pour weapon_type → clé ICONS
export const WEAPON_TYPE_TO_ICON_KEY = {
    'Missiles': 'MISSILES',
    'Drones': 'DRONES',
    'Military Aviation': 'MILITARY_AVIATION',
    'Small Arms': 'SMALL_ARMS',
};
