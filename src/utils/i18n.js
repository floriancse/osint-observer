// =======================================================================
// i18n.js : SEUL fichier de traduction de l'application.
//
// Aucune dépendance React : il est importé aussi bien par LangContext.jsx
// (composants) que par popupUtils.js (HTML brut, hors arbre React).
//
// Sommaire :
//   1. Langues disponibles (ordre, locales de date, langue de la carte)
//   2. `translations` : textes d'interface (+ popups de la carte et des tweets)
//   3. Valeurs catégorielles venant de la DB (armes, objectifs, typologie,
//      points de passage) : la clé est la valeur BRUTE du backend
//   4. Noms d'entités / d'acteurs traduits (remplis au runtime via /bootstrap)
//
// Pour ajouter une langue : l'ajouter dans LANG_ORDER, DATE_LOCALES,
// MAP_LANGUAGES, puis dans chaque dictionnaire ci-dessous.
// =======================================================================

// -----------------------------------------------------------------------
// 1. Langues
// -----------------------------------------------------------------------

// Ordre de rotation de toggleLang (une entrée par langue de `translations`).
export const LANG_ORDER = ["fr", "en", "es"];

export const DATE_LOCALES = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

// Langue des étiquettes de la carte MapTiler pour chaque langue de l'app.
// Valeurs = codes ISO 639-1 acceptés par maptilersdk (voir maptilersdk.Language).
export const MAP_LANGUAGES = {
  fr: "fr",
  en: "en",
  es: "es",
};

// -----------------------------------------------------------------------
// 2. Textes d'interface.
// Chaque clé correspond à un texte affiché quelque part dans l'app.
// Groupes : theaterPage, theaters, popupUi (popups MapView), tweetCard (popupUtils.js).
// -----------------------------------------------------------------------

export const translations = {
  fr: {
    loading: "Chargement d'OSINT Watch",
    pageTitle: "OSINT Watch | Carte OSINT interactive des conflits",
    mapLabel: "Carte interactive des conflits",
    metaDescription: "Suivez les conflits en temps réel sur une carte OSINT interactive : événements géolocalisés, armes, cibles, points chauds, tendances et chronologie.",
    feedTitle: "Flux OSINT",
    eventsCount: (n) => `${n} événement${n > 1 ? "s" : ""}`,
    sortRecent: "Récent",
    sortRelevant: "Important",
    allTopics: "Tous les sujets",
    periodToday: "Aujourd'hui",
    periodWeek: "Cette semaine",
    periodMonth: "Ce mois",
    periodCustom: "Personnalisé",
    periodGroup: "Période",
    twitterStream: "Flux Twitter / X",
    lastUpdate: "Dernière mise à jour :",
    filterWeapons: "Armes",
    filterTargets: "Cibles",
    timeline: "Chronologie",
    searchPlaceholder: "Rechercher dans OSINT Watch",
    clearSearch: "Effacer la recherche",
    trendingLabel: "TENDANCES",
    drawArea: "Dessiner une zone",
    cancelRectangle: "Annuler le rectangle",
    deleteRectangle: "Supprimer le rectangle",
    filterDataAction: "Filtrer les données",
    hideFilters: "Masquer les filtres",
    exportData: "Exporter les données",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié",
    disablePerformanceMode: "Désactiver le mode performance",
    enablePerformanceMode: "Activer le mode performance",
    stateActors: "Acteurs étatiques",
    nonStateActors: "Acteurs non étatiques",
    frontline: "Ligne de front",
    conflictZone: "Zone de conflit",
    militaryTheater: "Théâtre militaire",
    forceInPresence: "Force en présence",
    pairSince: "Depuis le",
    pairDuration: "Durée",
    pairTotalActions: "Attaques",
    pairActiveDays: "Jours actifs",
    daysCount: (n) => `${n} jour${n > 1 ? "s" : ""}`,
    expandPanel: "Ouvrir le panneau",
    theatersButton: "Théâtres",
    internalConflict: "Conflit interne",
    // Page /content/<slug>/ (TheaterPage)
    theaterPage: {
      brand: "OSINT Watch",
      viewOnMap: "Voir sur la carte",
      activeTitle: "Théâtres actifs",
      otherTheaters: "Autres théâtres",
      loading: "Chargement…",
      error: "Impossible de charger les données.",
      notFoundTitle: "Théâtre introuvable",
      notFoundText: "Ce théâtre n'existe pas ou a été renommé.",
      backToMap: "Retour à la carte",
      events: "Résumés quotidiens",
      noEvents: "Aucun événement significatif trouvé pour ce théâtre.",
      backToConflictMap: "Voir la carte OSINT",
      mapTitle: "Pays concernés",
      tocTitle: "Sommaire",
      tocSummary: "Résumé",
      tocRecent: "Développement récent",
      tocTopics: "Autres sujets",
      sources: "Sources",
      viewTweet: "Voir le tweet",
      imageCredit: "Image :",
      tagsLabel: "Indicateurs",
      tagConflict: "Conflit",
      tagCivilWar: "Guerre civile",
      tagActive: "Actif",
      tagInactive: "Inactif",
    },
    // Panneau "Théâtres" (TheatersDrawer)
    theaters: {
      title: "Théâtres",
      close: "Fermer",
      fallback: "Théâtre",
      empty: "Aucun théâtre à afficher.",
      active: (n) => `${n} théâtre${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""}`,
      eventsCount: (n) => `${n} résumé${n > 1 ? "s" : ""}`,
    },
    // Popups de la carte (MapView). Groupé pour éviter les collisions de clés
    // avec les libellés génériques ci-dessus (ex: "loading").
    popupUi: {
      theaterFallback: "Théâtre",
      loading: "Chargement…",
      unableToLoad: "Impossible de charger les données du théâtre.",
      situationSummary: "Résumé de la situation",
      majorEvents: "Événements majeurs",
      noEvents: "Aucun événement significatif trouvé pour ce théâtre.",
      activities: "Activités",
      date: "Date",
      unknownStatus: "Inconnu",
      statusSince: "depuis",
      day: "jour",
      days: "jours",
    },
    // Popups de tweets (popupUtils.js) : liste, carte détaillée, médias, lecteur vidéo.
    tweetCard: {
      unknownSource: "Source inconnue",
      eventsAtLocation: (n) => `${n} événements à cet endroit`,
      backToList: "Retour à la liste",
      showMedia: (n) => (n > 1 ? `Afficher les médias (${n})` : "Afficher le média"),
      hideMedia: "Masquer les médias",
      locatedByDeepseek: "Localisé par DeepSeek",
      locatedByNominatim: "Localisé par Nominatim",
      justNow: "à l'instant",
      minute: "min",
      hour: "h",
      day: "j",
      playVideo: "Lire la vidéo",
      openVideo: "Ouvrir la vidéo",
      carouselPrev: "Média précédent",
      carouselNext: "Média suivant",
      imageAlt: (user, i, n) => (n > 1 ? `Image ${i + 1} sur ${n} du tweet de ${user}` : `Image du tweet de ${user}`),
      vc: { play: "Lecture", pause: "Pause", mute: "Couper le son", unmute: "Activer le son", seek: "Position", volume: "Volume", fullscreen: "Plein écran" },
    },
  },
  en: {
    loading: "Loading OSINT Watch",
    pageTitle: "OSINT Watch | Interactive OSINT map of conflicts",
    mapLabel: "Interactive conflict map",
    metaDescription: "Follow conflicts in real time on an interactive OSINT map: geotagged events, weapons, targets, hotspots, trends and timeline.",
    feedTitle: "OSINT Feed",
    eventsCount: (n) => `${n} event${n > 1 ? "s" : ""}`,
    sortRecent: "Recent",
    sortRelevant: "Relevant",
    allTopics: "All topics",
    periodToday: "Today",
    periodWeek: "This week",
    periodMonth: "This month",
    periodCustom: "Custom",
    periodGroup: "Period",
    twitterStream: "Twitter / X stream",
    lastUpdate: "Last update:",
    filterWeapons: "Weapons",
    filterTargets: "Targets",
    timeline: "Timeline",
    searchPlaceholder: "Search OSINT Watch",
    clearSearch: "Clear search",
    trendingLabel: "TRENDING",
    drawArea: "Draw area",
    cancelRectangle: "Cancel rectangle",
    deleteRectangle: "Delete rectangle",
    filterDataAction: "Filter data",
    hideFilters: "Hide filters",
    exportData: "Export data",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    disablePerformanceMode: "Disable performance mode",
    enablePerformanceMode: "Enable performance mode",
    stateActors: "State actors",
    nonStateActors: "Non-state actors",
    frontline: "Frontline",
    conflictZone: "Conflict zone",
    militaryTheater: "Military theater",
    forceInPresence: "Force present",
    pairSince: "Since",
    pairDuration: "Duration",
    pairTotalActions: "Attacks",
    pairActiveDays: "Active days",
    daysCount: (n) => `${n} day${n > 1 ? "s" : ""}`,
    expandPanel: "Expand panel",
    theatersButton: "Theaters",
    internalConflict: "Internal conflict",
    // /content/<slug>/ page (TheaterPage)
    theaterPage: {
      brand: "OSINT Watch",
      viewOnMap: "View on map",
      activeTitle: "Active theaters",
      otherTheaters: "Other theaters",
      loading: "Loading…",
      error: "Unable to load data.",
      notFoundTitle: "Theater not found",
      notFoundText: "This theater does not exist or has been renamed.",
      backToMap: "Back to the map",
      events: "Daily summaries",
      noEvents: "No significant events found for this theater.",
      backToConflictMap: "View OSINT map",
      mapTitle: "Countries involved",
      tocTitle: "Table of contents",
      tocSummary: "Summary",
      tocRecent: "Recent developments",
      tocTopics: "Other topics",
      sources: "Sources",
      viewTweet: "View tweet",
      imageCredit: "Image:",
      tagsLabel: "Indicators",
      tagConflict: "Conflict",
      tagCivilWar: "Civil war",
      tagActive: "Active",
      tagInactive: "Inactive",
    },
    // "Theaters" panel (TheatersDrawer)
    theaters: {
      title: "Theaters",
      close: "Close",
      fallback: "Theater",
      empty: "No theaters to display.",
      active: (n) => `${n} active theater${n !== 1 ? "s" : ""}`,
      eventsCount: (n) => `${n} summar${n !== 1 ? "ies" : "y"}`,
    },
    // Map popups (MapView). Grouped to avoid key collisions with the generic
    // labels above (e.g. "loading").
    popupUi: {
      theaterFallback: "Theater",
      loading: "Loading…",
      unableToLoad: "Unable to load theater data.",
      situationSummary: "Situation summary",
      majorEvents: "Major events",
      noEvents: "No significant events found for this theater.",
      activities: "Activities",
      date: "Date",
      unknownStatus: "Unknown",
      statusSince: "for",
      day: "day",
      days: "days",
    },
    // Tweet popups (popupUtils.js): list, detail card, media, video player.
    tweetCard: {
      unknownSource: "Unknown source",
      eventsAtLocation: (n) => `${n} events at this location`,
      backToList: "Back to list",
      showMedia: (n) => (n > 1 ? `Show media (${n})` : "Show media"),
      hideMedia: "Hide media",
      locatedByDeepseek: "Located by DeepSeek",
      locatedByNominatim: "Located by Nominatim",
      justNow: "just now",
      minute: "m",
      hour: "h",
      day: "d",
      playVideo: "Play video",
      openVideo: "Open video",
      carouselPrev: "Previous media",
      carouselNext: "Next media",
      imageAlt: (user, i, n) => (n > 1 ? `Image ${i + 1} of ${n} from ${user}'s tweet` : `Image from ${user}'s tweet`),
      vc: { play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", seek: "Seek", volume: "Volume", fullscreen: "Fullscreen" },
    },
  },
  es: {
    loading: "Cargando OSINT Watch",
    pageTitle: "OSINT Watch | Mapa OSINT interactivo de conflictos",
    mapLabel: "Mapa interactivo de conflictos",
    metaDescription: "Sigue los conflictos en tiempo real en un mapa OSINT interactivo: eventos geolocalizados, armas, objetivos, puntos calientes, tendencias y cronología.",
    feedTitle: "Flujo OSINT",
    eventsCount: (n) => `${n} evento${n > 1 ? "s" : ""}`,
    sortRecent: "Reciente",
    sortRelevant: "Relevante",
    allTopics: "Todos los temas",
    periodToday: "Hoy",
    periodWeek: "Esta semana",
    periodMonth: "Este mes",
    periodCustom: "Personalizado",
    periodGroup: "Período",
    twitterStream: "Flujo de Twitter / X",
    lastUpdate: "Última actualización:",
    filterWeapons: "Armas",
    filterTargets: "Objetivos",
    timeline: "Cronología",
    searchPlaceholder: "Buscar en OSINT Watch",
    clearSearch: "Borrar búsqueda",
    trendingLabel: "TENDENCIAS",
    drawArea: "Dibujar una zona",
    cancelRectangle: "Cancelar rectángulo",
    deleteRectangle: "Eliminar rectángulo",
    filterDataAction: "Filtrar datos",
    hideFilters: "Ocultar filtros",
    exportData: "Exportar datos",
    copyLink: "Copiar enlace",
    linkCopied: "Enlace copiado",
    disablePerformanceMode: "Desactivar el modo de rendimiento",
    enablePerformanceMode: "Activar el modo de rendimiento",
    stateActors: "Actores estatales",
    nonStateActors: "Actores no estatales",
    frontline: "Línea del frente",
    conflictZone: "Zona de conflicto",
    militaryTheater: "Teatro militar",
    forceInPresence: "Fuerza presente",
    pairSince: "Desde",
    pairDuration: "Duración",
    pairTotalActions: "Ataques",
    pairActiveDays: "Días activos",
    daysCount: (n) => `${n} día${n > 1 ? "s" : ""}`,
    expandPanel: "Abrir el panel",
    theatersButton: "Teatros",
    internalConflict: "Conflicto interno",
    // Página /content/<slug>/ (TheaterPage)
    theaterPage: {
      brand: "OSINT Watch",
      viewOnMap: "Ver en el mapa",
      activeTitle: "Teatros activos",
      otherTheaters: "Otros teatros",
      loading: "Cargando…",
      error: "No se pudieron cargar los datos.",
      notFoundTitle: "Teatro no encontrado",
      notFoundText: "Este teatro no existe o ha sido renombrado.",
      backToMap: "Volver al mapa",
      events: "Resúmenes diarios",
      noEvents: "No se encontraron eventos significativos para este teatro.",
      backToConflictMap: "Ver OSINT mapa",
      mapTitle: "Países implicados",
      tocTitle: "Índice",
      tocSummary: "Resumen",
      tocRecent: "Novedades recientes",
      tocTopics: "Otros temas",
      sources: "Fuentes",
      viewTweet: "Ver tuit",
      imageCredit: "Imagen:",
      tagsLabel: "Indicadores",
      tagConflict: "Conflicto",
      tagCivilWar: "Guerra civil",
      tagActive: "Activo",
      tagInactive: "Inactivo",
    },
    // Panel "Teatros" (TheatersDrawer)
    theaters: {
      title: "Teatros",
      close: "Cerrar",
      fallback: "Teatro",
      empty: "No hay teatros que mostrar.",
      active: (n) => `${n} teatro${n !== 1 ? "s" : ""} activo${n !== 1 ? "s" : ""}`,
      eventsCount: (n) => `${n} resumen${n !== 1 ? "es" : ""}`,
    },
    // Popups del mapa (MapView). Agrupado para evitar colisiones de claves
    // con las etiquetas genéricas de arriba (p. ej. "loading").
    popupUi: {
      theaterFallback: "Teatro",
      loading: "Cargando…",
      unableToLoad: "No se pudieron cargar los datos del teatro.",
      situationSummary: "Resumen de la situación",
      majorEvents: "Eventos principales",
      noEvents: "No se encontraron eventos significativos para este teatro.",
      activities: "Actividades",
      date: "Fecha",
      unknownStatus: "Desconocido",
      statusSince: "desde hace",
      day: "día",
      days: "días",
    },
    // Popups de tuits (popupUtils.js): lista, tarjeta detallada, medios, reproductor de vídeo.
    tweetCard: {
      unknownSource: "Fuente desconocida",
      eventsAtLocation: (n) => `${n} eventos en este lugar`,
      backToList: "Volver a la lista",
      showMedia: (n) => (n > 1 ? `Mostrar medios (${n})` : "Mostrar medio"),
      hideMedia: "Ocultar medios",
      locatedByDeepseek: "Localizado por DeepSeek",
      locatedByNominatim: "Localizado por Nominatim",
      justNow: "ahora mismo",
      minute: "min",
      hour: "h",
      day: "d",
      playVideo: "Reproducir vídeo",
      openVideo: "Abrir vídeo",
      carouselPrev: "Medio anterior",
      carouselNext: "Medio siguiente",
      imageAlt: (user, i, n) => (n > 1 ? `Imagen ${i + 1} de ${n} del tuit de ${user}` : `Imagen del tuit de ${user}`),
      vc: { play: "Reproducir", pause: "Pausa", mute: "Silenciar", unmute: "Activar sonido", seek: "Posición", volume: "Volumen", fullscreen: "Pantalla completa" },
    },
  },
};

// Accès sécurisé : si une langue n'a pas (encore) de dictionnaire, on retombe
// sur l'anglais au lieu de planter. Utilisable hors React (popupUtils.js).
export const getTranslations = (lang) => translations[lang] || translations.en;

// -----------------------------------------------------------------------
// 3. Valeurs catégorielles (DB) : clés BRUTES du backend, jamais modifiées,
// seul l'affichage change selon la langue active.
// -----------------------------------------------------------------------

export const WEAPON_TYPE_LABELS = {
  "Drones": { fr: "Drones", en: "Drones", es: "Drones" },
  "Missiles": { fr: "Missiles", en: "Missiles", es: "Misiles" },
  "Explosives": { fr: "Explosifs", en: "Explosives", es: "Explosivos" },
  "Air Defence": { fr: "Défense antiaérienne", en: "Air Defence", es: "Defensa antiaérea" },
  "Military Aviation": { fr: "Aviation militaire", en: "Military Aviation", es: "Aviación militar" },
  "Artillery & Armour": { fr: "Artillerie et blindés", en: "Artillery & Armour", es: "Artillería y blindados" },
  "Small Arms": { fr: "Armes légères", en: "Small Arms", es: "Armas ligeras" },
  "Naval Weapons": { fr: "Armes navales", en: "Naval Weapons", es: "Armas navales" },
  "Unidentified Weapon": { fr: "Armes non identifiées", en: "Unidentified Weapon", es: "Armas no identificadas" },
};

export const OBJECTIVE_TYPE_LABELS = {
  "Military": { fr: "Militaire", en: "Military", es: "Militar" },
  "Industrial": { fr: "Industriel", en: "Industrial", es: "Industrial" },
  "Energy": { fr: "Énergie", en: "Energy", es: "Energía" },
  "Transport & Infrastructure": { fr: "Transport et infrastructure", en: "Transport & Infrastructure", es: "Transporte e infraestructura" },
  "Communications": { fr: "Communications", en: "Communications", es: "Comunicaciones" },
  "Civilian": { fr: "Civil", en: "Civilian", es: "Civil" },
  "Government & Institutional": { fr: "Gouvernemental et institutionnel", en: "Government & Institutional", es: "Gubernamental e institucional" },
  "Unidentified Objective": { fr: "Objectif non identifié", en: "Unidentified Objective", es: "Objetivo no identificado" },
};

export const CONFLICT_TYPOLOGY_LABELS = {
  MIL: { fr: "Militaire", en: "Military", es: "Militar" },
  POL: { fr: "Politique", en: "Politics", es: "Política" },
  MOVE: { fr: "Mouvement", en: "Movement", es: "Movimiento" },
  OTHER: { fr: "Autre", en: "Other", es: "Otro" },
};

// Noms des points de passage stratégiques (détroits, canaux, passages).
// La clé est la valeur BRUTE renvoyée par le backend (feature.properties.portname)
// — elle ne doit jamais être modifiée, seul l'affichage change.
export const CHOKEPOINT_LABELS = {
  "Bosporus Strait": { fr: "Détroit du Bosphore", en: "Bosporus Strait", es: "Estrecho del Bósforo" },
  "Korea Strait": { fr: "Détroit de Corée", en: "Korea Strait", es: "Estrecho de Corea" },
  "Ombai Strait": { fr: "Détroit d'Ombaï", en: "Ombai Strait", es: "Estrecho de Ombai" },
  "Bohai Strait": { fr: "Détroit de Bohai", en: "Bohai Strait", es: "Estrecho de Bohai" },
  "Magellan Strait": { fr: "Détroit de Magellan", en: "Magellan Strait", es: "Estrecho de Magallanes" },
  "Bering Strait": { fr: "Détroit de Béring", en: "Bering Strait", es: "Estrecho de Bering" },
  "Kerch Strait": { fr: "Détroit de Kertch", en: "Kerch Strait", es: "Estrecho de Kerch" },
  "Panama Canal": { fr: "Canal de Panama", en: "Panama Canal", es: "Canal de Panamá" },
  "Bab el-Mandeb Strait": { fr: "Détroit de Bab-el-Mandeb", en: "Bab el-Mandeb Strait", es: "Estrecho de Bab el-Mandeb" },
  "Malacca Strait": { fr: "Détroit de Malacca", en: "Malacca Strait", es: "Estrecho de Malaca" },
  "Cape of Good Hope": { fr: "Cap de Bonne-Espérance", en: "Cape of Good Hope", es: "Cabo de Buena Esperanza" },
  "Gibraltar Strait": { fr: "Détroit de Gibraltar", en: "Gibraltar Strait", es: "Estrecho de Gibraltar" },
  "Oresund Strait": { fr: "Détroit de l'Øresund", en: "Oresund Strait", es: "Estrecho de Øresund" },
  "Taiwan Strait": { fr: "Détroit de Taïwan", en: "Taiwan Strait", es: "Estrecho de Taiwán" },
  "Tsugaru Strait": { fr: "Détroit de Tsugaru", en: "Tsugaru Strait", es: "Estrecho de Tsugaru" },
  "Luzon Strait": { fr: "Détroit de Luçon", en: "Luzon Strait", es: "Estrecho de Luzón" },
  "Lombok Strait": { fr: "Détroit de Lombok", en: "Lombok Strait", es: "Estrecho de Lombok" },
  "Torres Strait": { fr: "Détroit de Torrès", en: "Torres Strait", es: "Estrecho de Torres" },
  "Sunda Strait": { fr: "Détroit de la Sonde", en: "Sunda Strait", es: "Estrecho de la Sonda" },
  "Makassar Strait": { fr: "Détroit de Makassar", en: "Makassar Strait", es: "Estrecho de Makasar" },
  "Yucatan Channel": { fr: "Canal du Yucatán", en: "Yucatan Channel", es: "Canal de Yucatán" },
  "Windward Passage": { fr: "Passage du Vent", en: "Windward Passage", es: "Paso de los Vientos" },
  "Mona Passage": { fr: "Canal de la Mona", en: "Mona Passage", es: "Canal de la Mona" },
  "Balabac Strait": { fr: "Détroit de Balabac", en: "Balabac Strait", es: "Estrecho de Balabac" },
  "Mindoro Strait": { fr: "Détroit de Mindoro", en: "Mindoro Strait", es: "Estrecho de Mindoro" },
  "Dover Strait": { fr: "Pas de Calais", en: "Dover Strait", es: "Paso de Calais" },
  "Suez Canal": { fr: "Canal de Suez", en: "Suez Canal", es: "Canal de Suez" },
  "Strait of Hormuz": { fr: "Détroit d'Ormuz", en: "Strait of Hormuz", es: "Estrecho de Ormuz" },
};

// Repli : lit la langue mémorisée par LangProvider directement dans
// localStorage. Utile pour du code qui tourne hors du rendu React (ex:
// callback de clic sur la carte) et qui ne peut donc pas appeler useLang().
export function getCurrentLang() {
  try {
    const saved = localStorage.getItem("lang");
    return LANG_ORDER.includes(saved) ? saved : "en";
  } catch {
    return "en";
  }
}

export function translateWeaponType(rawValue, lang = getCurrentLang()) {
  return WEAPON_TYPE_LABELS[rawValue]?.[lang] ?? rawValue;
}

export function translateObjectiveType(rawValue, lang = getCurrentLang()) {
  return OBJECTIVE_TYPE_LABELS[rawValue]?.[lang] ?? rawValue;
}

export function translateConflictTypology(rawValue, lang = getCurrentLang()) {
  return CONFLICT_TYPOLOGY_LABELS[rawValue]?.[lang] ?? rawValue;
}

export function translateChokepoint(rawValue, lang = getCurrentLang()) {
  return CHOKEPOINT_LABELS[rawValue]?.[lang] ?? rawValue;
}

// Statuts des points de passage (valeurs BRUTES du backend : feature.properties.status).
export const CHOKEPOINT_STATUS_LABELS = {
  OPENED: { fr: "Ouvert", en: "Open", es: "Abierto" },
  CLOSED: { fr: "Fermé", en: "Closed", es: "Cerrado" },
  RESTRICTED: { fr: "Restreint", en: "Restricted", es: "Restringido" },
  UNKNOWN: { fr: "Inconnu", en: "Unknown", es: "Desconocido" },
};

export function translateChokepointStatus(rawValue, lang = getCurrentLang()) {
  const key = rawValue ?? "UNKNOWN";
  return CHOKEPOINT_STATUS_LABELS[key]?.[lang] ?? key;
}

const DURATION_PREPOSITIONS = { fr: "depuis", en: "for", es: "desde hace" };
const DURATION_UNITS = {
  fr: ["jour", "jours"],
  en: ["day", "days"],
  es: ["día", "días"],
};

// Phrase de durée du popup : "Closed for 3 days." / "Fermé depuis 3 jours." / "Cerrado desde hace 3 días."
// Retourne du HTML (le nombre de jours est mis en évidence dans un <span>).
export function chokepointDurationHTML(rawStatus, days, lang = getCurrentLang()) {
  const label = translateChokepointStatus(rawStatus, lang);
  const preposition = DURATION_PREPOSITIONS[lang] ?? DURATION_PREPOSITIONS.en;
  const [unitSingular, unitPlural] = DURATION_UNITS[lang] ?? DURATION_UNITS.en;
  const unit = days > 1 ? unitPlural : unitSingular;
  return `${label} ${preposition} <span style="color: #fff">${days} ${unit}</span>.`;
}


// -----------------------------------------------------------------------
// 4. Noms d'entités / d'acteurs traduits.
// Alimentés par LangContext (setEntityNames* / setActorNames*) dès que
// MapView a chargé le /bootstrap : ce module est donc rempli au runtime.
// -----------------------------------------------------------------------
const dicts = { entity: {}, actor: {} };

export function setNameDictionary(kind, lang, dict) {
  dicts[kind][lang] = dict || {};
}

function lookup(name, lang, order) {
  for (const kind of order) {
    const hit = dicts[kind][lang]?.[name];
    if (hit) return hit;
  }
  return name;
}

// L'agresseur peut être un acteur non étatique ou un pays / une entité.
// Pas de dictionnaire (anglais) ou nom inconnu : valeur brute.
export function translateAggressor(name, lang) {
  return lookup(name, lang, ["actor", "entity"]);
}

// La cible est plutôt un pays / une entité, mais peut aussi être un acteur.
export function translateTarget(name, lang) {
  return lookup(name, lang, ["entity", "actor"]);
}