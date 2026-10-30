import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
// Toutes les traductions (textes, types DB, noms) vivent dans utils/i18n.js
import {
  translations,
  LANG_ORDER,
  MAP_LANGUAGES,
  DATE_LOCALES,
  translateWeaponType as translateWeaponTypeShared,
  translateObjectiveType as translateObjectiveTypeShared,
  setNameDictionary,
} from "../utils/i18n";
import { isTheaterPagePath } from "../utils/theaters";
// theaterUrl (et non theaterRoute) : évite de tirer theaterInfo.json dans le bundle principal
import { getInitialTheaterLang } from "../utils/theaterUrl";

const LangContext = createContext(null);

export function LangProvider({ children, defaultLang }) {
  const [lang, setLang] = useState(() => {
    // 0. Langue de l'URL (/content/<lang>/<slug>/) : prioritaire
    const urlLang = getInitialTheaterLang();
    if (urlLang && translations[urlLang]) return urlLang;
    // 1. Choix déjà mémorisé
    const saved = localStorage.getItem("lang");
    if (saved && translations[saved]) return saved;
    // 2. Langue par défaut imposée par le parent (optionnel)
    if (defaultLang && translations[defaultLang]) return defaultLang;
    // 3. Langue du navigateur
    const browserLang = navigator.language?.slice(0, 2);
    return translations[browserLang] ? browserLang : "en";
  });

  useEffect(() => {
    localStorage.setItem("lang", lang);
    // SEO / accessibilité : langue du document et titre de l'onglet
    document.documentElement.lang = lang;
    // Sur /content/<lang>/<slug>/, c'est TheaterPage qui gère le titre (les effets du
    // parent s'exécutent APRÈS ceux de l'enfant : on écraserait son titre).
    if (!isTheaterPagePath()) {
      document.title = translations[lang].pageTitle;
      // <meta name="description"> suit aussi la langue (la balise existe dans index.html)
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", translations[lang].metaDescription);
    }
  }, [lang]);

  // Dictionnaires de noms traduits, par langue : { fr: {...}, es: {...} }.
  //  - entités (pays, zones...) : world_areas.entity_name_<lang> (bootstrap)
  //  - acteurs non étatiques    : NON_STATE_ACTORS.name_<lang>  (bootstrap)
  // Alimentés une fois par MapView. L'anglais n'a pas de dictionnaire : le nom
  // brut est déjà en anglais. Pour une nouvelle langue : ajouter son setter.
  const [entityNames, setEntityNames] = useState({});
  const [actorNames, setActorNames] = useState({});
  // Setters / traducteurs stables (useCallback) + `value` mémoïsé : sans ça, l'objet
  // était recréé à chaque rendu et re-rendait TOUS les consommateurs de useLang.
  // Chaque setter alimente aussi le module partagé utils/i18n.js.
  const setEntityNamesFr = useCallback((dict) => {
    setNameDictionary("entity", "fr", dict);
    setEntityNames((p) => ({ ...p, fr: dict }));
  }, []);
  const setEntityNamesEs = useCallback((dict) => {
    setNameDictionary("entity", "es", dict);
    setEntityNames((p) => ({ ...p, es: dict }));
  }, []);
  const setActorNamesFr = useCallback((dict) => {
    setNameDictionary("actor", "fr", dict);
    setActorNames((p) => ({ ...p, fr: dict }));
  }, []);
  const setActorNamesEs = useCallback((dict) => {
    setNameDictionary("actor", "es", dict);
    setActorNames((p) => ({ ...p, es: dict }));
  }, []);

  // Passe à la langue suivante (fr -> en -> es -> fr). Pour un sélecteur
  // explicite, utiliser plutôt setLang("fr" | "en" | "es").
  const toggleLang = useCallback(
    () => setLang((l) => LANG_ORDER[(LANG_ORDER.indexOf(l) + 1) % LANG_ORDER.length]),
    []
  );

  // Traduit une valeur brute de weapon_type / objective_type vers le libellé
  // dans la langue active, en délégant au module partagé (aussi utilisé par
  // popupUtils.js qui n'a pas accès à React).
  const translateWeaponType = useCallback((rawValue) => translateWeaponTypeShared(rawValue, lang), [lang]);
  const translateObjectiveType = useCallback((rawValue) => translateObjectiveTypeShared(rawValue, lang), [lang]);

  // Traduit un nom d'entité (pays, zone...) via le dictionnaire de la langue
  // active (fr / es), sinon renvoie la valeur brute (anglais ou nom inconnu).
  const translateEntity = useCallback((name) => entityNames[lang]?.[name] ?? name, [entityNames, lang]);

  // Traduit un nom d'acteur non étatique : même logique que translateEntity.
  const translateActor = useCallback((name) => actorNames[lang]?.[name] ?? name, [actorNames, lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t: translations[lang],
      mapLanguage: MAP_LANGUAGES[lang] ?? "en",
      dateLocale: DATE_LOCALES[lang] ?? DATE_LOCALES.en,
      availableLangs: LANG_ORDER,
      translateWeaponType,
      translateObjectiveType,
      setEntityNamesFr,
      setEntityNamesEs,
      translateEntity,
      setActorNamesFr,
      setActorNamesEs,
      translateActor,
    }),
    [
      lang, toggleLang, translateWeaponType, translateObjectiveType,
      setEntityNamesFr, setEntityNamesEs, translateEntity,
      setActorNamesFr, setActorNamesEs, translateActor,
    ]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang doit être utilisé à l'intérieur d'un <LangProvider>");
  }
  return ctx;
};