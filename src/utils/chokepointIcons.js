// utils/chokepointIcons.js
import { FaAnchorCircleCheck, FaAnchorCircleXmark, FaAnchorCircleExclamation } from "react-icons/fa6";

const COLORS = {
    OPEN: "#298a6a",
    CLOSED: "#ed3f3f",
    UNKNOWN: "#6f6f6f",
    RESTRICTED: "#ffa600"
};

const ICON_COMPONENTS = {
    OPEN: FaAnchorCircleCheck,
    CLOSED: FaAnchorCircleXmark,
    RESTRICTED: FaAnchorCircleXmark,
    UNKNOWN: FaAnchorCircleExclamation,
};

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

function makeIcon(status) {
    const SIZE = 128;
    const color = COLORS[status];
    const Icon = ICON_COMPONENTS[status];
    const { paths } = extractSVGData(Icon);

    const MEASURE = 800;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = MEASURE;
    tempCanvas.height = MEASURE;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.fill(new Path2D(paths[0]));
    const data = tempCtx.getImageData(0, 0, MEASURE, MEASURE).data;

    let minX = MEASURE, maxX = 0, minY = MEASURE, maxY = 0;
    for (let y = 0; y < MEASURE; y++) {
        for (let x = 0; x < MEASURE; x++) {
            if (data[(y * MEASURE + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const realW = maxX - minX + 1;
    const realH = maxY - minY + 1;

    const PADDING = 24;
    const drawSize = SIZE - PADDING * 2;
    const scale = Math.min(drawSize / realW, drawSize / realH);
    const offsetX = (SIZE - realW * scale) / 2 - minX * scale;
    const offsetY = (SIZE - realH * scale) / 2 - minY * scale - 6; 

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    const C = SIZE / 2;
    const R = SIZE / 2 - 1;
    ctx.beginPath();
    ctx.moveTo(C, C - R);
    ctx.lineTo(C + R, C);
    ctx.lineTo(C, C + R);
    ctx.lineTo(C - R, C);
    ctx.closePath();
    ctx.fillStyle = "#141414";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();

    // --- Icône par dessus ---
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(paths[0]));

    return ctx.getImageData(0, 0, SIZE, SIZE);
}

export function loadChokepointImages(map) {
    ["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].forEach((status) => {
        const key = `chokepoint-${status}`;
        if (map.hasImage(key)) return;
        const imageData = makeIcon(status);
        map.addImage(key, imageData, { pixelRatio: 2 });
    });
}

