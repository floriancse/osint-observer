// Page « tous les théâtres » : /content/<lang>/theaters/
// (même logique que /content/<lang>/brief : à tester AVANT isTheaterPagePath() dans App.jsx,
// sinon « theaters » serait lu comme le slug d'un théâtre).

const INDEX_RE = /^\/content\/([A-Za-z]{2}(?:-[A-Za-z]+)?)\/theaters\/?$/;

export const theatersIndexPath = (lang) => `/content/${lang}/theaters/`;

export function isTheatersIndexPage() {
  return typeof window !== "undefined" && INDEX_RE.test(window.location.pathname);
}

// Langue portée par l'URL (null si on n'est pas sur la page).
export function getTheatersIndexLang() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(INDEX_RE);
  return m ? m[1] : null;
}