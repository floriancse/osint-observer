/* eslint-disable */
import { useEffect, useRef, useState } from "react";
import "./MapView.css";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTime } from "../../context/TimeContext";
import { createPopupHTML } from "../../utils/popupUtils";
import { loadChokepointImages } from "../../utils/chokepointIcons";

const STYLE_URL = "https://api.maptiler.com/maps/dataviz-dark/style.json?key=MIeaKd18gACAhOFV3PZu";
const API = process.env.REACT_APP_API_URL;

export default function MapView({ onTweetsLoaded }) {
    const { timeRange } = useTime();
    const containerRef = useRef(null);
    const timeRangeRef = useRef(timeRange);
    const mapRef = useRef(null);
    const animFrameRef = useRef(null)
    const [dataTweets, setDataTweets] = useState(null);
    const onTweetsLoadedRef = useRef(onTweetsLoaded);

    useEffect(() => { onTweetsLoadedRef.current = onTweetsLoaded; }, [onTweetsLoaded]);

    useEffect(() => {
        timeRangeRef.current = timeRange;
    }, [timeRange]);

    const loadAllData = async (map) => {
        try {
            const { start, end } = timeRangeRef.current;
            const [dataTweets, dataShipping, dataChokepoints, dataBorders, dataBordersTheaters, dataMilitaryAreas] =
                await Promise.all([
                    fetch(`${API}/tweets.geojson?start_date=${start}&end_date=${end}`).then(r => r.json()),
                    fetch(`${API}/shipping_lanes.geojson`).then(r => r.json()),
                    fetch(`${API}/chokepoints.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_borders.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_theaters.geojson`).then(r => r.json()),
                    fetch(`${API}/conflict_areas.geojson`).then(r => r.json()),
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
                if (pinnedPopup) {
                    pinnedPopup.remove();
                    pinnedPopup = null;
                }
            };
            map.addLayer({
                id: 'conflict-theaters-fill',
                type: 'fill',
                source: 'conflict-theaters',
                paint: {
                    'fill-color': '#ed3f3f',
                    'fill-opacity': 0.2
                }
            });
            map.addLayer({
                id: 'conflict-areas-fill',
                type: 'fill',
                source: 'conflict-areas',
                paint: {
                    'fill-color': '#ffbf00',
                    'fill-opacity': 0.2
                }
            });
            map.addLayer({
                id: 'conflict-areas-outline',
                type: 'line',
                source: 'conflict-areas',
                paint: {
                    'line-color': '#be8e00',
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
                    'line-color': '#ed3f3f',
                    'line-width': 2,
                    'line-opacity': 1,
                }
            });
            map.addLayer({
                id: 'shipping-lanes', type: 'line', source: 'shipping-lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#5693b0', 'line-width': .75, 'line-opacity': .5, 'line-dasharray': [2, 2] },
            });
            map.addLayer({
                id: 'pulse-high-importance_score',
                type: 'circle',
                source: 'tweets',
                filter: ['all',
                    ['==', ['get', 'conflict_typology'], 'MIL'],
                    ['>=', ['coalesce', ['to-number', ['get', 'importance_score']], 0], 4],
                    ['match', ['get', 'weapon_type'],
                        ['Ballistic missile', 'Unidentified weapon', 'Bombing / airstrike', 'Drone', 'Mine'],
                        true, false
                    ],
                ],
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
                    "circle-stroke-color": "#ed3f3f",
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
                    "circle-stroke-color": "#ed3f3f",
                    "circle-stroke-width": 1.5,
                },
            });
            map.addLayer({
                id: 'tweets-hover-area', type: 'circle', source: 'tweets',
                paint: { 'circle-radius': 7, 'circle-opacity': 0 },
            });

            loadChokepointImages(map);
            map.addLayer({
                id: "chokepoints",
                type: "symbol",
                source: "chokepoints",
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

            //MOUSE BEHAVIOR
            const theaterPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                className: 'tweet-popup'
            });
            let isHoveringTweet = false;

            const threatPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                className: 'tweet-popup'
            });


            map.on('mousemove', 'conflict-theaters-outline', (e) => {
                if (isHoveringTweet) return;
                map.getCanvas().style.cursor = 'pointer';

                const props = e.features[0].properties;

                theaterPopup
                    .setLngLat(e.lngLat)
                    .setHTML(`
            <div class="theater-popup-inner">
                <div style="font-weight: bold; font-size: 12px; color: #ccc;">
                    ${props.theater_name}
                </div>
            </div>
        `)
                    .addTo(map);
            });

            map.on('mouseleave', 'conflict-theaters-outline', () => {
                map.getCanvas().style.cursor = '';
                theaterPopup.remove();
            });
            let pinnedPopup = null;

            map.on("mouseenter", "tweets-hover-area", (e) => {
                if (!e.features.length) return;
                if (pinnedPopup) return;
                map.getCanvas().style.cursor = 'pointer';
                isHoveringTweet = true;
                theaterPopup.remove();
                const features = map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                    .sort((a, b) => (b.properties.importance_score || 0) - (a.properties.importance_score || 0));
                const props = features[0].properties;
                const images = (() => { try { return JSON.parse(props.images); } catch { return []; } })();
                const coords = features[0].geometry.coordinates.slice();
                popup
                    .setLngLat(coords)
                    .setHTML(createPopupHTML({ ...props, images }, false, 0, features.length, true, false))
                    .addTo(map);
            });

            map.on("mouseleave", "tweets-hover-area", () => {
                isHoveringTweet = false;
                if (pinnedPopup) return;
                popup.remove();
                map.getCanvas().style.cursor = '';
            });

            map.on("click", "tweets-hover-area", (e) => {
                e.originalEvent.stopPropagation();

                const features = map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                    .sort((a, b) => (b.properties.importance_score || 0) - (a.properties.importance_score || 0));

                if (!features.length) return;

                if (pinnedPopup) { pinnedPopup.remove(); pinnedPopup = null; }

                let currentIndex = 0;
                const coords = features[0].geometry.coordinates.slice();

                const renderPopup = (index) => {
                    const props = features[index].properties;
                    const images = (() => { try { return JSON.parse(props.images); } catch { return []; } })();
                    return createPopupHTML({ ...props, images }, true, index, features.length, true, false);
                };

                pinnedPopup = new maplibregl.Popup({
                    closeButton: true,
                    closeOnClick: true,
                    maxWidth: "360px",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(renderPopup(currentIndex))
                    .addTo(map);

                pinnedPopup.on("close", () => { pinnedPopup = null; });

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
                    props.status === "OPEN" ? "16, 185, 129" :  // Équivalent RGB de #10b981
                        props.status === "CLOSED" ? "237, 63, 63" : // Équivalent RGB de #ed3f3f
                            props.status === "RESTRICTED" ? "255, 166, 0 " :
                                "156, 156, 156";                            // Équivalent RGB de #9c9c9c

                const statusColor = `rgb(${baseColor})`;        // Pour le texte (opaque)
                const statusBg = `rgba(${baseColor}, 0.15)`;     // Pour le fond (15% d'opacité)

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

            map.on("click", (e) => {
                const features = map.queryRenderedFeatures(e.point);
                const tweets = features.filter(f => f.layer.id === "tweets-hover-area");
            });

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
                const radius = baseRadius + (baseRadius * 4) * phase;
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
}