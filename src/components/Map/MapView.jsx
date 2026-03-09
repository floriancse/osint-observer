import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createPopupHTML } from './popupUtils';

const LAYER_IDS = {
    heatmap: ['tweets_points', 'tweets_viseur', 'tweets_hover_area', 'tweets_heatmap_other', 'pulse-high-importance_score'],
};

function get24hRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

export default function MapView({
    tweetsData,
    selectedLayers,
    onAreaSelect,
    onLocateTweet,
    isRotating,
    onRotationChange,
    registerLocateHandler,
    dateOverride,
}) {
    const mapContainer = useRef(null);
    const mapRef = useRef(null);
    const popupRef = useRef(null);
    const rotationRef = useRef(null);
    const popupPinnedRef = useRef(false);
    const currentFeaturesRef = useRef([]);
    const currentIndexRef = useRef(0);
    const animFrameRef = useRef(null);
    const visibilityHandlerRef = useRef(null);
    const dateOverrideRef = useRef(dateOverride);
    const selectedNameRef = useRef(null);
    const tweetsReadyRef = useRef(false); // ← tweets affichés sur la carte ?

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

    // ── Fetch military actions ──
    const fetchMilitaryActions = useCallback((name, range) => {
        const map = mapRef.current;
        if (!map) return;
        const API = process.env.REACT_APP_API_URL;
        const { start, end } = range ?? get24hRange();
        const params = new URLSearchParams({ aggressor: name, start_date: start, end_date: end });
        fetch(`${API}/api/twitter_conflicts/military_actions.geojson?${params}`)
            .then(r => r.json())
            .then(data => map.getSource('military_actions').setData(data))
            .catch(console.error);
    }, []);

    const clearMilitaryActions = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        const source = map.getSource('military_actions');
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
    }, []);

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

        const html = createPopupHTML(props, popupPinnedRef.current, index, currentFeaturesRef.current.length);
        popup.setLngLat(coords).setHTML(html).addTo(map);
    }, []);

    // ── Expose les fonctions popup à window ──
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

    // ── Sync dateOverride → vide les lignes et attend les nouveaux tweets ──
    useEffect(() => {
        dateOverrideRef.current = dateOverride;
        // On remet à false : les nouvelles lignes militaires ne seront fetchées
        // qu'une fois les tweets du nouveau range affichés sur la carte
        tweetsReadyRef.current = false;
        clearMilitaryActions();
    }, [dateOverride, clearMilitaryActions]);

    // ── Expose le handler "localiser un tweet" au parent ──
    useEffect(() => {
        if (!registerLocateHandler) return;
        registerLocateHandler((feature) => {
            const map = mapRef.current;
            if (!map) return;
            stopRotation();
            const coords = feature.geometry.coordinates.slice();
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 5), duration: 1000 });
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
            workerCount: 0,
        });
        mapRef.current = map;

        popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 15,
            className: 'custom-popup',
            anchor: 'top',
        });

        ['mousedown', 'touchstart', 'dragstart'].forEach(evt => {
            map.on(evt, stopRotation);
        });

        map.on('load', async () => {
            const API = process.env.REACT_APP_API_URL;
            const [worldAreasData, shippingLanes, chokepoints, currentFrontline] = await Promise.all([
                fetch(`${API}/api/twitter_conflicts/world_areas.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/shipping_lanes.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/chokepoints.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/current_frontline.geojson`).then(r => r.json()),
            ]);
            map.setProjection({ type: 'globe' });

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

            map.addSource('world_areas', { type: 'geojson', data: worldAreasData, generateId: true });
            map.addSource('shipping_lanes', { type: 'geojson', data: shippingLanes });
            map.addSource('chokepoints', { type: 'geojson', data: chokepoints });
            map.addSource('aggressor_range', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('tweets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('military_actions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('current_frontline', { type: 'geojson', data: currentFrontline });

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
                        ['boolean', ['feature-state', 'selected'], false], 2,
                        ['boolean', ['feature-state', 'hover'], false], 1.5,
                        0
                    ],
                    'line-dasharray': ['case',
                        ['boolean', ['feature-state', 'selected'], false], ['literal', [1, 0]],
                        ['boolean', ['feature-state', 'hover'], false], ['literal', [2, 2]],
                        ['literal', [1, 0]]
                    ],
                },
            });

            map.addLayer({
                id: 'current_frontline_lines', type: 'line', source: 'current_frontline',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#ff3b5c', 'line-width': 2, 'line-opacity': 1 },
            });

            map.addLayer({
                id: 'military_actions_lines', type: 'line', source: 'military_actions',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ff3b5c', 'line-width': 1.5,
                    'line-opacity': 0.8, 'line-dasharray': [2, 2],
                },
            });

            map.addLayer({
                id: 'aggressor_range_fill', type: 'fill', source: 'aggressor_range',
                paint: { 'fill-color': '#ff3b5c', 'fill-opacity': 0.02 },
            });
            map.addLayer({
                id: 'aggressor_range_outline', type: 'line', source: 'aggressor_range',
                paint: {
                    'line-color': '#ff3b5c', 'line-width': 1.5,
                    'line-opacity': 0.6, 'line-dasharray': [6, 2],
                },
            });

            let hoveredId = null;
            let selectedId = null;

            map.on('mousemove', 'world_areas_fill', (e) => {
                if (!e.features.length) return;
                const f = e.features[0];
                if (hoveredId !== null && hoveredId !== f.id)
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                map.setFeatureState({ source: 'world_areas', id: f.id }, { hover: true });
                hoveredId = f.id;
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'world_areas_fill', () => {
                if (hoveredId !== null)
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                hoveredId = null;
                map.getCanvas().style.cursor = '';
            });

            map.on('click', 'world_areas_fill', (e) => {
                if (!e.features?.length) return;
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;

                const feature = e.features[0];
                if (selectedId !== null)
                    map.setFeatureState({ source: 'world_areas', id: selectedId }, { selected: false });

                if (selectedId === feature.id) {
                    selectedId = null;
                    selectedNameRef.current = null;
                    onAreaSelect(null);
                    map.getSource('aggressor_range').setData({ type: 'FeatureCollection', features: [] });
                    map.getSource('military_actions').setData({ type: 'FeatureCollection', features: [] });
                } else {
                    selectedId = feature.id;
                    map.setFeatureState({ source: 'world_areas', id: feature.id }, { selected: true });
                    const name = feature.properties.name || feature.properties.SOVEREIGNT || feature.properties.NAME || 'Inconnu';
                    selectedNameRef.current = name;
                    onAreaSelect(name);

                    map.getSource('aggressor_range').setData({ type: 'FeatureCollection', features: [] });
                    map.getSource('military_actions').setData({ type: 'FeatureCollection', features: [] });

                    // ← Les lignes militaires ne sont fetchées que si les tweets sont déjà affichés
                    if (tweetsReadyRef.current) {
                        fetchMilitaryActions(name, dateOverrideRef.current);
                    }

                    const API = process.env.REACT_APP_API_URL;
                    fetch(`${API}/api/twitter_conflicts/aggressor_range.geojson?aggressor=${encodeURIComponent(name)}`)
                        .then(r => r.json())
                        .then(data => map.getSource('aggressor_range').setData(data))
                        .catch(console.error);
                }
            });

            map.on('click', (e) => {
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;
                const areas = map.queryRenderedFeatures(e.point, { layers: ['world_areas_fill'] });
                if (!areas.length) onAreaSelect(null);
            });

            map.addLayer({
                id: 'shipping_lanes_lines', type: 'line', source: 'shipping_lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#5693b0', 'line-width': .75, 'line-opacity': .5, 'line-dasharray': [2, 2] },
            });

            map.addLayer({
                id: 'chokepoints', type: 'circle', source: 'chokepoints',
                paint: { 'circle-radius': 0, 'circle-color': '#5693b0', 'circle-opacity': 1, 'circle-stroke-width': 1, 'circle-stroke-color': '#5693b0' },
            });

            map.addLayer({
                id: 'pulse-high-importance_score', type: 'circle', source: 'tweets',
                filter: ['all', ['>=', ['coalesce', ['to-number', ['get', 'importance_score']], 0], 4]],
                paint: {
                    'circle-color': 'transparent', 'circle-radius': 8,
                    'circle-stroke-color': ['match', ['get', 'conflict_typology'], 'MIL', '#ff3b5c', 'rgba(108,172,251,1)'],
                    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 6, 1.5, 10, 2.5],
                    'circle-stroke-opacity': 0.8, 'circle-opacity': 0,
                },
            });

            map.addLayer({
                id: 'tweets_points', type: 'circle', source: 'tweets',
                filter: ['==', ['get', 'conflict_typology'], 'MIL'],
                paint: {
                    'circle-color': '#ff3b5c',
                    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'importance_score']], 1], 1, 1, 2, 2, 3, 3, 4, 4, 5, 8],
                    'circle-opacity': 0.7,
                },
            });

            map.addLayer({
                id: 'tweets_heatmap_other', type: 'heatmap', source: 'tweets',
                filter: ['!=', ['get', 'conflict_typology'], 'MIL'],
                paint: {
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'importance_score'], 1, 0.5, 5, 1],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(0,0,0,0)', 0.2, 'rgba(108,172,251,1)', 1, '#b4cff1'],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 7, 13],
                    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0.8],
                },
            });

            map.addLayer({
                id: 'tweets_viseur', type: 'circle', source: 'tweets',
                filter: ['==', ['get', 'conflict_typology'], 'MIL'],
                paint: {
                    'circle-color': '#ff3b5c', 'circle-opacity': 0.2,
                    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'importance_score']], 1], 1, 4, 2, 5, 3, 7, 4, 9, 5, 20],
                    'circle-stroke-width': 1, 'circle-stroke-color': '#ff3b5c', 'circle-stroke-opacity': 0.8,
                },
            });

            map.addLayer({
                id: 'tweets_hover_area', type: 'circle', source: 'tweets',
                paint: { 'circle-radius': 10, 'circle-opacity': 0 },
            });

            map.on('mouseenter', 'tweets_hover_area', (e) => {
                if (popupPinnedRef.current) return;
                map.getCanvas().style.cursor = 'pointer';
                const features = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                features.sort((a, b) => Date.parse(b.properties.created_at) - Date.parse(a.properties.created_at));
                if (!features.length) return;
                const feature = features[0];
                let props = { ...feature.properties };
                if (typeof props.images === 'string') {
                    try { props.images = JSON.parse(props.images); } catch { props.images = []; }
                }
                const coords = feature.geometry.coordinates.slice();
                while (Math.abs(e.lngLat.lng - coords[0]) > 180)
                    coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
                const html = createPopupHTML(props, false, 0, features.length);
                popupRef.current.setLngLat(coords).setHTML(html).addTo(map);
            });

            map.on('mouseleave', 'tweets_hover_area', () => {
                if (!popupPinnedRef.current) {
                    map.getCanvas().style.cursor = '';
                    popupRef.current.remove();
                }
            });

            map.on('click', 'tweets_hover_area', (e) => {
                e.preventDefault();
                popupPinnedRef.current = true;
                popupRef.current.remove();
                currentFeaturesRef.current = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                currentFeaturesRef.current.sort((a, b) => Date.parse(b.properties.created_at) - Date.parse(a.properties.created_at));
                if (!currentFeaturesRef.current.length) return;
                currentIndexRef.current = 0;
                showPopupAtIndex(0);
            });

            const animatePulse = () => {
                if (!mapRef.current) { animFrameRef.current = null; return; }
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
                const baseRadius = zoom < 3 ? 4 : zoom < 6 ? 5 : zoom < 9 ? 5 : 4;
                const radius = baseRadius + (baseRadius * 10 - baseRadius) * phase;
                map.setPaintProperty('pulse-high-importance_score', 'circle-stroke-opacity', opacity);
                map.setPaintProperty('pulse-high-importance_score', 'circle-opacity', opacity);
                map.setPaintProperty('pulse-high-importance_score', 'circle-radius', radius);
                animFrameRef.current = requestAnimationFrame(animatePulse);
            };

            const handleVisibilityChange = () => {
                if (document.hidden) { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }
                else animatePulse();
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            visibilityHandlerRef.current = handleVisibilityChange;
            mapRef.current._sourcesReady = true;
            animatePulse();
            startRotation();
        });

        return () => {
            document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (rotationRef.current) clearInterval(rotationRef.current);
            map.remove();
            mapRef.current = null;
        };
    }, []); // eslint-disable-line

    // ── Sync tweets data ──
    // C'est ici qu'on déclenche aussi les military actions une fois les tweets prêts
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !tweetsData) return;

        const applyData = () => {
            const source = map.getSource('tweets');
            if (!source) return;

            source.setData({
                ...tweetsData,
                features: tweetsData.features.map(f => ({
                    ...f,
                    properties: { ...f.properties, created_at_ms: new Date(f.properties.created_at).getTime() }
                }))
            });

            // Tweets maintenant affichés → on peut charger les lignes militaires
            const wasReady = tweetsReadyRef.current;
            tweetsReadyRef.current = true;

            const name = selectedNameRef.current;
            if (name) {
                // Premier chargement ou changement de dateOverride : on fetch
                fetchMilitaryActions(name, dateOverrideRef.current);
            }
        };

        if (map._sourcesReady) {
            applyData();
        } else {
            const interval = setInterval(() => {
                if (map.getSource('tweets')) { clearInterval(interval); applyData(); }
            }, 50);
            return () => clearInterval(interval);
        }
    }, [tweetsData, fetchMilitaryActions]);

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