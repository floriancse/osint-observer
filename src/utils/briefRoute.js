// Page « Daily brief » : /content/<lang>/brief  (fr, en, es...)

export const briefPath = (lang) => `/content/${lang || "en"}/brief`;

// Langue portée par l'URL (ex. "fr" pour /content/fr/brief), ou null si on n'est pas sur la page.
export const getBriefLang = () => {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/content\/([a-z]{2})\/brief\/?$/i);
  return m ? m[1].toLowerCase() : null;
};

export const isBriefPage = () => getBriefLang() !== null;