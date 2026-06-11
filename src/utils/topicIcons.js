import { FaEye } from "react-icons/fa6";
const TOPIC_COLOR = "#d9dee2";

function extractSVGData(IconComponent) {
    const element = IconComponent({ size: 1 });
    const viewBox = element.props.viewBox || "0 0 256 256";
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

function makeTopicIcon() {
    const SIZE = 128;
    const { paths } = extractSVGData(FaEye);

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
    const offsetY = (SIZE - realH * scale) / 2 - minY * scale;

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    // --- Fond cercle ---
    const C = SIZE / 2;
    const R = SIZE / 2 - 1;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#0f1524";
    ctx.fill();

    // --- Icône par dessus ---
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = TOPIC_COLOR;
    ctx.fill(new Path2D(paths[0]));

    return ctx.getImageData(0, 0, SIZE, SIZE);
}

export function loadTopicImages(map) {
    const key = "topic-location";
    if (map.hasImage(key)) return;
    const imageData = makeTopicIcon();
    map.addImage(key, imageData, { pixelRatio: 2 });
}