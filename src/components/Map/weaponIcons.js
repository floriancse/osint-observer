const CHOKEPOINT_STATUS_CONFIG = {
    'Open':    { color: '#32886b', stroke: '#10b981', symbol: '✓' },
    'Closed':  { color: '#ed3f3f', stroke: '#f17e7e', symbol: '✕' },
    'Unknown': { color: '#888780', stroke: '#B4B2A9', symbol: '?' },
};

export function createChokepointSVG(status) {
    const cfg = CHOKEPOINT_STATUS_CONFIG[status] ?? CHOKEPOINT_STATUS_CONFIG['Unknown'];
    const size = 48;
    const cx = size / 2;
    const r = 16;
    const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return `${cx + r * Math.cos(angle)},${cx + r * Math.sin(angle)}`;
    }).join(' ');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <polygon points="${pts}"
          fill="${cfg.color}" fill-opacity="1"
          stroke="${cfg.stroke}" stroke-width="1.5"/>
        <text x="${cx}" y="${cx + 4.5}"
          text-anchor="middle"
          font-family="'Roboto Mono', monospace"
          font-size="20"
          font-weight="700"
          fill="white">${cfg.symbol}</text>
      </svg>`;
    return svg;
}

export async function loadChokepointIconsToMap(map) {
    const statuses = ['Open', 'Closed', 'Unknown'];
    await Promise.all(statuses.map(status => new Promise((resolve, reject) => {
        const id = `chokepoint-${status.toLowerCase()}`;
        if (map.hasImage(id)) { resolve(); return; }
        const svg = createChokepointSVG(status);
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image(48, 48);
        img.onload = () => {
            map.addImage(id, img, { sdf: false });
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = reject;
        img.src = url;
    })));
}