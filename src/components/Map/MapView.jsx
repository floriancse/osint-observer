import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ARMED_GROUPS } from '../TopBar/TopBar';
import { createPopupHTML, createPopupGridHTML } from './popupUtils';
import { loadWeaponIconsToMap, weaponTypeToIconId } from './weaponIcons';
import { WEAPON_TYPE_COLORS, getWeaponTypeLineColorExpression, getWeaponTypePatternExpression } from './weaponIcons';

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
    isRotating,
    onRotationChange,
    registerLocateHandler,
    dateOverride,
    activeGroups = [],
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
    const tweetsReadyRef = useRef(false);
    const militaryAbortRef = useRef(null);
    const hoverInfoRef = useRef(null);

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
        const milParams = new URLSearchParams({ aggressor: name, start_date: start, end_date: end });
        const rangeParams = new URLSearchParams({ country: name });

        if (militaryAbortRef.current) militaryAbortRef.current.abort();
        militaryAbortRef.current = new AbortController();
        const signal = militaryAbortRef.current.signal;

        Promise.all([
            fetch(`${API}/api/twitter_conflicts/military_actions.geojson?${milParams}`, { signal }).then(r => r.json()),
            fetch(`${API}/api/twitter_conflicts/action_range?${rangeParams}`, { signal }).then(r => r.json()),
        ])
            .then(([milData, rangeData]) => {
                const milSource = map.getSource('military_actions');
                const rangeSource = map.getSource('action_range');

                milSource.setData({ type: 'FeatureCollection', features: [] });
                rangeSource.setData({ type: 'FeatureCollection', features: [] });

                setTimeout(() => {
                    milSource.setData(milData);
                    rangeSource.setData(rangeData);
                }, 0);
            })
            .catch(err => { if (err.name !== 'AbortError') console.error(err); });
    }, []);

    const clearMilitaryActions = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        const empty = { type: 'FeatureCollection', features: [] };
        map.getSource('military_actions')?.setData(empty);
        map.getSource('action_range')?.setData(empty);
    }, []);

    // ── Popup ──
    const showGridPopup = useCallback(() => {
        const map = mapRef.current;
        const popup = popupRef.current;
        if (!map || !popup || !currentFeaturesRef.current.length) return;

        const feature = currentFeaturesRef.current[0];
        const coords = feature.geometry.coordinates.slice();
        const html = createPopupGridHTML(currentFeaturesRef.current);
        popup.setLngLat(coords).setHTML(html).addTo(map);
    }, []);

    // ── Affiche le détail d'un tweet ──
    const showDetailPopup = useCallback((index) => {
        const map = mapRef.current;
        const popup = popupRef.current;
        if (!map || !popup || !currentFeaturesRef.current.length) return;

        currentIndexRef.current = index;
        const feature = currentFeaturesRef.current[index];
        const coords = feature.geometry.coordinates.slice();

        let props = { ...feature.properties };
        if (typeof props.images === 'string') {
            try { props.images = JSON.parse(props.images); } catch { props.images = []; }
        }

        // showBack=true uniquement si on vient d'une grille multi-points
        const showBack = currentFeaturesRef.current.length > 1;
        const html = createPopupHTML(props, true, index, currentFeaturesRef.current.length, true, showBack);
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
        window.selectTweetFromGrid = (index) => showDetailPopup(index);
        window.backToGrid = () => showGridPopup();
    }, [showDetailPopup, showGridPopup]);

    useEffect(() => {
        dateOverrideRef.current = dateOverride;
        tweetsReadyRef.current = false;
        clearMilitaryActions();
        const name = selectedNameRef.current;
        if (name) {
            fetchMilitaryActions(name, dateOverride);
        }
    }, [dateOverride, clearMilitaryActions]);

    useEffect(() => {
        if (!registerLocateHandler) return;
        registerLocateHandler((feature) => {
            const map = mapRef.current;
            if (!map) return;
            stopRotation();
            const coords = feature.geometry.coordinates.slice();
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 5), duration: 1000 });
        });
    }, [registerLocateHandler, stopRotation]);

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
        map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point);
        });
        map.on('load', async () => {
            const API = process.env.REACT_APP_API_URL;
            const [worldAreasData, shippingLanes, chokepoints, currentFrontline, seasConflicts] = await Promise.all([
                fetch(`${API}/api/twitter_conflicts/world_areas.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/shipping_lanes.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/chokepoints.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/current_frontline.geojson`).then(r => r.json()),
                fetch(`${API}/api/twitter_conflicts/seas_conflicts.geojson`).then(r => r.json()),
            ]);
            map.setProjection({ type: 'globe' });
            await loadWeaponIconsToMap(map, 48);

            map.addSource('world_areas', { type: 'geojson', data: worldAreasData, promoteId: 'id' });
            map.addSource('shipping_lanes', { type: 'geojson', data: shippingLanes });
            map.addSource('chokepoints', { type: 'geojson', data: chokepoints });
            map.addSource('seas_conflicts', { type: 'geojson', data: seasConflicts });
            map.addSource('tweets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('military_actions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('action_range', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addSource('current_frontline', { type: 'geojson', data: currentFrontline });
            map.addSource('armed_groups_hull', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            const size = 10;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#ed3f3f';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, size);
            ctx.lineTo(size, 0);
            ctx.stroke();

            map.addImage('hatch-pattern', ctx.getImageData(0, 0, size, size));

            map.addLayer({
                id: 'seas_conflicts_fill',
                type: 'fill',
                source: 'seas_conflicts',
                paint: {
                    'fill-pattern': 'hatch-pattern',
                    'fill-opacity': 0.5,
                }
            });

            map.addLayer({
                id: 'world_areas_fill', type: 'fill', source: 'world_areas',
                paint: {
                    'fill-opacity': ['case',
                        ['!=', ['get', 'entity_type'], 'country'], 0,
                        ['boolean', ['feature-state', 'hover'], false], 0.1,
                        0
                    ],
                }
            });

            map.addLayer({
                id: 'world_areas_outline', type: 'line', source: 'world_areas',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': ['case',
                        ['!=', ['get', 'entity_type'], 'country'], 'rgba(0,0,0,0)',
                        ['boolean', ['feature-state', 'selected'], false], '#10b981',
                        ['boolean', ['feature-state', 'hover'], false], '#32886b',
                        'rgba(0,0,0,0)'
                    ],
                    'line-width': ['case',
                        ['!=', ['get', 'entity_type'], 'country'], 0,
                        ['boolean', ['feature-state', 'selected'], false], 2,
                        ['boolean', ['feature-state', 'hover'], false], 1.5,
                        0
                    ],
                    'line-dasharray': ['case',
                        ['!=', ['get', 'entity_type'], 'country'], ['literal', [1, 0]],
                        ['boolean', ['feature-state', 'selected'], false], ['literal', [1, 0]],
                        ['boolean', ['feature-state', 'hover'], false], ['literal', [2, 2]],
                        ['literal', [1, 0]]
                    ],
                },
            });

            map.addLayer({
                id: 'marine_regions_fill', type: 'fill', source: 'world_areas',
                filter: ['==', ['get', 'entity_type'], 'marine region'],
                paint: { 'fill-opacity': 0.01 }
            });

            map.addLayer({
                id: 'current_frontline_lines', type: 'line', source: 'current_frontline',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#ed3f3f', 'line-width': 2, 'line-opacity': 1 },
            });

            map.addLayer({
                id: 'military_actions_lines',
                type: 'line',
                source: 'military_actions',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ed3f3f',
                    'line-width': 1,
                    'line-opacity': 1,
                    'line-dasharray': [2, 2],
                },
            });

            map.addLayer({
                id: 'shipping_lanes_lines', type: 'line', source: 'shipping_lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#5693b0', 'line-width': .75, 'line-opacity': .5, 'line-dasharray': [2, 2] },
            });

            map.addLayer({
                id: 'chokepoints', type: 'circle', source: 'chokepoints',
                paint: { 'circle-radius': 3, 'circle-color': '#5693b0', 'circle-opacity': 0, 'circle-stroke-width': 1, 'circle-stroke-color': '#5693b0' },
            });
            map.addLayer({
                id: 'pulse-high-importance_score', type: 'circle', source: 'tweets',
                filter: ['all', ['>=', ['coalesce', ['to-number', ['get', 'importance_score']], 0], 4]],
                paint: {
                    'circle-color': ['match', ['get', 'conflict_typology'], 'MIL', '#ed3f3f', 'rgba(108,172,251,1)'],
                    'circle-radius': 8,
                    'circle-opacity': 0,
                    'circle-stroke-width': 0,
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
                id: 'tweets_points_halo',
                type: 'circle',
                source: 'tweets',
                filter: ['==', ['get', 'conflict_typology'], 'MIL'],
                paint: {
                    'circle-radius': ['interpolate', ['linear'],
                        ['coalesce', ['to-number', ['get', 'importance_score']], 1],
                        1, 1,
                        3, 2,
                        5, 5,
                    ],
                    'circle-color': 'rgba(0, 0, 0, 0)',
                    'circle-stroke-color': '#ed3f3f',
                    'circle-stroke-width': ['interpolate', ['linear'],
                        ['coalesce', ['to-number', ['get', 'importance_score']], 1],
                        1, 3,
                        3, 6,
                        5, 12,
                    ],
                    'circle-stroke-opacity': 0.6,
                    'circle-blur': 0.5,
                },
            });


            map.addLayer({
                id: 'tweets_points',
                type: 'circle',
                source: 'tweets',
                filter: ['==', ['get', 'conflict_typology'], 'MIL'],
                paint: {
                    'circle-radius': ['interpolate', ['linear'],
                        ['coalesce', ['to-number', ['get', 'importance_score']], 1],
                        1, 1.5,
                        3, 2.5,
                        5, 5,
                    ],
                    'circle-color': '#ffffff',
                    'circle-stroke-color': '#ed3f3f',
                    'circle-stroke-width': 1.5,
                },
            });

            map.addLayer({
                id: 'tweets_hover_area', type: 'circle', source: 'tweets',
                paint: { 'circle-radius': 10, 'circle-opacity': 0 },
            });

            map.addLayer({
                id: 'armed_groups_hull_fill',
                type: 'fill',
                source: 'armed_groups_hull',
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.06,
                },
            });

            map.addLayer({
                id: 'armed_groups_hull_outline',
                type: 'line',
                source: 'armed_groups_hull',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 1.5,
                    'line-opacity': 0.8,
                    'line-dasharray': [3, 2],
                },
            });

            let hoveredId = null;
            let selectedId = null;

            map.on('mousemove', 'world_areas_fill', (e) => {
                if (!e.features.length) return;
                const f = e.features[0];

                // Mise à jour du rectangle d'info
                if (hoverInfoRef.current) {
                    const name = f.properties?.name || f.properties?.SOVEREIGNT || f.properties?.NAME || '';
                    const lng = e.lngLat.lng.toFixed(3);
                    const lat = e.lngLat.lat.toFixed(3);
                    hoverInfoRef.current.style.display = 'block';
                    hoverInfoRef.current.querySelector('.hover-name').textContent = name;
                    hoverInfoRef.current.querySelector('.hover-coords').textContent = `${lat}° ${lng}°`;
                }

                if (f.properties?.entity_type === 'country') {
                    if (hoveredId !== null && hoveredId !== f.id)
                        map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                    map.setFeatureState({ source: 'world_areas', id: f.id }, { hover: true });
                    hoveredId = f.id;
                    map.getCanvas().style.cursor = 'pointer';
                    return;
                }
                if (hoveredId !== null) {
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                    hoveredId = null;
                }
                map.getCanvas().style.cursor = '';
            });

            map.on('mouseleave', 'world_areas_fill', () => {
                if (hoveredId !== null)
                    map.setFeatureState({ source: 'world_areas', id: hoveredId }, { hover: false });
                hoveredId = null;
                map.getCanvas().style.cursor = '';
                if (hoverInfoRef.current) hoverInfoRef.current.style.display = 'none'; // ← ajouter
            });

            map.on('click', 'world_areas_fill', (e) => {
                if (!e.features?.length) return;
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;

                const feature = e.features[0];

                // Ignore tout ce qui n'est pas un country
                if (feature.properties?.entity_type !== 'country') return;

                if (selectedId !== null)
                    map.setFeatureState({ source: 'world_areas', id: selectedId }, { selected: false });

                if (selectedId === feature.id) {
                    selectedId = null;
                    selectedNameRef.current = null;
                    onAreaSelect(null);
                    clearMilitaryActions();
                } else {
                    selectedId = feature.id;
                    map.setFeatureState({ source: 'world_areas', id: feature.id }, { selected: true });
                    const name = feature.properties.name || feature.properties.SOVEREIGNT || feature.properties.NAME || 'Inconnu';
                    selectedNameRef.current = name;
                    onAreaSelect(name);

                    clearMilitaryActions();

                    if (tweetsReadyRef.current) {
                        fetchMilitaryActions(name, dateOverrideRef.current);
                    }
                }
            });

            map.on('click', (e) => {
                const tweets = map.queryRenderedFeatures(e.point, { layers: ['tweets_hover_area'] });
                if (tweets?.length) return;
                const areas = map.queryRenderedFeatures(e.point, { layers: ['world_areas_fill'] });
                if (!areas.length) onAreaSelect(null);
            });

            map.on('mouseenter', 'tweets_hover_area', (e) => {
                if (hoverInfoRef.current) hoverInfoRef.current.style.display = 'none';
                if (popupPinnedRef.current) return;
                map.getCanvas().style.cursor = 'pointer';

                const bbox = [
                    [e.point.x - 10, e.point.y - 10],
                    [e.point.x + 10, e.point.y + 10]
                ];
                const features = map.queryRenderedFeatures(bbox, { layers: ['tweets_hover_area'] });
                features.sort((a, b) => Date.parse(b.properties.created_at) - Date.parse(a.properties.created_at));
                if (!features.length) return;

                const coords = features[0].geometry.coordinates.slice();
                while (Math.abs(e.lngLat.lng - coords[0]) > 180)
                    coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;

                if (features.length === 1) {
                    let props = { ...features[0].properties };
                    if (typeof props.images === 'string') {
                        try { props.images = JSON.parse(props.images); } catch { props.images = []; }
                    }
                    const html = createPopupHTML(props, false, 0, 1, true, false);
                    popupRef.current.setLngLat(coords).setHTML(html).addTo(map);
                } else {
                    const html = createPopupGridHTML(features);
                    popupRef.current.setLngLat(coords).setHTML(html).addTo(map);
                }
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

                if (currentFeaturesRef.current.length === 1) {
                    showDetailPopup(0);
                } else {
                    showGridPopup();
                }
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
                const radius = baseRadius + (baseRadius * 4) * phase;
                map.setPaintProperty('pulse-high-importance_score', 'circle-stroke-opacity', 0);
                map.setPaintProperty('pulse-high-importance_score', 'circle-opacity', opacity * 0.5);
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

            const wasReady = tweetsReadyRef.current;
            tweetsReadyRef.current = true;

            const name = selectedNameRef.current;

        };

        if (map._sourcesReady) {
            applyData();
        } else {
            const interval = setInterval(() => {
                if (map.getSource('tweets')) { clearInterval(interval); applyData(); }
            }, 50);
            return () => clearInterval(interval);
        }
    }, [tweetsData]);

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

    useEffect(() => {
        if (isRotating) startRotation();
        else stopRotation();
    }, [isRotating, startRotation, stopRotation]);

    return (
        <>
            <div ref={mapContainer} id="map" style={{ width: '100%', height: '100%' }} />
            <div
                ref={hoverInfoRef}
                style={{
                    display: 'none',
                    position: 'absolute',
                    bottom: '16px',
                    left: '16px',
                    background: 'rgba(10, 12, 18, 0.82)',
                    backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    pointerEvents: 'none',
                    minWidth: '180px',
                    zIndex: 10,
                }}
            >
                <div
                    className="hover-name"
                    style={{
                        color: '#e2e8f0',
                        fontSize: '13px',
                        fontWeight: 500,
                        letterSpacing: '0.01em',
                        marginBottom: '4px',
                        whiteSpace: 'nowrap',
                    }}
                />
                <div
                    className="hover-coords"
                    style={{
                        color: 'rgba(148,163,184,0.8)',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.04em',
                    }}
                />
            </div>
        </>
    );
}