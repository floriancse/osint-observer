// utils/formatRelativeTime.js
// "Il y a 2 h" / "2 hr. ago" / "Hace 2 h", via Intl (pas de dictionnaire à maintenir).

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatRelativeTime(value, lang = "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  // Moins d'une minute (ou date légèrement dans le futur) : "maintenant"
  if (seconds < 60) {
    return capitalize(
      new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(0, "second")
    );
  }

  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "always", style: "short" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return capitalize(rtf.format(-Math.floor(seconds / size), unit));
    }
  }
  return "";
}