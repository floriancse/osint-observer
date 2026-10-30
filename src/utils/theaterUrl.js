// Lecture légère de l'URL /content/<lang>/<slug>/ : AUCUNE dépendance (pas de
// theaterInfo.json). LangContext l'importe au démarrage ; le reste du routage
// théâtre (slugs localisés, titres...) reste dans theaterRoute.js.

const PATH_RE = /^\/content\/(en|fr|es)\/([a-z0-9-]+)\/?$/;

let initialRoute; // undefined = pas encore lu ; mémoïsé comme readUrlState()

function readRoute() {
  if (initialRoute === undefined) {
    const m = typeof window !== "undefined" ? window.location.pathname.match(PATH_RE) : null;
    initialRoute = m ? { lang: m[1], slug: m[2] } : { lang: null, slug: null };
  }
  return initialRoute;
}

// Slug présent dans l'URL au chargement de la page (null si on est sur "/").
export const getInitialTheaterSlug = () => readRoute().slug;

// Langue présente dans l'URL au chargement (null hors /content/<lang>/<slug>/).
export const getInitialTheaterLang = () => readRoute().lang;