// Postbuild : rend la feuille CSS principale de build/index.html NON bloquante.
//
// Le spinner de chargement de index.html est stylé par un <style> inline et BootScreen
// (React) par des styles inline : ni l'un ni l'autre n'a besoin de main.css pour
// s'afficher. Sans blocage, le premier affichage (FCP) n'attend plus le téléchargement
// de cette feuille. Seule la racine "/" est modifiée : les pages /content/... (générées
// par inject-seo.js, du vrai contenu HTML) gardent leur CSS bloquant pour éviter un
// flash de contenu non stylé. À lancer APRÈS inject-seo.js (voir package.json).
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "build", "index.html");
let html = fs.readFileSync(file, "utf8");
let count = 0;

// Idempotent : déjà traité (évite de re-transformer la copie <noscript>).
if (/\/static\/css\/main\.[^"'\s>]+\.css[^>]*media="print"/.test(html)) {
  console.log("async-css : déjà appliqué, rien à faire");
  process.exit(0);
}

html = html.replace(/<link\b[^>]*>/g, (tag) => {
  const isMainCss = /rel=["']?stylesheet/i.test(tag) && /\/static\/css\/main\.[^"'\s>]+\.css/.test(tag);
  if (!isMainCss || /\bmedia=/.test(tag)) return tag;
  count++;
  const nonBlocking = tag.replace(/\s*\/?>$/, ` media="print" onload="this.media='all'">`);
  return `${nonBlocking}<noscript>${tag}</noscript>`;
});

fs.writeFileSync(file, html);
console.log(`async-css : ${count} feuille(s) principale(s) rendue(s) non bloquante(s) dans build/index.html`);
if (count === 0) console.warn("async-css : aucune feuille main.*.css trouvée (format du build changé ?)");