import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createPopupHTML } from './popupUtils';

const LAYER_IDS = {
    disputed: ['disputed_areas_fill', 'disputed_areas_outline'],
    heatmap: ['tweets_points', 'tweets_viseur', 'tweets_hover_area', 'tweets_heatmap_other', 'pulse-high-importance'],
};



export default function MapView({
    tweetsData,
    selectedLayers,
    onAreaSelect,
    onLocateTweet,
    isRotating,
    onRotationChange,
    registerLocateHandler,
}) {

    const mapContainer = useRef(null);
    const mapRef = useRef(null);
    const popupRef = useRef(null);
    const rotationRef = useRef(null);
    const popupPinnedRef = useRef(false);
    const currentFeaturesRef = useRef([]);
    const currentIndexRef = useRef(0);
    const animFrameRef = useRef(null);

    // ── Rotation ──
    const startRotation = useCallback(() => {
        if (rotationRef.current) return;
        rotationRef.current = setInterval(() => {
            const map = mapRef.current;
            if (!map) return;
            const center = map.getCenter();
            center.lng += 0.5;
            map.easeTo({ center, duration: 100, easing: t => t });
        }, 100);
        onRotationChange(true);
    }, [onRotationChange]);

    const stopRotation = useCallback(() => {
        if (rotationRef.current) {
            clearInterval(rotationRef.current);
            rotationRef.current = null;
        }
        onRotationChange(false);
    }, [onRotationChange]);

    // ── Popup ──
    const showPopupAtIndex = useCallback((index) => {
        const map = mapRef.current;
        const popup = popupRef.current;
        if (!map || !popup || currentFeaturesRef.current.length === 0) return;

        currentIndexRef.current = index;
        const feature = currentFeaturesRef.current[index];
        const coords = feature.geometry.coordinates.slice();

        let props = { ...feature.properties };
        if (typeof props.images === 'string') {
            try { props.images = JSON.parse(props.images); }
            catch { props.images = []; }
        }

        const html = createPopupHTML(
            props,
            popupPinnedRef.current,
            index,
            currentFeaturesRef.current.length
        );
        popup.setLngLat(coords).setHTML(html).addTo(map);
    }, []);

    // Expose les fonctions popup à window pour les onclick HTML
    useEffect(() => {
        window.closePopup = () => {
            popupPinnedRef.current = false;
            currentFeaturesRef.current = [];
            currentIndexRef.current = 0;
            popupRef.current?.remove();
        };
        window.nextTweet = () => {
            const next = (currentIndexRef.current + 1) % currentFeaturesRef.current.length;
            showPopupAtIndex(next);
        };
        window.previousTweet = () => {
            const prev = (currentIndexRef.current - 1 + currentFeaturesRef.current.length) % currentFeaturesRef.current.length;
            showPopupAtIndex(prev);
        };
    }, [showPopupAtIndex]);

    // Expose le handler "localiser un tweet" au parent
    useEffect(() => {
        if (!registerLocateHandler) return;
        registerLocateHandler((feature) => {
            const map = mapRef.current;
            if (!map) return;
            stopRotation();
            const coords = feature.geometry.coordinates.slice();
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 5), duration: 1000 });
            popupPinnedRef.current = true;
            currentFeaturesRef.current = [feature];
            currentIndexRef.current = 0;
            showPopupAtIndex(0);
        });
    }, [registerLocateHandler, stopRotation, showPopupAtIndex]);

    // ── Init carte ──
    useEffect(() => {
        const map = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=MIeaKd18gACAhOFV3PZu',
            zoom: 2.2,
            center: [2, 40],
            attributionControl: false,
            workerCount: 0,  // ← ajoute cette ligne
        });
        mapRef.current = map;

        popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 15,
            className: 'custom-popup',
        });

        ['mousedown', 'touchstart', 'dragstart'].forEach(evt => {
            map.on(evt, stopRotation);
        });

        map.on('load', async () => {
            const API = process.env.REACT_APP_API_URL;
            const [disputedData, worldAreasData] = await Promise.all([
                fetch(`${API}/api/twitter_conflicts/disputed_areas.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/world_areas.geojson`).then(r => r.json()),
            ]);
            map.setProjection({ type: 'globe' });

            // Hatch pattern
            const size = 64;
            const hatchImage = new Uint8Array(size * size * 4);
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    const idx = (y * size + x) * 4;
                    if ((x + y) % 8 < 2) {
                        hatchImage[idx] = 136; hatchImage[idx + 1] = 0;
                        hatchImage[idx + 2] = 0; hatchImage[idx + 3] = 255;
                    }
                }
            }
            map.addImage('hatch-pattern', { width: size, height: size, data: hatchImage });

            // Sources
            map.addSource('disputed_areas', {
                type: 'geojson',
                data: disputedData,
            });
            map.addSource('world_areas', {
                type: 'geojson',
                data: worldAreasData,
                generateId: true,
            });
            map.addSource('tweets', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            // Layers disputed
            map.addLayer({
                id: 'disputed_areas_fill', type: 'fill', source: 'disputed_areas',
                paint: { 'fill-pattern': 'hatch-pattern', 'fill-opacity': 0.5 }
            });
            map.addLayer({
                id: 'disputed_areas_outline', type: 'line', source: 'disputed_areas',
                paint: { 'line-color': '#880000', 'line-width': 1, 'line-opacity': 1 }
            });

            // Layers world areas
            map.addLayer({
                id: 'world_areas_fill', type: 'fill', source: 'world_areas',
                paint: { 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.1, 0] }
            });
            map.addLayer({
                id: 'world_areas_outline', type: 'line', source: 'world_areas',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': ['case',
                        ['boolean', ['feature-state', 'selected'], false], '#10b981',
                        ['boolean', ['feature-state', 'hover'], false], '#10b981',
                        'rgba(0,0,0,0)'
                    ],
                    'line-width': ['case',
                        ['boolean', ['feature-state', 'selected'], false], 3,
                        ['boolean', ['feature-state', 'hover'], false], 2,
                        0
                    ],
                },
            });

            // Hover world areas
            let hoveredId = null;
            let selectedId = null;

            map.on('mousemove', 'world_areas_fill', (e) => {
                if (!e.features.length) return;
                const f = e.features[0];
                if (hoveredId !== null && hoveredId !== f.id) {
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                }
                map.setFeatureState({ source: 'world_areas', id: f.id }, { hover: true });
                hoveredId = f.id;
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'world_areas_fill', () => {
                if (hoveredId !== null) {
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                }
                hoveredId = null;
                map.getCanvas().style.cursor = '';
            });

            // Click world area
            map.on('click', 'world_areas_fill', (e) => {
                if (!e.features?.length) return;
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;

                const feature = e.features[0];
                if (selectedId !== null) {
                    map.setFeatureState({ source: 'world_areas', id: selectedId }, { selected: false });
                }
                if (selectedId === feature.id) {
                    selectedId = null;
                    onAreaSelect(null);
                } else {
                    selectedId = feature.id;
                    map.setFeatureState({ source: 'world_areas', id: feature.id }, { selected: true });
                    const name = feature.properties.name || feature.properties.SOVEREIGNT || feature.properties.NAME || 'Inconnu';
                    onAreaSelect(name);
                }
            });

            // Click sur fond carte = déselectionne
            map.on('click', (e) => {
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;
                const areas = map.queryRenderedFeatures(e.point, { layers: ['world_areas_fill'] });
                if (!areas.length) onAreaSelect(null);
            });

            // Layers tweets
            map.addLayer({
                id: 'pulse-high-importance', type: 'circle', source: 'tweets',
                filter: ['all', ['>=', ['coalesce', ['to-number', ['get', 'importance']], 0], 4]],
                paint: {
                    'circle-color': 'transparent', 'circle-radius': 20,
                    'circle-stroke-color': ['match', ['get', 'typology'], 'MIL', '#ff3b5c', 'rgba(108,172,251,1)'],
                    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 6, 2.5, 10, 4],
                    'circle-stroke-opacity': 0, 'circle-opacity': 0,
                },
            });

            map.addLayer({
                id: 'tweets_points', type: 'circle', source: 'tweets',
                filter: ['==', ['get', 'typology'], 'MIL'],
                paint: {
                    'circle-color': '#ff3b5c',
                    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 5, 0.5, 10, 0.6, 18, 1],
                    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'importance']], 1], 1, 1, 2, 2, 3, 3, 4, 4, 5, 10],
                },
            });

            map.addLayer({
                id: 'tweets_heatmap_other', type: 'heatmap', source: 'tweets',
                filter: ['!=', ['get', 'typology'], 'MIL'],
                paint: {
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'importance'], 1, 0.5, 5, 1],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(0,0,0,0)', 0.2, 'rgba(108,172,251,1)', 1, '#b4cff1'],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 9, 15],
                    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0.8],
                },
            });

            map.addLayer({
                id: 'tweets_viseur', type: 'circle', source: 'tweets',
                filter: ['==', ['get', 'typology'], 'MIL'],
                paint: {
                    'circle-color': '#ff3b5c', 'circle-opacity': 0.3,
                    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'importance']], 1], 1, 2, 2, 4, 3, 6, 4, 10, 5, 20],
                    'circle-stroke-width': 1, 'circle-stroke-color': '#ff3b5c', 'circle-stroke-opacity': 0.8,
                },
            });

            map.addLayer({
                id: 'tweets_hover_area', type: 'circle', source: 'tweets',
                paint: { 'circle-radius': 10, 'circle-opacity': 0 },
            });

            // Popup hover
            map.on('mouseenter', 'tweets_hover_area', (e) => {
                if (popupPinnedRef.current) return;
                map.getCanvas().style.cursor = 'pointer';
                const features = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                features.sort((a, b) => (parseFloat(b.properties.importance) || 0) - (parseFloat(a.properties.importance) || 0));
                if (!features.length) return;

                const feature = features[0];
                const coords = feature.geometry.coordinates.slice();
                while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
                    coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
                }
                const html = createPopupHTML(feature.properties, false, 0, features.length);
                popupRef.current.setLngLat(coords).setHTML(html).addTo(map);
            });

            map.on('mouseleave', 'tweets_hover_area', () => {
                if (!popupPinnedRef.current) {
                    map.getCanvas().style.cursor = '';
                    popupRef.current.remove();
                }
            });

            // Click tweet = pin popup
            map.on('click', 'tweets_hover_area', (e) => {
                e.preventDefault();
                popupPinnedRef.current = true;
                popupRef.current.remove();
                currentFeaturesRef.current = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                currentFeaturesRef.current.sort((a, b) => (parseFloat(b.properties.importance) || 0) - (parseFloat(a.properties.importance) || 0));
                if (!currentFeaturesRef.current.length) return;
                currentIndexRef.current = 0;
                showPopupAtIndex(0);
            });

            // Animation pulse
            const animatePulse = () => {
                const now = performance.now() / 1000;
                const zoom = map.getZoom();
                const duration = 2.8;
                const phase = (now % duration) / duration;
                const maxOpacity = zoom < 6 ? 0.9 : zoom < 9 ? 0.85 : 0.8;
                const appearStart = 0.12;
                let opacity = 0;
                if (phase > appearStart) {
                    const t = (phase - appearStart) / (1 - appearStart);
                    opacity = maxOpacity * (1 - t);
                }
                if (zoom < 3) opacity *= 0.6;
                const baseRadius = zoom < 3 ? 7 : zoom < 6 ? 6 : zoom < 9 ? 5 : 4;
                const maxGrow = baseRadius * (zoom < 6 ? 15 : zoom < 9 ? 8 : 10);
                const radius = baseRadius + (maxGrow - baseRadius) * phase;
                map.setPaintProperty('pulse-high-importance', 'circle-stroke-opacity', opacity);
                map.setPaintProperty('pulse-high-importance', 'circle-opacity', opacity);
                map.setPaintProperty('pulse-high-importance', 'circle-radius', radius);
                animFrameRef.current = requestAnimationFrame(animatePulse);
            };
            animatePulse();

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
                } else {
                    animatePulse();
                }
            });

            startRotation();
        });

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (rotationRef.current) clearInterval(rotationRef.current);
            map.remove();
        };
    }, []); // eslint-disable-line

    // ── Sync tweets data ──
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !tweetsData) return;
        const source = map.getSource('tweets');
        if (source) source.setData(tweetsData);
    }, [tweetsData]);

    // ── Sync layers visibility ──
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        Object.entries(LAYER_IDS).forEach(([id, layerIds]) => {
            const visibility = selectedLayers.has(id) ? 'none' : 'visible';
            layerIds.forEach(lid => {
                if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', visibility);
            });
        });
    }, [selectedLayers]);

    // ── Sync rotation ──
    useEffect(() => {
        if (isRotating) startRotation();
        else stopRotation();
    }, [isRotating, startRotation, stopRotation]);

    return <div ref={mapContainer} id="map" style={{ width: '100%', height: '100%' }} />;
}