// utils/polIcons.js
import { GiGreekTemple } from "react-icons/gi";

const POL_ICONS = {
    POL: {
        component: GiGreekTemple,
        color: "#9fc5f4", // jaune/or – à adapter selon ta charte
        label: "Political",
    },
};

/**
 * Extrait les paths SVG d'un composant React Icons.
 * Même technique que milIcons.js / chokepointIcons.js.
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
 * Génère un ImageData canvas pour la clé POL.
 * Fond : losange sombre (#0f1524) bordé de la couleur de l'icône.
 * Icône : path SVG centré par-dessus.
 */
function makePolIcon(key) {
    const SIZE = 128;
    const { component: Icon, color } = POL_ICONS[key];
    const { viewBox, paths } = extractSVGData(Icon);

    if (!paths.length) {
        console.warn(`[polIcons] Aucun path SVG trouvé pour ${key}`);
        return null;
    }

    // ── Parse du viewBox ──
    const [, , vbW, vbH] = viewBox.split(" ").map(Number);

    // ── Mesure des bounds réels du path dans l'espace viewBox ──
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = vbW;
    tempCanvas.height = vbH;
    const tempCtx = tempCanvas.getContext("2d");

    // GiGreekTemple peut avoir plusieurs paths – on les empile tous
    paths.forEach((d) => tempCtx.fill(new Path2D(d)));

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

    // Losange (identique à milIcons / chokepointIcons)
    const C = SIZE / 2;
    const R = SIZE / 2 - 1;
    ctx.beginPath();
    ctx.moveTo(C, C - R);
    ctx.lineTo(C + R, C);
    ctx.lineTo(C, C + R);
    ctx.lineTo(C - R, C);
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
    // On dessine tous les paths (GiGreekTemple en a plusieurs)
    paths.forEach((d) => ctx.fill(new Path2D(d)));

    return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Enregistre l'image POL dans la carte MapLibre.
 * Appeler après map.on("load", ...).
 *
 * Clé d'image générée : "pol-POL"
 */
export function loadPolImages(map) {
    Object.keys(POL_ICONS).forEach((key) => {
        const imageKey = `pol-${key}`;
        if (map.hasImage(imageKey)) return;
        const imageData = makePolIcon(key);
        if (imageData) {
            map.addImage(imageKey, imageData, { pixelRatio: 2 });
        }
    });
}