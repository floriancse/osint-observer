// utils/milIcons.js
import { FaInfoCircle } from "react-icons/fa";
import { PiDroneBold } from "react-icons/pi";
import { GiAk47 } from "react-icons/gi";
import { FaJetFighterUp } from "react-icons/fa6";
import { GiArtilleryShell } from "react-icons/gi";

const MIL_ICONS = {
    MISSILES: {
        component: GiArtilleryShell,
        color: "#f97316",
        weaponType: "Missiles",
    },
    DRONES: {
        component: PiDroneBold,
        color: "#60a5fa",
        weaponType: "Drones",
    },
    MILITARY_AVIATION: {
        component: FaJetFighterUp,
        color: "#a78bfa",
        weaponType: "Military Aviation",
    },
    SMALL_ARMS: {
        component: GiAk47,
        color: "#3ff457",
        weaponType: "Small Arms",
    },
    UNKNOWN: {
        component: FaInfoCircle,
        color: "#f71616",
        weaponType: null,
    },
    // UNIDENTIFIED_WEAPON supprimé → mappé vers "mil-UNKNOWN" dans la couche MapLibre
};

/**
 * Extrait les paths SVG d'un composant React Icons.
 * Même technique que chokepointIcons.js.
 */
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

/**
 * Génère un ImageData canvas pour un weapon_type donné.
 * Fond : losange sombre (#0f1524) bordé de la couleur de l'icône.
 * Icône : path SVG centré par-dessus.
 */
function makeMilIcon(key) {
    const SIZE = 128;
    const { component: Icon, color } = MIL_ICONS[key];
    const { viewBox, paths } = extractSVGData(Icon);

    // ── Parse du viewBox pour connaître l'espace de coordonnées réel ──
    const [, , vbW, vbH] = viewBox.split(" ").map(Number);

    // ── Mesure des bounds réels du path dans l'espace viewBox ──
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = vbW;
    tempCanvas.height = vbH;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.fill(new Path2D(paths[0]));
    const data = tempCtx.getImageData(0, 0, vbW, vbH).data;

    let minX = vbW, maxX = 0, minY = vbH, maxY = 0;
    for (let y = 0; y < vbH; y++) {
        for (let x = 0; x < vbW; x++) {
            if (data[(y * vbW + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const realW = maxX - minX + 1;
    const realH = maxY - minY + 1;

    // ── Calcul du scale / offset pour centrer l'icône ──
    const PADDING = 30;
    const drawSize = SIZE - PADDING * 2;
    const scale = Math.min(drawSize / realW, drawSize / realH);
    const offsetX = (SIZE - realW * scale) / 2 - minX * scale;
    const offsetY = (SIZE - realH * scale) / 2 - minY * scale;

    // ── Rendu final ──
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    // Losange (identique à chokepointIcons)
    const C = SIZE / 2;
    const R = SIZE / 2 - 1;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#0f1524";
    ctx.fill();
    // ctx.strokeStyle = color;
    // ctx.lineWidth = 3;
    // ctx.stroke();

    // Icône par-dessus
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(paths[0]));

    return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Enregistre toutes les images MIL dans la carte MapLibre.
 * Appeler après map.on("load", ...) comme loadChokepointImages.
 *
 * Clé d'image générée : "mil-MISSILES", "mil-DRONES", …
 */
export function loadMilImages(map) {
    Object.keys(MIL_ICONS).forEach((key) => {
        const imageKey = `mil-${key}`;
        if (map.hasImage(imageKey)) return;
        const imageData = makeMilIcon(key);
        map.addImage(imageKey, imageData, { pixelRatio: 2 });
    });
}