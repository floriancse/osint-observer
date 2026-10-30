// -----------------------------------------------------------------------
// Dictionnaires PARTAGÉS entre LangContext.jsx (composants React) et
// popupUtils.js (génération de HTML brut, potentiellement hors arbre React
// — ex: popups MapLibre déclenchés par des event handlers imperatifs).
// Ce fichier ne dépend volontairement pas de React : il doit pouvoir être
// importé depuis n'importe quel contexte JS.
//
// Les clés sont les valeurs BRUTES telles qu'elles arrivent du backend
// (listes fermées WEAPON_TYPES / OBJECTIVE_TYPES) — on ne les modifie
// jamais, seul l'affichage change selon la langue active.
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

export const DATE_LOCALES = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

// Repli : lit la langue mémorisée par LangProvider directement dans
// localStorage. Utile pour du code qui tourne hors du rendu React (ex:
// callback de clic sur la carte) et qui ne peut donc pas appeler useLang().
export function getCurrentLang() {
  try {
    const saved = localStorage.getItem("lang");
    return saved === "fr" || saved === "en" || saved === "es" ? saved : "en";
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