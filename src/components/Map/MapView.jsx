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

// Filtre côté client un FeatureCollection de tweets déjà chargé, selon une plage
const filterTweets = (collection, { start, end }, activeWeaponTypes, activeObjectiveTypes, activeLabel) => {
    if (!collection?.features) return { type: "FeatureCollection", features: [] };
    const startTs = new Date(start).getTime();
    const endTs = new Date(end).getTime();

    return {
        type: "FeatureCollection",
        features: collection.features.filter((f) => {
            // 1. Filtre Temporel
            const t = new Date(f.properties?.created_at).getTime();
            const matchesTime = t >= startTs && t <= endTs;
            if (!matchesTime) return false;

            // 2. Filtre par type d'arme (si des filtres sont actifs)
            if (activeWeaponTypes && activeWeaponTypes.length > 0) {
                const weapon = f.properties?.weapon_type;
                if (!activeWeaponTypes.includes(weapon)) return false;
            }

            // 2bis. Filtre par type d'objectif (si des filtres sont actifs)
            if (activeObjectiveTypes && activeObjectiveTypes.length > 0) {
                const objective = f.properties?.objective_type;
                if (!activeObjectiveTypes.includes(objective)) return false;
            }

            // 3. Filtre par Sujet / Label (Ancien comportement restauré)
            if (activeLabel) {
                // Adaptez la clé selon votre structure (f.properties?.topic, f.properties?.label, etc.)
                const label = f.properties?.topic || f.properties?.label;
                if (label !== activeLabel) return false;
            }

            return true;
        }),
    };
};

// Filtre un FeatureCollection complet et y attache les métadonnées utiles aux filtres
const buildEnrichedTweets = (allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel) => {
    // 1. Toutes les features de la période, sans aucun filtre arme/objectif/topic
    const timeOnlyFiltered = filterTweets(allCollection, timeRange, [], [], null);
    const totalOnPeriod = timeOnlyFiltered.features.length;

    // 2. Liste complète des labels pour la période (sans filtre armes/objectifs)
    const allLabels = [...new Set(
        timeOnlyFiltered.features
            .map(f => f.properties.label)
            .filter(Boolean)
    )].sort();

    // 3. Liste complète des types d'armes pour la période (sans filtre armes)
    const allWeaponTypes = [...new Set(
        timeOnlyFiltered.features
            .map(f => f.properties?.weapon_type)
            .filter(Boolean)
    )].sort();

    // 3bis. Liste complète des types d'objectifs pour la période (sans filtre objectifs)
    const allObjectiveTypes = [...new Set(
        timeOnlyFiltered.features
            .map(f => f.properties?.objective_type)
            .filter(Boolean)
    )].sort();

    // 4. Labels encore disponibles une fois les filtres armes/objectifs appliqués (sans le topic)
    const filteredByFiltersAndTime = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, null);
    const availableLabels = [...new Set(
        filteredByFiltersAndTime.features
            .map(f => f.properties.label)
            .filter(Boolean)
    )].sort();

    // 5. Le jeu de données réellement affiché (filtre armes + filtre objectifs + filtre topic)
    const filteredTweets = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel);

    filteredTweets.totalCountForTimeRange = totalOnPeriod;
    filteredTweets.allLabelsForTimeRange = allLabels;
    filteredTweets.availableLabelsForFilters = availableLabels;
    filteredTweets.availableWeaponTypesForTimeRange = allWeaponTypes;
    filteredTweets.availableObjectiveTypesForTimeRange = allObjectiveTypes;

    return filteredTweets;
};


/* ─── Theater popup helpers ─── */
const getTheaterFreshness = (isoDate) => {
    if (!isoDate) return "stale";
    const diffH = (Date.now() - new Date(isoDate).getTime()) / 36e5;
    if (diffH < 6) return "hot";
    if (diffH < 24) return "warm";
    if (diffH < 72) return "cool";
    return "stale";
};

const formatTheaterDate = (iso) =>
    new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const getTheaterLoadingHTML = () => `
    <div class="theater-popup-inner">
        <div class="theater-popup-header">
            <div class="theater-popup-header-top">
                <span class="theater-popup-title">Loading…</span>
                <button onclick="window.closePopup()" class="close-btn">
                    <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </div>
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
                    <p class="theater-popup-event-summary">${t.summary}</p>
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
                    <button onclick="window.closePopup()" class="close-btn">
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
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

const MapView = forwardRef(function MapView({ onTweetsLoaded, activeLabel, activeWeaponTypes, activeObjectiveTypes }, ref) {
    const { timeRange } = useTime();
    const containerRef = useRef(null);
    const timeRangeRef = useRef(timeRange);
    const activeLabelRef = useRef(activeLabel);
    const activeWeaponTypesRef = useRef(activeWeaponTypes);
    const activeObjectiveTypesRef = useRef(activeObjectiveTypes);
    useEffect(() => {
        activeWeaponTypesRef.current = activeWeaponTypes;
    }, [activeWeaponTypes]);
    useEffect(() => {
        activeObjectiveTypesRef.current = activeObjectiveTypes;
    }, [activeObjectiveTypes]);
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
                    closeButton: false,
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
    const allTweetsRef = useRef(null); // jeu complet des dernières 36h, filtré côté client
    const allMilitaryLinesRef = useRef(null); // idem pour les lignes militaires
    const onTweetsLoadedRef = useRef(onTweetsLoaded);
    const isFirstRender = useRef(true);
    const pinnedPopupRef = useRef(null);

    // ── Performance mode (désactive les pulses quand trop de tweets sont chargés) ──
    const [performanceMode, setPerformanceMode] = useState(false);
    const performanceModeRef = useRef(false);
    const militaryPulseFrameRef = useRef(null);
    const resumeAnimationsRef = useRef(null);
    const tweetCount = dataTweets?.features?.length || 0;
    const PERFORMANCE_MODE_THRESHOLD = 200;

    useEffect(() => { onTweetsLoadedRef.current = onTweetsLoaded; }, [onTweetsLoaded]);
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded() || !allTweetsRef.current) return;

        const filtered = filterTweets(allTweetsRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes);
        const tweetSource = map.getSource("tweets");
        if (tweetSource) {
            tweetSource.setData(filtered);
            setDataTweets(filtered);
            if (onTweetsLoaded) onTweetsLoaded(filtered); // Met à jour le SidePanel !
        }
    }, [activeWeaponTypes, activeObjectiveTypes, timeRange]);

    // Charge au lancement les dernières 36h (unique point d'entrée des tweets et military_lines désormais)
    const loadHistoryInBackground = (map) => {
        const end = new Date();
        const start = new Date(end);
        start.setHours(start.getHours() - 36);

        fetch(`${API}/tweets.geojson?start_date=${start.toISOString()}&end_date=${end.toISOString()}`)
            .then((r) => r.json())
            .then((allTweets) => {
                allTweetsRef.current = allTweets;
                const filtered = buildEnrichedTweets(
                    allTweets,
                    timeRangeRef.current,
                    activeWeaponTypesRef.current,
                    activeObjectiveTypesRef.current,
                    activeLabelRef.current
                );
                setDataTweets(filtered);
                if (onTweetsLoaded) onTweetsLoaded(filtered);
                if (onTweetsLoadedRef.current) onTweetsLoadedRef.current(filtered);

                const tweetSource = map.getSource("tweets");
                if (tweetSource) tweetSource.setData(filtered);
            })
            .catch((err) => console.error("Erreur chargement historique 36h :", err));

        fetch(`${API}/military_lines.geojson?start_date=${start.toISOString()}&end_date=${end.toISOString()}`)
            .then((r) => r.json())
            .then((allMilitaryLines) => {
                allMilitaryLinesRef.current = allMilitaryLines;
                const filtered = filterTweets(
                    allMilitaryLines,
                    timeRangeRef.current,
                    activeWeaponTypesRef.current,
                    activeObjectiveTypesRef.current,
                    activeLabelRef.current
                );
                const militaryLinesSource = map.getSource("military-lines");
                if (militaryLinesSource) militaryLinesSource.setData(filtered);
            })
            .catch((err) => console.error("Erreur chargement historique 36h (military_lines) :", err));
    };

    const loadAllData = async (map) => {
        try {
            // Chargement des autres GeoJSON statiques/environnementaux d'un seul coup
            const [dataShipping, dataChokepoints, dataBorders, dataBordersTheaters, dataMilitaryAreas, dataWorldAreas, dataTopicsLocations, dataTopicsAreas] =
                await Promise.all([
                    fetch(`${API}/shipping_lanes.geojson`).then(r => r.json()),
                    fetch(`${API}/chokepoints.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_borders.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_theaters.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_areas.geojson`).then(r => r.json()),
                    fetch(`${API}/world_areas.geojson`).then(r => r.json()),
                    fetch(`${API}/topics_location.geojson`).then(r => r.json()),
                    fetch(`${API}/topics_areas.geojson`).then(r => r.json()),
                ]);

            const emptyGeoJSON = { type: "FeatureCollection", features: [] };

            // Initialisation des sources tweets et military-lines à vide
            map.addSource("tweets", { type: "geojson", data: emptyGeoJSON });
            map.addSource("military-lines", { type: "geojson", data: emptyGeoJSON, lineMetrics: true });

            // Ajout des autres sources
            map.addSource("shipping-lanes", { type: "geojson", data: dataShipping });
            map.addSource("chokepoints", { type: "geojson", data: dataChokepoints });
            map.addSource("conflict-borders", { type: "geojson", data: dataBorders });
            map.addSource("conflict-theaters", { type: "geojson", data: dataBordersTheaters });
            map.addSource("conflict-areas", { type: "geojson", data: dataMilitaryAreas });
            map.addSource("world-areas", { type: "geojson", data: dataWorldAreas, generateId: true });
            map.addSource("topics-locations", { type: "geojson", data: dataTopicsLocations });
            map.addSource("topics-areas", { type: "geojson", data: dataTopicsAreas });

            // On lance immédiatement le chargement de l'historique complet (30 jours)
            loadHistoryInBackground(map);

            return emptyGeoJSON;
        } catch (err) {
            console.error("Erreur chargement données initiales :", err);
        }
    };

    useEffect(() => {
        if (mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: STYLE_URL,
            center: [40, 40],
            zoom: 2,
            projection: "globe",
        });

        mapRef.current = map;

        map.on("load", async () => {
            map.setProjection({ type: 'globe' });
            const dataTweets = await loadAllData(map);
            let popup = new maplibregl.Popup({
                closeButton: false,
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
                id: 'military-lines',
                type: 'line',
                source: 'military-lines',
                paint: {
                    'line-color': '#7d8288',
                    'line-width': 0.5
                }
            });

            // 3. Layer supplémentaire pour le pulse (par-dessus)
            map.addLayer({
                id: 'military-lines-pulse',
                type: 'line',
                source: 'military-lines',
                paint: {
                    'line-width': 2,
                    'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)']
                }
            });
            map.addLayer({
                id: 'world-areas-hover-outline',
                type: 'line',
                source: 'world-areas',
                paint: {
                    'line-color': '#a6afba',
                    'line-width': 2,
                    'line-opacity': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        0.55,
                        0,
                    ],
                }
            });
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
                    'fill-opacity': 0.3
                }
            });
            map.addLayer({
                id: 'conflict-areas-outline',
                type: 'line',
                source: 'conflict-areas',
                paint: {
                    'line-color': '#f7a816',
                    'line-width': 1,
                    'line-opacity': .5,
                    'line-dasharray': [4, 2]
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
                filter: ["in", ["get", "status"], ["literal", ["CLOSED", "RESTRICTED"]]],
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
                    "line-color": "#d9dee2",
                    "line-width": 1.5,
                    "line-opacity": 1,
                    "line-dasharray": [2, 2],
                },
            });
            //MOUSE BEHAVIOR
            let pinnedTopicId = null;
            const emptyTopicFilter = ['==', ['get', 'topic_id'], ''];

            const clearTopicOutline = () => {
                pinnedTopicId = null;
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
                map.setFilter("topics-areas-hover-outline", topicFilter);

                // Show loading popup immediately
                const theaterPopup = new maplibregl.Popup({
                    closeButton: false,
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
                    closeButton: false,
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
                                ${props.STATE_DURATION != null ? `
                            <div style="color: #ccc; font-size: 11px; margin-top: 6px;">
                                ${props.status.charAt(0).toUpperCase() + props.status.slice(1).toLowerCase()} for <span style="color: #fff">${props.STATE_DURATION} day${props.STATE_DURATION > 1 ? 's' : ''}.</span>
                            </div>` : ""}
                            </div>` : ""}
                        </div>
                    `)
                    .addTo(map);
            });

            map.on("mouseleave", "chokepoints", () => {
                map.getCanvas().style.cursor = "";
                if (!pinnedPopup) popup.remove();
            });

            let hoveredWorldAreaId = null;

            map.on('mousemove', 'world-areas', (e) => {
                if (!e.features.length) return;
                const id = e.features[0].id;
                if (hoveredWorldAreaId !== null && hoveredWorldAreaId !== id) {
                    map.setFeatureState({ source: 'world-areas', id: hoveredWorldAreaId }, { hover: false });
                }
                if (hoveredWorldAreaId !== id) {
                    hoveredWorldAreaId = id;
                    map.setFeatureState({ source: 'world-areas', id }, { hover: true });
                }
            });

            map.on('mouseleave', 'world-areas', () => {
                if (hoveredWorldAreaId !== null) {
                    map.setFeatureState({ source: 'world-areas', id: hoveredWorldAreaId }, { hover: false });
                    hoveredWorldAreaId = null;
                }
            });

            //PULSE
            // PULSE - Military Lines
            function pulseColor(dist, width) {
                const intensity = Math.exp(-Math.pow(dist / width, 2));
                return `rgba(255,255,255,${intensity.toFixed(3)})`;
            }

            function buildGradient(center, width, steps = 30) {
                const expr = ['interpolate', ['linear'], ['line-progress']];
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    expr.push(t, pulseColor(Math.abs(t - center), width));
                }
                return expr;
            }

            // === CONFIGURATION ===
            const pulseSpeed = 2800;
            const pauseBetweenPulses = 2500;

            const cycleDuration = pulseSpeed + pauseBetweenPulses;

            let start = null;

            function animate(ts) {
                if (performanceModeRef.current) {
                    // Mode performance actif : on arrête de planifier des frames.
                    militaryPulseFrameRef.current = null;
                    return;
                }
                if (!start) start = ts;

                const elapsed = (ts - start) % cycleDuration;
                let center = 0;

                if (elapsed < pulseSpeed) {
                    center = elapsed / pulseSpeed;
                }
                else {
                    center = 2;
                }

                map.setPaintProperty('military-lines-pulse', 'line-gradient', buildGradient(center, 0.02));

                militaryPulseFrameRef.current = requestAnimationFrame(animate);
            }

            militaryPulseFrameRef.current = requestAnimationFrame(animate);
            const animatePulse = () => {
                if (!mapRef.current) { animFrameRef.current = null; return; }
                if (performanceModeRef.current) { animFrameRef.current = null; return; }
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

            // Permet de relancer les deux boucles depuis le useEffect du mode performance
            resumeAnimationsRef.current = () => {
                if (!militaryPulseFrameRef.current) {
                    militaryPulseFrameRef.current = requestAnimationFrame(animate);
                }
                if (!animFrameRef.current) {
                    animFrameRef.current = requestAnimationFrame(animatePulse);
                }
            };
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
    // Active/désactive automatiquement le mode performance dès qu'on franchit le seuil
    // (dans un sens ou dans l'autre), sans écraser un toggle manuel tant que le seuil
    // n'est pas re-franchi.
    const wasAboveThresholdRef = useRef(false);
    useEffect(() => {
        const isAbove = tweetCount > PERFORMANCE_MODE_THRESHOLD;
        if (isAbove !== wasAboveThresholdRef.current) {
            setPerformanceMode(isAbove);
            wasAboveThresholdRef.current = isAbove;
        }
    }, [tweetCount]);

    // Applique/relâche le mode performance sur les deux couches de pulse
    useEffect(() => {
        performanceModeRef.current = performanceMode;
        const map = mapRef.current;
        if (!map || !map.getLayer('military-lines-pulse')) return;

        if (performanceMode) {
            // On fige les pulses (plus de calcul par frame, rendu statique/éteint)
            map.setPaintProperty('military-lines-pulse', 'line-gradient', [
                'interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)'
            ]);
            if (map.getLayer('pulse-high-importance_score')) {
                map.setPaintProperty('pulse-high-importance_score', 'circle-opacity', 0);
                map.setPaintProperty('pulse-high-importance_score', 'circle-stroke-opacity', 0);
            }
        } else {
            resumeAnimationsRef.current?.();
        }
    }, [performanceMode]);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (!mapRef.current) return;
        const map = mapRef.current;

        if (allTweetsRef.current) {
            const filteredTweets = buildEnrichedTweets(allTweetsRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel);

            const tweetSource = map.getSource("tweets");
            if (tweetSource) {
                tweetSource.setData(filteredTweets);
                setDataTweets(filteredTweets);
                if (onTweetsLoaded) onTweetsLoaded(filteredTweets);
            }

            // 7. Idem pour les lignes militaires (mêmes filtres armes/objectifs + période)
            if (allMilitaryLinesRef.current) {
                const filteredLines = filterTweets(allMilitaryLinesRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel);
                const militaryLinesSource = map.getSource("military-lines");
                if (militaryLinesSource) militaryLinesSource.setData(filteredLines);
            }
        }
    }, [timeRange.start, timeRange.end, activeWeaponTypes, activeObjectiveTypes, activeLabel]);

    // ── Téléchargement de la sélection actuelle (dataTweets) au format GeoJSON ──
    const handleDownloadGeoJSON = () => {
        if (!dataTweets?.features?.length) return;

        // On ne garde que les champs standards GeoJSON (on exclut les métadonnées
        // maison type totalCountForTimeRange, allLabelsForTimeRange, etc.)
        const exportData = {
            type: "FeatureCollection",
            features: dataTweets.features,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/geo+json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const startDate = new Date(timeRange.start).toISOString().slice(0, 10);
        const endDate = new Date(timeRange.end).toISOString().slice(0, 10);
        a.href = url;
        a.download = `osint_observer_export_${startDate}_${endDate}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={containerRef}
                className="map-container"
            />
            {tweetCount > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 14,
                        left: 14,
                        zIndex: 999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    {/* ── Bouton de téléchargement de la sélection en GeoJSON ── */}
                    <button
                        title="Export data"
                        onClick={handleDownloadGeoJSON}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            border: '1px solid #334155',
                            background: 'rgba(15,21,36,0.85)',
                            backdropFilter: 'blur(4px)',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#f71616';
                            e.currentTarget.style.color = '#f71616';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#334155';
                            e.currentTarget.style.color = '#94a3b8';
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>

                    <div
                            title={performanceMode}
                            onClick={() => setPerformanceMode(v => !v)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 10px',
                                borderRadius: 20,
                                border: `1px solid ${performanceMode ? '#f71616' : '#334155'}`,
                                background: 'rgba(15,21,36,1)',
                                backdropFilter: 'blur(4px)',
                                fontFamily: 'sans-serif',
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                color: performanceMode ? '#f71616' : '#94a3b8',
                                cursor: 'pointer',
                                userSelect: 'none',
                                transition: 'border-color 0.15s ease, color 0.15s ease',
                            }}
                        >
                            <span>Performance mode</span>
                            {/* ── Switch ── */}
                            <span
                                style={{
                                    position: 'relative',
                                    width: 32,
                                    height: 18,
                                    borderRadius: 999,
                                    flexShrink: 0,
                                    background: performanceMode ? '#f71616' : '#334155',
                                    transition: 'background 0.2s ease',
                                }}
                            >
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: 2,
                                        left: performanceMode ? 16 : 2,
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        background: '#f8fafc',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                        transition: 'left 0.2s ease',
                                    }}
                                />
                            </span>
                        </div>
                </div>
            )}
        </div>
    );
});

export default MapView;