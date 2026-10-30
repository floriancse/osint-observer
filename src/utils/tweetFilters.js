// Filtrage côté client des tweets / lignes militaires (période, armes, objectifs, topic,
// texte, rectangle). Module LÉGER, sans MapLibre ni React : MapApp l'importe directement
// (liste de tweets précoce) sans tirer MapView, qui peut ainsi être chargé en différé.
import { getCurrentLang } from "./typeLabels";

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


// Construit le texte "cherchable" d'un tweet : UNIQUEMENT le texte affiché dans la langue
// active (translations[lang]). Le texte d'origine (properties.text) n'est utilisé qu'en
// repli quand il n'existe pas de traduction pour cette langue (ex. tweet déjà rédigé dans
// la langue active, ou traduction manquante). Ainsi, en français, "hormuz" (graphie
// anglaise présente dans le texte d'origine) ne renvoie plus un tweet qui affiche "Ormuz".
// Utilisé aussi par l'auto-complétion de la barre de recherche (MapView) : suggestions et
// filtre restent cohérents.
export const getSearchableText = (properties, lang) => {
    let translations = properties?.translations;
    if (typeof translations === "string") {
        try { translations = JSON.parse(translations); } catch { translations = null; }
    }
    const translated = translations?.[lang];
    const text = typeof translated === "string" && translated.trim() ? translated : (properties?.text || "");
    return text.toLowerCase();
};

// Filtre côté client un FeatureCollection de tweets déjà chargé, selon une plage
export const filterTweets = (collection, { start, end }, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle, lang = getCurrentLang()) => {
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
                if (!getSearchableText(f.properties, lang).includes(normalizedSearch)) return false;
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
export const buildEnrichedTweets = (allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle, lang = getCurrentLang()) => {
    // 1. Toutes les features de la période (et du rectangle si actif), sans
    // aucun filtre arme/objectif/topic/texte
    const timeOnlyFiltered = filterTweets(allCollection, timeRange, [], [], null, null, spatialRectangle, lang);
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
    const filteredByFiltersAndTime = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, null, searchText, spatialRectangle, lang);
    const availableLabels = [...new Set(
        filteredByFiltersAndTime.features
            .map(f => f.properties.label)
            .filter(Boolean)
    )].sort();

    // 5. Le jeu de données réellement affiché (filtre armes + filtre objectifs + filtre topic + filtre texte + filtre spatial)
    const filteredTweets = filterTweets(allCollection, timeRange, activeWeaponTypes, activeObjectiveTypes, activeLabel, searchText, spatialRectangle, lang);

    filteredTweets.totalCountForTimeRange = totalOnPeriod;
    filteredTweets.allLabelsForTimeRange = allLabels;
    filteredTweets.availableLabelsForFilters = availableLabels;
    filteredTweets.availableWeaponTypesForTimeRange = allWeaponTypes;
    filteredTweets.availableObjectiveTypesForTimeRange = allObjectiveTypes;

    // 6. Compteurs par type d'arme / d'objectif, "facettés" : pour chaque section on
    // applique tous les autres filtres (période, topic, texte, rectangle, et l'autre
    // section) mais pas le filtre de la section elle-même. Ainsi les compteurs ne
    // tombent pas à 0 quand on coche une puce : ils indiquent ce qu'on obtiendrait
    // en cochant ce type.
    const countBy = (collection, key) => {
        const counts = {};
        for (const f of collection.features) {
            const v = f.properties?.[key];
            if (v) counts[v] = (counts[v] || 0) + 1;
        }
        return counts;
    };
    const forWeaponCounts = filterTweets(allCollection, timeRange, [], activeObjectiveTypes, activeLabel, searchText, spatialRectangle, lang);
    const forObjectiveCounts = filterTweets(allCollection, timeRange, activeWeaponTypes, [], activeLabel, searchText, spatialRectangle, lang);
    filteredTweets.weaponCountsForFilters = countBy(forWeaponCounts, "weapon_type");
    filteredTweets.objectiveCountsForFilters = countBy(forObjectiveCounts, "objective_type");

    return filteredTweets;
};