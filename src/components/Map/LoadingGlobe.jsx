import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

const MAPTILER_API_KEY = process.env.REACT_APP_MAPTILER_API_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/01a08581-15c5-7b23-8c9d-3268f5efe2fb/style.json?key=${MAPTILER_API_KEY}`;
export { STYLE_URL };

const DUMMY_POINTS = [
    { id: 1, lng: 51.389, lat: 35.6892, offset: 0 },     // Téhéran
    { id: 2, lng: 34.7818, lat: 32.0853, offset: 340 },  // Tel Aviv
    { id: 3, lng: 37.6173, lat: 55.7558, offset: 680 },  // Moscou
    { id: 4, lng: 30.5234, lat: 50.4501, offset: 1020 }, // Kiev
    { id: 5, lng: 32.5599, lat: 15.5007, offset: 1360 }, // Khartoum
    { id: 6, lng: 2.1098, lat: 13.5137, offset: 1700 },  // Niamey
    { id: 7, lng: 116.4074, lat: 39.9042, offset: 2040 }, // Pékin
    { id: 8, lng: 56.25, lat: 26.56, offset: 2380 },      // Détroit d'Ormuz
    { id: 9, lng: 43.33, lat: 12.58, offset: 2720 },      // Détroit de Bab-el-Mandeb
    { id: 10, lng: 139.6917, lat: 35.6895, offset: 3060 }, // Tokyo
    { id: 11, lng: 103.8198, lat: 1.3521, offset: 3400 },  // Singapour (Détroit de Malacca)
    { id: 12, lng: 72.8777, lat: 19.0760, offset: 3740 },  // Mumbai
    { id: 13, lng: 31.2357, lat: 30.0444, offset: 4080 },  // Le Caire (Canal de Suez)
    { id: 14, lng: 3.3792, lat: 6.5244, offset: 4420 },    // Lagos
    { id: 15, lng: 18.4241, lat: -33.9249, offset: 4760 }, // Le Cap
    { id: 16, lng: -74.0060, lat: 40.7128, offset: 5100 }, // New York
    { id: 17, lng: -99.1332, lat: 19.4326, offset: 5440 }, // Mexico
    { id: 18, lng: -79.5197, lat: 8.9824, offset: 5780 },  // Panama (Canal de Panama)
    { id: 19, lng: -43.1729, lat: -22.9068, offset: 6120 },// Rio de Janeiro
    { id: 20, lng: -122.4194, lat: 37.7749, offset: 6460 } // San Francisco
];
const PULSE_DURATION_MS = 2400;

function buildDummySource() {
    return {
        type: "FeatureCollection",
        features: DUMMY_POINTS.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: { id: p.id, offset: p.offset },
        })),
    };
}

// Zoom du globe en fonction de la taille (px) réelle du conteneur. Sur un
// petit conteneur, un zoom trop élevé fait perdre la courbure de la sphère
// (elle remplit alors tout le carré du canvas jusque dans les coins, ce qui
// donne une impression de "carte plate/carrée" plutôt que de globe). On
// dézoome donc progressivement à mesure que le conteneur rétrécit.
const MIN_GLOBE_ZOOM = 0.55;
const MAX_GLOBE_ZOOM = 1;
const MIN_GLOBE_PX = 140;
const MAX_GLOBE_PX = 480;

function computeZoomForSize(px) {
    const clamped = Math.max(MIN_GLOBE_PX, Math.min(MAX_GLOBE_PX, px));
    const t = (clamped - MIN_GLOBE_PX) / (MAX_GLOBE_PX - MIN_GLOBE_PX);
    return MIN_GLOBE_ZOOM + t * (MAX_GLOBE_ZOOM - MIN_GLOBE_ZOOM);
}

// Petit globe décoratif, purement visuel, utilisé sur l'écran de chargement.
// Réutilise la même basemap (STYLE_URL) que MapView, sans aucune interaction
// (pas de drag/zoom/rotate manuels), avec une rotation automatique continue
// et quelques points factices repris du style "tweets MIL" de MapView
// (cercle blanc à liseré rouge + halo flou + anneau pulsé).
export default function LoadingGlobe({ size = 220 }) {
    const containerRef = useRef(null);

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: STYLE_URL,
            center: [50, 25],
            zoom: computeZoomForSize(containerRef.current.offsetWidth || MAX_GLOBE_PX),
            projection: "globe",
            interactive: false,
            attributionControl: false,
        });

        let frameId = null;
        let resizeObserver = null;

        map.on("load", () => {
            map.setProjection({ type: "globe" });
            
            // Réajuste le zoom si la taille du conteneur change (ex: rotation
            // d'écran, redimensionnement de fenêtre, clamp() en vmin qui
            // recalcule la taille).
            resizeObserver = new ResizeObserver((entries) => {
                const width = entries[0]?.contentRect?.width;
                if (width) map.setZoom(computeZoomForSize(width));
            });
            resizeObserver.observe(containerRef.current);

            map.addSource("dummy-points", {
                type: "geojson",
                data: buildDummySource(),
            });

            // Halo flou statique — reprend "tweets-mil-halo" de MapView.
            map.addLayer({
                id: "dummy-points-halo",
                type: "circle",
                source: "dummy-points",
                paint: {
                    "circle-radius": 6,
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-color": "#ED0C0C",
                    "circle-stroke-width": 6,
                    "circle-stroke-opacity": 0.5,
                    "circle-blur": 0.6,
                },
            });

            // Anneau pulsé — reprend l'esprit de "pulse-high-importance_score",
            // avec un décalage de phase par point (voir animate() plus bas).
            map.addLayer({
                id: "dummy-points-pulse",
                type: "circle",
                source: "dummy-points",
                paint: {
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-color": "#ED0C0C",
                    "circle-radius": 3,
                    "circle-stroke-width": 2,
                    "circle-stroke-opacity": 0,
                },
            });

            // Point plein — reprend "tweets-mil" de MapView (blanc, liseré rouge).
            map.addLayer({
                id: "dummy-points-core",
                type: "circle",
                source: "dummy-points",
                paint: {
                    "circle-radius": 3,
                    "circle-color": "#ffffff",
                    "circle-stroke-color": "#ED0C0C",
                    "circle-stroke-width": 1.5,
                },
            });

            const animate = (ts) => {
                // Rotation continue du globe
                const center = map.getCenter();
                center.lng -= 0.18;
                map.setCenter(center);

                // Pulsation des points, décalée par "offset" (expression évaluée
                // côté GPU/style ; "ts" est injecté comme littéral et recalculé
                // à chaque frame).
                const phase = ["%", ["+", ts, ["get", "offset"]], PULSE_DURATION_MS];
                map.setPaintProperty("dummy-points-pulse", "circle-radius", [
                    "interpolate", ["linear"], phase,
                    0, 3,
                    PULSE_DURATION_MS, 16,
                ]);
                map.setPaintProperty("dummy-points-pulse", "circle-stroke-opacity", [
                    "interpolate", ["linear"], phase,
                    0, 0.6,
                    PULSE_DURATION_MS * 0.85, 0.05,
                    PULSE_DURATION_MS, 0,
                ]);

                frameId = requestAnimationFrame(animate);
            };
            frameId = requestAnimationFrame(animate);
        });

        return () => {
            if (frameId) cancelAnimationFrame(frameId);
            if (resizeObserver) resizeObserver.disconnect();
            map.remove();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                overflow: "hidden",
                clipPath: "circle(50% at 50% 50%)",
                WebkitClipPath: "circle(50% at 50% 50%)",
                // Filet de sécurité : sur certains navigateurs, overflow:hidden
                // et clip-path seuls ne clippent pas de façon fiable un canvas
                // WebGL composité par le GPU. mask-image, lui, s'applique après
                // la composition et découpe donc toujours bien le rendu final.
                WebkitMaskImage: "radial-gradient(circle, #000 100%, transparent 100%)",
                maskImage: "radial-gradient(circle, #000 100%, transparent 100%)",
            }}
        />
    );
}