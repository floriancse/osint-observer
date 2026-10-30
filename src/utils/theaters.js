// Helpers partagés entre TheatersDrawer (liste sur la carte) et TheaterPage
// (page /content/<slug>/).
import { DATE_LOCALES } from "./typeLabels";

export const isTheaterPagePath = () =>
  typeof window !== "undefined" && /^\/content\/./.test(window.location.pathname);

export const getFreshness = (iso) => {
  if (!iso) return "stale";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 72) return "hot";
  if (h < 168) return "warm";
  if (h < 336) return "cool";
  return "stale";
};

export const relativeTime = (iso, ui) => {
  if (!iso) return "";
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return ui.ago.min(min);
  if (min < 60 * 24) return ui.ago.h(Math.round(min / 60));
  return ui.ago.d(Math.round(min / 1440));
};

export const formatDate = (iso, lang) =>
  new Date(iso).toLocaleString(DATE_LOCALES[lang], { day: "2-digit", month: "2-digit", year: "numeric" });

// /img/<LABEL brut>.webp (le nom du fichier = LABEL brut, non traduit)
const IMG_EXT = "webp";
export const imageUrl = (label) =>
  `${process.env.PUBLIC_URL || ""}/img/${encodeURIComponent((label || "").trim().replace(/\s+/g, "-"))}.${IMG_EXT}`;

const maxDate = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
};

/**
 * Construit une liste propre de théâtres à partir du bootstrap :
 *  - ignore les lignes sans TOPIC_ID / sans LABEL ;
 *  - fusionne les doublons (la requête SQL groupe aussi par COUNTRIES,
 *    TOPIC_SUMMARY... : un même topic peut sortir sur plusieurs lignes) ;
 *  - déduit LATEST_UPDATE du dernier résumé quotidien si besoin.
 */
export const buildTheaters = (topics, summariesByTopic) => {
  const byId = new Map();
  const upsert = (id, patch) => {
    if (id === null || id === undefined || !patch.LABEL) return;
    const key = String(id);
    const prev = byId.get(key) || { TOPIC_ID: id, COUNTRIES: [] };
    byId.set(key, {
      ...prev,
      LABEL: prev.LABEL || patch.LABEL,
      TOPIC_SUMMARY: prev.TOPIC_SUMMARY || patch.TOPIC_SUMMARY,
      SLUG: prev.SLUG || patch.SLUG,
      CREDIT: prev.CREDIT || patch.CREDIT, // légende + crédit de l'image (TOPICS.CREDIT)
      COUNTRIES: prev.COUNTRIES.length ? prev.COUNTRIES : (Array.isArray(patch.COUNTRIES) ? patch.COUNTRIES : []),
      LATEST_UPDATE: maxDate(prev.LATEST_UPDATE, patch.LATEST_UPDATE),
    });
  };

  (Array.isArray(topics) ? topics : []).forEach((t) => upsert(t.TOPIC_ID, t));

  // La date affichée sur la carte doit refléter le dernier RÉSUMÉ quotidien
  // (c'est lui que l'utilisateur lit : "N résumés"). On ne retombe sur la date
  // du dernier tweet du topic (topics.LATEST_UPDATE) que si le théâtre n'a
  // aucun résumé. Avec un max() des deux, un simple tweet récent rattaché au
  // topic suffisait à afficher "il y a 2 j" alors que le dernier résumé date
  // d'il y a plusieurs semaines.
  byId.forEach((topic, key) => {
    const list = summariesByTopic?.[key] || [];
    const latest = list.reduce((acc, ev) => maxDate(acc, ev.created_at), null);
    if (latest) topic.LATEST_UPDATE = latest;
  });

  return [...byId.values()].sort(
    (a, b) => new Date(b.LATEST_UPDATE || 0) - new Date(a.LATEST_UPDATE || 0)
  );
};