/* eslint-disable */
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import "./MapView.css";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTime } from "../../context/TimeContext";
import { createPopupHTML } from "../../utils/popupUtils";
import { loadChokepointImages } from "../../utils/chokepointIcons";
import { loadTopicImages } from "../../utils/topicIcons";
import { useBootstrap, useKeywords } from "../../context/BootstrapContext";
import { MdOutlineDraw, MdTrendingUp, MdClose } from "react-icons/md";
import { CgPerformance } from "react-icons/cg";
import { FaFilter } from "react-icons/fa";
import { FaRegPenToSquare } from "react-icons/fa6";

const MAPTILER_API_KEY = process.env.REACT_APP_MAPTILER_API_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/019e947a-cdc7-7112-be5f-b04019239e3c/style.json?key=${MAPTILER_API_KEY}`;
export { STYLE_URL };
const API = process.env.REACT_APP_API_URL;
// Calcule la bbox (min/max lng/lat) d'une feature rectangle tracée à la main
// (Polygon fermé à 5 points, cf. buildRectangleFeature) et indique si un point
// donné [lng, lat] tombe dedans. Retourne toujours true si aucun rectangle
// n'est actif (pas de filtre spatial appliqué).
const isPointInsideRectangle = (lng, lat, rectangleFeature) => {
    const ring = rectangleFeature?.geometry?.coordinates?.[0];
    if (!ring || ring.length < 4) return true;
    const lngs = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
};

// Calcule le niveau de zoom permettant d'afficher le globe (projection
// "globe" de MapLibre) entièrement dans un conteneur de taille donnée.
// Avec un tileSize de 512px, la circonférence du globe à l'écran vaut
// 512 * 2^zoom pixels ; son diamètre vaut donc (512 * 2^zoom) / π.
// On résout zoom pour que ce diamètre tienne dans la plus petite dimension
// du conteneur (avec une marge "factor" pour ne pas coller aux bords).
const getFitGlobeZoom = (width, height, factor = 0.92, tileSize = 512) => {
    const minDim = Math.min(width, height);
    if (!minDim || minDim <= 0) return 1.8; // fallback si le conteneur n'est pas encore mesurable
    return Math.log2((minDim * factor * Math.PI) / tileSize);
};

// Filtre côté client un FeatureCollection de tweets déjà chargé, selon une plage
const filterTweets = (collection, { start, end }, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle) => {
    if (!collection?.features) return { type: "FeatureCollection", features: [] };
    const startTs = new Date(start).getTime();
    const endTs = new Date(end).getTime();
    const normalizedSearch = (searchText || "").trim().toLowerCase();

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

            // 4. Filtre texte libre sur le contenu du tweet
            if (normalizedSearch) {
                const text = (f.properties?.text || "").toLowerCase();
                if (!text.includes(normalizedSearch)) return false;
            }

            // 5. Filtre spatial : ne garder que les features à l'intérieur du
            // rectangle tracé sur la carte (si un rectangle est actif).
            // - Point (tweets) : le point lui-même doit être dans le rectangle.
            // - LineString / MultiLineString (military-lines) : on garde la
            //   ligne uniquement si son POINT DE FIN (dernier sommet) tombe
            //   dans le rectangle — le point de départ n'est pas pris en compte.
            if (spatialRectangle) {
                const geom = f.geometry;
                if (geom?.type === "Point") {
                    const [lng, lat] = geom.coordinates;
                    if (!isPointInsideRectangle(lng, lat, spatialRectangle)) return false;
                } else if (geom?.type === "LineString") {
                    const coords = geom.coordinates;
                    const [lng, lat] = coords[coords.length - 1] || [];
                    if (lng === undefined || !isPointInsideRectangle(lng, lat, spatialRectangle)) return false;
                } else if (geom?.type === "MultiLineString") {
                    const lines = geom.coordinates;
                    const lastLine = lines[lines.length - 1] || [];
                    const [lng, lat] = lastLine[lastLine.length - 1] || [];
                    if (lng === undefined || !isPointInsideRectangle(lng, lat, spatialRectangle)) return false;
                }
            }

            return true;
        }),
    };
};

// Filtre un FeatureCollection complet et y attache les métadonnées utiles aux filtres
const buildEnrichedTweets = (allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle) => {
    // 1. Toutes les features de la période (et du rectangle si actif), sans
    // aucun filtre arme/objectif/topic/texte
    const timeOnlyFiltered = filterTweets(allCollection, timeRange, [], [], null, null, spatialRectangle);
    const totalOnPeriod = timeOnlyFiltered.features.length;

    // 2. Liste complète des labels pour la période (sans filtre armes/objectifs)
    const allLabels = [...new Set(
        timeOnlyFiltered.features
            .map(f => f.properties.label)
            .filter(Boolean)
    )].sort();

    // 3. Liste complète des types d'armes sur tout l'historique chargé (30j),
    //    indépendante de la période sélectionnée : les boutons de filtre
    //    restent affichés en permanence, même si aucun événement du type
    //    n'apparaît dans la fenêtre temporelle courante.
    const allWeaponTypes = [...new Set(
        (allCollection?.features || [])
            .map(f => f.properties?.weapon_type)
            .filter(Boolean)
    )].sort();

    // 3bis. Idem pour les types d'objectifs
    const allObjectiveTypes = [...new Set(
        (allCollection?.features || [])
            .map(f => f.properties?.objective_type)
            .filter(Boolean)
    )].sort();

    // 4. Labels encore disponibles une fois les filtres armes/objectifs/texte/rectangle appliqués (sans le topic)
    const filteredByFiltersAndTime = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, null, searchText, spatialRectangle);
    const availableLabels = [...new Set(
        filteredByFiltersAndTime.features
            .map(f => f.properties.label)
            .filter(Boolean)
    )].sort();

    // 5. Le jeu de données réellement affiché (filtre armes + filtre objectifs + filtre topic + filtre texte + filtre spatial)
    const filteredTweets = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle);

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

const MapView = forwardRef(function MapView({ onTweetsLoaded, activeLabel, activeWeaponTypes, activeObjectiveTypes, searchText, onSearchTextChange, searchBarLeftOffset = 5, filtersOpen = false, onToggleFilters, onRectangleDrawn, onLoadingChange }, ref) {
    const { timeRange } = useTime();

    // ── Debounce de la recherche texte ──
    // L'input affiche une valeur locale (mise à jour immédiatement, pour que
    // la saisie reste fluide), mais on ne remonte la valeur au parent
    // (onSearchTextChange -> searchText) qu'après 300ms sans frappe. Comme
    // searchText déclenche le filtrage de la carte (coûteux : rebuild des
    // features + setData sur les layers MapLibre) ET le fetch réseau du
    // chart (EventsChart), débouncer ici évite de refaire ce travail à
    // chaque caractère tapé.
    const [localSearchText, setLocalSearchText] = useState(searchText || "");
    useEffect(() => {
        // Garde l'input synchronisé si le parent change searchText de
        // l'extérieur (ex: reset programmatique ailleurs dans l'app).
        setLocalSearchText(searchText || "");
    }, [searchText]);
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (onSearchTextChange && localSearchText !== searchText) {
                onSearchTextChange(localSearchText);
            }
        }, 300);
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localSearchText]);
    const { data: bootstrapData, error: bootstrapError } = useBootstrap();

    // ── Suggestions "Trending" (façon Reddit) au-dessus de la search bar ──
    // useKeywords() renvoie désormais des paires {term, context} issues de
    // KW1/KW1_CTX .. KW5/KW5_CTX. On garde un fallback tolérant au cas où
    // le backend renverrait encore de simples strings (ancien format).
    const rawKeywords = useKeywords(); // [{term, context}, ...] ou ["kw1", ...] (legacy) ou []
    const trendingKeywords = (rawKeywords || [])
        .map((kw) => {
            if (kw && typeof kw === "object") {
                const term = kw.term ?? kw.kw ?? "";
                const context = kw.context ?? kw.ctx ?? "";
                return term ? { term, context } : null;
            }
            // legacy: simple string, pas de contexte disponible
            return kw ? { term: kw, context: "" } : null;
        })
        .filter(Boolean);
    const [showSuggestions, setShowSuggestions] = useState(false);
    // Les tendances restent affichées en permanence, indépendamment du texte
    // tapé dans l'input (pas de filtrage "façon autocomplete" ici).
    const filteredKeywords = trendingKeywords;

    const handleSelectKeyword = (kw) => {
        // Le filtrage/recherche se fait toujours sur le terme brut (kw.term),
        // jamais sur le libellé contextuel affiché.
        setLocalSearchText(kw.term);
        setShowSuggestions(false);
        // Remonte immédiatement au parent, sans attendre les 300ms de debounce
        if (onSearchTextChange) onSearchTextChange(kw.term);
    };

    const handleClearSearch = () => {
        setLocalSearchText("");
        if (onSearchTextChange) onSearchTextChange("");
    };

    // Ferme le dropdown "Trending" uniquement sur un clic en dehors du bloc
    // recherche (input + dropdown) — pas sur un simple onBlur de l'input,
    // qui se déclenchait à tort au survol d'un tweet sur la carte (popup
    // MapLibre volant le focus) et fermait le dropdown alors qu'on n'avait
    // rien cliqué.
    const searchContainerRef = useRef(null);
    useEffect(() => {
        if (!showSuggestions) return;
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showSuggestions]);

    // Le fetch de /bootstrap est déclenché une seule fois dans BootstrapProvider,
    // en amont dans l'arbre React. Il peut ne pas être terminé au moment où la
    // carte MapLibre émet son évènement "load" (créée dans un useEffect à part,
    // au tout premier rendu). On expose donc bootstrapData sous forme d'une
    // Promise qu'on peut "await" dans le handler "load" : elle se résout dès
    // que le contexte a fini de charger, immédiatement si c'est déjà le cas.
    const bootstrapReadyRef = useRef(null);
    if (!bootstrapReadyRef.current) {
        let resolveFn, rejectFn;
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });
        bootstrapReadyRef.current = { promise, resolve: resolveFn, reject: rejectFn, settled: false };
    }
    useEffect(() => {
        const ready = bootstrapReadyRef.current;
        if (ready.settled) return;
        if (bootstrapData) {
            ready.settled = true;
            ready.resolve(bootstrapData);
        } else if (bootstrapError) {
            ready.settled = true;
            ready.reject(bootstrapError);
        }
    }, [bootstrapData, bootstrapError]);

    const containerRef = useRef(null);
    const timeRangeRef = useRef(timeRange);
    const activeLabelRef = useRef(activeLabel);
    const activeWeaponTypesRef = useRef(activeWeaponTypes);
    const activeObjectiveTypesRef = useRef(activeObjectiveTypes);
    const searchTextRef = useRef(searchText);
    useEffect(() => {
        activeLabelRef.current = activeLabel;
    }, [activeLabel]);
    useEffect(() => {
        activeWeaponTypesRef.current = activeWeaponTypes;
    }, [activeWeaponTypes]);
    useEffect(() => {
        activeObjectiveTypesRef.current = activeObjectiveTypes;
    }, [activeObjectiveTypes]);
    useEffect(() => {
        searchTextRef.current = searchText;
    }, [searchText]);
    // timeRangeRef doit rester synchronisé comme les refs ci-dessus : sinon,
    // si /bootstrap répond APRÈS qu'EventsChart ait déjà sélectionné les 2
    // derniers buckets via setRange() (voir TimeContext), loadAllData
    // utiliserait encore la plage par défaut figée au montage au lieu de la
    // vraie sélection — la carte et le graphique afficheraient alors des
    // périodes différentes au premier chargement.
    useEffect(() => {
        timeRangeRef.current = timeRange;
    }, [timeRange]);
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
    const allTweetsRef = useRef(null); // jeu complet des 30 derniers jours, filtré côté client
    const allMilitaryLinesRef = useRef(null); // idem pour les lignes militaires
    const allTopicsAreasRef = useRef(null); // polygones topics_areas (bootstrap), pour calculer la bbox au clic SidePanel
    const topicsRef = useRef(null); // liste des topics "importants", fournie par /bootstrap
    const topicSummariesRef = useRef(null); // résumés par topic_id, fournis par /bootstrap
    const prevActiveLabelRef = useRef(activeLabel); // détecte un VRAI changement de topic sélectionné, pour ne pan la carte que dans ce cas
    const onTweetsLoadedRef = useRef(onTweetsLoaded);
    const onLoadingChangeRef = useRef(onLoadingChange);
    useEffect(() => { onLoadingChangeRef.current = onLoadingChange; }, [onLoadingChange]);
    const isFirstRender = useRef(true);
    const pinnedPopupRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [quadrilateralCoords, setQuadrilateralCoords] = useState([]);
    const [drawnQuadrilateral, setDrawnQuadrilateral] = useState(null);
    // ── Outil "rectangle" (bouton FaRegPenToSquare) : 1er clic = coin de départ, 2nd clic = coin final ──
    const isDrawModeRef = useRef(false); // reflète isDrawing dans les handlers maplibre (closures figées au "load")
    const rectPointRef = useRef({ start: null }); // coin de départ posé, en attente du second clic
    const onRectangleDrawnRef = useRef(onRectangleDrawn);
    useEffect(() => { onRectangleDrawnRef.current = onRectangleDrawn; }, [onRectangleDrawn]);
    // Efface le rectangle tracé (source maplibre + état + notification au parent),
    // utilisée à la fois par le bouton (nouveau tracé) et par la croix de suppression.
    const clearDrawnRectangle = () => {
        const source = mapRef.current?.getSource("draw-rectangle");
        if (source) source.setData({ type: "FeatureCollection", features: [] });
        setDrawnQuadrilateral(null);
        if (onRectangleDrawnRef.current) onRectangleDrawnRef.current(null);
    };
    // ── Performance mode (désactive les pulses quand trop de tweets sont chargés) ──
    const [performanceMode, setPerformanceMode] = useState(false);
    const performanceModeRef = useRef(false);
    const militaryPulseFrameRef = useRef(null);
    const resumeAnimationsRef = useRef(null);
    const tweetCount = dataTweets?.features?.length || 0;
    const PERFORMANCE_MODE_THRESHOLD = 150;

    useEffect(() => { onTweetsLoadedRef.current = onTweetsLoaded; }, [onTweetsLoaded]);

    // Active/désactive le mode "tracer un rectangle" : curseur en croix, et
    // nettoyage de la prévisualisation si le mode est quitté avant le second
    // clic (annulation en cours de tracé). Ne touche jamais aux closures
    // figées des handlers maplibre (qui relisent isDrawModeRef à chaque événement).
    useEffect(() => {
        isDrawModeRef.current = isDrawing;
        const map = mapRef.current;
        if (!map) return;
        map.getCanvas().style.cursor = isDrawing ? "crosshair" : "";
        if (!isDrawing && rectPointRef.current.start) {
            // Tracé annulé avant le second clic : on efface la prévisualisation en cours
            rectPointRef.current.start = null;
            const source = map.getSource("draw-rectangle");
            if (source) source.setData({ type: "FeatureCollection", features: [] });
        }
    }, [isDrawing]);
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded() || !allTweetsRef.current) return;

        const filtered = filterTweets(allTweetsRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, undefined, searchText, drawnQuadrilateral);
        const tweetSource = map.getSource("tweets");
        if (tweetSource) {
            tweetSource.setData(filtered);
            setDataTweets(filtered);
            if (onTweetsLoaded) onTweetsLoaded(filtered); // Met à jour le SidePanel !
        }
    }, [activeWeaponTypes, activeObjectiveTypes, searchText, timeRange, drawnQuadrilateral]);

    // Initialise les sources "statiques" de la carte à partir des données déjà
    // chargées par BootstrapProvider (aucun fetch ici : on attend juste que
    // le contexte ait fini son unique requête /bootstrap, via la Promise
    // exposée par bootstrapReadyRef). tweets et military_lines viennent tous
    // les deux directement du bootstrap (30 jours), sans requête HTTP
    // supplémentaire.
    const loadAllData = async (map) => {
        try {
            const bootstrap = await bootstrapReadyRef.current.promise;

            const {
                shipping_lanes: dataShipping,
                chokepoints: dataChokepoints,
                conflict_borders: dataBorders,
                conflict_theaters: dataBordersTheaters,
                world_areas: dataWorldAreas,
                topics_location: dataTopicsLocations,
                topics_areas: dataTopicsAreas,
                military_lines: dataMilitaryLines,
                tweets: dataTweetsBootstrap,
                topics: dataTopics,
                topic_summaries: dataTopicSummaries
            } = bootstrap;

            const emptyGeoJSON = { type: "FeatureCollection", features: [] };

            // Liste des topics "importants", fournie par /bootstrap : évite un
            // fetch séparé sur /topics à chaque clic sur un theater (voir le
            // handler de clic "topics-areas-fill" plus bas).
            topicsRef.current = dataTopics ?? [];

            // Résumés par topic_id (15 max chacun), fournis par /bootstrap :
            // évite un fetch séparé sur /topics/{topic_id} à chaque clic.
            topicSummariesRef.current = dataTopicSummaries ?? {};

            // Cache complet (30 jours) pour re-filtrage client sur timeRange/armes/objectifs/label
            allMilitaryLinesRef.current = dataMilitaryLines ?? emptyGeoJSON;
            const filteredMilitaryLines = filterTweets(
                allMilitaryLinesRef.current,
                timeRangeRef.current,
                activeWeaponTypesRef.current,
                activeObjectiveTypesRef.current,
                activeLabelRef.current,
                searchTextRef.current
            );

            // Cache complet (30 jours) des tweets, désormais fourni directement
            // par /bootstrap (plus de fetch séparé vers /tweets.geojson).
            allTweetsRef.current = dataTweetsBootstrap ?? emptyGeoJSON;
            window.__debugTweets = allTweetsRef.current;
            const filteredTweets = buildEnrichedTweets(
                allTweetsRef.current,
                timeRangeRef.current,
                activeWeaponTypesRef.current,
                activeObjectiveTypesRef.current,
                activeLabelRef.current,
                searchTextRef.current
            );
            setDataTweets(filteredTweets);
            if (onTweetsLoaded) onTweetsLoaded(filteredTweets);
            if (onTweetsLoadedRef.current) onTweetsLoadedRef.current(filteredTweets);

            // tweets et military-lines sont alimentées immédiatement avec les
            // données du bootstrap (plus besoin d'attendre un fetch séparé).
            map.addSource("tweets", { type: "geojson", data: filteredTweets });
            map.addSource("military-lines", { type: "geojson", data: filteredMilitaryLines, lineMetrics: true });

            // Ajout des autres sources
            map.addSource("shipping-lanes", { type: "geojson", data: dataShipping });
            map.addSource("chokepoints", { type: "geojson", data: dataChokepoints });
            map.addSource("conflict-borders", { type: "geojson", data: dataBorders });
            map.addSource("conflict-theaters", { type: "geojson", data: dataBordersTheaters });
            map.addSource("world-areas", { type: "geojson", data: dataWorldAreas, generateId: true });
            map.addSource("topics-locations", { type: "geojson", data: dataTopicsLocations });
            map.addSource("topics-areas", { type: "geojson", data: dataTopicsAreas });

            // Cache des polygones topics_areas, pour calculer la bbox du topic
            // sélectionné (SidePanel) sans dépendre de querySourceFeatures
            // (qui ne renvoie que les features des tuiles déjà rendues).
            allTopicsAreasRef.current = dataTopicsAreas ?? emptyGeoJSON;

            return filteredTweets;
        } catch (err) {
            console.error("Erreur chargement données initiales (bootstrap) :", err);
            return { type: "FeatureCollection", features: [] };
        } finally {
            if (onLoadingChangeRef.current) onLoadingChangeRef.current(false);
        }
    };

    useEffect(() => {
        if (mapRef.current) return;

        // Zoom initial calculé à partir de la taille réelle du conteneur au
        // moment du montage, pour que le globe soit entièrement visible dès
        // le premier chargement, quelle que soit la taille de la fenêtre.
        const { width, height } = containerRef.current.getBoundingClientRect();
        const initialZoom = getFitGlobeZoom(width, height);

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: STYLE_URL,
            center: [37, 37],
            zoom: initialZoom,
            projection: "globe",
        });

        mapRef.current = map;

        // Tant que la page est encore sur l'écran de chargement (le globe
        // "flotte" sans que l'utilisateur ait interagi), on recale le zoom
        // à chaque redimensionnement de fenêtre pour garder le globe entier
        // visible (ex: fenêtre redimensionnée juste après le rechargement).
        let userInteracted = false;
        const markInteracted = () => { userInteracted = true; };
        map.on("dragstart", markInteracted);
        map.on("zoomstart", (e) => {
            // Ignore les zooms déclenchés par notre propre resize (pas d'event
            // "originalEvent" venant de l'utilisateur dans ce cas).
            if (e.originalEvent) markInteracted();
        });

        const handleResize = () => {
            if (userInteracted || !mapRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mapRef.current.setZoom(getFitGlobeZoom(rect.width, rect.height));
        };
        window.addEventListener("resize", handleResize);
        map.once("remove", () => window.removeEventListener("resize", handleResize));

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
                    'fill-color': '#ED0C0C',
                    'fill-opacity': 0.2
                }
            });

            map.addLayer({
                id: 'conflict-borders',
                type: 'line',
                source: 'conflict-borders',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ED0C0C',
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
                    'circle-color': ['match', ['get', 'conflict_typology'], 'MIL', '#ED0C0C', 'rgb(129, 183, 249)'],
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
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 5, 10],
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
                    "circle-stroke-color": "#ED0C0C",
                    "circle-stroke-width": ["interpolate", ["linear"],
                        ["coalesce", ["to-number", ["get", "importance_score"]], 1],
                        1, 2, 3, 5, 5, 10,
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
                        1, 1, 3, 2, 5, 5,
                    ],
                    "circle-color": "#ffffff",
                    "circle-stroke-color": "#ED0C0C",
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
            // Couche dédiée au topic sélectionné dans le SidePanel : totalement
            // indépendante du survol souris, ne disparaît que si activeLabel change.
            map.addLayer({
                id: "topics-areas-selected-outline",
                type: "line",
                source: "topics-areas",
                filter: ['==', ['get', 'label'], ''],
                paint: {
                    "line-color": "#d9dee2",
                    "line-width": 1.5,
                    "line-opacity": 1,
                    "line-dasharray": [2, 2],
                },
            });
            // ── Outil "rectangle" : source + couches du rectangle bleu tracé à la volée ──
            map.addSource("draw-rectangle", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer({
                id: "draw-rectangle-fill",
                type: "fill",
                source: "draw-rectangle",
                paint: { "fill-color": "#2f6fed", "fill-opacity": 0.15 },
            });
            map.addLayer({
                id: "draw-rectangle-outline",
                type: "line",
                source: "draw-rectangle",
                paint: { "line-color": "#2f6fed", "line-width": 2 },
            });

            const buildRectangleFeature = (start, end) => {
                const [lng1, lat1] = start;
                const [lng2, lat2] = end;
                const minLng = Math.min(lng1, lng2), maxLng = Math.max(lng1, lng2);
                const minLat = Math.min(lat1, lat2), maxLat = Math.max(lat1, lat2);
                return {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [minLng, minLat],
                            [maxLng, minLat],
                            [maxLng, maxLat],
                            [minLng, maxLat],
                            [minLng, minLat],
                        ]],
                    },
                };
            };

            const updateRectangleSource = (feature) => {
                const source = map.getSource("draw-rectangle");
                if (source) source.setData({ type: "FeatureCollection", features: feature ? [feature] : [] });
            };

            map.on("click", (e) => {
                if (!isDrawModeRef.current) return;
                if (!rectPointRef.current.start) {
                    // 1er clic : on pose le coin de départ et on prévisualise au fil de la souris
                    rectPointRef.current.start = [e.lngLat.lng, e.lngLat.lat];
                    return;
                }
                // 2nd clic : on pose le coin final et on termine le tracé
                const feature = buildRectangleFeature(rectPointRef.current.start, [e.lngLat.lng, e.lngLat.lat]);
                updateRectangleSource(feature);
                rectPointRef.current.start = null;
                setDrawnQuadrilateral(feature);
                if (onRectangleDrawnRef.current) onRectangleDrawnRef.current(feature);
                // Le tracé est terminé : on ressort automatiquement du mode dessin.
                setIsDrawing(false);
            });

            map.on("mousemove", (e) => {
                if (!isDrawModeRef.current || !rectPointRef.current.start) return;
                const feature = buildRectangleFeature(rectPointRef.current.start, [e.lngLat.lng, e.lngLat.lat]);
                updateRectangleSource(feature);
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
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "pointer";
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
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                isHoveringTopic = false;
                // Ne garde le contour de hover que si un topic est épinglé (clic).
                // La sélection du SidePanel vit désormais sur sa propre couche
                // (topics-areas-selected-outline) et n'est jamais affectée ici.
                if (!pinnedTopicId) {
                    map.setFilter("topics-areas-hover-outline", emptyTopicFilter);
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
                    // Topics et résumés viennent désormais tous les deux de
                    // /bootstrap (topicsRef / topicSummariesRef, chargés une
                    // seule fois au montage) : plus aucun fetch réseau ici.
                    const topic = (topicsRef.current || []).find(t => t.TOPIC_ID === topicId) || {};
                    const tweets = (topicSummariesRef.current?.[topicId] || []).slice().sort(
                        (a, b) => new Date(b.created_at) - new Date(a.created_at)
                    );

                    if (theaterPopup.isOpen()) {
                        theaterPopup.setHTML(getTheaterHTML(topic, tweets));
                    }
                } catch (err) {
                    console.error("Erreur affichage theater popup:", err);
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
                    <div style="white-space: nowrap; font-family:'Roboto Mono',monospace; font-size:11px; background:#0a0f1c; border-radius:8px; border:1px solid #2a2a3e; padding:12px 14px;">                    <div style="margin-bottom:8px;">
                        <span style="font-size:11px; color:${statusColor}; font-weight:bold; background:${statusBg}; padding:2px 8px; border-radius:4px; border:1px solid ${statusBorder}; letter-spacing:0.03em;">
                        ${props.name}
                        </span>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; display:flex; flex-direction:column; gap:5px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:9px; color:${labelColor}; letter-spacing:0.06em; ">Activities</span>
                        <span style="font-size:10px; color:#e0e0e0; font-weight:bold;">${props.count}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:9px; color:${labelColor};letter-spacing:0.06em;">Date</span>
                        <span style="font-size:10px; color:#aaa;">${today}</span>
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

                if (!isDrawModeRef.current) map.getCanvas().style.cursor = 'pointer';

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

            map.on("mouseleave", "tweets-hover-area", () => {
                isHoveringTweet = false;
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = '';

                setTimeout(() => {
                    if (!isHoveringConflictArea && !pinnedPopup) {
                        popup.remove();
                        if (currentHoverPopup === 'tweet') currentHoverPopup = null;
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
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "pointer";

                const props = e.features[0].properties;
                const coords = e.features[0].geometry.coordinates.slice();

                const baseColor =
                    props.status === "OPEN" ? "16, 185, 129" :
                        props.status === "CLOSED" ? "237, 12, 12" :
                            props.status === "RESTRICTED" ? "255, 166, 0 " :
                                "156, 156, 156";

                const statusColor = `rgb(${baseColor})`;
                const statusBg = `rgba(${baseColor}, 0.15)`;

                popup
                    .setLngLat(coords)
                    .setHTML(`
                        <div class="chokepoint-popup-inner" style="font-family: sans-serif; font-size: 12px; min-width: 80px; padding: 10px">
                            <div style="display: flex;   gap: 8px;">
                                <div style="font-weight: bold; font-size: 11px; color: #ccc">
                                    ${props.portname}
                                </div>
                                <div style="font-size: 10px">
                                    <span style="color: ${statusColor}; font-weight: bold; background: ${statusBg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${statusBg};">
                                        ${props.status ?? "Unknown"}
                                    </span>
                                </div>
                            </div>
                            ${props.reason ? `
                            <div style="color: #ccc; font-size: 10px; margin-top: 6px;">
                                ${props.reason}
                                ${props.STATE_DURATION != null ? `
                            <div style="color: #ccc; font-size: 10px; margin-top: 6px;">
                                ${props.status.charAt(0) + props.status.slice(1).toLowerCase()} for <span style="color: #fff">${props.STATE_DURATION} day${props.STATE_DURATION > 1 ? 's' : ''}.</span>
                            </div>` : ""}
                            </div>` : ""}
                        </div>
                    `)
                    .addTo(map);
            });

            map.on("mouseleave", "chokepoints", () => {
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                if (!pinnedPopup) popup.remove();
            });

            let hoveredWorldAreaId = null;

            // map.on('mousemove', 'world-areas', (e) => {
            //     if (!e.features.length) return;
            //     const id = e.features[0].id;
            //     if (hoveredWorldAreaId !== null && hoveredWorldAreaId !== id) {
            //         map.setFeatureState({ source: 'world-areas', id: hoveredWorldAreaId }, { hover: false });
            //     }
            //     if (hoveredWorldAreaId !== id) {
            //         hoveredWorldAreaId = id;
            //         map.setFeatureState({ source: 'world-areas', id }, { hover: true });
            //     }
            // });

            // map.on('mouseleave', 'world-areas', () => {
            //     if (hoveredWorldAreaId !== null) {
            //         map.setFeatureState({ source: 'world-areas', id: hoveredWorldAreaId }, { hover: false });
            //         hoveredWorldAreaId = null;
            //     }
            // });

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
                const radius = baseRadius + (baseRadius * 4) * phase;
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
            const filteredTweets = buildEnrichedTweets(allTweetsRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral);

            const tweetSource = map.getSource("tweets");
            if (tweetSource) {
                tweetSource.setData(filteredTweets);
                setDataTweets(filteredTweets);
                if (onTweetsLoaded) onTweetsLoaded(filteredTweets);
            }

            // 7. Idem pour les lignes militaires (mêmes filtres armes/objectifs + période)
            if (allMilitaryLinesRef.current) {
                const filteredLines = filterTweets(allMilitaryLinesRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral);
                const militaryLinesSource = map.getSource("military-lines");
                if (militaryLinesSource) militaryLinesSource.setData(filteredLines);
            }
        }

        // 8. Affiche/masque le contour de la topic area sur la carte en fonction
        // du topic sélectionné dans le SidePanel. Couche dédiée, indépendante
        // du survol souris (topics-areas-hover-outline) : elle ne change que
        // lorsque activeLabel change, jamais au survol d'un autre topic.
        if (map.getLayer("topics-areas-selected-outline")) {
            const topicFilter = activeLabel
                ? ['==', ['get', 'label'], activeLabel]
                : ['==', ['get', 'label'], ''];
            map.setFilter("topics-areas-selected-outline", topicFilter);
        }

        // 9. Masque les points topics-locations des autres topics quand un
        // topic est sélectionné dans le SidePanel ; les réaffiche tous sinon.
        if (map.getLayer("topics-locations-layer")) {
            const locationsFilter = activeLabel
                ? ['==', ['get', 'label'], activeLabel]
                : null;
            map.setFilter("topics-locations-layer", locationsFilter);
        }

        prevActiveLabelRef.current = activeLabel;
    }, [timeRange.start, timeRange.end, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral]);

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
            {/* Conteneur principal de la carte */}
            <div ref={containerRef} className="map-container" />

            {/* Barre de recherche (si applicable) */}
            {onSearchTextChange && (
                <div
                    ref={searchContainerRef}
                    style={{
                        position: 'absolute',
                        top: 5,
                        left: searchBarLeftOffset,
                        width: 320,
                        zIndex: 999,
                    }}
                >
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input
                            type="text"
                            className="map-search-input"
                            value={localSearchText}
                            onChange={(e) => setLocalSearchText(e.target.value)}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="Search OSINT Observer"
                            style={{
                                height: 30,
                                borderRadius: 15,
                                border: '1px solid rgb(38, 48, 61)',
                                background: 'rgba(15,21,36,1)',
                                backdropFilter: 'blur(4px)',
                                color: '#e1e1e1',
                                fontFamily: 'sans-serif',
                                fontSize: '.7rem',
                                padding: localSearchText ? '0 28px 0 12px' : '0 12px',
                                width: "100%",
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                        {localSearchText && (
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleClearSearch();
                                }}
                                aria-label="Effacer la recherche"
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    right: 8,
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 18,
                                    height: 18,
                                    padding: 0,
                                    border: 'none',
                                    borderRadius: '50%',
                                    background: 'transparent',
                                    color: '#8b949e',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(139,148,158,0.15)';
                                    e.currentTarget.style.color = '#e2e8f0';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#8b949e';
                                }}
                            >
                                <MdClose size={14} />
                            </button>
                        )}
                    </div>

                    {showSuggestions && filteredKeywords.length > 0 && (
                        <div
                            style={{
                                marginTop: 4,
                                borderRadius: 10,
                                border: '1px solid rgb(38, 48, 61)',
                                background: 'rgba(15,21,36,0.97)',
                                backdropFilter: 'blur(4px)',
                                overflow: 'hidden',
                                boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                            }}
                        >
                            <div
                                style={{
                                    padding: '8px 12px 4px',
                                    fontSize: '.6rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    color: '#4f9dff',
                                    fontFamily: 'sans-serif',
                                }}
                            >
                                TRENDING LAST 3 DAYS
                            </div>
                            {filteredKeywords.map((kw, i) => (
                                <div
                                    key={`${kw.term}-${i}`}
                                    onMouseDown={() => handleSelectKeyword(kw)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '7px 12px',
                                        cursor: 'pointer',
                                        color: '#e2e8f0',
                                        fontFamily: 'sans-serif',
                                        fontSize: '.6rem',

                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1b2436')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <MdTrendingUp size={14} color="#4f9dff" />
                                    {/* On affiche le libellé contextuel (autonome et lisible),
                                        avec repli sur le terme brut si le contexte est vide.
                                        Si un contexte est affiché, on ajoute le mot-clé brut à la suite,
                                        en gris discret, pour référence. */}
                                    {kw.context && kw.context.trim() ? (
                                        <span>
                                            {kw.context}
                                            <span style={{ color: '#6b7280', marginLeft: 6 }}>
                                                {kw.term}
                                            </span>
                                        </span>
                                    ) : (
                                        <span>{kw.term}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 🔹 Barre d'outils en bas à gauche : Bouton de dessin + Export + Performance */}
            {tweetCount > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 5,
                        left: 5,
                        zIndex: 999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    {/* 1. Tracer un rectangle bleu sur la carte */}
                    <div style={{ position: 'relative' }}>
                        <button
                            title={isDrawing ? "Cancel rectangle" : "Draw area"}
                            onClick={() => {
                                const turningOn = !isDrawing;
                                if (turningOn && drawnQuadrilateral) {
                                    // On active un nouveau tracé : le rectangle précédent est supprimé
                                    // immédiatement, sans attendre le premier clic du nouveau tracé.
                                    clearDrawnRectangle();
                                }
                                setIsDrawing(turningOn);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 30,
                                height: 30,
                                borderRadius: '15px',
                                border: `1px solid ${isDrawing ? '#4f9dff' : 'rgb(38, 48, 61)'}`,
                                background: 'rgba(15,21,36,1)',
                                backdropFilter: 'blur(4px)',
                                color: isDrawing ? '#4f9dff' : 'rgb(139, 148, 158)',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#4f9dff';
                                e.currentTarget.style.color = '#4f9dff';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = isDrawing ? '#4f9dff' : 'rgb(38, 48, 61)';
                                e.currentTarget.style.color = isDrawing ? '#4f9dff' : 'rgb(139, 148, 158)';
                            }}
                        >
                            <FaRegPenToSquare size={13} />
                        </button>

                        {/* Croix de suppression : visible uniquement si un rectangle est tracé */}
                        {drawnQuadrilateral && (
                            <button
                                title="Delete rectangle"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearDrawnRectangle();
                                }}
                                style={{
                                    position: 'absolute',
                                    top: -2,
                                    right: -2,
                                    width: 12,
                                    height: 12,
                                    padding: 0,
                                    borderRadius: '50%',
                                    border: '1px solid rgb(36, 30, 15)',
                                    background: '#ED0C0C',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    lineHeight: 0,
                                }}
                            >
                                <MdClose size={10} />
                            </button>
                        )}
                    </div>

                    {/* 2. Toggle du panneau de filtres (armes / objectifs) */}
                    <button
                        title={filtersOpen ? "Hide filters" : "Filter data"}
                        onClick={() => onToggleFilters && onToggleFilters()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            borderRadius: '15px',
                            border: `1px solid ${filtersOpen ? '#4f9dff' : 'rgb(38, 48, 61)'}`,
                            background: 'rgba(15,21,36,1)',
                            backdropFilter: 'blur(4px)',
                            color: filtersOpen ? '#4f9dff' : 'rgb(139, 148, 158)',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#4f9dff';
                            e.currentTarget.style.color = '#4f9dff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = filtersOpen ? '#4f9dff' : 'rgb(38, 48, 61)';
                            e.currentTarget.style.color = filtersOpen ? '#4f9dff' : 'rgb(139, 148, 158)';
                        }}
                    >
                        <FaFilter size={13} style={{ position: 'relative', left: -0.5, top: 1 }} />
                    </button>

                    {/* 3. Bouton d'export GeoJSON */}
                    <button
                        title="Export data"
                        onClick={handleDownloadGeoJSON}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            borderRadius: '15px',
                            border: '1px solid rgb(38, 48, 61)',
                            background: 'rgba(15,21,36,1)',
                            backdropFilter: 'blur(4px)',
                            color: 'rgb(139, 148, 158)',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#4f9dff';
                            e.currentTarget.style.color = '#4f9dff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgb(38, 48, 61)';
                            e.currentTarget.style.color = 'rgb(139, 148, 158)';
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>

                    {/* 4. Toggle Performance Mode */}
                    <div
                        title={performanceMode ? "Disable performance mode" : "Enable performance mode"}
                        onClick={() => setPerformanceMode(v => !v)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 29,
                            height: 29,
                            borderRadius: '15px',
                            border: `1px solid ${isDrawing
                                    ? '#e1e1e1'
                                    : performanceMode
                                        ? '#4f9dff'
                                        : 'rgb(38, 48, 61)'
                                }`,
                            background: 'rgba(15,21,36,1)',
                            backdropFilter: 'blur(4px)',
                            cursor: 'pointer',
                            userSelect: 'none',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#4f9dff';
                            e.currentTarget.style.color = '#4f9dff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = performanceMode ? '#4f9dff' : 'rgb(38, 48, 61)';
                            e.currentTarget.style.color = performanceMode ? '#4f9dff' : 'rgb(139, 148, 158)';
                        }}
                    >
                        <CgPerformance
                            size={16}
                            color={performanceMode ? '#4f9dff' : 'rgb(139, 148, 158)'}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapView;