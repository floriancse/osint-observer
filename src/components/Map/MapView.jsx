/* eslint-disable */
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import "./MapView.css";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTime } from "../../context/TimeContext";
import { createPopupHTML } from "../../utils/popupUtils";
import { loadChokepointImages } from "../../utils/chokepointIcons";
import { loadTopicImages } from "../../utils/topicIcons";

const MAPTILER_API_KEY = process.env.REACT_APP_MAPTILER_API_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/019e947a-cdc7-7112-be5f-b04019239e3c/style.json?key=${MAPTILER_API_KEY}`;
const API = process.env.REACT_APP_API_URL;

/* ─── Theater popup helpers ─── */
const getTheaterFreshness = (isoDate) => {
    if (!isoDate) return "stale";
    const diffH = (Date.now() - new Date(isoDate).getTime()) / 36e5;
    if (diffH < 6) return "hot";
    if (diffH < 24) return "warm";
    if (diffH < 72) return "cool";
    return "stale";
};

const formatTheaterRelative = (isoDate) => {
    if (!isoDate) return null;
    const diffH = (Date.now() - new Date(isoDate).getTime()) / 36e5;
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
};

const formatTheaterDate = (iso) =>
    new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const getTheaterLoadingHTML = () => `
    <div class="theater-popup-inner">
        <div class="theater-popup-loading">
            <span class="theater-popup-loading-dot"></span>
            <span class="theater-popup-loading-dot"></span>
            <span class="theater-popup-loading-dot"></span>
        </div>
    </div>
`;

const getTheaterErrorHTML = () => `
    <div class="theater-popup-inner">
        <p class="theater-popup-empty">Unable to load theater data.</p>
    </div>
`;

const getTheaterHTML = (topic, tweets) => {
    const freshness = getTheaterFreshness(topic.LATEST_UPDATE);
    const relTime = formatTheaterRelative(topic.LATEST_UPDATE);
    const countries = (topic.COUNTRIES || [])
        .map(c => `<span class="theater-popup-tag">${c}</span>`).join('');
    const imgLabel = (topic.LABEL || '').replace(/ /g, '%20');
    const publicUrl = process.env.PUBLIC_URL || '';

    const summaryBlock = topic.TOPIC_SUMMARY ? `
        <div class="theater-popup-summary" style="background-image:url('${publicUrl}/img/${imgLabel}.png')">
            <div class="theater-popup-summary-overlay"></div>
            <div class="theater-popup-summary-inner">
                <div class="theater-popup-summary-label">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    Situation summary
                </div>
                <p class="theater-popup-summary-text">${topic.TOPIC_SUMMARY}</p>
            </div>
        </div>
    ` : '';

    const eventsHTML = tweets.length > 0 ? `
        <div class="theater-popup-divider"><span>Major events</span></div>
        <div class="theater-popup-events">
            ${tweets.map(t => `
                <div class="theater-popup-event">
                    <div class="theater-popup-event-date">${formatTheaterDate(t.created_at)}</div>
                    ${t.summary_title ? `<p class="theater-popup-event-title">${t.summary_title}</p>` : ''}
                    <p class="theater-popup-event-summary">"${t.summary}"</p>
                </div>
            `).join('')}
        </div>
    ` : `<p class="theater-popup-empty">No significant events found for this theater.</p>`;

    return `
        <div class="theater-popup-inner">
            <div class="theater-popup-header">
                <div class="theater-popup-header-top">
                    <span class="theater-popup-freshness-dot theater-popup-freshness-dot--${freshness}"></span>
                    <span class="theater-popup-title">${topic.LABEL || 'Theater'}</span>
                </div>
                ${countries ? `<div class="theater-popup-countries">${countries}</div>` : ''}
            </div>
            <div class="theater-popup-body">
                ${summaryBlock}
                ${eventsHTML}
            </div>
        </div>
    `;
};

const MapView = forwardRef(function MapView({ onTweetsLoaded, activeLabel }, ref) {
    const { timeRange } = useTime();
    const containerRef = useRef(null);
    const timeRangeRef = useRef(timeRange);
    const activeLabelRef = useRef(activeLabel);
    const mapRef = useRef(null);
    useImperativeHandle(ref, () => ({
        flyTo: (options) => {
            const currentZoom = mapRef.current?.getZoom();
            mapRef.current?.flyTo({ ...options, zoom: currentZoom });
        },
        openTweetPopup: (feature) => {
            const map = mapRef.current;
            if (!map) return;

            const coords = feature.geometry?.coordinates?.slice()
                || [feature.properties.longitude, feature.properties.latitude];
            if (!coords || coords.length < 2) return;

            const props = feature.properties;
            const images = (() => {
                if (Array.isArray(props.images)) return props.images;
                try { return JSON.parse(props.images); } catch { return []; }
            })();

            // Close any existing pinned popup
            if (pinnedPopupRef.current) {
                pinnedPopupRef.current.remove();
                pinnedPopupRef.current = null;
            }

            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 5), duration: 1200, padding: { top: 0, bottom: 0, left: 0, right: 0 } });

            // Open popup once the camera stops moving
            map.once('moveend', () => {
                if (pinnedPopupRef.current) return;
                const newPopup = new maplibregl.Popup({
                    closeButton: true,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(createPopupHTML({ ...props, images }, true, 0, 1, true, false))
                    .addTo(map);

                pinnedPopupRef.current = newPopup;
                newPopup.on("close", () => { pinnedPopupRef.current = null; });
                window.navigateTweet = () => { };
            });
        },
        resize: () => mapRef.current?.resize(),
    }));
    const animFrameRef = useRef(null)
    const [dataTweets, setDataTweets] = useState(null);
    const onTweetsLoadedRef = useRef(onTweetsLoaded);
    const isFirstRender = useRef(true);
    const pinnedPopupRef = useRef(null);

    useEffect(() => { onTweetsLoadedRef.current = onTweetsLoaded; }, [onTweetsLoaded]);
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        activeLabelRef.current = activeLabel;

        // Filtres de base définis à la création des layers (à ne pas écraser)
        const baseFilters = {
            'pulse-high-importance_score': ['all',
                ['==', ['get', 'conflict_typology'], 'MIL'],
                ['>=', ['coalesce', ['to-number', ['get', 'importance_score']], 0], 4],
            ],
            'tweets_heatmap_other': ['!=', ['get', 'conflict_typology'], 'MIL'],
            'tweets-mil-halo': ['==', ['get', 'conflict_typology'], 'MIL'],
            'tweets-mil': ['==', ['get', 'conflict_typology'], 'MIL'],
            'tweets-hover-area': null,
        };

        Object.entries(baseFilters).forEach(([layerId, baseFilter]) => {
            if (!map.getLayer(layerId)) return;

            if (activeLabel) {
                const labelFilter = ['==', ['get', 'label'], activeLabel];
                const combined = baseFilter
                    ? ['all', baseFilter, labelFilter]
                    : labelFilter;
                map.setFilter(layerId, combined);
            } else {
                map.setFilter(layerId, baseFilter);
            }
        });

        // Topic areas : afficher l'outline du topic sélectionné, cacher si "All topics"
        const topicAreaLayers = ['topics-areas-hover-fill', 'topics-areas-hover-outline'];
        topicAreaLayers.forEach(layerId => {
            if (!map.getLayer(layerId)) return;
            map.setFilter(layerId, activeLabel
                ? ['==', ['get', 'label'], activeLabel]
                : ['==', ['get', 'topic_id'], '']   // filtre vide = tout masqué
            );
        });
    }, [activeLabel]);
    useEffect(() => {
        timeRangeRef.current = timeRange;
    }, [timeRange]);

    const loadAllData = async (map) => {
        try {
            const { start, end } = timeRangeRef.current;
            const [dataTweets, dataShipping, dataChokepoints, dataBorders, dataBordersTheaters, dataMilitaryAreas, dataWorldAreas, dataTopicsLocations, dataTopicsAreas, dataMilitaryLines] =
                await Promise.all([
                    fetch(`${API}/tweets.geojson?start_date=${start}&end_date=${end}`).then(r => r.json()),
                    fetch(`${API}/shipping_lanes.geojson`).then(r => r.json()),
                    fetch(`${API}/chokepoints.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_borders.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_theaters.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_areas.geojson`).then(r => r.json()),
                    fetch(`${API}/world_areas.geojson`).then(r => r.json()),
                    fetch(`${API}/topics_location.geojson`).then(r => r.json()),
                    fetch(`${API}/topics_areas.geojson`).then(r => r.json()),
                    fetch(`${API}/military_lines.geojson`).then(r => r.json()),
                ]);

            setDataTweets(dataTweets);
            if (onTweetsLoaded) onTweetsLoaded(dataTweets);
            if (onTweetsLoadedRef.current) onTweetsLoadedRef.current(dataTweets);
            map.addSource("tweets", { type: "geojson", data: dataTweets });
            map.addSource("shipping-lanes", { type: "geojson", data: dataShipping });
            map.addSource("chokepoints", { type: "geojson", data: dataChokepoints });
            map.addSource("conflict-borders", { type: "geojson", data: dataBorders });
            map.addSource("conflict-theaters", { type: "geojson", data: dataBordersTheaters });
            map.addSource("conflict-areas", { type: "geojson", data: dataMilitaryAreas });
            map.addSource("world-areas", { type: "geojson", data: dataWorldAreas });
            map.addSource("topics-locations", { type: "geojson", data: dataTopicsLocations });
            map.addSource("topics-areas", { type: "geojson", data: dataTopicsAreas });
            map.addSource("military-lines", { type: "geojson", data: dataMilitaryLines });
            return dataTweets
        } catch (err) {
            console.error("Erreur chargement données initiales :", err);
        }
    };

    useEffect(() => {
        if (mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: STYLE_URL,
            center: [2, 40],
            zoom: 1.5,
            projection: "globe",
        });

        mapRef.current = map;

        map.on("load", async () => {
            map.setProjection({ type: 'globe' });
            const dataTweets = await loadAllData(map);
            let popup = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true,
                maxWidth: "360px",
                className: "tweet-popup",
                anchor: "bottom",
            });

            window.closePopup = () => {
                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                }
            };

            map.addLayer({
                id: 'conflict-theaters-fill',
                type: 'fill',
                source: 'conflict-theaters',
                paint: {
                    'fill-color': '#f71616',
                    'fill-opacity': 0.2
                }
            });
            map.addLayer({
                id: 'conflict-areas-fill',
                type: 'fill',
                source: 'conflict-areas',
                paint: {
                    'fill-color': '#f7a816',
                    'fill-opacity': 0.2
                }
            });
            map.addLayer({
                id: 'conflict-areas-outline',
                type: 'line',
                source: 'conflict-areas',
                paint: {
                    'line-color': '#f7a816',
                    'line-width': 1,
                    'line-opacity': 1,
                    'line-dasharray': [6, 3]
                }
            });
            map.addLayer({
                id: 'conflict-borders',
                type: 'line',
                source: 'conflict-borders',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#f71616',
                    'line-width': 2,
                    'line-opacity': 1,
                }
            });
            map.addLayer({
                id: 'shipping-lanes', type: 'line', source: 'shipping-lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#4a588e', 'line-width': .75, 'line-opacity': .5, 'line-dasharray': [2, 2] },
            });
            map.addLayer({
                id: 'pulse-high-importance_score',
                type: 'circle',
                source: 'tweets',
                filter: ['all',
                    ['==', ['get', 'conflict_typology'], 'MIL'],
                    ['>=', ['coalesce', ['to-number', ['get', 'importance_score']], 0], 4],
                ],
                paint: {
                    'circle-color': ['match', ['get', 'conflict_typology'], 'MIL', '#f71616', 'rgb(129, 183, 249)'],
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
                        0, 'rgba(0,0,0,0)', 0.2, 'rgb(78, 152, 241)', 1, '#9fc5f4'],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 7, 13],
                    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0.8],
                },
            });
            const MIL_FILTER = ["==", ["get", "conflict_typology"], "MIL"];
            map.addLayer({
                id: "tweets-mil-halo",
                type: "circle",
                source: "tweets",
                filter: MIL_FILTER,
                paint: {
                    "circle-radius": ["interpolate", ["linear"],
                        ["coalesce", ["to-number", ["get", "importance_score"]], 1],
                        1, 1, 3, 2, 5, 5,
                    ],
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-color": "#f71616",
                    "circle-stroke-width": ["interpolate", ["linear"],
                        ["coalesce", ["to-number", ["get", "importance_score"]], 1],
                        1, 3, 3, 6, 5, 12,
                    ],
                    "circle-stroke-opacity": 0.6,
                    "circle-blur": 0.5,
                },
                layout: {
                    "circle-sort-key": ["coalesce", ["to-number", ["get", "importance_score"]], 0],
                },
            });
            map.addLayer({
                id: "tweets-mil",
                type: "circle",
                source: "tweets",
                filter: MIL_FILTER,
                paint: {
                    "circle-radius": ["interpolate", ["linear"],
                        ["coalesce", ["to-number", ["get", "importance_score"]], 1],
                        1, 1.5, 3, 2.5, 5, 5,
                    ],
                    "circle-color": "#ffffff",
                    "circle-stroke-color": "#f71616",
                    "circle-stroke-width": 1.5,
                },
            });
            map.addLayer({
                id: 'tweets-hover-area', type: 'circle', source: 'tweets',
                paint: { 'circle-radius': 7, 'circle-opacity': 0 },
            });

            loadChokepointImages(map);
            loadTopicImages(map);
            map.addLayer({
                id: "chokepoints",
                type: "symbol",
                source: "chokepoints",
                filter: ["==", ["get", "status"], "CLOSED"],
                layout: {
                    "icon-image": [
                        "match",
                        ["get", "status"],
                        "OPEN", "chokepoint-OPEN",
                        "CLOSED", "chokepoint-CLOSED",
                        "RESTRICTED", "chokepoint-RESTRICTED",
                        "chokepoint-UNKNOWN",
                    ],
                    "icon-size": 0.35,
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                },
            });
            map.addLayer({
                id: 'world-areas',
                type: 'fill',
                source: 'world-areas',
                paint: {
                    'fill-color': 'transparent',
                    'fill-opacity': 0,
                }
            });
            map.addLayer({
                id: "topics-locations-layer",
                type: "symbol",
                source: "topics-locations",
                layout: {
                    "icon-image": "topic-location",
                    "icon-size": 0.35,
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                },
            });
            map.addLayer({
                id: "topics-areas-hover-outline",
                type: "line",
                source: "topics-areas",
                filter: ['==', ['get', 'topic_id'], ''],
                paint: {
                    "line-color": "#b7bdc3",
                    "line-width": 1.5,
                    "line-opacity": 1,
                    "line-dasharray": [4, 2],
                },
            });
            //MOUSE BEHAVIOR
            let pinnedTopicId = null;
            const emptyTopicFilter = ['==', ['get', 'topic_id'], ''];

            const clearTopicOutline = () => {
                pinnedTopicId = null;
                map.setFilter("topics-areas-hover-fill", emptyTopicFilter);
                map.setFilter("topics-areas-hover-outline", emptyTopicFilter);
            };

            map.on("mouseenter", "topics-locations-layer", (e) => {
                if (!e.features.length) return;
                map.getCanvas().style.cursor = "pointer";
                isHoveringTopic = true;

                // Topics take priority: dismiss any active tweet / conflict hover popup
                if (!pinnedPopup) {
                    popup.remove();
                    conflictPopup.remove();
                    currentHoverPopup = null;
                }
                isHoveringTweet = false;
                isHoveringConflictArea = false;

                const topicId = e.features[0].properties.topic_id;
                const filter = ['==', ['get', 'topic_id'], topicId];
                map.setFilter("topics-areas-hover-fill", filter);
                map.setFilter("topics-areas-hover-outline", filter);
            });

            map.on("mouseleave", "topics-locations-layer", () => {
                map.getCanvas().style.cursor = "";
                isHoveringTopic = false;
                // Don't clear outline if a popup is pinned on this topic
                if (!pinnedTopicId) {
                    // Restore label-based filter if a topic is selected in the panel, else hide
                    const restoreFilter = activeLabelRef.current
                        ? ['==', ['get', 'label'], activeLabelRef.current]
                        : emptyTopicFilter;
                    map.setFilter("topics-areas-hover-fill", restoreFilter);
                    map.setFilter("topics-areas-hover-outline", restoreFilter);
                }
            });

            let topicClickConsumed = false;

            map.on("click", "topics-locations-layer", async (e) => {
                topicClickConsumed = true;
                setTimeout(() => { topicClickConsumed = false; }, 0);
                if (!e.features.length) return;

                const topicId = e.features[0].properties.topic_id;
                const coords = e.features[0].geometry.coordinates.slice();

                // Close any existing pinned popup
                if (pinnedPopup) { pinnedPopup.remove(); setPinnedPopup(null); }

                // Pin the outline on this topic
                pinnedTopicId = topicId;
                const topicFilter = ['==', ['get', 'topic_id'], topicId];
                map.setFilter("topics-areas-hover-fill", topicFilter);
                map.setFilter("topics-areas-hover-outline", topicFilter);

                // Show loading popup immediately
                const theaterPopup = new maplibregl.Popup({
                    closeButton: true,
                    closeOnClick: false,
                    maxWidth: "none",
                    className: "tweet-popup theater-popup-wrap",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(getTheaterLoadingHTML())
                    .addTo(map);

                setPinnedPopup(theaterPopup);
                theaterPopup.on("close", () => {
                    setPinnedPopup(null);
                    clearTopicOutline();
                });



                try {
                    const [topicsRes, tweetsRes] = await Promise.all([
                        fetch(`${API}/topics`),
                        fetch(`${API}/topics/${topicId}`),
                    ]);
                    const topicsData = await topicsRes.json();
                    const tweetsData = await tweetsRes.json();

                    const topic = (topicsData.topics || []).find(t => t.TOPIC_ID === topicId) || {};
                    const tweets = (tweetsData.tweets || []).sort(
                        (a, b) => new Date(b.created_at) - new Date(a.created_at)
                    );

                    if (theaterPopup.isOpen()) {
                        theaterPopup.setHTML(getTheaterHTML(topic, tweets));
                    }
                } catch (err) {
                    console.error("Erreur fetch theater popup:", err);
                    if (theaterPopup.isOpen()) {
                        theaterPopup.setHTML(getTheaterErrorHTML());
                    }
                }
            });
            let conflictPopup = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true,
                maxWidth: "none",
                className: "conflict-popup",
                anchor: "bottom",
            });
            const isOverConflictArea = (point) => {
                return map.queryRenderedFeatures(point, { layers: ["conflict-areas-fill"] }).length > 0;
            };
            let isHoveringTweet = false;
            let isHoveringTopic = false;
            let pinnedPopup = null;
            // Keep ref in sync so useImperativeHandle can access it
            const setPinnedPopup = (p) => { pinnedPopup = p; pinnedPopupRef.current = p; };
            let isHoveringConflictArea = false
            let currentHoverPopup = null

            const getConflictHTML = (props) => {
                const baseColor = "255, 191, 0";
                const statusColor = `rgb(${baseColor})`;
                const statusBg = `rgba(${baseColor}, 0.15)`;
                const statusBorder = `rgba(${baseColor}, 0.3)`;
                const labelColor = `rgba(${baseColor}, 0.6)`;

                const today = new Date().toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric'
                });

                return `
                    <div style="white-space: nowrap; font-family:'Roboto Mono',monospace; font-size:13px; background:#0a0f1c; border-radius:8px; border:1px solid #2a2a3e; padding:12px 14px;">                    <div style="margin-bottom:8px;">
                        <span style="font-size:11px; color:${statusColor}; font-weight:bold; background:${statusBg}; padding:2px 8px; border-radius:4px; border:1px solid ${statusBorder}; letter-spacing:0.03em;">
                        ${props.name}
                        </span>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; display:flex; flex-direction:column; gap:5px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:10px; color:${labelColor}; text-transform:uppercase; letter-spacing:0.06em; ">Activities</span>
                        <span style="font-size:12px; color:#e0e0e0; font-weight:bold;">${props.count}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:10px; color:${labelColor}; text-transform:uppercase; letter-spacing:0.06em;">Date</span>
                        <span style="font-size:11px; color:#aaa;">${today}</span>
                        </div>
                    </div>
                    </div>
                `;
            };
            map.on("mousemove", "tweets-hover-area", (e) => {
                // Topics always win — bail out if the cursor is over a topic point
                if (map.queryRenderedFeatures(e.point, { layers: ["topics-locations-layer"] }).length) return;
                if (pinnedPopup) return;

                isHoveringTweet = true;
                isHoveringConflictArea = false;

                if (currentHoverPopup !== 'tweet') {
                    conflictPopup.remove();
                    popup.remove();
                    currentHoverPopup = 'tweet';
                }

                map.getCanvas().style.cursor = 'pointer';

                const features = map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                    .sort((a, b) => (b.properties.importance_score || 0) - (a.properties.importance_score || 0));

                if (!features.length) return;

                const props = features[0].properties;
                const images = (() => { try { return JSON.parse(props.images); } catch { return []; } })();
                const coords = features[0].geometry.coordinates.slice();

                popup
                    .setLngLat(coords)
                    .setHTML(createPopupHTML({ ...props, images }, false, 0, features.length, true, false))
                    .addTo(map);
            });

            map.on("mousemove", "conflict-areas-fill", (e) => {
                if (pinnedPopup || isHoveringTweet) return;
                isHoveringConflictArea = true;
                isHoveringTweet = false;

                if (currentHoverPopup !== 'conflict') {
                    popup.remove();
                    currentHoverPopup = 'conflict';
                }

                map.getCanvas().style.cursor = "pointer";

                const props = e.features[0].properties;

                conflictPopup
                    .setLngLat([e.lngLat.lng, e.lngLat.lat])
                    .setHTML(getConflictHTML(props))
                    .addTo(map);
            });

            map.on("mouseleave", "tweets-hover-area", () => {
                isHoveringTweet = false;
                map.getCanvas().style.cursor = '';

                setTimeout(() => {
                    if (!isHoveringConflictArea && !pinnedPopup) {
                        popup.remove();
                        if (currentHoverPopup === 'tweet') currentHoverPopup = null;
                    }
                }, 20);
            });

            map.on("mouseleave", "conflict-areas-fill", () => {
                isHoveringConflictArea = false;
                map.getCanvas().style.cursor = "";

                setTimeout(() => {
                    if (!isHoveringTweet && !pinnedPopup) {
                        conflictPopup.remove();
                        if (currentHoverPopup === 'conflict') currentHoverPopup = null;
                    }
                }, 20);
            });

            map.on("click", "tweets-hover-area", (e) => {
                // Topics always win — their click handler sets this flag synchronously
                if (topicClickConsumed) return;

                e.originalEvent.stopPropagation();

                const features = map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                    .sort((a, b) => (b.properties.importance_score || 0) - (a.properties.importance_score || 0));

                if (!features.length) return;

                if (pinnedPopup) { pinnedPopup.remove(); setPinnedPopup(null); }

                let currentIndex = 0;
                const coords = features[0].geometry.coordinates.slice();

                const renderPopup = (index) => {
                    const props = features[index].properties;
                    const images = (() => { try { return JSON.parse(props.images); } catch { return []; } })();
                    return createPopupHTML({ ...props, images }, true, index, features.length, true, false);
                };

                const newPinnedPopup = new maplibregl.Popup({
                    closeButton: true,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(renderPopup(currentIndex))
                    .addTo(map);

                setPinnedPopup(newPinnedPopup);
                newPinnedPopup.on("close", () => { setPinnedPopup(null); });

                window.navigateTweet = (index) => {
                    currentIndex = index;
                    pinnedPopup.setHTML(renderPopup(currentIndex));
                };
            });

            map.on("mouseenter", "chokepoints", (e) => {
                if (!e.features.length) return;
                map.getCanvas().style.cursor = "pointer";

                const props = e.features[0].properties;
                const coords = e.features[0].geometry.coordinates.slice();

                const baseColor =
                    props.status === "OPEN" ? "16, 185, 129" :
                        props.status === "CLOSED" ? "237, 63, 63" :
                            props.status === "RESTRICTED" ? "255, 166, 0 " :
                                "156, 156, 156";

                const statusColor = `rgb(${baseColor})`;
                const statusBg = `rgba(${baseColor}, 0.15)`;

                popup
                    .setLngLat(coords)
                    .setHTML(`
                        <div class="chokepoint-popup-inner" style="font-family: sans-serif; font-size: 13px; min-width: 80px; padding: 10px">
                            <div style="display: flex;   gap: 8px;">
                                <div style="font-weight: bold; font-size: 12px; color: #ccc">
                                    ${props.portname}
                                </div>
                                <div style="font-size: 10px">
                                    <span style="color: ${statusColor}; font-weight: bold; background: ${statusBg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${statusBg};">
                                        ${props.status ?? "Unknown"}
                                    </span>
                                </div>
                            </div>
                            ${props.reason ? `
                            <div style="color: #ccc; font-size: 11px; margin-top: 6px;">
                                ${props.reason}
                            </div>` : ""}
                        </div>
                    `)
                    .addTo(map);
            });

            map.on("mouseleave", "chokepoints", () => {
                map.getCanvas().style.cursor = "";
                if (!pinnedPopup) popup.remove();
            });

            let hoveredName = null;

            //PULSE
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
                const radius = baseRadius + (baseRadius * 6) * phase;
                map.setPaintProperty('pulse-high-importance_score', 'circle-stroke-opacity', 0);
                map.setPaintProperty('pulse-high-importance_score', 'circle-opacity', opacity * 1);
                map.setPaintProperty('pulse-high-importance_score', 'circle-radius', radius);
                animFrameRef.current = requestAnimationFrame(animatePulse);
            };
            animatePulse();
        });

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (!mapRef.current) return;
        const map = mapRef.current;

        const reload = async () => {
            try {
                const { start, end } = timeRange;

                const [newTweets, newMilActions] = await Promise.all([
                    fetch(`${API}/tweets.geojson?start_date=${start}&end_date=${end}`).then(r => r.json()),
                ]);

                const tweetSource = map.getSource("tweets");

                if (tweetSource) {
                    tweetSource.setData(newTweets);
                    setDataTweets(newTweets);
                    if (onTweetsLoaded) onTweetsLoaded(newTweets);
                }

            } catch (error) {
                console.error("Erreur reload :", error);
            }
        };

        reload();
    }, [timeRange.start, timeRange.end]);

    return (
        <div
            ref={containerRef}
            className="map-container"
        />
    );
});

export default MapView;