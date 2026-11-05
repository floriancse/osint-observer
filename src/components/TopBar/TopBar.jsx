import { useLang } from "../../context/LangContext";
import { briefPath } from "../../utils/briefRoute";
import { theatersIndexPath } from "../../utils/theatersIndexRoute";
import "./TopBar.css";

// Libellés de repli si t.topbar n'existe pas encore dans LangContext.
// Pour traduire proprement : ajoute `topbar: { map, brief, theaters, label }` dans tes dictionnaires.
const FALLBACK = {
  fr: { map: "Carte", brief: "Résumé du jour", theaters: "Théâtres", label: "Navigation principale" },
  en: { map: "Map", brief: "Daily brief", theaters: "Theaters", label: "Main navigation" },
  es: { map: "Mapa", brief: "Resumen diario", theaters: "Teatros", label: "Navegación principal" },
};
const BRAND = "OSINT Watch";

/**
 * Barre de navigation : Carte / Résumé du jour / Théâtres.
 *  - variant "float" (carte) : pastille flottante sans fond, au-dessus de la carte (sans marque).
 *  - variant "bar" (pages /content/...) : bandeau collant avec fond, avec la marque.
 * Un bouton avec handler (onMap, onBrief, onTheaters) agit sur place ; sans handler, c'est un lien :
 *   Carte → /   |   Résumé du jour → /content/<lang>/brief   |   Théâtres → /content/<lang>/theaters/.
 */
export default function TopBar({ active, onMap, onBrief, onTheaters, variant = "float", lang: langProp, brand = BRAND }) {
  const { t, lang: ctxLang } = useLang();
  const lang = langProp || ctxLang;
  const L = { ...(FALLBACK[lang] || FALLBACK.en), ...(t.topbar || {}) };

  const items = [
    { id: "map", label: L.map, onClick: onMap, href: "/" },
    { id: "brief", label: L.brief, onClick: onBrief, href: briefPath(lang) },
    { id: "theaters", label: L.theaters, onClick: onTheaters, href: theatersIndexPath(lang) },
  ];

  return (
    <header className={`topbar topbar--${variant}`}>
      {variant === "bar" && (onMap ? (
        <button type="button" className="topbar-brand" onClick={onMap}>{brand}</button>
      ) : (
        <a className="topbar-brand" href="/">{brand}</a>
      ))}
      <nav className="topbar-nav" aria-label={L.label}>
        {items.map((it) => {
          const cls = `topbar-btn${active === it.id ? " is-active" : ""}`;
          const cur = active === it.id ? "page" : undefined;
          const inner = it.label;
          return it.onClick ? (
            <button key={it.id} type="button" className={cls} aria-current={cur} aria-label={it.label} onClick={it.onClick}>{inner}</button>
          ) : (
            <a key={it.id} href={it.href} className={cls} aria-current={cur} aria-label={it.label}>{inner}</a>
          );
        })}
      </nav>
    </header>
  );
}