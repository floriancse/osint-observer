/* eslint-disable */
import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useMemo } from "react";
import "./MapView.css";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { useTime } from "../../context/TimeContext";
import { useLang } from "../../context/LangContext";
import { createPopupHTML, createPopupListHTML, sortFeaturesByDateDesc } from "../../utils/popupUtils";
import { filterTweets, buildEnrichedTweets, getSearchableText } from "../../utils/tweetFilters";
import { getCurrentLang, translateChokepointStatus, translateChokepoint, chokepointDurationHTML, DATE_LOCALES } from "../../utils/typeLabels";
import { loadChokepointImages } from "../../utils/chokepointIcons";
import { useBootstrap, useKeywords } from "../../context/BootstrapContext";
import { MdOutlineDraw, MdSearch, MdTrendingUp, MdClose, MdSatelliteAlt, MdOutlineMap, MdOutlineFlag } from "react-icons/md";
import { PiBookOpenTextBold } from "react-icons/pi";
import { CgPerformance } from "react-icons/cg";
import { FaFilter } from "react-icons/fa";
import TheatersDrawer from "./TheatersDrawer";
import MapSpinner, { SHOW_MAP_SPINNER } from "./MapSpinner";
import { getInitialTheaterSlug } from "../../utils/theaterRoute";
import { buildSearch } from "../../utils/urlState";

const MAPTILER_API_KEY = process.env.REACT_APP_MAPTILER_API_KEY;
maptilersdk.config.apiKey = MAPTILER_API_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/019e947a-cdc7-7112-be5f-b04019239e3c/style.json?key=${MAPTILER_API_KEY}`;
export { STYLE_URL };
const SATELLITE_STYLE_URL = `https://api.maptiler.com/maps/satellite-v4/style.json?key=${MAPTILER_API_KEY}`;
const API = process.env.REACT_APP_API_URL;

// Affichage des zones de conflit (hachures rouges). Mettre à true pour les réactiver.
const SHOW_CONFLICT_ZONES = false;
const CZ_VISIBILITY = SHOW_CONFLICT_ZONES ? "visible" : "none";

// ── Changement de fond de carte ──────────────────────────────────────────────
// map.setStyle() remplace tout le style : les sources/couches ajoutées à la main
// (tweets, zones, détroits, rectangle...) disparaîtraient. transformStyle reçoit
// l'ancien style (sérialisé, donc avec les données GeoJSON à jour) et le nouveau :
// on reporte sur le nouveau toutes les sources GeoJSON de l'ancien et les couches
// qui les utilisent. Les couches du fond (vector ou satellite) ne sont jamais reprises.
const keepCustomLayers = (previous, next) => {
    if (!previous) return next;
    const nextSources = next.sources ?? {};
    const customSources = {};
    for (const [id, src] of Object.entries(previous.sources ?? {})) {
        if (src.type === "geojson" && !(id in nextSources)) customSources[id] = src;
    }
    const customLayers = (previous.layers ?? []).filter((l) => l.source && l.source in customSources);
    return {
        ...next,
        sources: { ...nextSources, ...customSources },
        layers: [...(next.layers ?? []), ...customLayers],
    };
};

// Les images (addImage) sont stockées dans le style : elles sont perdues au setStyle.
// Cette fonction recrée les trames de hachures (idempotente).
const ensureHatchImages = (map) => {
    const makeHatch = (id, color, lineWidth, diagonal) => {
        if (map.hasImage(id)) return;
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        // 3 diagonales décalées pour que la trame se raccorde d'une tuile à l'autre
        for (const offset of [-size, 0, size]) {
            ctx.beginPath();
            if (diagonal === "/") { ctx.moveTo(offset, size); ctx.lineTo(offset + size, 0); }
            else { ctx.moveTo(offset, 0); ctx.lineTo(offset + size, size); }
            ctx.stroke();
        }
        map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
    };
    makeHatch("hatch-restricted", "#e0a12b", 2, "/");      // détroits RESTRICTED
    makeHatch("hatch-conflict-zones", "#ED0C0C", 1.5, "\\"); // zones de conflit
};

// Icône du bouton « zone d'extraction » : un cadre en pointillés dont les deux coins
// opposés sont marqués (= les deux clics du tracé) et quelques points à l'intérieur
// (= les éléments extraits). Quand une zone est tracée (filled), le cadre devient plein
// et légèrement teinté pour signaler que l'extraction est active.
const AreaSelectIcon = ({ size = 16, filled = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="1"
              fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0}
              strokeDasharray={filled ? undefined : "3.2 2.8"} />
        <rect x="2" y="2" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="18" y="18" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
        <circle cx="9.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="9" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
);

// ── Pays : contours (survol / sélection) + filtrage des tweets par pays ─────────
// Les contours viennent de GET /countries (une feature par pays, properties.name).
// Le filtrage se fait côté client par point-in-polygon sur ces mêmes géométries :
// pas de dépendance à une propriété "pays" sur les tweets.
const buildCountryIndex = (fc) => {
    const index = new Map(); // name -> [{ bbox, rings }]
    for (const f of fc?.features ?? []) {
        const name = f.properties?.name;
        const g = f.geometry;
        if (!name || !g) continue;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        const entries = polys.map((rings) => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const [x, y] of rings[0]) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
            return { bbox: [minX, minY, maxX, maxY], rings };
        });
        index.set(name, [...(index.get(name) ?? []), ...entries]);
    }
    return index;
};

const ringContains = (ring, x, y) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

const pointInCountry = (polys, x, y) =>
    polys.some((p) =>
        x >= p.bbox[0] && x <= p.bbox[2] && y >= p.bbox[1] && y <= p.bbox[3] &&
        ringContains(p.rings[0], x, y) &&
        !p.rings.slice(1).some((hole) => ringContains(hole, x, y))
    );

// kind "point" : tweets. kind "line" : lignes militaires (capitale de l'agresseur -> point
// du tweet) : on garde la ligne si son point d'arrivée (dernier sommet = le tweet) est dans le pays.
const filterByCountry = (fc, polys, kind = "point") => {
    if (!fc?.features || !polys) return fc;
    return {
        ...fc,
        features: fc.features.filter((f) => {
            const c = f.geometry?.coordinates;
            if (!c) return false;
            const pt = kind === "line" ? c[c.length - 1] : c;
            return Array.isArray(pt) && pointInCountry(polys, pt[0], pt[1]);
        }),
    };
};

const COUNTRY_TITLES = { fr: "Pays sélectionné", en: "Selected country", es: "País seleccionado" };

const BASEMAP_TITLES = {
    vector: { fr: "Passer en vue satellite", en: "Switch to satellite view", es: "Cambiar a vista satélite" },
    satellite: { fr: "Revenir au fond de carte", en: "Back to map view", es: "Volver al mapa" },
};
// Comportement au chargement de la carte :
//  "canvas" : seule la carte est masquée (fond sombre) jusqu'à ce que le style et les couches
//             soient prêts, puis apparaît en fondu ; les contrôles restent visibles.
//  "all"    : la carte ET ses contrôles flottants sont masqués, puis apparaissent ensemble.
//  "none"   : tout est visible dès le montage (le style et les couches arrivent au fil du chargement).
const MAP_REVEAL_MODE = "canvas";
// Théâtres de conflit : l'aplat rouge s'estompe entre ces deux zooms,
// puis la couche est retirée au-delà de THEATERS_FADE_END.
const THEATERS_FADE_START = 6;
const THEATERS_FADE_END = 9;
const THEATERS_FILL_OPACITY = ['interpolate', ['linear'], ['zoom'], THEATERS_FADE_START, 0.2, THEATERS_FADE_END, 0];

// Zones de conflit (clusters d'événements) : même principe que les théâtres,
// elles s'estompent progressivement avec le zoom jusqu'à devenir transparentes,
// pour laisser la place aux tweets / à la carte en vue détaillée.
// Ajustez ces deux valeurs indépendamment de celles des théâtres si besoin.
const ZONES_FADE_START = 6;
const ZONES_FADE_END = 9;
// Enveloppe une opacité (nombre ou expression data-driven) dans un fondu par le zoom.
// MapLibre n'autorise ["zoom"] qu'en entrée d'un interpolate/step de plus haut niveau :
// l'expression data-driven passe donc en *sortie* du premier palier.
const zoneZoomFade = (opacity) =>
    ['interpolate', ['linear'], ['zoom'], ZONES_FADE_START, opacity, ZONES_FADE_END, 0];

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

// Détecte un écran "mobile" (portrait/tablette étroite) pour adapter à la
// volée la taille des zones cliquables et le mode d'affichage des popups.
// Basé sur matchMedia plutôt que sur un userAgent sniff, pour suivre les
// changements réels de taille (rotation, redimensionnement de fenêtre).
const MOBILE_BREAKPOINT_PX = 768;
const isMobileViewport = () =>
    typeof window !== "undefined" &&
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;

// Rayon (en px) de la zone invisible qui capte les clics/taps sur un tweet.
// Sur mobile, un doigt a besoin d'une cible bien plus large qu'un curseur
// de souris (recommandation usuelle : ~44px de diamètre, soit ~20-22px de
// rayon en tenant compte du fait que plusieurs points peuvent être proches).
const getTweetHitRadius = () => (isMobileViewport() ? 26 : 7);

// Sur mobile, les popups s'affichent en "bottom sheet" collée en bas de
// l'écran (voir MapView.css) : elle recouvre donc le bas de la carte. Pour que
// le point touché ne se retrouve pas caché dessous, on décale le centre de la
// carte via le padding du bas (= hauteur réelle de la sheet). Le padding est
// remis à 0 à la fermeture de la popup (resetSheetPadding).
const revealPointAboveSheet = (map, popup, coords) => {
    if (!isMobileViewport()) return;
    requestAnimationFrame(() => {
        try {
            const content = popup.getElement()?.querySelector(".maplibregl-popup-content");
            const height = content?.offsetHeight ?? 0;
            if (!height) return;
            map.easeTo({ center: coords, padding: { bottom: height }, duration: 300 });
        } catch { /* carte ou popup déjà détruite */ }
    });
};

const resetSheetPadding = (map) => {
    try {
        if (!isMobileViewport() || map.getPadding().bottom === 0) return;
        map.easeTo({ padding: { bottom: 0 }, duration: 300 });
    } catch { /* carte déjà détruite */ }
};

// Vide la source "tweet-highlight" : retire le cercle (bague + pulse) du
// tweet sélectionné. Utilisé par clearTweetHighlight() et à la fermeture de
// la popup mobile ouverte par highlightTweet().
const clearHighlightSource = (map) => {
    try {
        // Le highlight n'est plus actif : la boucle d'animation du pulse
        // s'arrêtera d'elle-même à sa prochaine frame (cf. animateHighlightPulse).
        map.__highlightActive = false;
        const src = map.getSource("tweet-highlight");
        if (src) src.setData({ type: "FeatureCollection", features: [] });
    } catch { /* carte déjà détruite */ }
};

/* Les libellés des popups (ex-MAPVIEW_UI_LABELS) vivent maintenant dans
   LangContext (t.popupUi). Dans les handlers MapLibre, on les lit via tRef.current. */

// Aire approximative (en deg², corrigée de la latitude) d'une géométrie Polygon /
// MultiPolygon. Sert uniquement à comparer les zones de conflit entre elles :
// les plus petites doivent rester dessinées et survolables au-dessus des grandes.
// Calculée sur les données sources (et non sur les features de queryRenderedFeatures,
// dont la géométrie est découpée par tuile et donc inexploitable).
function approxGeometryArea(geometry) {
    if (!geometry) return 0;
    const ringArea = (ring) => {
        let sum = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[i + 1];
            sum += x1 * y2 - x2 * y1;
        }
        const lat = ring.reduce((acc, c) => acc + c[1], 0) / (ring.length || 1);
        return Math.abs(sum) / 2 * Math.cos((lat * Math.PI) / 180);
    };
    const polyArea = (rings) =>
        rings.reduce((acc, ring, i) => acc + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);
    if (geometry.type === "Polygon") return polyArea(geometry.coordinates);
    if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((acc, poly) => acc + polyArea(poly), 0);
    return 0;
}

// Ajoute la propriété "_area" à chaque zone de conflit.
function withZoneAreas(fc) {
    if (!fc?.features) return fc;
    return {
        ...fc,
        features: fc.features.map((f) => ({
            ...f,
            properties: { ...(f.properties ?? {}), _area: approxGeometryArea(f.geometry) },
        })),
    };
}

// Parmi plusieurs features de zones de conflit superposées, renvoie la plus petite.
function pickSmallestZone(features) {
    if (!features?.length) return undefined;
    return features.reduce((best, f) =>
        (Number(f.properties?._area) || Infinity) < (Number(best.properties?._area) || Infinity) ? f : best
    );
}

// Les clics dans une popup de tweet ne doivent pas atteindre la carte : la popup est
// un enfant du conteneur du canvas, donc le clic remonte et le handler
// "tweets-hover-area" recréerait la popup (et couperait la vidéo en lecture).
// Les onclick inline des boutons et les contrôles natifs de <video> fonctionnent toujours.
const isolatePopupEvents = (p) => {
    const el = p?.getElement?.();
    if (!el || el.__isolated) return;
    el.__isolated = true;
    ["click", "dblclick", "contextmenu"].forEach((type) =>
        el.addEventListener(type, (ev) => ev.stopPropagation())
    );
};

// Fait défiler la grille d'une pile de tweets pour centrer la ligne sélectionnée.
const centerSelectedInList = (p) => {
    const list = p?.getElement?.()?.querySelector(".tweet-list-items");
    const sel = list?.querySelector(".tweet-list-item.selected");
    if (!list || !sel) return;
    const lr = list.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    list.scrollTop += sr.top - lr.top - (lr.height - sr.height) / 2;
};

const MapView = forwardRef(function MapView({ onTweetsLoaded, activeLabel, activeWeaponTypes, activeObjectiveTypes, searchText, onSearchTextChange, searchBarLeftOffset = 5, filtersOpen = false, onToggleFilters, onRectangleDrawn, onCountryChange, onLoadingChange, onTweetPopupClose, selectedTweetId = null, sidePanelOpen = false, initialView = null, initialRectangle = null, initialTweetId = null, onMoveEnd }, ref) {
    const { timeRange } = useTime();
    const { t, lang, mapLanguage, setEntityNamesFr, setEntityNamesEs, setActorNamesFr, setActorNamesEs, translateActor, translateEntity } = useLang();

    // ── Panneau latéral "Théâtres" ──
    // Ouvert d'emblée si l'URL est /content/<slug>/ (le panneau sélectionne alors ce théâtre)
    const [theatersOpen, setTheatersOpen] = useState(() => getInitialTheaterSlug() !== null);
    const theaterOutlineIdRef = useRef(null); // topic_id (valeur exacte de la source) dont l'area est activée par le panneau

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
    // Dernier bootstrap connu : loadAllData (asynchrone) lit celui-ci plutôt que la
    // valeur résolue au 1er rendu, pour voir les tweets plus anciens s'ils sont déjà arrivés.
    const latestBootstrapRef = useRef(bootstrapData);
    latestBootstrapRef.current = bootstrapData;
    // Incrémenté quand /tweets/older a été fusionné : relance le filtrage de la carte.
    const [tweetsRevision, setTweetsRevision] = useState(0);

    // ── Suggestions "Trending" (façon Reddit) au-dessus de la search bar ──
    // useKeywords() renvoie désormais des paires {term, context} issues de
    // KW1/KW1_CTX .. KW5/KW5_CTX. On garde un fallback tolérant au cas où
    // le backend renverrait encore de simples strings (ancien format).
    const rawKeywords = useKeywords(); // [{term, context, term_fr, term_en, context_fr, context_en}, ...] ou ["kw1", ...] (legacy) ou []
    const trendingKeywords = (rawKeywords || [])
        .map((kw) => {
            if (kw && typeof kw === "object") {
                // Traduction FR/EN issue de KW_TENDANCIES_TRANSLATIONS, avec
                // repli sur le terme/contexte brut si la traduction manque
                // (même logique que reason_fr/reason_en pour les chokepoints).
                // term_<lang> / context_<lang> si dispo (fr, en, es...), sinon repli sur l'anglais.
                const translatedTerm = kw[`term_${lang}`] || (lang !== "fr" ? kw.term_en : "");
                const translatedContext = kw[`context_${lang}`] || (lang !== "fr" ? kw.context_en : "");
                const term = translatedTerm || kw.term || kw.kw || "";
                const context = translatedContext || kw.context || kw.ctx || "";
                return term ? { term, context } : null;
            }
            // legacy: simple string, pas de contexte disponible
            return kw ? { term: kw, context: "" } : null;
        })
        .filter(Boolean);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);


    const handleSelectKeyword = (kw) => {
        // Le filtrage/recherche se fait sur kw.term, qui est désormais le
        // terme affiché (traduit FR/EN si dispo), jamais sur le libellé
        // contextuel (kw.context).
        setLocalSearchText(kw.term);
        setShowSuggestions(false);
        // Remonte immédiatement au parent, sans attendre les 300ms de debounce
        if (onSearchTextChange) onSearchTextChange(kw.term);
    };

    const handleClearSearch = () => {
        setLocalSearchText("");
        if (onSearchTextChange) onSearchTextChange("");
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === "Escape") { setShowSuggestions(false); return; }
        if (!showSuggestions || !filteredKeywords.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => (i + 1) % filteredKeywords.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => (i <= 0 ? filteredKeywords.length - 1 : i - 1));
        } else if (e.key === "Enter" && activeIdx >= 0) {
            e.preventDefault();
            handleSelectKeyword(filteredKeywords[activeIdx]);
        }
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
    const langRef = useRef(lang);
    useEffect(() => {
        langRef.current = lang;
    }, [lang]);
    // Langue des étiquettes de la carte (MapTiler). La ref permet à l'effet
    // d'initialisation (monté une seule fois) de lire la valeur courante, et
    // appliedMapLangRef évite un setLanguage inutile si rien n'a changé.
    const mapLanguageRef = useRef(mapLanguage);
    const appliedMapLangRef = useRef(null);
    useEffect(() => {
        mapLanguageRef.current = mapLanguage;
    }, [mapLanguage]);
    // Dictionnaire de la langue active, lisible depuis les callbacks de la carte
    // (créés une seule fois au montage) sans être figés sur la langue initiale.
    const tRef = useRef(t);
    useEffect(() => {
        tRef.current = t;
    }, [t]);
    // Idem pour la traduction des acteurs non étatiques (popups de zones de conflit).
    const translateActorRef = useRef(translateActor);
    useEffect(() => {
        translateActorRef.current = translateActor;
    }, [translateActor]);
    // Idem pour la traduction des noms de pays (popup des lignes de front).
    const translateEntityRef = useRef(translateEntity);
    useEffect(() => {
        translateEntityRef.current = translateEntity;
    }, [translateEntity]);
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
    // Permalinks : valeurs initiales (lues une seule fois) + callback moveend
    const initialViewRef = useRef(initialView);
    const initialRectangleRef = useRef(initialRectangle);
    const initialTweetIdRef = useRef(initialTweetId);
    const onMoveEndRef = useRef(onMoveEnd);
    useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);
    useImperativeHandle(ref, () => ({
        // Permet à la topbar (parent) d'ouvrir/fermer le panneau Théâtres
        toggleTheaters: () => setTheatersOpen((v) => !v),
        openTheaters: () => setTheatersOpen(true),
        closeTheaters: () => setTheatersOpen(false),
        getView: () => {
            const m = mapRef.current;
            if (!m) return null;
            const c = m.getCenter();
            return { center: [c.lng, c.lat], zoom: m.getZoom() };
        },
        flyTo: (options) => {
            const currentZoom = mapRef.current?.getZoom();
            mapRef.current?.flyTo({ ...options, zoom: currentZoom });
        },
        // Remplace l'ancien openTweetPopup : sur desktop, le SidePanel affiche
        // déjà le contenu du tweet à côté de la carte donc une popup ferait
        // doublon — on se contente d'un pan/fly + indicateur (cercle pulsant)
        // via la source "tweet-highlight". Sur mobile en revanche, le
        // SidePanel occupe tout l'écran (cf. media query 768px) et masque la
        // carte : on rouvre donc la popup pour voir le résultat du clic.
        highlightTweet: (feature, { fly = true, animate = true } = {}) => {
            const map = mapRef.current;
            if (!map) return;

            const coords = feature.geometry?.coordinates?.slice()
                || [feature.properties.longitude, feature.properties.latitude];
            if (!coords || coords.length < 2) return;

            // Ferme une éventuelle popup encore ouverte. C'est une fermeture
            // programmatique : on vide la ref AVANT remove() pour que le
            // handler "close" de l'ancienne popup l'ignore (sinon il effacerait
            // le nouveau cercle et désélectionnerait le nouveau tweet).
            if (pinnedPopupRef.current) {
                const oldPopup = pinnedPopupRef.current;
                pinnedPopupRef.current = null;
                oldPopup.remove();
            }

            const highlightSource = map.getSource("tweet-highlight");
            if (highlightSource) {
                highlightSource.setData({
                    type: "FeatureCollection",
                    features: [{
                        type: "Feature",
                        geometry: { type: "Point", coordinates: coords },
                        properties: { conflict_typology: feature.properties?.conflict_typology ?? null },
                    }],
                });
                // Un tweet est sélectionné : on (re)lance l'animation du pulse.
                map.__highlightActive = true;
                map.__startHighlightPulse?.();
            }

            if (fly) {
                const target = { center: coords, zoom: Math.max(map.getZoom(), 5) };
                // animate: false => saut instantané (ouverture initiale, carte encore masquée
                // derrière le spinner : inutile de jouer un vol de 1,2 s que personne ne voit).
                if (animate) map.flyTo({ ...target, duration: 1200, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
                else map.jumpTo({ ...target, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
            }

            if (!fly || !isMobileViewport()) return;

            const props = feature.properties;
            const images = (() => {
                if (Array.isArray(props.images)) return props.images;
                try { return JSON.parse(props.images); } catch { return []; }
            })();

            // Ouvre la popup une fois la caméra arrivée (mobile uniquement)
            const openMobilePopup = () => {
                if (pinnedPopupRef.current) return;
                const newPopup = new maptilersdk.Popup({
                    closeButton: true,
                    closeOnClick: false,
                    maxWidth: "none",
                    className: "tweet-popup tweet-popup--mobile",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(createPopupHTML({ ...props, images }, true, 0, 1, true, false))
                    .addTo(map);
                isolatePopupEvents(newPopup);

                // Pas de z-index inline : on garde celui de la feuille de style (.tweet-popup),
                // comme pour la popup ouverte par un clic direct sur la carte.

                pinnedPopupRef.current = newPopup;
                newPopup.on("close", () => {
                    // Remplacée par une autre popup (highlightTweet) : rien à faire
                    if (pinnedPopupRef.current !== newPopup) return;
                    pinnedPopupRef.current = null;
                    resetSheetPadding(map);
                    clearHighlightSource(map);          // retire le cercle du tweet sélectionné
                    onTweetPopupCloseRef.current?.();   // prévient le parent (désélection)
                });
                revealPointAboveSheet(map, newPopup, coords);
                window.navigateTweet = () => { };
            };
            if (animate) map.once('moveend', openMobilePopup);
            else openMobilePopup();
        },
        // Désélection côté SidePanel : ferme la popup mobile éventuelle et
        // efface l'indicateur. On vide la ref AVANT remove() pour que le handler
        // "close" de la popup l'ignore (sinon il rappellerait onTweetPopupClose
        // et referait le nettoyage une seconde fois).
        clearTweetHighlight: () => {
            const map = mapRef.current;
            if (!map) return;
            if (pinnedPopupRef.current) {
                const oldPopup = pinnedPopupRef.current;
                pinnedPopupRef.current = null;
                oldPopup.remove();
                resetSheetPadding(map);
            }
            clearHighlightSource(map);
        },
        resize: () => mapRef.current?.resize(),
    }));
    const animFrameRef = useRef(null)
    const [dataTweets, setDataTweets] = useState(null);
    // La carte (et ses contrôles flottants) reste masquée derrière un spinner tant que le
    // style MapTiler, les tuiles et les couches ne sont pas prêts : évite le flash d'une
    // carte noire / sans style au chargement (surtout visible sur mobile).
    const [mapReady, setMapReady] = useState(MAP_REVEAL_MODE === "none");
    const allTweetsRef = useRef(null); // jeu complet des 30 derniers jours, filtré côté client
    const allMilitaryLinesRef = useRef(null); // idem pour les lignes militaires
    const allTopicsAreasRef = useRef(null); // polygones topics_areas (bootstrap), pour calculer la bbox au clic SidePanel
    const chokepointsDataRef = useRef(null); // GeoJSON des chokepoints (bootstrap), pour retrouver le point depuis une area
    const prevActiveLabelRef = useRef(activeLabel); // détecte un VRAI changement de topic sélectionné, pour ne pan la carte que dans ce cas
    const onTweetsLoadedRef = useRef(onTweetsLoaded);
    const onLoadingChangeRef = useRef(onLoadingChange);
    useEffect(() => { onLoadingChangeRef.current = onLoadingChange; }, [onLoadingChange]);
    // Callback appelé quand l'utilisateur ferme la popup mobile d'un tweet
    // sélectionné depuis le SidePanel (pour que le parent désélectionne aussi).
    const onTweetPopupCloseRef = useRef(onTweetPopupClose);
    useEffect(() => { onTweetPopupCloseRef.current = onTweetPopupClose; }, [onTweetPopupClose]);

    // Id du tweet actuellement sélectionné (côté parent) : lu par l'effet de
    // filtrage pour savoir s'il est encore dans le jeu affiché. Une ref évite
    // de relancer tout le filtrage à chaque sélection.
    const selectedTweetIdRef = useRef(selectedTweetId);
    useEffect(() => { selectedTweetIdRef.current = selectedTweetId; }, [selectedTweetId]);
    // Si la grille d'une pile de tweets est ouverte, on la redessine pour que la ligne
    // surlignée suive la sélection du SidePanel (déclaré APRÈS la mise à jour de la ref).
    useEffect(() => { window.__refreshTweetList?.(); }, [selectedTweetId]);

    // Pause du pulse du tweet sélectionné quand le SidePanel recouvre la carte
    // (mobile uniquement) : inutile de rendre la carte ~60 fois/s si elle est cachée.
    const highlightPausedRef = useRef(false);
    useEffect(() => {
        const evaluate = () => {
            const paused = sidePanelOpen && isMobileViewport();
            const wasPaused = highlightPausedRef.current;
            highlightPausedRef.current = paused;
            // Carte de nouveau visible : on relance la boucle si un tweet est sélectionné
            if (wasPaused && !paused) mapRef.current?.__startHighlightPulse?.();
        };
        evaluate();
        window.addEventListener('resize', evaluate); // rotation d'écran
        return () => window.removeEventListener('resize', evaluate);
    }, [sidePanelOpen]);
    const isFirstRender = useRef(true);
    // ── Pays sélectionné (clic sur un pays ; reclic = désélection) ──
    const [selectedCountry, setSelectedCountry] = useState(null);
    const selectedCountryRef = useRef(null);
    const onCountryChangeRef = useRef(onCountryChange);
    useEffect(() => { onCountryChangeRef.current = onCountryChange; }, [onCountryChange]);
    const countryIndexRef = useRef(null); // Map name -> polygones (rempli par GET /countries)
    useEffect(() => {
        selectedCountryRef.current = selectedCountry;
        mapRef.current?.__applyCountrySelected?.(selectedCountry); // contour + voile bleu
        onCountryChangeRef.current?.(selectedCountry); // le graphique se filtre aussi (EventsChart)
    }, [selectedCountry]);
    const pinnedPopupRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [quadrilateralCoords, setQuadrilateralCoords] = useState([]);
    const [drawnQuadrilateral, setDrawnQuadrilateral] = useState(null);
    // ── Outil "rectangle" (bouton AreaSelectIcon) : 1er clic = coin de départ, 2nd clic = coin final ──
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
    // Fond de carte : "vector" (style MapTiler personnalisé) ou "satellite"
    const [basemap, setBasemap] = useState("vector");
    const handleToggleBasemap = () => {
        const map = mapRef.current;
        if (!map) return;
        const next = basemap === "vector" ? "satellite" : "vector";
        setBasemap(next);
        // Une fois le nouveau style chargé : on restaure ce que setStyle() réinitialise
        // (images, projection globe, langue des étiquettes, animation du tweet sélectionné).
        map.once("style.load", () => {
            try {
                ensureHatchImages(map);
                loadChokepointImages(map);
                map.setProjection({ type: "globe" });
                if (next === "vector" && appliedMapLangRef.current) map.setLanguage(appliedMapLangRef.current);
                if (map.__highlightActive) map.__startHighlightPulse?.();
                map.__reapplyCountryState?.(); // feature-state perdu au setStyle
            } catch { /* carte déjà détruite */ }
        });
        map.setStyle(next === "satellite" ? SATELLITE_STYLE_URL : STYLE_URL, { transformStyle: keepCustomLayers });
    };
    // Feedback du bouton "Copier le lien" (icône coche pendant ~1,8 s)
    const [linkCopied, setLinkCopied] = useState(false);
    const performanceModeRef = useRef(false);
    const militaryPulseFrameRef = useRef(null);
    const resumeAnimationsRef = useRef(null);
    const tweetCount = dataTweets?.features?.length || 0;
    // Nombre de filtres arme + objectif actifs : affiché en pastille sur le bouton filtres de la toolbar
    const activeFilterCount = (activeWeaponTypes?.length || 0) + (activeObjectiveTypes?.length || 0);
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
    // NB : le re-filtrage des tweets (setData sur "tweets" et "military-lines",
    // setDataTweets, onTweetsLoaded) est fait UNE SEULE FOIS, dans le useEffect
    // qui appelle buildEnrichedTweets() plus bas. Un ancien effet en doublon
    // refaisait le même travail (2 setData + 2 re-render d'App par changement)
    // et, en plus, n'appliquait pas le filtre activeLabel.

    // Initialise les sources "statiques" de la carte à partir des données déjà
    // chargées par BootstrapProvider (aucun fetch ici : on attend juste que
    // le contexte ait fini son unique requête /bootstrap, via la Promise
    // exposée par bootstrapReadyRef). tweets et military_lines viennent tous
    // les deux directement du bootstrap (30 jours), sans requête HTTP
    // supplémentaire.
    const loadAllData = async (map) => {
        try {
            const resolvedBootstrap = await bootstrapReadyRef.current.promise;
            const bootstrap = latestBootstrapRef.current ?? resolvedBootstrap;

            const {
                shipping_lanes: dataShipping,
                chokepoints: dataChokepoints,
                chokepoints_areas: dataChokepointsAreas,
                conflict_borders: dataBorders,
                conflict_theaters: dataBordersTheaters,
                topics_areas: dataTopicsAreas,
                conflict_zones: dataConflictZones,
                military_lines: dataMilitaryLines,
                tweets: dataTweetsBootstrap
            } = bootstrap;

            // Noms d'entités traduits (world_areas.entity_name_fr) -> LangContext
            setEntityNamesFr(bootstrap.entity_names_fr ?? {});
            setActorNamesFr(bootstrap.actor_names_fr ?? {});
            setEntityNamesEs(bootstrap.entity_names_es ?? {});
            setActorNamesEs(bootstrap.actor_names_es ?? {});

            const emptyGeoJSON = { type: "FeatureCollection", features: [] };

            chokepointsDataRef.current = dataChokepoints ?? null;

            // Cache complet (30 jours) pour re-filtrage client sur timeRange/armes/objectifs/label
            allMilitaryLinesRef.current = dataMilitaryLines ?? emptyGeoJSON;
            const filteredMilitaryLines = filterTweets(
                allMilitaryLinesRef.current,
                timeRangeRef.current,
                activeWeaponTypesRef.current,
                activeObjectiveTypesRef.current,
                activeLabelRef.current,
                searchTextRef.current,
                undefined,
                langRef.current
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
                searchTextRef.current,
                undefined,
                langRef.current
            );
            setDataTweets(filteredTweets);
            if (onTweetsLoadedRef.current) onTweetsLoadedRef.current(filteredTweets);

            // map === null : mode "secours" (le style MapTiler n'a pas pu être chargé,
            // ex: rendu Googlebot). On ne touche alors qu'à l'état React ; les
            // sources seront ajoutées si la carte finit par se charger.
            if (map) {
                // tweets et military-lines sont alimentées immédiatement avec les
                // données du bootstrap (plus besoin d'attendre un fetch séparé).
                map.addSource("tweets", { type: "geojson", data: filteredTweets });
                map.addSource("military-lines", { type: "geojson", data: filteredMilitaryLines, lineMetrics: true });

                // Ajout des autres sources
                map.addSource("shipping-lanes", { type: "geojson", data: dataShipping });
                map.addSource("chokepoints", { type: "geojson", data: dataChokepoints });
                map.addSource("chokepoints-areas", { type: "geojson", data: dataChokepointsAreas ?? emptyGeoJSON });
                map.addSource("conflict-borders", { type: "geojson", data: dataBorders });
                map.addSource("conflict-theaters", { type: "geojson", data: dataBordersTheaters });
                map.addSource("topics-areas", { type: "geojson", data: dataTopicsAreas });
                map.addSource("conflict-zones", { type: "geojson", data: withZoneAreas(dataConflictZones) ?? emptyGeoJSON });
            }

            // Cache des polygones topics_areas, pour calculer la bbox du topic
            // sélectionné (SidePanel) sans dépendre de querySourceFeatures
            // (qui ne renvoie que les features des tuiles déjà rendues).
            allTopicsAreasRef.current = dataTopicsAreas ?? emptyGeoJSON;

            return filteredTweets;
        } catch (err) {
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

        const map = new maptilersdk.Map({
            container: containerRef.current,
            style: STYLE_URL,
            // Étiquettes de la carte dans la langue de l'app dès le premier rendu
            language: mapLanguageRef.current,
            center: initialViewRef.current?.center ?? [37, 37],
            zoom: initialViewRef.current?.zoom ?? initialZoom,
            projection: "globe",
            space: { preset: "stars" },
            navigationControl: false,
            geolocateControl: false,


        });

        mapRef.current = map;
        appliedMapLangRef.current = mapLanguageRef.current;

        // Secours : si le style de la carte ne se charge pas (clé MapTiler refusée,
        // réseau, rendu Googlebot...), l'événement "load" n'arrive jamais et les
        // données (tweets, panneau latéral) + la fin du chargement restent bloqués.
        // On charge alors les données SANS la carte, pour que l'UI reste utilisable.
        let mapLoaded = false;
        let fallbackDone = false;
        const runDataFallback = () => {
            if (mapLoaded || fallbackDone) return;
            fallbackDone = true;
            loadAllData(null);
        };
        map.on("error", () => { if (!map.isStyleLoaded()) runDataFallback(); });
        const fallbackTimer = setTimeout(runDataFallback, 3000);
        // Garde-fou : si le style / les tuiles ne finissent jamais de charger (réseau très
        // lent, clé refusée, crawler), on révèle quand même l'UI pour qu'elle reste utilisable.
        const revealTimer = setTimeout(() => setMapReady(true), 8000);
        let revealed = false;
        const revealMap = () => {
            if (revealed) return;
            revealed = true;
            clearTimeout(revealTimer);
            // Une frame de plus pour que le dernier rendu (couches ajoutées) soit peint
            requestAnimationFrame(() => setMapReady(true));
        };

        // Tant que la page est encore sur l'écran de chargement (le globe
        // "flotte" sans que l'utilisateur ait interagi), on recale le zoom
        // à chaque redimensionnement de fenêtre pour garder le globe entier
        // visible (ex: fenêtre redimensionnée juste après le rechargement).
        // Vue venue de l'URL : on ne la "recale" pas sur le globe entier au resize.
        let userInteracted = Boolean(initialViewRef.current);
        const markInteracted = () => { userInteracted = true; };
        map.on("dragstart", markInteracted);
        map.on("moveend", () => onMoveEndRef.current?.());
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
            mapLoaded = true;
            clearTimeout(fallbackTimer);
            map.doubleClickZoom.disable();
            map.setProjection({ type: 'globe' });
            const dataTweets = await loadAllData(map);
            let popup = new maptilersdk.Popup({
                closeButton: false,
                closeOnClick: true,
                maxWidth: "none",
                className: "tweet-popup",
                anchor: "bottom",
            });

            window.closePopup = () => {
                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                } else if (popup.isOpen()) {
                    // Popup de survol (même rendu que la popup épinglée)
                    popup.remove();
                    window.__closeHoverTweetStack?.();
                }
            };
            // Zones maritimes touchées par un détroit fermé/restreint aujourd'hui.
            // Un polygone par détroit, symbolisé selon "status" :
            //  - CLOSED     : aplat rouge + contour plein        (navigation impossible)
            //  - RESTRICTED : hachures ambre + contour pointillé (navigation incertaine)
            // Ajoutées avant military-lines : elles restent sous les lignes,
            // les tweets et les icônes de chokepoints.
            const CHOKEPOINT_CLOSED_COLOR = '#e02b2b';
            const CHOKEPOINT_RESTRICTED_COLOR = '#e0a12b';

            // Trame de hachures diagonales (tuilable) pour les zones RESTRICTED.
            // 32x32 px dessinés pour un pixelRatio de 2 => rendu net sur écrans HiDPI.
            ensureHatchImages(map);

            // CLOSED : aplat
            map.addLayer({
                id: 'chokepoints-areas-fill-closed',
                type: 'fill',
                source: 'chokepoints-areas',
                filter: ['==', ['get', 'status'], 'CLOSED'],
                paint: {
                    'fill-color': CHOKEPOINT_CLOSED_COLOR,
                    'fill-opacity': 0.25
                }
            });
            // RESTRICTED : hachures (fill-color ignoré avec fill-pattern)
            map.addLayer({
                id: 'chokepoints-areas-fill-restricted',
                type: 'fill',
                source: 'chokepoints-areas',
                filter: ['==', ['get', 'status'], 'RESTRICTED'],
                paint: {
                    'fill-pattern': 'hatch-restricted',
                    'fill-opacity': 0.6
                }
            });
            // Contours : plein pour CLOSED, pointillé pour RESTRICTED
            // (line-dasharray n'accepte pas d'expression => une couche par statut)
            map.addLayer({
                id: 'chokepoints-areas-line-closed',
                type: 'line',
                source: 'chokepoints-areas',
                filter: ['==', ['get', 'status'], 'CLOSED'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': CHOKEPOINT_CLOSED_COLOR,
                    'line-width': 1,
                    'line-opacity': 0.9
                }
            });
            map.addLayer({
                id: 'chokepoints-areas-line-restricted',
                type: 'line',
                source: 'chokepoints-areas',
                filter: ['==', ['get', 'status'], 'RESTRICTED'],
                layout: { 'line-join': 'round' },
                paint: {
                    'line-color': CHOKEPOINT_RESTRICTED_COLOR,
                    'line-width': 1,
                    'line-dasharray': [4, 3],
                    'line-opacity': 0.9
                }
            });

            // Surbrillance au survol d'une zone : fond uniquement, contours inchangés
            // (filtre piloté par setFilter, vide par défaut)
            const HOVER_AREA_COLOR = [
                'match', ['get', 'status'],
                'CLOSED', CHOKEPOINT_CLOSED_COLOR,
                'RESTRICTED', CHOKEPOINT_RESTRICTED_COLOR,
                '#ffffff'
            ];
            map.addLayer({
                id: 'chokepoints-areas-hover-fill',
                type: 'fill',
                source: 'chokepoints-areas',
                filter: ['==', ['get', 'portname'], ''],
                paint: {
                    'fill-color': HOVER_AREA_COLOR,
                    'fill-opacity': 0.35
                }
            });
            // Zones de conflit (clusters d'événements des 30 derniers jours, pré-calculés
            // par feed.py). Style volontairement distinct des théâtres (aplat rouge + trait
            // épais) et des détroits (rouge/ambre) : hachures rouges (même teinte que les
            // événements MIL et les théâtres) en sens "\" (les détroits RESTRICTED sont
            // en "/"), contour fin plein. L'intensité des
            // hachures croît avec le nombre d'événements (3 -> discret, 40+ -> dense).
            // Ajoutées avant military-lines : elles restent sous les lignes et les tweets.
            const CONFLICT_ZONE_COLOR = '#ED0C0C';
            // Léger voile de fond pour que la zone reste lisible entre les hachures
            map.addLayer({
                id: 'conflict-zones-tint',
                type: 'fill',
                source: 'conflict-zones',
                layout: { visibility: CZ_VISIBILITY, 'fill-sort-key': ['*', -1, ['coalesce', ['to-number', ['get', '_area']], 0]] },
                paint: {
                    'fill-color': CONFLICT_ZONE_COLOR,
                    'fill-opacity': zoneZoomFade(0.06)
                }
            });
            map.addLayer({
                id: 'conflict-zones-hatch',
                type: 'fill',
                source: 'conflict-zones',
                maxzoom: ZONES_FADE_END,
                layout: { visibility: CZ_VISIBILITY, 'fill-sort-key': ['*', -1, ['coalesce', ['to-number', ['get', '_area']], 0]] },
                paint: {
                    'fill-pattern': 'hatch-conflict-zones',
                    // Intensité selon nb_events, puis fondu vers 0 avec le zoom
                    'fill-opacity': zoneZoomFade(['interpolate', ['linear'],
                        ['coalesce', ['to-number', ['get', 'nb_events']], 3],
                        3, 0.25, 15, 0.5, 40, 0.8
                    ])
                }
            });
            map.addLayer({
                id: 'conflict-zones-outline',
                type: 'line',
                source: 'conflict-zones',
                maxzoom: ZONES_FADE_END,
                layout: { visibility: CZ_VISIBILITY, 'line-join': 'round' },
                paint: {
                    'line-color': CONFLICT_ZONE_COLOR,
                    'line-width': 1,
                    'line-opacity': zoneZoomFade(0.7)
                }
            });
            // Surbrillance au survol d'une zone de conflit (filtre piloté par setFilter, vide par défaut)
            map.addLayer({
                id: 'conflict-zones-hover-fill',
                type: 'fill',
                source: 'conflict-zones',
                filter: ['==', ['get', 'zid'], -1],
                maxzoom: ZONES_FADE_END,
                layout: { visibility: CZ_VISIBILITY },
                paint: {
                    'fill-color': CONFLICT_ZONE_COLOR,
                    'fill-opacity': zoneZoomFade(0.2)
                }
            });
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
                id: 'conflict-theaters-fill',
                type: 'fill',
                source: 'conflict-theaters',
                maxzoom: THEATERS_FADE_END, 
                paint: {
                    'fill-color': '#ED0C0C',
                    'fill-opacity': THEATERS_FILL_OPACITY
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
            // Surbrillance de la paire de pays survolée : théâtre (aplat) + frontière (trait).
            // Filtres pilotés par setFilter (vides par défaut) : cf. setPairHighlight.
            map.addLayer({
                id: 'conflict-pair-hover-fill',
                type: 'fill',
                source: 'conflict-theaters',
                filter: ['==', ['get', 'country_a'], '__none__'],
                maxzoom: THEATERS_FADE_END,
                paint: {
                    'fill-color': '#ED0C0C',
                    'fill-opacity': THEATERS_FILL_OPACITY
                }
            });
            map.addLayer({
                id: 'conflict-pair-hover-line',
                type: 'line',
                source: 'conflict-borders',
                filter: ['==', ['get', 'country_a'], '__none__'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ff5a5a',
                    'line-width': 2,
                    'line-opacity': 1
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
                paint: { 'circle-radius': getTweetHitRadius(), 'circle-opacity': 0 },
            });

            // ── Indicateur de tweet sélectionné (clic depuis le SidePanel) ──
            // Source vide par défaut, alimentée par highlightTweet() via
            // useImperativeHandle. Deux couches : une bague fixe autour du
            // point, et un cercle qui pulse (grossit + s'estompe en boucle)
            // pour bien attirer l'œil sans ouvrir de popup redondante.
            map.addSource("tweet-highlight", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
            // Couleur selon la typologie du tweet (même règle que les points
            // de la carte) : MIL → rouge, autres → bleu. highlightTweet()
            // recopie conflict_typology dans les properties de la feature.
            const HIGHLIGHT_STROKE = ["match", ["get", "conflict_typology"], "MIL", "#ED0C0C", "#4f9dff"];
            const HIGHLIGHT_FILL = ["match", ["get", "conflict_typology"], "MIL", "rgba(237,12,12,0.18)", "rgba(79,157,255,0.18)"];
            map.addLayer({
                id: "tweet-highlight-pulse",
                type: "circle",
                source: "tweet-highlight",
                paint: {
                    "circle-radius": 8,
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-color": HIGHLIGHT_STROKE,
                    "circle-stroke-width": 2,
                    "circle-stroke-opacity": 0.8,
                },
            });
            map.addLayer({
                id: "tweet-highlight-ring",
                type: "circle",
                source: "tweet-highlight",
                paint: {
                    "circle-radius": 7,
                    "circle-color": HIGHLIGHT_FILL,
                    "circle-stroke-color": HIGHLIGHT_STROKE,
                    "circle-stroke-width": 1.5,
                    "circle-stroke-opacity": 0.9,
                },
            });

            // Boucle d'animation du pulse (rayon croissant + opacité décroissante,
            // en boucle). Elle ne tourne QUE tant qu'un tweet est sélectionné
            // (map.__highlightActive) : chaque setPaintProperty force un rendu
            // complet de la carte, donc une boucle permanente = ~60 rendus/s
            // même au repos (batterie, chauffe, saccades sur mobile).
            let highlightAnimFrame = null;
            const PULSE_DURATION_MS = 1400;
            const animateHighlightPulse = (timestamp) => {
                if (
                    !map.getLayer("tweet-highlight-pulse") ||
                    !map.__highlightActive ||
                    highlightPausedRef.current // SidePanel ouvert sur mobile : carte cachée
                ) {
                    highlightAnimFrame = null; // rien à animer : on arrête la boucle
                    return;
                }
                const t = (timestamp % PULSE_DURATION_MS) / PULSE_DURATION_MS; // 0 → 1
                const radius = 8 + t * 18; // grossit de 8 à 26px
                const opacity = 0.8 * (1 - t); // s'estompe jusqu'à 0
                map.setPaintProperty("tweet-highlight-pulse", "circle-radius", radius);
                map.setPaintProperty("tweet-highlight-pulse", "circle-stroke-opacity", opacity);
                highlightAnimFrame = requestAnimationFrame(animateHighlightPulse);
            };
            map.__startHighlightPulse = () => {
                if (highlightAnimFrame == null) {
                    highlightAnimFrame = requestAnimationFrame(animateHighlightPulse);
                }
            };
            map.once("remove", () => {
                if (highlightAnimFrame != null) cancelAnimationFrame(highlightAnimFrame);
            });

            // Recalcule le rayon de la zone cliquable si le viewport franchit
            // le seuil mobile (rotation d'écran, redimensionnement de fenêtre).
            const updateTweetHitRadius = () => {
                if (map.getLayer('tweets-hover-area')) {
                    map.setPaintProperty('tweets-hover-area', 'circle-radius', getTweetHitRadius());
                }
            };
            window.addEventListener('resize', updateTweetHitRadius);
            map.once('remove', () => window.removeEventListener('resize', updateTweetHitRadius));

            loadChokepointImages(map);
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
            // Contour de la topic area sélectionnée (SidePanel via activeLabel,
            // ou panneau Théâtres via theaterOutlineIdRef).
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

            // ── Permalinks : restaure le rectangle et le tweet sélectionné de l'URL ──
            // (toutes les sources, dont "draw-rectangle" et "tweet-highlight", existent ici)
            if (initialRectangleRef.current) {
                map.getSource("draw-rectangle")?.setData({ type: "FeatureCollection", features: [initialRectangleRef.current] });
                setDrawnQuadrilateral(initialRectangleRef.current);
            }
            if (initialTweetIdRef.current) {
                const wantedId = String(initialTweetIdRef.current);
                initialTweetIdRef.current = null;
                const feature = allTweetsRef.current?.features?.find((f) => String(f.properties?.id) === wantedId);
                if (feature) ref?.current?.highlightTweet?.(feature, { fly: !initialViewRef.current });
                else onTweetPopupCloseRef.current?.(); // tweet introuvable (trop ancien ?) : on désélectionne
            }

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

            let conflictPopup = new maptilersdk.Popup({
                closeButton: true,
                closeOnClick: true,
                maxWidth: "none",
                className: "conflict-popup",
                anchor: "bottom",
            });

            let isHoveringTweet = false;
            // pinnedPopupRef (partagé avec useImperativeHandle / highlightTweet) est
            // désormais l'UNIQUE source de vérité pour "y a-t-il une popup épinglée ?".
            // Avant, une variable locale `pinnedPopup` dupliquait cet état : elle ne
            // reflétait jamais les popups ouvertes/fermées par highlightTweet (clic
            // depuis le SidePanel), qui ne touche que la ref. Résultat sur mobile :
            // clic SidePanel -> popup A (ref à jour, variable locale toujours null)
            // puis clic direct sur la carte -> le handler ne voyait pas la popup A
            // (variable locale null) et en ouvrait une seconde par-dessus.
            const setPinnedPopup = (p) => { pinnedPopupRef.current = p; };
            let isHoveringConflictArea = false
            let currentHoverPopup = null

            const getConflictHTML = (props, lang = getCurrentLang()) => {
                const ui = tRef.current.popupUi;

                const today = new Date().toLocaleDateString(DATE_LOCALES[lang] || DATE_LOCALES.en, {
                    day: '2-digit', month: 'short', year: 'numeric'
                });

                return `
                    <div class="conflict-card">
                        <span class="conflict-card-name">${props.name}</span>
                        <dl class="conflict-card-rows">
                            <div><dt>${ui.activities}</dt><dd>${props.count}</dd></div>
                            <div><dt>${ui.date}</dt><dd>${today}</dd></div>
                        </dl>
                    </div>
                `;
            };
            // ── Popup de pile de tweets : le MÊME rendu au survol et au clic ──
            // tweetStack = { key, features, coords, view: "list" | "detail", index, pinned }
            // Au survol la popup est interactive : on peut y amener la souris (délai de
            // fermeture + mouseenter/mouseleave sur la popup) pour cliquer une ligne,
            // changer de tweet ou revenir à la liste.
            // Délai avant fermeture de la popup de survol quand le curseur quitte le point
            // ou la popup (en ms). 0 = fermeture immédiate (le timer reste asynchrone : si le
            // curseur passe directement sur la popup, son mouseenter l'annule). Si la popup se
            // ferme avant qu'on puisse l'atteindre, passer à 100-150.
            const HOVER_CLOSE_DELAY_MS = 0;
            let tweetStack = null;
            let lastHoverTweetHTML = null;
            let hoverCloseTimer = null;
            let popupHovered = false;

            const renderTweetStack = (st) => {
                const lang = getCurrentLang();
                if (st.view === "list") return createPopupListHTML(st.features, lang, selectedTweetIdRef.current);
                const props = st.features[st.index].properties;
                const images = (() => { try { return JSON.parse(props.images); } catch { return []; } })();
                return createPopupHTML(
                    { ...props, images }, true, st.index, st.features.length,
                    true, false, false, lang, st.features.length > 1
                );
            };

            const updateTweetStack = () => {
                const st = tweetStack;
                if (!st) return;
                const p = st.pinned ? pinnedPopupRef.current : popup;
                if (!p) return;
                const html = renderTweetStack(st);
                // Redessin de la grille déjà ouverte : on garde la position de scroll,
                // sinon (première ouverture de la vue liste) on centre la ligne sélectionnée.
                const prevTop = p.getElement()?.querySelector(".tweet-list-items")?.scrollTop;
                p.setHTML(html);
                const newList = p.getElement()?.querySelector(".tweet-list-items");
                if (newList) {
                    if (prevTop != null) newList.scrollTop = prevTop;
                    else centerSelectedInList(p);
                }
                if (st.pinned) revealPointAboveSheet(map, p, st.coords);
                else lastHoverTweetHTML = html;
            };

            // Réassigné à chaque ouverture : la popup mobile de highlightTweet les remplace par des no-op
            const bindTweetStackNav = () => {
                window.navigateTweet = (index) => {
                    if (!tweetStack) return;
                    tweetStack.index = index;
                    tweetStack.view = "detail";
                    updateTweetStack();
                };
                window.showTweetList = () => {
                    if (!tweetStack) return;
                    tweetStack.view = "list";
                    updateTweetStack();
                };
            };

            const resetHoverTweetStack = () => {
                clearTimeout(hoverCloseTimer);
                popupHovered = false;
                lastHoverTweetHTML = null;
                if (tweetStack && !tweetStack.pinned) tweetStack = null;
                if (currentHoverPopup === 'tweet') currentHoverPopup = null;
            };
            window.__closeHoverTweetStack = resetHoverTweetStack;
            // Redessine la grille (vue liste) quand la sélection du SidePanel change
            window.__refreshTweetList = () => {
                if (tweetStack?.view === "list") updateTweetStack();
            };

            const scheduleHoverClose = (delay) => {
                clearTimeout(hoverCloseTimer);
                hoverCloseTimer = setTimeout(() => {
                    if (isHoveringTweet || popupHovered || pinnedPopupRef.current || isHoveringConflictArea) return;
                    // On ne retire la popup que si elle affiche encore un tweet
                    // (un détroit / une zone a pu la remplacer entre-temps).
                    if (popup.isOpen() && popup.getElement()?.querySelector(".tweet-card")) popup.remove();
                    resetHoverTweetStack();
                }, delay);
            };

            const bindHoverPopupEvents = () => {
                const el = popup.getElement();
                if (!el || el.__tweetHoverBound) return;
                el.__tweetHoverBound = true;
                isolatePopupEvents(popup);
                el.addEventListener("mouseenter", () => {
                    popupHovered = true;
                    clearTimeout(hoverCloseTimer);
                });
                el.addEventListener("mouseleave", () => {
                    popupHovered = false;
                    scheduleHoverClose(HOVER_CLOSE_DELAY_MS);
                });
            };

            const getStackKey = (features) =>
                features.map((f) => f.properties.url ?? String(f.properties.text ?? "").slice(0, 40)).join("|");

            map.on("mousemove", "tweets-hover-area", (e) => {
                // Sur mobile, les navigateurs tactiles émulent souvent un
                // mousemove/mouseenter juste avant le vrai "click" sur un tap.
                // Ce hover n'a aucun sens au doigt, et le popup qu'il ouvre ici
                // n'est jamais stylé "mobile" (className fixe sur `popup`) : il
                // s'affichait donc en plein sur le premier tap, à la place du
                // popup épinglé mobile, et consommait ce premier tap (d'où le
                // besoin de taper 2 fois). On coupe donc ce chemin sur mobile
                // et on laisse uniquement le handler "click" gérer l'ouverture.
                if (isMobileViewport()) return;
                if (pinnedPopupRef.current) return;
                // Souris au-dessus de la popup elle-même : MapLibre voit quand même le
                // mousemove (la popup est dans le conteneur du canvas) et interroge la
                // carte sous le curseur. On ignore, sinon la popup de survol est
                // ré-injectée (setHTML) et la vidéo en lecture est recréée.
                if (e.originalEvent?.target?.closest?.(".maplibregl-popup")) return;

                isHoveringTweet = true;
                isHoveringConflictArea = false;
                clearTimeout(hoverCloseTimer);

                if (currentHoverPopup !== 'tweet') {
                    conflictPopup.remove();
                    popup.remove();
                    currentHoverPopup = 'tweet';
                    tweetStack = null;
                    lastHoverTweetHTML = null;
                }

                if (!isDrawModeRef.current) map.getCanvas().style.cursor = 'pointer';

                const features = sortFeaturesByDateDesc(
                    map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                );

                if (!features.length) return;

                // Même pile qu'au mousemove précédent : on garde l'état (liste / détail / index)
                // pour ne pas écraser la navigation faite dans la popup.
                const key = getStackKey(features);
                if (!tweetStack || tweetStack.pinned || tweetStack.key !== key) {
                    tweetStack = {
                        key,
                        features,
                        coords: features[0].geometry.coordinates.slice(),
                        view: features.length > 1 ? "list" : "detail",
                        index: 0,
                        pinned: false,
                    };
                    lastHoverTweetHTML = null;
                }
                bindTweetStackNav();

                // mousemove tire en continu : on ne ré-injecte le HTML que s'il a changé
                // (évite de recharger les miniatures et de perdre le scroll de la liste).
                const html = renderTweetStack(tweetStack);
                if (popup.isOpen() && lastHoverTweetHTML === html) return;
                lastHoverTweetHTML = html;

                popup
                    .setLngLat(tweetStack.coords)
                    .setHTML(html)
                    .addTo(map);
                centerSelectedInList(popup);
                bindHoverPopupEvents();
            });

            map.on("mouseleave", "tweets-hover-area", () => {
                if (isMobileViewport()) return;
                isHoveringTweet = false;
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = '';

                // Délai : laisse le temps d'amener la souris sur la popup (qui reste
                // ouverte tant qu'elle est survolée).
                scheduleHoverClose(HOVER_CLOSE_DELAY_MS);
            });

            map.on("click", "tweets-hover-area", (e) => {
                // Clic venu de l'intérieur d'une popup : on ne recrée rien (la vidéo continue)
                if (e.originalEvent?.target?.closest?.(".maplibregl-popup")) return;
                e.originalEvent.stopPropagation();

                const features = sortFeaturesByDateDesc(
                    map.queryRenderedFeatures(e.point, { layers: ["tweets-hover-area"] })
                );

                if (!features.length) return;

                if (pinnedPopupRef.current) { pinnedPopupRef.current.remove(); setPinnedPopup(null); }
                // La popup de survol laisse la place à la popup épinglée
                if (popup.isOpen()) popup.remove();
                resetHoverTweetStack();

                const coords = features[0].geometry.coordinates.slice();
                const mobile = isMobileViewport();

                tweetStack = {
                    key: getStackKey(features),
                    features,
                    coords,
                    view: features.length > 1 ? "list" : "detail",
                    index: 0,
                    pinned: true,
                };
                bindTweetStackNav();

                const newPinnedPopup = new maptilersdk.Popup({
                    closeButton: mobile,
                    closeOnClick: !mobile,
                    maxWidth: "none",
                    className: mobile ? "tweet-popup tweet-popup--mobile" : "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(renderTweetStack(tweetStack))
                    .addTo(map);
                isolatePopupEvents(newPinnedPopup);
                centerSelectedInList(newPinnedPopup);

                setPinnedPopup(newPinnedPopup);
                newPinnedPopup.on("close", () => {
                    setPinnedPopup(null);
                    resetSheetPadding(map);
                    if (tweetStack?.pinned) tweetStack = null;
                });
                revealPointAboveSheet(map, newPinnedPopup, coords);
            });

            const getChokepointPopupHTML = (props, lang = getCurrentLang()) => {
                // Couleur de statut passée en variable CSS (--c) : le style vit dans MapView.css (.cp-status)
                const baseColor =
                    (props.status === "OPENED" || props.status === "OPEN") ? "16, 185, 129" :
                        props.status === "CLOSED" ? "237, 12, 12" :
                            props.status === "RESTRICTED" ? "255, 166, 0" :
                                "156, 156, 156";

                // reason_<lang> si dispo (fr, en, es...), sinon repli sur l'anglais puis la valeur brute.
                const reasonText = props[`reason_${lang}`] || (lang !== "fr" ? props.reason_en : "") || props.reason;

                return `
                    <div class="chokepoint-popup-inner" style="--c: ${baseColor}">
                        <div class="cp-head">
                            <span class="cp-name">${translateChokepoint(props.portname, lang)}</span>
                            <span class="cp-status">${translateChokepointStatus(props.status, lang)}</span>
                        </div>
                        ${reasonText ? `
                        <div class="cp-reason">
                            ${reasonText}
                            ${props.STATE_DURATION != null ? `
                            <div class="cp-duration">
                                ${chokepointDurationHTML(props.status, props.STATE_DURATION, lang)}
                            </div>` : ""}
                        </div>` : ""}
                    </div>
                `;
            };

            const showChokepointPopup = (props, coords) => {
                const currentLang = getCurrentLang();

                popup
                    .setLngLat(coords)
                    .setHTML(getChokepointPopupHTML(props, currentLang))
                    .addTo(map);

                // Le popup est un élément DOM posé au-dessus du canvas : s'il passe sous le
                // curseur, la carte reçoit un "mouseleave" => popup retiré => réapparition...
                // => clignotement. On le rend transparent aux événements souris.
                // ATTENTION : MapLibre force "pointer-events: auto" sur .maplibregl-popup-content
                // (le conteneur est en "none", pas son contenu). Il faut donc l'appliquer
                // aussi au contenu et aux enfants, sinon le texte capte la souris
                // (curseur de sélection de texte, popup impossible à rouvrir à cet endroit).
                const el = popup.getElement();
                if (el) {
                    [el, ...el.querySelectorAll("*")].forEach((node) => {
                        node.style.pointerEvents = "none";
                        node.style.userSelect = "none";
                    });
                }
            };

            // Survol de l'icône du chokepoint
            map.on("mouseenter", "chokepoints", (e) => {
                // Sur mobile, le tactile peut émuler des événements souris.
                // On laisse uniquement le click/tap gérer l'ouverture.
                if (isMobileViewport()) return;

                if (!e.features.length) return;
                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "pointer";

                showChokepointPopup(
                    e.features[0].properties,
                    e.features[0].geometry.coordinates.slice()
                );
            });

            map.on("mouseleave", "chokepoints", () => {
                if (isMobileViewport()) return;

                if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                if (!pinnedPopupRef.current) popup.remove();
            });

            // Survol des zones (CLOSED = aplat, RESTRICTED = hachures) :
            // ouvre le même popup que l'icône du chokepoint associé (via portname).
            const AREA_FILL_LAYERS = ["chokepoints-areas-fill-closed", "chokepoints-areas-fill-restricted"];
            const setAreaHighlight = (portname) => {
                const f = ['==', ['get', 'portname'], portname ?? ''];
                map.setFilter('chokepoints-areas-hover-fill', f);
            };

            // Un SEUL handler pour les deux couches de zones. Avec un mouseleave par couche,
            // le passage d'une zone à une autre (ou CLOSED <-> RESTRICTED, zones qui se
            // chevauchent) déclenchait leave => popup.remove() puis move => popup réaffiché.
            // Couches prioritaires : si le curseur est sur un tweet,
            // la zone dessous ne réagit pas (ni surbrillance, ni popup).
            const AREA_BLOCKING_LAYERS = ["tweets-hover-area"];
            let lastBlockedAt = 0;
            let highlightedPortname = null; // zone actuellement en surbrillance
            let areaPopupPortname = null;   // zone dont le popup est affiché
            let mobileChokepointClickConsumed = false;
            let mobileChokepointPopup = null;

            const clearAreaHover = () => {
                if (highlightedPortname !== null) {
                    highlightedPortname = null;
                    setAreaHighlight(null);
                }
                if (areaPopupPortname !== null) {
                    areaPopupPortname = null;
                    if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                    if (!pinnedPopupRef.current) popup.remove();
                }
            };

            map.on("mousemove", (e) => {
                // Sur mobile, les navigateurs tactiles peuvent émuler des événements
                // souris avant le vrai tap. Le popup mobile est donc géré uniquement
                // par les handlers "click".
                if (isMobileViewport()) return;

                if (isDrawModeRef.current) { clearAreaHover(); return; }

                // Curseur sur un tweet / topic location : ils ont la priorité sur la zone.
                // On coupe la surbrillance et on lâche la main sur le popup (c'est le
                // handler du tweet / topic qui l'a déjà remplacé ou fermé : ne pas le retirer ici).
                if (map.queryRenderedFeatures(e.point, { layers: AREA_BLOCKING_LAYERS }).length) {
                    lastBlockedAt = performance.now();
                    if (highlightedPortname !== null) {
                        highlightedPortname = null;
                        setAreaHighlight(null);
                    }
                    areaPopupPortname = null;
                    return;
                }

                const areaFeature = map.queryRenderedFeatures(e.point, { layers: AREA_FILL_LAYERS })[0];
                const portname = areaFeature?.properties?.portname ?? null;

                if (portname !== highlightedPortname) {
                    highlightedPortname = portname;
                    setAreaHighlight(portname);
                }

                if (!portname) {
                    if (areaPopupPortname !== null) clearAreaHover();
                    return;
                }
                if (pinnedPopupRef.current) return;

                // Juste après avoir quitté un tweet : son mouseleave retire le popup avec
                // un délai de 20 ms. On attend un peu pour ne pas afficher puis effacer.
                if (performance.now() - lastBlockedAt < 40) return;

                // L'icône est au-dessus de la zone : son propre handler gère le popup
                if (map.queryRenderedFeatures(e.point, { layers: ["chokepoints"] }).length) {
                    areaPopupPortname = null;
                    return;
                }

                const alreadyShown = portname === areaPopupPortname && popup.isOpen();
                // popup ouvert mais pas à nous (tweet, icône) : on ne l'écrase pas
                const foreignPopupOpen = areaPopupPortname === null && popup.isOpen();
                if (alreadyShown || foreignPopupOpen) return;

                const pointFeature = chokepointsDataRef.current?.features?.find(
                    (f) => f.properties.portname === portname
                );
                if (!pointFeature) return;

                areaPopupPortname = portname;
                map.getCanvas().style.cursor = "pointer";
                showChokepointPopup(
                    pointFeature.properties,
                    pointFeature.geometry.coordinates.slice()
                );
            });

            // Sur mobile : un tap dans la zone ouvre une popup épinglée.
            // Le popup est volontairement séparé du popup de hover desktop afin que
            // le comportement "tap ailleurs = fermeture" soit parfaitement maîtrisé.
            map.on("click", AREA_FILL_LAYERS, (e) => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (!e.features?.length) return;

                // Un tweet sous le doigt a la priorité sur la zone (comme au survol
                // desktop). Les handlers "click" de MapLibre sont tous appelés pour
                // un même tap (e.originalEvent.stopPropagation() n'empêche pas les
                // autres handlers de la carte) : sans cette garde, la popup du
                // chokepoint remplaçait / recouvrait celle du tweet. On sort ici
                // SANS poser mobileChokepointClickConsumed : le handler du tweet
                // s'occupe du tap, et le tap "ailleurs" ferme l'éventuelle popup
                // chokepoint précédente.
                if (map.queryRenderedFeatures(e.point, { layers: AREA_BLOCKING_LAYERS }).length) return;

                mobileChokepointClickConsumed = true;
                setTimeout(() => {
                    mobileChokepointClickConsumed = false;
                }, 0);

                e.originalEvent.stopPropagation();

                const areaFeature = e.features[0];
                const portname = areaFeature.properties?.portname;
                if (!portname) return;

                const pointFeature = chokepointsDataRef.current?.features?.find(
                    (f) => f.properties?.portname === portname
                );
                if (!pointFeature) return;

                const props = pointFeature.properties;
                const coords = pointFeature.geometry.coordinates.slice();

                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                }
                if (mobileChokepointPopup) {
                    mobileChokepointPopup.remove();
                    mobileChokepointPopup = null;
                }

                setAreaHighlight(portname);
                areaPopupPortname = portname;

                const mobilePopup = new maptilersdk.Popup({
                    closeButton: false,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(getChokepointPopupHTML(props))
                    .addTo(map);

                mobileChokepointPopup = mobilePopup;
                setPinnedPopup(mobilePopup);

                mobilePopup.on("close", () => {
                    if (pinnedPopupRef.current !== mobilePopup) return;

                    setPinnedPopup(null);
                    mobileChokepointPopup = null;
                    areaPopupPortname = null;
                    setAreaHighlight(null);
                    resetSheetPadding(map);
                });
            });

            // Sur mobile, un tap sur l'icône elle-même doit avoir exactement le
            // même comportement qu'un tap dans la zone.
            map.on("click", "chokepoints", (e) => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (!e.features?.length) return;

                mobileChokepointClickConsumed = true;
                setTimeout(() => {
                    mobileChokepointClickConsumed = false;
                }, 0);

                e.originalEvent.stopPropagation();

                const feature = e.features[0];
                const props = feature.properties;
                const coords = feature.geometry.coordinates.slice();

                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                }
                if (mobileChokepointPopup) {
                    mobileChokepointPopup.remove();
                    mobileChokepointPopup = null;
                }

                const mobilePopup = new maptilersdk.Popup({
                    closeButton: false,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(coords)
                    .setHTML(getChokepointPopupHTML(props))
                    .addTo(map);

                mobileChokepointPopup = mobilePopup;
                setPinnedPopup(mobilePopup);

                mobilePopup.on("close", () => {
                    if (pinnedPopupRef.current !== mobilePopup) return;

                    setPinnedPopup(null);
                    mobileChokepointPopup = null;
                    areaPopupPortname = null;
                    setAreaHighlight(null);
                    resetSheetPadding(map);
                });
            });

            // Tap ailleurs sur la carte : fermeture de la popup chokepoint mobile.
            // Les handlers de zone / icône posent mobileChokepointClickConsumed pour
            // que leur propre tap ne soit pas immédiatement interprété comme un tap
            // "ailleurs".
            map.on("click", (e) => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (mobileChokepointClickConsumed) return;

                if (mobileChokepointPopup) {
                    mobileChokepointPopup.remove();
                    mobileChokepointPopup = null;
                }

                areaPopupPortname = null;
                setAreaHighlight(null);
            });

            // ═══════════════════════════════════════════
            // Zones de conflit : popup au survol (desktop) / au tap (mobile)
            // Même fonctionnement que les zones de détroits :
            //  - même conteneur (ancré dans le coin de la carte, cf. MapView.css)
            //  - surbrillance du fond au survol
            //  - priorités : tweet > icône / zone de détroit > zone de conflit
            // ═══════════════════════════════════════════
            const CONFLICT_ZONE_FILL_LAYERS = ["conflict-zones-tint"];
            // Couches prioritaires sur une zone de conflit
            const CONFLICT_ZONE_BLOCKING_LAYERS = ["tweets-hover-area", "chokepoints", ...AREA_FILL_LAYERS];

            // Les propriétés lues via queryRenderedFeatures sont sérialisées :
            // les tableaux reviennent sous forme de chaîne JSON.
            const parseZoneList = (value) => {
                if (Array.isArray(value)) return value;
                if (typeof value !== "string" || !value) return [];
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            };

            const getConflictZonePopupHTML = (props) => {
                const tr = tRef.current; // traductions de LangContext (langue active)
                const nb = Number(props.nb_events) || 0;
                const actor = props.actor ?? "";
                const countries = parseZoneList(props.countries);

                // Un acteur peut être un pays (world_areas.entity_name_fr) ou un acteur non
                // étatique (NON_STATE_ACTORS.name_fr) : on essaie d'abord le dictionnaire des
                // pays, puis celui des acteurs. Les deux renvoient la valeur brute si inconnue.
                const translateName = (name) => {
                    const asEntity = translateEntityRef.current(name);
                    return asEntity !== name ? asEntity : translateActorRef.current(name);
                };

                // Une zone = un acteur (props.actor) : il est déjà affiché en titre,
                // on le retire donc des listes d'acteurs pour ne garder que ses adversaires / alliés.
                const withoutMain = (list) => list.filter((a) => a !== actor);
                const rawStateActors = parseZoneList(props.state_actors);
                const stateActors = withoutMain(rawStateActors).map(translateEntityRef.current);

                const rawNonStateActors = parseZoneList(props.non_state_actors);

                // Conflit interne : aucun acteur non étatique, et les États impliqués sont
                // exactement les pays où se déroulent les événements
                // (comparaison d'ensembles, indépendante de l'ordre).
                const isInternal =
                    rawNonStateActors.length === 0 &&
                    countries.length > 0 &&
                    new Set(rawStateActors).size === new Set(countries).size &&
                    countries.every((c) => rawStateActors.includes(c));
                const nonStateActors = withoutMain(rawNonStateActors)
                    .map(translateActorRef.current);

                const row = (label, list) => list.length ? `
                    <div class="cz-actors">
                        <span class="cz-actors-label">${label}</span>
                        <span class="cz-actors-list">${list.join(", ")}</span>
                    </div>` : "";

                const internalLabel = tr.internalConflict;
                const internalHTML = isInternal
                    ? `<div class="cz-actors"><span class="cz-actors-list"><strong>${internalLabel}</strong></span></div>`
                    : "";
                const detailsHTML =
                    internalHTML +
                    row(tr.stateActors, stateActors) +
                    row(tr.nonStateActors, nonStateActors);

                // --c : couleur du badge (rouge, comme les zones de conflit sur la carte)
                return `
                    <div class="chokepoint-popup-inner conflict-zone-popup-inner" style="--c: 237, 12, 12">
                        <div class="cp-head">
                            <div class="cz-force">
                                <span class="cz-kicker">${tr.forceInPresence}</span>
                                <span class="cp-name">${translateName(actor)}</span>
                            </div>
                            <div class="cz-meta">
                                <span class="cz-kicker">${tr.conflictZone}</span>
                                <span class="cp-status">${tr.eventsCount(nb)}</span>
                            </div>
                        </div>
                        ${detailsHTML ? `<div class="cp-reason">${detailsHTML}</div>` : ""}
                    </div>
                `;
            };

            const setConflictZoneHighlight = (zid) => {
                map.setFilter("conflict-zones-hover-fill", ["==", ["get", "zid"], zid ?? -1]);
            };

            // Même mécanisme que showChokepointPopup : popup transparent aux événements souris
            const showConflictZonePopup = (props, coords) => {
                popup
                    .setLngLat(coords)
                    .setHTML(getConflictZonePopupHTML(props))
                    .addTo(map);

                const el = popup.getElement();
                if (el) {
                    [el, ...el.querySelectorAll("*")].forEach((node) => {
                        node.style.pointerEvents = "none";
                        node.style.userSelect = "none";
                    });
                }
            };

            let czLastBlockedAt = 0;
            let highlightedZoneId = null; // zone en surbrillance
            let zonePopupId = null;       // zone dont le popup est affiché
            let mobileZoneClickConsumed = false;
            let mobileZonePopup = null;

            const clearConflictZoneHover = () => {
                if (highlightedZoneId !== null) {
                    highlightedZoneId = null;
                    setConflictZoneHighlight(null);
                }
                if (zonePopupId !== null) {
                    zonePopupId = null;
                    if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                    if (!pinnedPopupRef.current) popup.remove();
                }
            };

            map.on("mousemove", (e) => {
                if (isMobileViewport()) return;

                if (isDrawModeRef.current) { clearConflictZoneHover(); return; }

                // Un tweet / une icône / une zone de détroit sous le curseur ont la priorité :
                // on coupe la surbrillance et on lâche la main sur le popup (leur handler l'a
                // déjà remplacé ou fermé : ne pas le retirer ici).
                if (map.queryRenderedFeatures(e.point, { layers: CONFLICT_ZONE_BLOCKING_LAYERS }).length) {
                    czLastBlockedAt = performance.now();
                    if (highlightedZoneId !== null) {
                        highlightedZoneId = null;
                        setConflictZoneHighlight(null);
                    }
                    if (zonePopupId !== null) {
                        zonePopupId = null;
                        // Le curseur est sur une couche prioritaire : on retire notre popup
                        // (sauf s'il a déjà été remplacé par celui de la couche prioritaire).
                        if (!pinnedPopupRef.current && !isHoveringTweet) popup.remove();
                    }
                    return;
                }

                const zoneFeature = pickSmallestZone(map.queryRenderedFeatures(e.point, { layers: CONFLICT_ZONE_FILL_LAYERS }));
                const zid = zoneFeature?.properties?.zid ?? null;

                if (zid !== highlightedZoneId) {
                    highlightedZoneId = zid;
                    setConflictZoneHighlight(zid);
                }

                if (zid === null) {
                    if (zonePopupId !== null) clearConflictZoneHover();
                    return;
                }
                if (pinnedPopupRef.current) return;

                // Juste après avoir quitté une couche prioritaire : son mouseleave retire le
                // popup avec un délai de 20 ms. On attend un peu pour ne pas afficher puis effacer.
                if (performance.now() - czLastBlockedAt < 40) return;

                const alreadyShown = zid === zonePopupId && popup.isOpen();
                // popup ouvert mais pas à nous (tweet, détroit) : on ne l'écrase pas
                const foreignPopupOpen = zonePopupId === null && popup.isOpen();
                if (alreadyShown || foreignPopupOpen) return;

                zonePopupId = zid;
                map.getCanvas().style.cursor = "pointer";
                showConflictZonePopup(zoneFeature.properties, [e.lngLat.lng, e.lngLat.lat]);
            });

            // Sur mobile : un tap dans la zone ouvre une popup épinglée.
            map.on("click", CONFLICT_ZONE_FILL_LAYERS, (e) => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (!e.features?.length) return;

                // Tweet / icône / zone de détroit sous le doigt : ils ont la priorité.
                // On sort SANS poser mobileZoneClickConsumed (le tap ferme alors une éventuelle
                // popup de zone précédente).
                if (map.queryRenderedFeatures(e.point, { layers: CONFLICT_ZONE_BLOCKING_LAYERS }).length) return;

                mobileZoneClickConsumed = true;
                setTimeout(() => { mobileZoneClickConsumed = false; }, 0);

                e.originalEvent.stopPropagation();

                const props = pickSmallestZone(
                    map.queryRenderedFeatures(e.point, { layers: CONFLICT_ZONE_FILL_LAYERS })
                )?.properties ?? e.features[0].properties;
                const zid = props?.zid ?? null;

                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                }
                if (mobileZonePopup) {
                    mobileZonePopup.remove();
                    mobileZonePopup = null;
                }

                setConflictZoneHighlight(zid);
                zonePopupId = zid;

                const zonePopup = new maptilersdk.Popup({
                    closeButton: false,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(e.lngLat)
                    .setHTML(getConflictZonePopupHTML(props))
                    .addTo(map);

                mobileZonePopup = zonePopup;
                setPinnedPopup(zonePopup);

                zonePopup.on("close", () => {
                    if (pinnedPopupRef.current !== zonePopup) return;

                    setPinnedPopup(null);
                    mobileZonePopup = null;
                    zonePopupId = null;
                    setConflictZoneHighlight(null);
                    resetSheetPadding(map);
                });
            });

            // Tap ailleurs sur la carte : fermeture de la popup de zone mobile.
            map.on("click", () => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (mobileZoneClickConsumed) return;

                if (mobileZonePopup) {
                    mobileZonePopup.remove();
                    mobileZonePopup = null;
                }

                zonePopupId = null;
                setConflictZoneHighlight(null);
            });

            // Le curseur quitte complètement la carte
            map.getCanvas().addEventListener("mouseleave", clearAreaHover);
            map.getCanvas().addEventListener("mouseleave", clearConflictZoneHover);

            // ═══════════════════════════════════════════
            // Théâtres / frontières de conflit : sélection de la paire de pays
            // (country_a / country_b). Survol (desktop) ou tap (mobile) sur le théâtre OU sur
            // la frontière => les deux sont mis en surbrillance + popup dans le même
            // conteneur que les zones de détroits (coin de la carte, cf. MapView.css).
            // Priorités : tweet / détroit / zone de conflit > théâtre / frontière.
            // ═══════════════════════════════════════════
            const PAIR_HIT_LAYERS = ["conflict-theaters-fill", "conflict-borders"];
            const PAIR_BLOCKING_LAYERS = [...CONFLICT_ZONE_BLOCKING_LAYERS, ...CONFLICT_ZONE_FILL_LAYERS];

            // Paire non ordonnée : (A, B) et (B, A) désignent la même paire
            const pairFilter = (a, b) => ["any",
                ["all", ["==", ["get", "country_a"], a], ["==", ["get", "country_b"], b]],
                ["all", ["==", ["get", "country_a"], b], ["==", ["get", "country_b"], a]],
            ];
            const setPairHighlight = (a, b) => {
                const f = a && b ? pairFilter(a, b) : ["==", ["get", "country_a"], "__none__"];
                map.setFilter("conflict-pair-hover-fill", f);
                map.setFilter("conflict-pair-hover-line", f);
            };
            const pairKeyOf = (a, b) => [a, b].sort().join("|");

            // Zone de test élargie de quelques pixels : la frontière ne fait que 2px de large.
            const queryPair = (point) => {
                const pad = 5;
                const hit = map.queryRenderedFeatures(
                    [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]],
                    { layers: PAIR_HIT_LAYERS }
                )[0];
                const a = hit?.properties?.country_a;
                const b = hit?.properties?.country_b;
                return a && b ? { a, b, props: hit.properties } : null;
            };

            const getPairPopupHTML = (a, b, props = {}) => {
                const tr = translateEntityRef.current; // noms de pays (world_areas.entity_name_fr)
                const lang = langRef.current;
                const L = tRef.current; // libellés centralisés dans LangContext
                const nf = new Intl.NumberFormat(lang);

                const hasStats = props.total_actions != null;
                let statsHTML = "";
                if (hasStats) {
                    // first_action = "YYYY-MM-DD" : lu et affiché en UTC pour éviter tout décalage de jour
                    const since = props.first_action
                        ? new Date(props.first_action).toLocaleDateString(lang, {
                            day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                        })
                        : null;
                    const days = Math.max(1, Number(props.duration_days) || 0);
                    const stat = (label, value) => `
                        <div class="cp-pair-stat">
                            <span class="cp-pair-stat-label">${label}</span>
                            <span class="cp-pair-stat-value">${value}</span>
                        </div>`;
                    statsHTML = `
                        <div class="cp-pair-stats">
                            ${since ? stat(L.pairSince, since) : ""}
                            ${stat(L.pairDuration, L.daysCount(days))}
                            ${stat(L.pairTotalActions, nf.format(props.total_actions))}
                            ${props.active_days != null ? stat(L.pairActiveDays, nf.format(props.active_days)) : ""}
                        </div>`;
                }

                return `
                    <div class="chokepoint-popup-inner conflict-zone-popup-inner conflict-pair-popup-inner" style="--c: 237, 12, 12">
                        <div class="cp-head">
                            <span class="cp-name">${tr(a)} – ${tr(b)}</span>
                        </div>
                        <div class="cp-reason">
                            <div class="cz-actors"><span class="cz-actors-list"><strong>${tRef.current.militaryTheater}</strong></span></div>
                            ${statsHTML}
                        </div>
                    </div>
                `;
            };

            // Le popup partagé est-il encore le nôtre ? (un tweet / un détroit a pu le remplacer)
            const isPairPopupShown = () =>
                popup.isOpen() && !!popup.getElement()?.querySelector(".conflict-pair-popup-inner");

            const showPairPopup = (a, b, lngLat, props) => {
                popup.setLngLat(lngLat).setHTML(getPairPopupHTML(a, b, props)).addTo(map);
                const el = popup.getElement();
                if (el) {
                    [el, ...el.querySelectorAll("*")].forEach((node) => {
                        node.style.pointerEvents = "none";
                        node.style.userSelect = "none";
                    });
                }
            };

            let pairLastBlockedAt = 0;
            let highlightedPairKey = null; // paire en surbrillance
            let pairPopupKey = null;       // paire dont le popup est affiché
            let mobilePairPopup = null;

            const clearPairHover = () => {
                if (highlightedPairKey !== null) {
                    highlightedPairKey = null;
                    setPairHighlight(null);
                }
                if (pairPopupKey !== null) {
                    pairPopupKey = null;
                    if (!isDrawModeRef.current) map.getCanvas().style.cursor = "";
                    // On ne retire le popup que s'il est encore le nôtre
                    if (!pinnedPopupRef.current && isPairPopupShown()) popup.remove();
                }
            };

            map.on("mousemove", (e) => {
                if (isMobileViewport()) return;
                if (isDrawModeRef.current) { clearPairHover(); return; }

                if (map.queryRenderedFeatures(e.point, { layers: PAIR_BLOCKING_LAYERS }).length) {
                    pairLastBlockedAt = performance.now();
                    clearPairHover();
                    return;
                }

                const pair = queryPair(e.point);
                if (!pair) { clearPairHover(); return; }

                const key = pairKeyOf(pair.a, pair.b);
                if (key !== highlightedPairKey) {
                    highlightedPairKey = key;
                    setPairHighlight(pair.a, pair.b);
                }
                if (pinnedPopupRef.current) return;

                // Juste après une couche prioritaire : son mouseleave retire le popup avec un délai
                if (performance.now() - pairLastBlockedAt < 40) return;

                const alreadyShown = key === pairPopupKey && popup.isOpen();
                // popup ouvert mais pas à nous (tweet, détroit, zone) : on ne l'écrase pas
                const foreignPopupOpen = pairPopupKey === null && popup.isOpen();
                if (alreadyShown || foreignPopupOpen) return;

                pairPopupKey = key;
                map.getCanvas().style.cursor = "pointer";
                showPairPopup(pair.a, pair.b, [e.lngLat.lng, e.lngLat.lat], pair.props);
            });

            // Sur mobile : un tap sur le théâtre / la frontière ouvre une popup épinglée.
            map.on("click", (e) => {
                if (!isMobileViewport() || isDrawModeRef.current) return;
                if (map.queryRenderedFeatures(e.point, { layers: PAIR_BLOCKING_LAYERS }).length) return;

                const pair = queryPair(e.point);
                if (!pair) return; // tap ailleurs : la popup se ferme seule (closeOnClick)

                e.originalEvent.stopPropagation();

                if (pinnedPopupRef.current) {
                    pinnedPopupRef.current.remove();
                    setPinnedPopup(null);
                }
                if (mobilePairPopup) {
                    mobilePairPopup.remove();
                    mobilePairPopup = null;
                }

                setPairHighlight(pair.a, pair.b);

                const pairPopup = new maptilersdk.Popup({
                    closeButton: false,
                    closeOnClick: true,
                    maxWidth: "none",
                    className: "tweet-popup",
                    anchor: "bottom",
                })
                    .setLngLat(e.lngLat)
                    .setHTML(getPairPopupHTML(pair.a, pair.b, pair.props))
                    .addTo(map);

                mobilePairPopup = pairPopup;
                setPinnedPopup(pairPopup);

                pairPopup.on("close", () => {
                    setPairHighlight(null);
                    if (mobilePairPopup === pairPopup) mobilePairPopup = null;
                    if (pinnedPopupRef.current !== pairPopup) return;
                    setPinnedPopup(null);
                    resetSheetPadding(map);
                });
            });

            map.getCanvas().addEventListener("mouseleave", clearPairHover);


            // ═══════════════════════════════════════════
            // Pays : contours au survol, sélection au clic (reclic = désélection).
            // Les tweets / lignes militaires sont ensuite filtrés sur le pays sélectionné
            // (voir l'effet de filtrage : filterByCountry).
            // Données chargées en arrière-plan (GET /countries), sans bloquer l'affichage.
            // ═══════════════════════════════════════════
            const COUNTRY_FILL = "countries-fill";
            const csel = ["boolean", ["feature-state", "selected"], false];
            const chov = ["boolean", ["feature-state", "hover"], false];

            let hoveredCountry = null;
            const setCountryHover = (name) => {
                if (name === hoveredCountry) return;
                if (hoveredCountry !== null) map.setFeatureState({ source: "countries", id: hoveredCountry }, { hover: false });
                hoveredCountry = name;
                if (name !== null) map.setFeatureState({ source: "countries", id: name }, { hover: true });
            };

            let paintedSelected = null;
            map.__applyCountrySelected = (name) => {
                if (!map.getSource("countries")) return;
                if (paintedSelected !== null) map.setFeatureState({ source: "countries", id: paintedSelected }, { selected: false });
                paintedSelected = name ?? null;
                if (paintedSelected !== null) map.setFeatureState({ source: "countries", id: paintedSelected }, { selected: true });
            };
            map.__reapplyCountryState = () => {
                hoveredCountry = null;
                if (paintedSelected !== null && map.getSource("countries")) {
                    map.setFeatureState({ source: "countries", id: paintedSelected }, { selected: true });
                }
            };

            // Desktop : seuls tweets et icônes de détroit sont prioritaires sur le pays.
            // Mobile : un tap ouvre déjà une popup sur les zones / détroits, on s'en écarte aussi.
            const countryBlockingLayers = () =>
                isMobileViewport() ? PAIR_BLOCKING_LAYERS : ["tweets-hover-area", "chokepoints"];
            const queryCountry = (point) => {
                if (!map.getLayer(COUNTRY_FILL)) return null;
                const blocking = countryBlockingLayers().filter((id) => map.getLayer(id));
                if (blocking.length && map.queryRenderedFeatures(point, { layers: blocking }).length) return null;
                return map.queryRenderedFeatures(point, { layers: [COUNTRY_FILL] })[0]?.properties?.name ?? null;
            };

            map.on("mousemove", (e) => {
                if (isMobileViewport()) return;
                if (isDrawModeRef.current) { setCountryHover(null); return; }
                setCountryHover(queryCountry(e.point));
            });
            map.getCanvas().addEventListener("mouseleave", () => setCountryHover(null));

            map.on("click", (e) => {
                if (isDrawModeRef.current) return;
                if (e.originalEvent?.target?.closest?.(".maplibregl-popup")) return;
                const name = queryCountry(e.point);
                if (!name) return;
                const next = selectedCountryRef.current === name ? null : name;
                selectedCountryRef.current = next;
                setSelectedCountry(next);
            });

            fetch(`${API}/countries`)
                .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
                .then((fc) => {
                    if (!mapRef.current || map.getSource("countries")) return;
                    countryIndexRef.current = buildCountryIndex(fc);
                    // promoteId : l'id de feature-state est le nom du pays
                    map.addSource("countries", { type: "geojson", data: fc, promoteId: "name" });
                    // Sous toutes les couches de données (zones, lignes, tweets, détroits...)
                    const beforeId = map.getLayer("chokepoints-areas-fill-closed") ? "chokepoints-areas-fill-closed" : undefined;
                    // Aplat quasi transparent : sert de cible de survol / clic (opacité 0 = toujours interrogeable)
                    map.addLayer({
                        id: COUNTRY_FILL, type: "fill", source: "countries",
                        paint: {
                            "fill-color": ["case", csel, "#4f9dff", "#ffffff"],
                            "fill-opacity": ["case", csel, 0.12, chov, 0.06, 0],
                        },
                    }, beforeId);
                    map.addLayer({
                        id: "countries-outline", type: "line", source: "countries",
                        layout: { "line-join": "round" },
                        paint: {
                            "line-color": ["case", csel, "#4f9dff", "#ffffff"],
                            "line-width": ["case", csel, 2, 1.5],
                            "line-opacity": ["case", csel, 1, chov, 0.9, 0],
                        },
                    }, beforeId);
                    map.__applyCountrySelected(selectedCountryRef.current);
                    // Un pays déjà sélectionné ne peut pas exister ici, mais on relance le filtrage par sécurité
                    setTweetsRevision((v) => v + 1);
                })
                .catch((err) => console.warn("/countries indisponible :", err));

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

                // Pendant un changement de fond de carte (setStyle), la couche n'existe pas
                // encore : on saute la mise à jour mais on garde la boucle active.
                if (map.getLayer('military-lines-pulse')) {
                    map.setPaintProperty('military-lines-pulse', 'line-gradient', buildGradient(center, 0.02));
                }

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
                // Idem : couche absente pendant le rechargement du style.
                if (map.getLayer('pulse-high-importance_score')) {
                    map.setPaintProperty('pulse-high-importance_score', 'circle-stroke-opacity', 0);
                    map.setPaintProperty('pulse-high-importance_score', 'circle-opacity', opacity * 1);
                    map.setPaintProperty('pulse-high-importance_score', 'circle-radius', radius);
                }
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

            // Toutes les couches sont en place (et l'événement "load" garantit que le style
            // et les tuiles initiales sont prêts) : on révèle la carte tout de suite, sans
            // attendre la fin d'un éventuel vol vers un tweet (les tuiles se rechargent
            // pendant tout le zoom, ce qui retardait l'affichage jusqu'à l'arrivée).
            revealMap();
        });

        return () => {
            clearTimeout(fallbackTimer);
            clearTimeout(revealTimer);
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            if (militaryPulseFrameRef.current) {
                cancelAnimationFrame(militaryPulseFrameRef.current);
                militaryPulseFrameRef.current = null;
            }
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Change la langue des étiquettes de la carte quand l'utilisateur bascule FR/EN.
    // (La langue initiale est déjà passée au constructeur de la carte.)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || appliedMapLangRef.current === mapLanguage) return;

        const apply = () => {
            map.setLanguage(mapLanguage);
            appliedMapLangRef.current = mapLanguage;
        };

        if (map.isStyleLoaded()) {
            apply();
            return;
        }
        // Style pas encore prêt : on applique dès qu'il l'est.
        map.once("load", apply);
        return () => map.off("load", apply);
    }, [mapLanguage]);

    // Active/désactive automatiquement le mode performance dès qu'on franchit le seuil
    // (dans un sens ou dans l'autre), sans écraser un toggle manuel tant que le seuil
    // n'est pas re-franchi. Sur mobile, les pulses sont systématiquement désactivées
    // (moins utiles sur petit écran et plus coûteuses côté perf/batterie), qu'on soit
    // ou non au-dessus du seuil de tweets.
    const wasAboveThresholdRef = useRef(false);
    useEffect(() => {
        const evaluate = () => {
            const isAbove = tweetCount > PERFORMANCE_MODE_THRESHOLD || isMobileViewport();
            if (isAbove !== wasAboveThresholdRef.current) {
                setPerformanceMode(isAbove);
                wasAboveThresholdRef.current = isAbove;
            }
        };
        evaluate();
        // Réévalue au redimensionnement/rotation d'écran, pas seulement quand
        // tweetCount change, puisque isMobileViewport() peut changer seule.
        window.addEventListener('resize', evaluate);
        return () => window.removeEventListener('resize', evaluate);
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
            // Pays sélectionné : on isole les tweets / lignes dont le point tombe dans ses contours
            const countryPolys = selectedCountry ? countryIndexRef.current?.get(selectedCountry) : null;
            const enrichedTweets = buildEnrichedTweets(allTweetsRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral, lang);
            const filteredTweets = filterByCountry(enrichedTweets, countryPolys, "point");

            // Le tweet sélectionné est sorti du jeu filtré (topic, période, armes,
            // objectifs, recherche, rectangle) : on retire le pulse et on désélectionne.
            const selId = selectedTweetIdRef.current;
            if (selId != null && !filteredTweets.features.some((f) => f.properties?.id === selId)) {
                clearHighlightSource(map); // coupe aussi la boucle d'animation du pulse
                if (pinnedPopupRef.current) { // popup mobile éventuelle
                    const p = pinnedPopupRef.current;
                    pinnedPopupRef.current = null; // évite que le handler "close" ne se redéclenche
                    p.remove();
                    resetSheetPadding(map);
                }
                onTweetPopupCloseRef.current?.(); // le parent fait setSelectedTweetId(null)
            }

            const tweetSource = map.getSource("tweets");
            if (tweetSource) {
                tweetSource.setData(filteredTweets);
                setDataTweets(filteredTweets);
                if (onTweetsLoaded) onTweetsLoaded(filteredTweets);
            }

            // 7. Idem pour les lignes militaires (mêmes filtres armes/objectifs + période)
            if (allMilitaryLinesRef.current) {
                const filteredLines = filterByCountry(
                    filterTweets(allMilitaryLinesRef.current, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral, lang),
                    countryPolys, "line"
                );
                const militaryLinesSource = map.getSource("military-lines");
                if (militaryLinesSource) militaryLinesSource.setData(filteredLines);
            }
        }

        // 8. Affiche/masque le contour de la topic area sur la carte en fonction
        // du topic sélectionné dans le SidePanel (activeLabel).
        if (map.getLayer("topics-areas-selected-outline")) {
            // Priorité au topic du SidePanel ; à défaut, l'area activée par le panneau Théâtres
            const topicFilter = activeLabel
                ? ['==', ['get', 'label'], activeLabel]
                : theaterOutlineIdRef.current !== null
                    ? ['==', ['get', 'topic_id'], theaterOutlineIdRef.current]
                    : ['==', ['get', 'label'], ''];
            map.setFilter("topics-areas-selected-outline", topicFilter);
        }

        prevActiveLabelRef.current = activeLabel;
    }, [timeRange.start, timeRange.end, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, drawnQuadrilateral, lang, tweetsRevision, selectedCountry]);

    // /tweets/older fusionné après le chargement initial : on remplace le jeu complet
    // de tweets / lignes militaires et on relance le filtrage (effet ci-dessus).
    // Si la carte n'a pas encore chargé ses données, loadAllData lira directement
    // la version fusionnée (latestBootstrapRef).
    useEffect(() => {
        if (!bootstrapData?.merged || !allTweetsRef.current) return;
        if (allTweetsRef.current === bootstrapData.tweets) return;
        const emptyFC = { type: "FeatureCollection", features: [] };
        allTweetsRef.current = bootstrapData.tweets ?? emptyFC;
        allMilitaryLinesRef.current = bootstrapData.military_lines ?? emptyFC;
        window.__debugTweets = allTweetsRef.current;
        setTweetsRevision((v) => v + 1);
    }, [bootstrapData]);

    // ── Panneau Théâtres : active la topic area du théâtre choisi + cadre la carte dessus ──
    // topic === null : on désactive l'area (retour à la liste / fermeture du panneau).
    const applyTheaterOutline = (map, topicId) => {
        theaterOutlineIdRef.current = topicId;
        if (!map.getLayer("topics-areas-selected-outline")) return;
        // Le topic sélectionné dans le SidePanel (activeLabel) garde la priorité
        const filter = activeLabelRef.current
            ? ['==', ['get', 'label'], activeLabelRef.current]
            : topicId !== null && topicId !== undefined
                ? ['==', ['get', 'topic_id'], topicId]
                : ['==', ['get', 'label'], ''];
        map.setFilter("topics-areas-selected-outline", filter);
    };

    const getBBox = (geometry) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const walk = (c) => {
            if (typeof c[0] === "number") {
                minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
                minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
            } else c.forEach(walk);
        };
        walk(geometry.coordinates);
        return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
    };

    const handleSelectTheater = (topic, opts) => {
        const map = mapRef.current;
        if (!map) return;
        if (!topic) { applyTheaterOutline(map, null); return; }

        const areas = (bootstrapData?.topics_areas?.features || []).filter(
            (f) => String(f.properties?.topic_id) === String(topic.TOPIC_ID)
        );
        if (areas.length === 0) { applyTheaterOutline(map, null); return; }

        applyTheaterOutline(map, areas[0].properties.topic_id);

        // Cadre la carte sur l'ensemble des polygones du topic
        const boxes = areas.map((f) => f.geometry && getBBox(f.geometry)).filter(Boolean);
        if (boxes.length === 0) return;
        // Ouverture depuis l'URL : si le lien porte aussi une vue de carte (view=...),
        // c'est elle qui prime sur le cadrage automatique du théâtre.
        if (opts?.initial && initialViewRef.current) return;
        const bounds = [
            [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
            [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
        ];
        const mobile = isMobileViewport();
        map.fitBounds(bounds, {
            padding: { top: 60, bottom: 60, left: mobile ? 30 : 370, right: 30 },
            maxZoom: 6,
            duration: 800,
        });
    };

    // À la fermeture du panneau, on désactive l'area
    useEffect(() => {
        if (theatersOpen || theaterOutlineIdRef.current === null) return;
        if (mapRef.current) applyTheaterOutline(mapRef.current, null);
    }, [theatersOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
        a.download = `osintwatch_export_${startDate}_${endDate}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ── Copier le lien (permalink) ──
    // L'URL est construite uniquement à la demande, à partir de l'état courant :
    // la barre d'adresse n'est jamais modifiée (pas d'entrées dans l'historique).
    const handleCopyLink = async () => {
        const m = mapRef.current;
        const c = m?.getCenter?.();
        const view = c ? { center: [c.lng, c.lat], zoom: m.getZoom() } : null;
        const url =
            window.location.origin +
            window.location.pathname +
            buildSearch({
                timeRange,
                weapons: activeWeaponTypes,
                objectives: activeObjectiveTypes,
                label: activeLabel,
                search: searchText,
                rectangle: drawnQuadrilateral,
                tweetId: selectedTweetId,
                view,
            }) +
            window.location.hash;
        try {
            // Sur mobile : feuille de partage native
            if (navigator.share && window.matchMedia("(max-width: 768px)").matches) {
                await navigator.share({ url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1800);
        } catch (err) {
            if (err?.name !== "AbortError") window.prompt("URL :", url);
        }
    };

    // ── Auto-complétion basée sur le texte des tweets AFFICHÉS ──
    // Champ vide : tendances. Champ rempli : mots / expressions (1 à 3 mots) présents
    // dans les tweets actuellement chargés sur la carte et dans le SidePanel, c'est-à-dire
    // après application de la période, des armes, des objectifs, du topic, du rectangle
    // et du pays sélectionné, mais SANS le texte de recherche lui-même (sinon les
    // suggestions se réduiraient à ce qui a déjà été tapé). Classement par nombre de
    // tweets contenant l'expression. Le texte inséré est une sous-chaîne exacte du texte
    // du tweet (langue et casse de getSearchableText) : le filtre renvoie donc toujours
    // au moins un résultat.
    // Ce bloc est placé après les déclarations de selectedCountry, drawnQuadrilateral,
    // allTweetsRef... dont il dépend (sinon erreur d'accès avant initialisation).
    const normSearch = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const STOPWORDS = new Set((
        "le la les un une des du de d l et ou en au aux à a ce ces cet cette son sa ses leur leurs " +
        "dans sur sous par pour avec sans que qui quoi dont où est sont été être il elle ils elles on nous vous " +
        "the an and or of to in on at by for with from that this these those is are was were be been it its as " +
        "el los las unos unas y o del al por con para sin que es son fue ser se su sus lo"
    ).split(" "));

    // Fonction "paresseuse" : l'index n'est construit qu'à la première frappe, puis mis en
    // cache jusqu'au prochain changement de filtre (la période n'a que des presets, donc
    // les recalculs sont rares). Rien n'est mis en cache tant que les tweets ne sont pas là.
    const getPhraseIndex = useMemo(() => {
        let cache = null;
        return () => {
            if (cache) return cache;
            const src = allTweetsRef.current ?? bootstrapData?.tweets;
            if (!src?.features) return { entries: [], texts: [] };

            const countryPolys = selectedCountry ? countryIndexRef.current?.get(selectedCountry) : null;
            const shown = filterByCountry(
                filterTweets(src, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, null, drawnQuadrilateral, lang),
                countryPolys, "point"
            );

            const MAX_WORDS = 3;
            const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu; // sans # ni @ : « ukr » trouve aussi #Ukraine
            const counts = new Map(); // clé normalisée -> { key, term, count, n }
            const texts = []; // textes cherchables (identiques à ceux de filterTweets), pour les vrais compteurs
            for (const f of shown?.features ?? []) {
                // URLs neutralisées (remplacées par des espaces) pour ne pas polluer l'index
                const raw = getSearchableText(f.properties, lang);
                texts.push(raw);
                const text = raw.replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
                const toks = [];
                for (const m of text.matchAll(TOKEN)) {
                    toks.push({ s: m.index, e: m.index + m[0].length, w: normSearch(m[0]) });
                }
                const seen = new Set(); // 1 tweet = 1 occurrence max par expression
                for (let i = 0; i < toks.length; i++) {
                    if (STOPWORDS.has(toks[i].w)) continue; // pas d'expression qui commence par un mot vide
                    for (let j = i; j < toks.length && j < i + MAX_WORDS; j++) {
                        // mots séparés par un seul espace : sinon l'expression ne serait
                        // pas une sous-chaîne exacte du tweet
                        if (j > i && text.slice(toks[j - 1].e, toks[j].s) !== " ") break;
                        if (STOPWORDS.has(toks[j].w)) continue; // ...ni qui se termine par un mot vide
                        const term = text.slice(toks[i].s, toks[j].e);
                        const key = normSearch(term);
                        if (j === i && key.length < 3) continue;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const entry = counts.get(key);
                        if (entry) entry.count++;
                        else counts.set(key, { key, term, count: 1, n: j - i + 1 });
                    }
                }
            }
            // Expressions de 2-3 mots vues une seule fois : écartées (bruit + mémoire)
            const entries = [...counts.values()]
                .filter((e) => e.n === 1 || e.count >= 2)
                .sort((a, b) => b.count - a.count);
            cache = { entries, texts };
            return cache;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bootstrapData, tweetsRevision, timeRange.start, timeRange.end, activeWeaponTypes, activeObjectiveTypes, activeLabel, drawnQuadrilateral, selectedCountry, lang]);

    // Seul le début est ignoré : un espace final ("missile ") propose les mots suivants.
    const searchQuery = normSearch(localSearchText.replace(/^[\s#@]+/, "")).replace(/\s+/g, " ");
    const filteredKeywords = useMemo(() => {
        const q = searchQuery.trimEnd();
        if (!q) return trendingKeywords.map((k) => ({ ...k, kind: "trending" }));
        if (q.length < 2) return [];
        const { entries, texts } = getPhraseIndex();
        // Candidats présélectionnés d'après l'index par mots (rapide)...
        const candidates = [];
        for (const e of entries) {
            if (e.key === q || !e.key.startsWith(searchQuery)) continue;
            candidates.push(e);
            if (candidates.length >= 40) break;
        }
        // ...puis compteur EXACT = nombre de tweets que le filtre renverrait pour ce terme
        // (filterTweets cherche par sous-chaîne : "drone" matche aussi "drones", "drone fpv"...).
        // Le classement se fait sur ce compteur réel.
        return candidates
            .map((e) => {
                let count = 0;
                for (const t of texts) if (t.includes(e.term)) count++;
                return { term: e.term, context: "", count, kind: "text" };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, getPhraseIndex]);

    useEffect(() => { setActiveIdx(-1); }, [searchQuery]);

    return (
        <div className={`map-root map-root--${MAP_REVEAL_MODE}${mapReady ? " is-ready" : ""}`}>
            {/* Spinner affiché tant que la carte n'est pas prête (même rendu que le
                fallback Suspense de MapApp : transition sans à-coup) */}
            {!mapReady && SHOW_MAP_SPINNER && (
                <div className="map-loading">
                    <MapSpinner />
                </div>
            )}
            {/* Conteneur principal de la carte */}
            <div
                ref={containerRef}
                className="map-container"
                role="region"
                aria-label={t.mapLabel}
            />

            {/* Bouton d'ouverture du panneau Théâtres */}
            <button
                type="button"
                className={`map-ctrl-btn map-ctrl-btn--float${theatersOpen ? " is-active" : ""}`}
                title={t.theatersButton}
                aria-expanded={theatersOpen}
                onClick={() => setTheatersOpen((v) => !v)}
                style={{ left: searchBarLeftOffset }}
            >
                <PiBookOpenTextBold size={16} />
            </button>

            <TheatersDrawer
                open={theatersOpen}
                onClose={() => setTheatersOpen(false)}
                topics={bootstrapData?.topics || []}
                summariesByTopic={bootstrapData?.topic_summaries || {}}
                lang={lang}
                onSelectTopic={handleSelectTheater}
                initialSlug={getInitialTheaterSlug()}
            />

            {/* Barre de recherche (si applicable) */}
            {onSearchTextChange && (
                <div
                    ref={searchContainerRef}
                    className="map-kw-list"
                    style={{ left: searchBarLeftOffset + 42 }} // laisse la place au bouton Théâtres
                >
                    <div className="map-search">
                        <input
                            type="text"
                            className={`map-search-input${localSearchText ? " has-value" : ""}`}
                            value={localSearchText}
                            onChange={(e) => { setLocalSearchText(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onKeyDown={handleSearchKeyDown}
                            autoComplete="off"
                            placeholder={t.searchPlaceholder}
                        />
                        {localSearchText && (
                            <button
                                type="button"
                                className="map-search-clear"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleClearSearch();
                                }}
                                aria-label={t.clearSearch}
                            >
                                <MdClose size={14} />
                            </button>
                        )}
                    </div>

                    {showSuggestions && filteredKeywords.length > 0 && (
                        <div className="map-suggest">
                            {!searchQuery && <div className="map-suggest-title">{t.trendingLabel}</div>}
                            {filteredKeywords.map((kw, i) => (
                                <div
                                    key={`${kw.kind}-${kw.term}-${i}`}
                                    className={`map-suggest-item${i === activeIdx ? " is-active" : ""}`}
                                    style={i === activeIdx ? { background: "rgba(255,255,255,0.08)" } : undefined}
                                    onMouseDown={() => handleSelectKeyword(kw)}
                                    onMouseEnter={() => setActiveIdx(i)}
                                >
                                    {kw.kind === "trending"
                                        ? <MdTrendingUp size={14} className="map-suggest-icon" />
                                        : <MdSearch size={14} className="map-suggest-icon" />}
                                    {/* On affiche le libellé contextuel (autonome et lisible),
                                        avec repli sur le terme brut si le contexte est vide.
                                        Si un contexte est affiché, on ajoute le mot-clé brut à la suite,
                                        en gris discret, pour référence. */}
                                    {kw.context && kw.context.trim() ? (
                                        <span>
                                            {kw.context}
                                            <span className="map-suggest-term">{kw.term}</span>
                                        </span>
                                    ) : (
                                        <span>
                                            {kw.term}
                                            {kw.count != null && <span className="map-suggest-term">{kw.count}</span>}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Barre d'outils en bas à gauche : dessin + filtres + export + performance */}
            {/* Affichée dès que les données sont chargées, même si les filtres
                actifs ne renvoient aucun tweet : sinon impossible de rouvrir /
                décocher les filtres ou d'effacer le rectangle. */}
            {dataTweets !== null && (
                <div className="map-toolbar" role="toolbar">
                    {/* 1. Zone d'extraction : tracer un rectangle pour ne garder que les éléments qu'il contient */}
                    <div className="map-toolbar-item">
                        <button
                            type="button"
                            className={`map-ctrl-btn${isDrawing ? " is-active" : ""}`}
                            aria-pressed={isDrawing}
                            title={isDrawing ? t.cancelRectangle : t.drawArea}
                            aria-label={isDrawing ? t.cancelRectangle : t.drawArea}
                            onClick={() => {
                                const turningOn = !isDrawing;
                                if (turningOn && drawnQuadrilateral) {
                                    // On active un nouveau tracé : le rectangle précédent est supprimé
                                    // immédiatement, sans attendre le premier clic du nouveau tracé.
                                    clearDrawnRectangle();
                                }
                                setIsDrawing(turningOn);
                            }}
                        >
                            <AreaSelectIcon size={16} filled={!!drawnQuadrilateral && !isDrawing} />
                        </button>

                        {/* Croix de suppression : visible uniquement si un rectangle est tracé */}
                        {drawnQuadrilateral && (
                            <button
                                type="button"
                                className="map-ctrl-badge"
                                title={t.deleteRectangle}
                                aria-label={t.deleteRectangle}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearDrawnRectangle();
                                }}
                            >
                                <MdClose size={10} />
                            </button>
                        )}
                    </div>

                    {/* 1b. Pays sélectionné : visible uniquement si un pays est isolé ; clic = désélection */}
                    {selectedCountry && (
                        <div className="map-toolbar-item">
                            <button
                                type="button"
                                className="map-ctrl-btn is-active"
                                title={`${COUNTRY_TITLES[lang] ?? COUNTRY_TITLES.en} : ${translateEntity(selectedCountry)}`}
                                aria-label={`${COUNTRY_TITLES[lang] ?? COUNTRY_TITLES.en} : ${translateEntity(selectedCountry)}`}
                                onClick={() => setSelectedCountry(null)}
                            >
                                <MdOutlineFlag size={17} />
                            </button>
                            <button
                                type="button"
                                className="map-ctrl-badge"
                                aria-label={t.deleteRectangle}
                                onClick={(e) => { e.stopPropagation(); setSelectedCountry(null); }}
                            >
                                <MdClose size={10} />
                            </button>
                        </div>
                    )}

                    {/* 2. Panneau de filtres (armes / objectifs) + pastille du nombre de filtres actifs */}
                    <div className="map-toolbar-item" style={{ position: "relative" }}>
                        <button
                            type="button"
                            className={`map-ctrl-btn${filtersOpen ? " is-active" : ""}`}
                            aria-pressed={filtersOpen}
                            title={filtersOpen ? t.hideFilters : t.filterDataAction}
                            onClick={() => onToggleFilters && onToggleFilters()}
                        >
                            <FaFilter size={13} />
                        </button>
                        {activeFilterCount > 0 && (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: "absolute",
                                    top: -5,
                                    right: -5,
                                    minWidth: 15,
                                    height: 15,
                                    padding: "0 4px",
                                    boxSizing: "border-box",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 9999,
                                    background: "var(--ox-accent, #4f9dff)",
                                    color: "#0d1320",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    fontVariantNumeric: "tabular-nums",
                                    pointerEvents: "none", // le clic traverse jusqu'au bouton
                                }}
                            >
                                {activeFilterCount}
                            </span>
                        )}
                    </div>

                    {/* 3. Export GeoJSON */}
                    <button
                        type="button"
                        className="map-ctrl-btn"
                        title={t.exportData}
                        onClick={handleDownloadGeoJSON}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>

                    {/* 3b. Copier le lien (permalink) */}
                    {/* <button
                        type="button"
                        className={`map-ctrl-btn${linkCopied ? " is-active" : ""}`}
                        title={linkCopied ? t.linkCopied : t.copyLink}
                        aria-label={linkCopied ? t.linkCopied : t.copyLink}
                        onClick={handleCopyLink}
                    >
                        {linkCopied ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                        )}
                    </button> */}

                    {/* 4. Mode performance */}
                    <button
                        type="button"
                        className={`map-ctrl-btn${performanceMode ? " is-active" : ""}`}
                        aria-pressed={performanceMode}
                        title={performanceMode ? t.disablePerformanceMode : t.enablePerformanceMode}
                        onClick={() => setPerformanceMode((v) => !v)}
                    >
                        <CgPerformance size={17} />
                    </button>

                    {/* 5. Fond de carte : vector <-> satellite */}
                    <button
                        type="button"
                        className={`map-ctrl-btn${basemap === "satellite" ? " is-active" : ""}`}
                        aria-pressed={basemap === "satellite"}
                        title={(BASEMAP_TITLES[basemap][lang] ?? BASEMAP_TITLES[basemap].en)}
                        aria-label={(BASEMAP_TITLES[basemap][lang] ?? BASEMAP_TITLES[basemap].en)}
                        onClick={handleToggleBasemap}
                    >
                        {basemap === "satellite" ? <MdOutlineMap size={17} /> : <MdSatelliteAlt size={16} />}
                    </button>
                </div>
            )}
        </div>
    );
});

export default MapView;