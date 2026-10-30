import { getCurrentLang } from "./typeLabels";
import THEATER_INFO from "../data/theaterInfo.json";

// Traductions des théâtres : voir src/data/theaterInfo.json (lu aussi par
// scripts/inject-seo.js au build). La CLÉ est la valeur BRUTE du backend
// (topic.LABEL) et ne doit jamais être traduite. Langues : en, fr, es.
export { THEATER_INFO };

// Libellé traduit d'un théâtre pour l'affichage (dropdown, titre de popup...).
// `rawLabel` reste la valeur de filtrage/clé — on ne la modifie jamais ici,
// on retourne juste le texte à montrer. Fallback sur la valeur brute si le
// théâtre n'est pas (encore) dans le dictionnaire, pour ne rien casser.
export const translateTheaterLabel = (rawLabel, lang = getCurrentLang()) => {
  if (!rawLabel) return rawLabel;
  const entry = THEATER_INFO[rawLabel];
  if (!entry) return rawLabel;
  return entry[lang]?.label || entry.en?.label || rawLabel;
};

// Résumé traduit d'un théâtre. `fallbackSummary` est le TOPIC_SUMMARY brut
// renvoyé par le backend, utilisé si le théâtre n'est pas encore traduit
// localement.
export const translateTheaterSummary = (rawLabel, lang = getCurrentLang(), fallbackSummary = "") => {
  const entry = THEATER_INFO[rawLabel];
  if (!entry) return fallbackSummary;
  return entry[lang]?.summary || entry.en?.summary || fallbackSummary;
};