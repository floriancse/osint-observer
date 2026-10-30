// Routage "une URL par théâtre et par langue" : /content/<lang>/<slug>/
//
// Le HTML de ces pages est généré au build (scripts/inject-seo.js) ; ici on
// gère le côté client : lire langue + slug au démarrage, et tenir l'URL à jour
// quand l'utilisateur ouvre / ferme un théâtre dans le panneau.
//
// UrlStateSync réécrit uniquement la partie "?query" (writeSearchToUrl garde
// window.location.pathname), donc le chemin posé ici n'est jamais écrasé.
//
// L'ancien format /content/<slug>/ n'est plus servi que par une petite page de
// redirection (générée au build) : il n'est pas lu ici.

import THEATER_INFO from "../data/theaterInfo.json";

export const THEATER_LANGS = ["en", "fr", "es"];

// La lecture de l'URL vit dans theaterUrl.js (sans dépendance) ; on la ré-exporte
// ici pour que les imports existants (MapView, TheaterPage...) continuent de marcher.
export { getInitialTheaterSlug, getInitialTheaterLang } from "./theaterUrl";

// Chemin d'une page théâtre.
export const theaterPath = (lang, slug) => `/content/${lang}/${slug}/`;

// Même règle que _slugify() dans main.py (utilisé seulement si le bootstrap
// ne fournit pas encore le champ SLUG).
export const slugify = (label) =>
  String(label || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const theaterSlug = (topic) => topic?.SLUG || slugify(topic?.LABEL);

// Slug d'un théâtre dans une langue : dérivé du libellé traduit (theaterInfo.json),
// ex. fr -> "guerre-entre-l-ukraine-et-la-russie". "en" = slug canonique du backend.
// Même règle que localSlug() dans scripts/inject-seo.js.
export const localizedSlug = (topic, lang) => {
  const base = theaterSlug(topic);
  if (!topic || lang === "en") return base;
  const label = THEATER_INFO[topic.LABEL]?.[lang]?.label;
  const s = slugify(String(label || "").replace(/[’']/g, "-"));
  return s && !THEATER_LANGS.includes(s) ? s : base;
};

// Le slug de l'URL correspond-il à ce théâtre, DANS LA LANGUE de l'URL ?
// Slug localisé de cette langue, ou ancien slug canonique (anglais), que TheaterPage
// redirige ensuite vers l'URL localisée. Le slug d'une autre langue ne correspond pas.
export const matchesTheaterSlug = (topic, slug, lang) =>
  localizedSlug(topic, lang) === slug || theaterSlug(topic) === slug;

// Met le chemin à /content/<lang>/<slug>/ (ou "/" si slug = null), en gardant ?query et #hash.
// `lang` : par défaut la langue du document (posée par LangProvider), sinon "en".
export function setTheaterPath(slug, lang) {
  const l = THEATER_LANGS.includes(lang)
    ? lang
    : THEATER_LANGS.includes(document.documentElement.lang)
      ? document.documentElement.lang
      : "en";
  const target = slug ? theaterPath(l, slug) : "/";
  if (window.location.pathname === target) return;
  window.history.replaceState(
    null,
    "",
    `${target}${window.location.search}${window.location.hash}`
  );
}

// Même titre que les pages statiques (anglais) ; fr / es : "<théâtre> | OSINT Watch".
export const theaterTitle = (rawLabel, localizedLabel, lang) =>
  lang === "en" || !localizedLabel
    ? `${rawLabel}: latest OSINT updates and map | OSINT Watch`
    : `${localizedLabel} | OSINT Watch`;