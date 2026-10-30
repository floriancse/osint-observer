// Après "npm run build" (script "postbuild") :
//   1. injecte dans build/index.html le contenu SEO de la page d'accueil (/seo-content) ;
//   2. génère une page par théâtre ET par langue : build/content/<lang>/<slug>/index.html
//      (en = HTML de /seo-theaters ; fr/es = reconstruit depuis /bootstrap + theaterInfo.json),
//      avec hreflang, og:locale, canonical et JSON-LD propres à chaque langue ;
//   3. génère build/sitemap.xml (avec alternates hreflang) ;
//   2bis. garde l'ancienne URL build/content/<slug>/ comme petite page de redirection ;
//   4. embarque dans chaque page théâtre ses données (<script id="theater-data">),
//      tirées de /bootstrap : TheaterPage n'a alors plus besoin de le télécharger ;
//   5. personnalise les métadonnées de chaque page théâtre : og:type, og:image /
//      twitter:image (image du théâtre) et JSON-LD (CollectionPage + BreadcrumbList).
//
// Ne fait JAMAIS échouer le build : si l'API est injoignable, on garde le bloc
// statique de public/index.html et on n'écrit ni pages ni sitemap.
// Nécessite Node 18+ (fetch intégré).

const fs = require("fs");
const path = require("path");

const API_BASE = process.env.SEO_API_BASE || "https://api.osintwatch.app";
const SITE_URL = (process.env.SITE_URL || "https://osintwatch.app").replace(/\/$/, "");
const BUILD_DIR = path.join(__dirname, "..", "build");
const INDEX_PATH = path.join(BUILD_DIR, "index.html");

const LANGS = ["en", "fr", "es"];
const LOCALES = { en: "en_US", fr: "fr_FR", es: "es_ES" };
const DATE_LOCALES = { en: "en-US", fr: "fr-FR", es: "es-ES" };
const COPY = {
  fr: { back: "Retour à la carte OSINT interactive", updates: "Dernières mises à jour", tail: "Actualités OSINT et carte interactive." },
  es: { back: "Volver al mapa OSINT interactivo", updates: "Últimas actualizaciones", tail: "Noticias OSINT y mapa interactivo." },
};
const MAX_EVENTS = 50;

// Traductions partagées avec le front (src/utils/theaterLabels.js importe le même JSON).
let THEATER_INFO = {};
try {
  THEATER_INFO = require("../src/data/theaterInfo.json");
} catch (err) {
  console.warn(`[inject-seo] src/data/theaterInfo.json illisible, seulement l'anglais : ${err.message}`);
}

// Le fragment ne contient aucun <div> : le premier </div> ferme donc #root.
const ROOT_RE = /(<div id="root">)([\s\S]*?)(<\/div>)/;
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function getText(url, timeoutMs = 20000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// Même règle que slugify() / theaterSlug() dans src/utils/theaterRoute.js.
const slugify = (label) =>
  String(label || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const topicSlug = (t) => t.SLUG || slugify(t.LABEL);

// Slug d'un théâtre dans une langue : dérivé du libellé traduit (theaterInfo.json).
// "en" = slug canonique de l'API. Même règle que localizedSlug() dans src/utils/theaterRoute.js.
const localSlug = (th, lang) => {
  if (lang === "en") return th.slug;
  const label = THEATER_INFO[th.label]?.[lang]?.label;
  const s = slugify(String(label || "").replace(/[’']/g, "-"));
  return s && !LANGS.includes(s) ? s : th.slug;
};

// Données embarquées dans la page d'un théâtre, au même format que /bootstrap
// ({ topics, topic_summaries, topic_summary_tweets }) pour que buildTheaters() les lise telles quelles.
//  - théâtre courant : toutes ses lignes topics + tous ses résumés quotidiens ;
//  - autres théâtres  : juste de quoi alimenter la colonne de droite (libellé,
//    slug, date du dernier résumé), pour ne pas gonfler le HTML.
function buildSeed(bootstrap, slug) {
  const topics = Array.isArray(bootstrap?.topics) ? bootstrap.topics : [];
  const summaries = bootstrap?.topic_summaries || {};
  const allTweets = bootstrap?.topic_summary_tweets || {};
  if (!topics.some((t) => topicSlug(t) === slug)) return null;

  const seedTopics = [];
  const seedSummaries = {};
  const seedTweets = {}; // tweets cités (sources) par les résumés du théâtre courant uniquement
  const seenOthers = new Set(); // la requête SQL répète un topic sur plusieurs lignes
  for (const t of topics) {
    const id = String(t.TOPIC_ID);
    const list = Array.isArray(summaries[id]) ? summaries[id] : [];
    if (topicSlug(t) === slug) {
      seedTopics.push(t);
      seedSummaries[id] = list;
      for (const ev of list) {
        for (const r of ev.tweets || []) {
          if (allTweets[r.id]) seedTweets[r.id] = allTweets[r.id];
        }
      }
    } else if (!seenOthers.has(id)) {
      seenOthers.add(id);
      seedTopics.push({ TOPIC_ID: t.TOPIC_ID, LABEL: t.LABEL, SLUG: t.SLUG, LATEST_UPDATE: t.LATEST_UPDATE });
      const latest = list.reduce((acc, ev) => (!acc || new Date(ev.created_at) > new Date(acc) ? ev.created_at : acc), null);
      if (latest) seedSummaries[id] = [{ created_at: latest }];
    }
  }
  return { topics: seedTopics, topic_summaries: seedSummaries, topic_summary_tweets: seedTweets };
}

// <script type="application/json"> placé APRÈS #root : React ne l'efface pas au montage.
// "<" échappé pour qu'aucune valeur ne puisse fermer la balise <script>.
function embedSeed(html, seed) {
  const json = JSON.stringify(seed).replace(/</g, "\\u003c");
  if (!html.includes("</body>")) throw new Error("</body> introuvable dans build/index.html");
  return html.replace("</body>", () => `<script type="application/json" id="theater-data">${json}</script></body>`);
}

function setRoot(html, fragment) {
  if (!ROOT_RE.test(html)) throw new Error('<div id="root"> introuvable dans build/index.html');
  // Fonction de remplacement : évite l'interprétation des "$&" etc. dans le texte.
  return html.replace(ROOT_RE, (_, open, __, close) => open + fragment + close);
}

// Remplace l'attribut content/href d'une balise, ou échoue bruyamment (le HTML
// du build a changé de forme) plutôt que de publier une page au mauvais titre.
function setAttr(html, tagRe, attr, value) {
  const re = new RegExp(`(${tagRe}[^>]*?\\s${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`balise introuvable : ${tagRe}`);
  return html.replace(re, (_, a, b) => a + escAttr(value) + b);
}

// --- Métadonnées propres à chaque théâtre -------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

// Nom affiché du théâtre : celui du <h1> de la page (déjà dans th.html).
function theaterLabel(th) {
  if (th.label) return th.label;
  const m = /<h1[^>]*class="tp-title"[^>]*>([^<]*)<\/h1>/.exec(th.html || "");
  return m ? decodeEntities(m[1]).trim() : th.title;
}

// URL absolue de l'image du théâtre. Chemin /img/<…>.webp : celui du <img> de th.html
// s'il y en a un, sinon dérivé du label brut avec la même règle que imageUrl() dans
// src/utils/theaters.js (espaces -> "-", puis encodeURIComponent).
// Gardée seulement si l'image existe vraiment (sinon on conserve preview.png) :
//   1. fichier présent dans build/ (copié depuis public/), ou
//   2. image déjà servie en production (HEAD sur l'URL publique).
async function theaterImageUrl(th) {
  const m = /<img[^>]*\ssrc="(\/img\/[^"]+\.webp)"/.exec(th.html || "");
  const pathname = m
    ? m[1]
    : th.label
      ? `/img/${encodeURIComponent(String(th.label).trim().replace(/\s+/g, "-"))}.webp`
      : null;
  if (!pathname) return null;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes("..")) return null;
  const url = SITE_URL + pathname;
  if (fs.existsSync(path.join(BUILD_DIR, rel))) return url;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    if (res.ok && /^image\//.test(res.headers.get("content-type") || "")) return url;
  } catch { /* injoignable : repli sur preview.png */ }
  return null;
}

const LD_RE = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
function setJsonLd(html, data) {
  if (!LD_RE.test(html)) throw new Error("balise JSON-LD introuvable dans le gabarit");
  // "<" échappé : aucune valeur ne peut fermer la balise <script>.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html.replace(LD_RE, () => `<script type="application/ld+json">${json}</script>`);
}

function buildJsonLd(p) {
  const websiteId = `${SITE_URL}/#website`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${p.url}#page`,
        url: p.url,
        name: p.title,
        description: p.description,
        inLanguage: p.lang,
        ...(p.lastmod ? { dateModified: p.lastmod } : {}),
        about: { "@type": "Thing", name: p.label },
        isPartOf: { "@id": websiteId },
        breadcrumb: { "@id": `${p.url}#breadcrumb` },
        ...(p.image ? { image: p.image, primaryImageOfPage: { "@type": "ImageObject", url: p.image } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${p.url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "OSINT Watch", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: p.label, item: p.url },
        ],
      },
      { "@type": "WebSite", "@id": websiteId, url: `${SITE_URL}/`, name: "OSINT Watch", inLanguage: "en" },
    ],
  };
}

// --- Multilingue ---------------------------------------------------------------

const pageUrl = (lang, slug) => `${SITE_URL}/content/${lang}/${slug}/`;

// Coupe sur une limite de mot, avec "…".
function clip(s, n) {
  s = String(s).replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const i = cut.lastIndexOf(" ");
  return (i > n * 0.5 ? cut.slice(0, i) : cut).replace(/[\s,;:.]+$/, "") + "…";
}

// Mots de liaison à ne pas laisser en fin de description coupée (« …entre l'Iran et… »).
const DANGLING = {
  fr: "à au aux avec contre dans de des du en entre et la le les leur leurs ou par pour que qui sa se ses son sur un une l' d'",
  es: "a al con contra de del el en entre la las los o para por que su sus un una y como",
};

// Coupe la tête de description à `max` caractères : 1re phrase si elle tient, sinon coupe au
// dernier mot, jamais dans une parenthèse ouverte ni sur un mot de liaison ; termine par « … ».
function clipHead(label, summary, max, lang) {
  const first = String(summary || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0];
  const full = first ? `${label} : ${first}` : String(label);
  if (full.length <= max) return /[.!?]$/.test(full) ? full : full + ".";
  let cut = full.slice(0, max - 1);
  cut = cut.slice(0, cut.lastIndexOf(" ")); // dernier mot entier
  if (cut.split("(").length > cut.split(")").length) cut = cut.slice(0, cut.lastIndexOf("(")); // parenthèse ouverte
  const strip = (t) => t.replace(/[\s,;:.\-–—]+$/, "");
  const stop = new Set((DANGLING[lang] || "").split(" "));
  let words = strip(cut).split(" ");
  while (words.length > 1 && stop.has(words[words.length - 1].toLowerCase().replace(/[,;:]+$/, ""))) words.pop();
  return strip(words.join(" ")) + "…";
}

// Lignes de topics + résumés quotidiens d'un théâtre dans /bootstrap.
function findTheater(bootstrap, slug) {
  const topics = (Array.isArray(bootstrap?.topics) ? bootstrap.topics : []).filter((t) => topicSlug(t) === slug);
  if (!topics.length) return null;
  const id = String(topics[0].TOPIC_ID);
  const list = Array.isArray(bootstrap?.topic_summaries?.[id]) ? bootstrap.topic_summaries[id] : [];
  const events = list
    .filter((e) => e && e.created_at && !Number.isNaN(new Date(e.created_at).getTime()))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const withCountries = topics.find((t) => Array.isArray(t.COUNTRIES) && t.COUNTRIES.length);
  return { events, countries: withCountries ? withCountries.COUNTRIES : [] };
}

// Même règle de repli que TheaterPage : champ_<lang>, sinon anglais (hors fr), sinon brut.
const pickField = (ev, base, lang) =>
  ev[`${base}_${lang}`] || (lang !== "fr" ? ev[`${base}_en`] : "") || ev[base] || "";

// Fragment HTML (sans <div>) dans le même format que celui de /seo-theaters.
function buildFragment(lang, label, countries, events) {
  const c = COPY[lang];
  const articles = events
    .slice(0, MAX_EVENTS)
    .map((ev) => {
      const title = pickField(ev, "summary_title", lang);
      const text = pickField(ev, "summary", lang);
      if (!title && !text) return "";
      const day = new Date(ev.created_at).toISOString().slice(0, 10);
      const date = new Date(ev.created_at).toLocaleDateString(DATE_LOCALES[lang], {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      });
      return `<article>${title ? `<h3>${escText(title)}</h3>` : ""}<time datetime="${day}">${escText(date)}</time><p>${escText(text)}</p></article>`;
    })
    .join("");
  const ctr = countries.length ? `<p>${escText(countries.join(", "))}</p>` : "";
  return `<h1>${escText(label)}</h1>${ctr}<p><a href="/">${c.back}</a></p><h2>${c.updates}</h2>${articles}`;
}

// Les liens /content/<slug>/ (ancien format, redirigé) deviennent /content/en/<slug>/ :
// filet de sécurité si le backend sert encore l'ancien format.
const toEnLinks = (html) =>
  String(html || "").replace(/href="\/content\/([a-z0-9-]+)\/"/g, (m, slug) =>
    LANGS.includes(slug) ? m : `href="/content/en/${slug}/"`
  );

// Prépare la page d'un théâtre dans une langue ; null si la langue n'est pas disponible.
function buildPageSpec(th, lang, bootstrap) {
  const url = pageUrl(lang, localSlug(th, lang));
  if (lang === "en") {
    return { lang, url, title: th.title, description: th.description, label: theaterLabel(th), fragment: toEnLinks(th.html), lastmod: th.lastmod };
  }
  const tr = THEATER_INFO[th.label]?.[lang];
  const found = bootstrap ? findTheater(bootstrap, th.slug) : null;
  if (!tr || !found) return null;
  const tail = COPY[lang].tail;
  // Description fixe (résumé du théâtre) : ne dépend plus du dernier résumé quotidien.
  const head = clipHead(tr.label, tr.summary, Math.max(40, 160 - tail.length - 1), lang);
  return {
    lang, url,
    title: `${tr.label} | OSINT Watch`,
    description: `${head} ${tail}`,
    label: tr.label,
    fragment: buildFragment(
      lang,
      tr.label,
      // Même source que MapView : bootstrap.entity_names_<lang> (nom anglais -> nom traduit)
      found.countries.map((c) => bootstrap?.[`entity_names_${lang}`]?.[c] ?? c),
      found.events
    ),
    lastmod: th.lastmod,
  };
}

function setHtmlLang(html, lang) {
  html = /<html\b[^>]*\slang="/.test(html)
    ? html.replace(/(<html\b[^>]*?\slang=")[^"]*(")/, (_, a, b) => a + lang + b)
    : html.replace(/<html\b/, () => `<html lang="${lang}"`);
  // Marqueur lu par TheaterPage : titre / description / canonical sont déjà bons, on n'y touche pas.
  return html.replace(/<html\b/, () => '<html data-seo="1"');
}

function addToHead(html, tags) {
  if (!html.includes("</head>")) throw new Error("</head> introuvable dans build/index.html");
  return html.replace("</head>", () => `${tags}</head>`);
}

function buildTheaterPage(template, p, langs, seed) {
  // Image du théâtre avec un vrai alt (le HTML de l'API n'en contient pas), juste après le <h1>.
  const fragment = p.image
    ? p.fragment.replace("</h1>", () => `</h1><img src="${escAttr(p.image)}" alt="${escAttr(p.label)}">`)
    : p.fragment;
  let html = setRoot(template, fragment);
  html = setHtmlLang(html, p.lang);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escText(p.title)}</title>`);
  html = setAttr(html, '<meta\\s+name="description"', "content", p.description);
  html = setAttr(html, '<link\\s+rel="canonical"', "href", p.url);
  html = setAttr(html, '<meta\\s+property="og:title"', "content", p.title);
  html = setAttr(html, '<meta\\s+property="og:description"', "content", p.description);
  html = setAttr(html, '<meta\\s+property="og:url"', "content", p.url);
  html = setAttr(html, '<meta\\s+name="twitter:title"', "content", p.title);
  html = setAttr(html, '<meta\\s+name="twitter:description"', "content", p.description);
  html = setAttr(html, '<meta\\s+property="og:type"', "content", "article");
  if (p.image) {
    html = setAttr(html, '<meta\\s+property="og:image"', "content", p.image);
    html = setAttr(html, '<meta\\s+name="twitter:image"', "content", p.image);
  }
  // og:locale + hreflang (réécrits à neuf : on retire ce que le gabarit pourrait contenir)
  html = html.replace(/<meta\s+property="og:locale[^>]*>\s*/g, "").replace(/<link\s+rel="alternate"\s+hreflang[^>]*>\s*/g, "");
  const alt = langs.filter((l) => l !== p.lang);
  html = addToHead(
    html,
    `<meta property="og:locale" content="${LOCALES[p.lang]}">` +
      alt.map((l) => `<meta property="og:locale:alternate" content="${LOCALES[l]}">`).join("") +
      langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${escAttr(pageUrl(l, p.slugs[l]))}">`).join("") +
      `<link rel="alternate" hreflang="x-default" href="${escAttr(pageUrl("en", p.slugs.en || p.slug))}">`
  );
  html = setJsonLd(html, buildJsonLd(p));
  if (seed) html = embedSeed(html, seed);
  return html;
}

// Ancienne URL /content/<slug>/ : petite page de redirection vers la langue du visiteur
// (GitHub Pages ne sait pas faire de 301). Le canonical pointe vers la version anglaise.
function buildLegacyStub(slug, slugs, label, langs) {
  const en = pageUrl("en", slugs.en || slug);
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escText(label)} | OSINT Watch</title>` +
    `<link rel="canonical" href="${escAttr(en)}">` +
    `<noscript><meta http-equiv="refresh" content="0;url=${escAttr(en)}"></noscript>` +
    `<script>(function(){var l="en";try{l=localStorage.getItem("lang")||(navigator.language||"en").slice(0,2)}catch(e){}` +
    `if(${JSON.stringify(langs)}.indexOf(l)<0)l="en";var m=${JSON.stringify(slugs)};location.replace("/content/"+l+"/"+(m[l]||${JSON.stringify(slug)})+"/"+location.search+location.hash)})()</script>` +
    `</head><body><p><a href="${escAttr(en)}">${escText(label)}</a></p></body></html>\n`
  );
}

// Redirection d'une ancienne URL /content/<lang>/<slug-anglais>/ vers sa version localisée.
function buildRedirectStub(target, label) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escText(label)} | OSINT Watch</title>` +
    `<link rel="canonical" href="${escAttr(target)}">` +
    `<meta http-equiv="refresh" content="0;url=${escAttr(target)}">` +
    `<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")}+location.search+location.hash)</script>` +
    `</head><body><p><a href="${escAttr(target)}">${escText(label)}</a></p></body></html>\n`
  );
}

// generated : [{ slug, slugs: { en, fr, es }, lastmod, langs: ["en", "fr", ...] }]
function buildSitemap(generated) {
  const today = new Date().toISOString().slice(0, 10);
  const lastHome = generated.map((t) => t.lastmod).filter(Boolean).sort().pop() || today;
  const lm = (d) => (d ? `<lastmod>${d}</lastmod>` : "");
  const entries = [`  <url><loc>${escText(SITE_URL + "/")}</loc>${lm(lastHome)}</url>`];
  for (const g of generated) {
    const links =
      g.langs.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escAttr(pageUrl(l, g.slugs[l]))}"/>`).join("") +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${escAttr(pageUrl("en", g.slugs.en || g.slug))}"/>`;
    for (const l of g.langs) entries.push(`  <url><loc>${escText(pageUrl(l, g.slugs[l]))}</loc>${lm(g.lastmod)}${links}</url>`);
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries.join("\n") +
    `\n</urlset>\n`
  );
}

(async () => {
  let template;
  try {
    // 1. Page d'accueil
    let fragment = (await getText(`${API_BASE}/seo-content`)).trim();
    if (!fragment.startsWith("<h1>") || fragment.includes("</div>")) throw new Error("fragment inattendu");
    // L'API renvoie des liens /content/<slug>/ (ancien format, redirigé) : on les
    // réécrit vers la page anglaise directe /content/en/<slug>/.
    fragment = fragment.replace(/href="\/content\/([a-z0-9-]+)\/"/g, (m, slug) =>
      LANGS.includes(slug) ? m : `href="/content/en/${slug}/"`
    );
    template = setRoot(fs.readFileSync(INDEX_PATH, "utf8"), fragment);
    fs.writeFileSync(INDEX_PATH, template);
    console.log(`[inject-seo] accueil : contenu injecté (${fragment.length} caractères)`);
  } catch (err) {
    console.warn(`[inject-seo] accueil ignoré, bloc statique conservé : ${err.message}`);
    return; // sans contenu frais, on ne génère pas de pages par théâtre
  }

  try {
    // 2. Pages par théâtre et par langue + sitemap
    const { theaters } = JSON.parse(await getText(`${API_BASE}/seo-theaters`));
    if (!Array.isArray(theaters) || theaters.length === 0) throw new Error("aucun théâtre");

    // Un seul fetch de /bootstrap : données embarquées ET contenu fr/es. S'il échoue, seules
    // les pages anglaises (issues de /seo-theaters) sont générées, sans données embarquées.
    let bootstrap = null;
    try {
      bootstrap = JSON.parse(await getText(`${API_BASE}/bootstrap`, 60000));
    } catch (err) {
      console.warn(`[inject-seo] /bootstrap indisponible, pages anglaises seules : ${err.message}`);
    }

    const base = fs.readFileSync(INDEX_PATH, "utf8");
    const generated = [];
    let written = 0;
    let seeded = 0;
    for (const th of theaters) {
      if (!/^[a-z0-9-]+$/.test(th.slug) || LANGS.includes(th.slug)) continue; // le slug devient un nom de dossier
      const seed = bootstrap ? buildSeed(bootstrap, th.slug) : null;
      if (seed) seeded++;
      const image = await theaterImageUrl(th);
      if (!image) console.warn(`[inject-seo] ${th.slug} : image introuvable, preview.png conservé`);

      const slugs = Object.fromEntries(LANGS.map((l) => [l, localSlug(th, l)]));
      const specs = [];
      for (const lang of LANGS) {
        const spec = buildPageSpec(th, lang, bootstrap);
        if (spec) specs.push({ ...spec, slug: slugs[lang], slugs, image });
        else console.warn(`[inject-seo] ${th.slug} : pas de version "${lang}" (traduction ou données manquantes)`);
      }
      const langs = specs.map((s) => s.lang);
      for (const spec of specs) {
        const dir = path.join(BUILD_DIR, "content", spec.lang, spec.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), buildTheaterPage(base, spec, langs, seed));
        written++;
        // Ancienne URL /content/<lang>/<slug-anglais>/ -> redirection vers le slug localisé
        if (spec.slug !== th.slug) {
          const oldDir = path.join(BUILD_DIR, "content", spec.lang, th.slug);
          fs.mkdirSync(oldDir, { recursive: true });
          fs.writeFileSync(path.join(oldDir, "index.html"), buildRedirectStub(spec.url, spec.label));
        }
      }
      // Ancienne URL /content/<slug>/ -> redirection
      const legacyDir = path.join(BUILD_DIR, "content", th.slug);
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, "index.html"), buildLegacyStub(th.slug, slugs, theaterLabel(th), langs));
      generated.push({ slug: th.slug, slugs, lastmod: th.lastmod, langs });
    }
    fs.writeFileSync(path.join(BUILD_DIR, "sitemap.xml"), buildSitemap(generated));
    console.log(`[inject-seo] ${written} pages théâtre (${generated.length} théâtres, ${seeded} avec données embarquées) + redirections + sitemap.xml générés`);
  } catch (err) {
    console.warn(`[inject-seo] pages théâtre ignorées : ${err.message}`);
  }
})();