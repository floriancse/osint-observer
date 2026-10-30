import "./popupUtils.css";
import {
  translateWeaponType,
  translateObjectiveType,
  translateConflictTypology,
  translateAggressor,
  translateTarget,
  getCurrentLang,
  getTranslations,
  DATE_LOCALES,
} from "./i18n";


// Les propriétés lues via queryRenderedFeatures (MapLibre/MapTiler) sont
// sérialisées en JSON quand ce sont des objets/tableaux (ex: translations,
// images). Ce helper accepte indifféremment la valeur déjà parsée (SidePanel,
// données /bootstrap) ou la chaîne JSON (popups de la carte).
function parseJSONProp(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Textes d'interface : tout est dans i18n.js (groupe `tweetCard`).
// Repli sur l'anglais si une langue n'a pas (encore) de dictionnaire.
const getUI = (lang) => getTranslations(lang).tweetCard;

const isValidUrl = (u) => u && typeof u === "string" && u.trim() !== "";

// Identifiant numérique du média, présent à la fois dans l'URL de la miniature
// (.../amplify_video_thumb/<id>/img/...) et dans celle de la vidéo
// (.../amplify_video/<id>/vid/...). Sert à associer une vidéo à sa miniature.
const mediaId = (url) => String(url).match(/\/(\d{10,})\//)?.[1] ?? null;

const VIDEO_THUMB_RE = /(amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)/;

// Sépare les médias d'un tweet :
//  - photos : images à afficher dans la grille
//  - videos : [{ src, poster }] avec la miniature associée quand elle existe
// Les miniatures de vidéos sont stockées comme des "images" en base : on les
// retire de la grille uniquement si une vidéo les remplace (anciens tweets
// sans vidéo en base : la miniature reste affichée comme avant).
function splitMedia(props) {
  const images = parseJSONProp(props.images, []);
  const videos = parseJSONProp(props.videos, []);
  const imgs = (Array.isArray(images) ? images : []).filter(isValidUrl);
  const vids = (Array.isArray(videos) ? videos : []).filter(isValidUrl);

  const thumbs = imgs.filter((u) => VIDEO_THUMB_RE.test(u));
  const used = new Set();

  const videoItems = vids.map((src, i) => {
    const id = mediaId(src);
    let poster = thumbs.find((t) => !used.has(t) && id && mediaId(t) === id);
    if (!poster) poster = thumbs.find((t) => !used.has(t)); // repli : par ordre
    if (poster) used.add(poster);
    return { src, poster: poster || null };
  });

  // Si le tweet a des vidéos, aucune miniature de vidéo ne doit finir dans la
  // grille de photos : celles qui ont servi de poster sont déjà exclues (used),
  // et les miniatures en surplus (doublons, anciennes données) le sont aussi.
  const hasVideos = videoItems.length > 0;
  return {
    photos: imgs.filter(
      (u) => !used.has(u) && !(hasVideos && VIDEO_THUMB_RE.test(u))
    ),
    videos: videoItems,
  };
}

// Attributs de chargement des <img> : la 1re carte de la liste (priority) est
// chargée tout de suite et en priorité (c'est le LCP) ; les autres sont différées.
const imgLoadAttrs = (priority) =>
  priority
    ? 'loading="eager" decoding="async" fetchpriority="high"'
    : 'loading="lazy" decoding="async"';

// Triangle de lecture à coins arrondis : triangle d'origine (8,5 / 8,19 / 19,12) rétréci de 1,5
// (demi-épaisseur du trait) puis contourné d'un trait de 3 à jonctions rondes => même encombrement.
const PLAY_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;

// Remplace la miniature par un vrai lecteur <video> au clic. Tant que l'utilisateur
// n'a pas cliqué, aucun lecteur n'est monté : moins de DOM, et la miniature est
// une vraie <img> (fetchpriority / lazy possibles, taille réservée par le CSS).
//
// Le lecteur est créé INVISIBLE (.is-loading) par-dessus la miniature, qui reste affichée
// tant qu'il n'a pas reçu ses premières images. Sinon, pendant la négociation de la source,
// le lecteur natif vide affichait une fraction de seconde son écran gris "format non
// supporté", même quand la vidéo se lisait ensuite normalement.
// ── Contrôles vidéo personnalisés ──
// Les contrôles natifs du navigateur masquent la barre de progression et le volume
// quand le lecteur est étroit (vidéos portrait). On les remplace par une barre
// compacte qui garde toujours : lecture, progression, volume, plein écran.
const vcIcon = (path) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg>`;
const VC_ICONS = {
  play: vcIcon('<path d="M8 5v14l11-7z"/>'),
  pause: vcIcon('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'),
  volume: vcIcon('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/>'),
  muted: vcIcon('<path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v2.2l2.5 2.5V12zM19 12a7 7 0 0 1-.9 3.4l1.5 1.5A9 9 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.1v2.1a9 9 0 0 0 3.5-1.8l2 2 1.3-1.3L4.3 3zM12 4 9.9 6.1 12 8.2V4z"/>'),
  fullscreen: vcIcon('<path d="M7 14H5v5h5v-2H7v-3zM5 10h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>'),
};

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// Volume partagé entre toutes les vidéos : régler l'une règle aussi les autres
// (celles déjà affichées et celles qui seront lues ensuite).
const sharedVolume = { volume: 1, muted: false };
const vcVideos = new Set();

const applySharedVolume = (v) => {
  if (v.volume !== sharedVolume.volume) v.volume = sharedVolume.volume;
  if (v.muted !== sharedVolume.muted) v.muted = sharedVolume.muted;
};

// Appelé à chaque "volumechange". Si les valeurs de la vidéo diffèrent du volume partagé,
// c'est un réglage de l'utilisateur : on le mémorise et on le propage. Les vidéos qui
// reçoivent la propagation déclenchent à leur tour un évènement, mais avec des valeurs
// déjà égales au volume partagé : pas de boucle.
const onSharedVolumeChange = (v) => {
  if (v.volume === sharedVolume.volume && v.muted === sharedVolume.muted) return;
  sharedVolume.volume = v.volume;
  sharedVolume.muted = v.muted;
  vcVideos.forEach((other) => {
    if (!other.isConnected) vcVideos.delete(other); // vidéo retirée du DOM (popup fermée, liste rafraîchie)
    else if (other !== v) applySharedVolume(other);
  });
};

function buildVideoControls(v, wrap) {
  const L = getUI(getCurrentLang()).vc;
  const bar = document.createElement("div");
  bar.className = "tweet-card-vc";
  bar.innerHTML = `
    <input type="range" class="vc-seek" min="0" max="1000" step="1" value="0" aria-label="${L.seek}">
    <div class="vc-row">
      <button type="button" class="vc-btn vc-play"></button>
      <span class="vc-time">0:00 / 0:00</span>
      <span class="vc-spacer"></span>
      <div class="vc-volgroup">
        <button type="button" class="vc-btn vc-mute"></button>
        <span class="vc-volpop"><input type="range" class="vc-vol" min="0" max="1" step="0.05" value="1" aria-label="${L.volume}"></span>
      </div>
      <button type="button" class="vc-btn vc-fs" aria-label="${L.fullscreen}" title="${L.fullscreen}">${VC_ICONS.fullscreen}</button>
    </div>`;

  const seek = bar.querySelector(".vc-seek");
  const playBtn = bar.querySelector(".vc-play");
  const muteBtn = bar.querySelector(".vc-mute");
  const vol = bar.querySelector(".vc-vol");
  const time = bar.querySelector(".vc-time");
  const fsBtn = bar.querySelector(".vc-fs");
  let seeking = false;

  const setFill = (el, ratio) => el.style.setProperty("--p", `${(ratio * 100).toFixed(1)}%`);

  const syncPlay = () => {
    const paused = v.paused || v.ended;
    playBtn.innerHTML = paused ? VC_ICONS.play : VC_ICONS.pause;
    playBtn.setAttribute("aria-label", paused ? L.play : L.pause);
    playBtn.title = paused ? L.play : L.pause;
  };
  const syncTime = () => {
    const d = v.duration;
    time.textContent = `${fmtTime(v.currentTime)} / ${fmtTime(d)}`;
    seek.title = time.textContent; // durée visible au survol quand le timer est masqué
    if (!seeking && Number.isFinite(d) && d > 0) {
      seek.value = Math.round((v.currentTime / d) * 1000);
      setFill(seek, v.currentTime / d);
    }
  };
  const syncVolume = () => {
    const silent = v.muted || v.volume === 0;
    muteBtn.innerHTML = silent ? VC_ICONS.muted : VC_ICONS.volume;
    muteBtn.setAttribute("aria-label", silent ? L.unmute : L.mute);
    muteBtn.title = silent ? L.unmute : L.mute;
    const level = v.muted ? 0 : v.volume;
    vol.value = level;
    setFill(vol, level);
  };

  const toggle = () => (v.paused || v.ended ? v.play?.()?.catch?.(() => {}) : v.pause());
  playBtn.onclick = toggle;
  v.addEventListener("click", toggle); // clic sur l'image = lecture / pause

  muteBtn.onclick = () => {
    if (v.muted || v.volume === 0) {
      v.muted = false;
      if (v.volume === 0) v.volume = 0.5;
    } else {
      v.muted = true;
    }
  };
  vol.oninput = () => {
    v.volume = Number(vol.value);
    v.muted = v.volume === 0;
  };

  seek.addEventListener("input", () => {
    seeking = true;
    setFill(seek, seek.value / 1000);
    if (Number.isFinite(v.duration)) v.currentTime = (seek.value / 1000) * v.duration;
  });
  seek.addEventListener("change", () => { seeking = false; });

  fsBtn.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (wrap.requestFullscreen) wrap.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS Safari
  };

  ["play", "pause", "ended"].forEach((e) => v.addEventListener(e, syncPlay));
  ["timeupdate", "loadedmetadata", "durationchange"].forEach((e) => v.addEventListener(e, syncTime));
  v.addEventListener("volumechange", syncVolume);
  v.addEventListener("volumechange", () => onSharedVolumeChange(v));

  applySharedVolume(v); // reprend le volume réglé sur les autres vidéos
  vcVideos.add(v);

  syncPlay();
  syncTime();
  syncVolume();
  return bar;
}

if (typeof window !== "undefined") {
  window.playTweetVideo = (btn) => {
    const wrap = btn.parentElement;
    if (!wrap || wrap.querySelector("video")) return; // double clic : un seul lecteur

    const v = document.createElement("video");
    v.className = "is-loading";
    v.controls = false; // contrôles personnalisés (buildVideoControls)
    v.playsInline = true;
    v.autoplay = true;
    v.preload = "auto";
    v.poster = btn.querySelector("img")?.src || "";

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      v.classList.remove("is-loading");
      btn.remove(); // la miniature n'est plus utile : le lecteur affiche déjà l'image
      wrap.appendChild(buildVideoControls(v, wrap));
    };
    // Premières images décodées (ou lecture démarrée) : on peut montrer le lecteur
    v.addEventListener("loadeddata", reveal);
    v.addEventListener("playing", reveal);

    v.onerror = () => {
      console.warn("Erreur vidéo", v.error && v.error.code, v.currentSrc);
      v.remove();
      btn.remove();
      wrap.querySelector(".tweet-card-vc")?.remove();
      const fb = wrap.querySelector(".tweet-card-video-fallback");
      if (fb) fb.hidden = false;
    };

    btn.style.pointerEvents = "none"; // évite de relancer pendant le chargement
    v.src = btn.dataset.src;
    wrap.insertBefore(v, btn.nextSibling); // après la miniature : même cadre, au-dessus d'elle
    const p = v.play?.();
    if (p && p.catch) p.catch(() => {});
  };

  // Bouton "Afficher / Masquer les médias". Les médias sont stockés dans un <template> :
  // tant que l'utilisateur n'a pas déplié, rien n'est inséré dans le DOM (aucune image ni
  // vidéo n'est téléchargée). Au repli, le contenu est retiré : une vidéo en lecture s'arrête.
  window.toggleTweetMedia = (btn) => {
    const root = btn.closest(".tweet-card-media-toggle");
    const body = root && root.querySelector(".tweet-card-media-body");
    const tpl = root && root.querySelector("template");
    if (!body || !tpl) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    if (open) {
      body.replaceChildren();
      body.hidden = true;
    } else {
      body.appendChild(tpl.content.cloneNode(true));
      body.hidden = false;
      // les flèches du carrousel ne se calculent qu'une fois le contenu visible
      body.querySelectorAll(".tweet-card-carousel").forEach((c) => window.syncTweetCarousel?.(c));
    }
    btn.setAttribute("aria-expanded", String(!open));
    const label = btn.querySelector(".tweet-card-media-label");
    if (label) label.textContent = open ? btn.dataset.show : btn.dataset.hide;
  };

  // Carrousel de médias : affiche/masque les flèches selon la position de défilement.
  window.syncTweetCarousel = (el) => {
    const root = el && el.closest && el.closest(".tweet-card-carousel");
    const track = root && root.querySelector(".tweet-card-track");
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    root.classList.toggle("can-prev", track.scrollLeft > 2);
    root.classList.toggle("can-next", track.scrollLeft < max - 2);
  };

  // Flèches : avance / recule d'un média (le scroll-snap cale le cadre sur le bord gauche).
  window.scrollTweetCarousel = (btn, dir) => {
    const root = btn.closest(".tweet-card-carousel");
    const track = root && root.querySelector(".tweet-card-track");
    if (!track) return;
    const slides = Array.from(track.children).filter((s) => s.offsetParent !== null);
    const x = track.scrollLeft;
    const target = dir > 0
      ? slides.find((s) => s.offsetLeft > x + 4)
      : [...slides].reverse().find((s) => s.offsetLeft < x - 4);
    track.scrollTo({
      left: target ? target.offsetLeft : dir > 0 ? track.scrollWidth : 0,
      behavior: "smooth",
    });
  };
}

// Dimensions de la vidéo lues dans l'URL mp4 (.../vid/avc1/720x1280/xxx.mp4).
// Permet de donner au cadre le vrai format (portrait, carré, paysage) dès le rendu.
const videoDims = (src) => {
  const m = String(src).match(/\/(\d{2,5})x(\d{2,5})\//);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};
const videoSizeStyle = (src) => {
  const d = videoDims(src);
  return d ? ` style="--w:${d.w};--h:${d.h}"` : "";
};
// Vidéo portrait (plus haute que large) : peut se ranger 2 par 2 quand il y en a plusieurs.
const videoClass = (src) => {
  const d = videoDims(src);
  return d && d.w < d.h ? "tweet-card-video is-portrait" : "tweet-card-video";
};

// Repli quand l'URL ne contient pas les dimensions : on les lit sur la miniature chargée.
const POSTER_ONLOAD =
  "var f=this.closest('.tweet-card-video');if(f&&!f.style.getPropertyValue('--w')&&this.naturalWidth){f.style.setProperty('--w',this.naturalWidth);f.style.setProperty('--h',this.naturalHeight)}window.syncTweetCarousel&&window.syncTweetCarousel(this)";

// Une vidéo (cadre + miniature ou lecteur). Utilisé par la grille classique et par le carrousel.
function videoItemHTML({ src, poster }, i, lang, priority, extraClass = "") {
  const ui = getUI(lang);
  const playLabel = ui.playVideo;
  const cls = videoClass(src) + extraClass;
  const fallback = `<a class="tweet-card-video-fallback" hidden href="${escapeHTML(src)}" target="_blank" rel="noopener noreferrer">▶ ${escapeHTML(ui.openVideo)} ↗</a>`;
  // Avec miniature : facade <img> + bouton lecture (lecteur créé au clic).
  if (poster) {
    return `
        <div class="${cls}"${videoSizeStyle(src)}>
          <button type="button" class="tweet-card-video-poster" data-src="${escapeHTML(src)}" aria-label="${playLabel}" onclick="window.playTweetVideo(this)">
            <img src="${escapeHTML(poster)}" alt="" ${imgLoadAttrs(priority && i === 0)} onload="${POSTER_ONLOAD}" onerror="this.style.display='none'">
            <span class="tweet-card-video-play">${PLAY_ICON}</span>
          </button>
          ${fallback}
        </div>`;
  }
  // Sans miniature : comportement d'origine (metadata pour afficher une image).
  return `
        <div class="${cls}"${videoSizeStyle(src)}>
          <video controls playsinline preload="metadata"
            src="${escapeHTML(src)}"
            onerror="console.warn('Erreur vidéo', this.error && this.error.code, this.currentSrc); this.style.display='none'; this.nextElementSibling.hidden=false"></video>
          ${fallback}
        </div>`;
}

function videosHTML(videos, lang = "en", priority = false) {
  if (!videos || videos.length === 0) return "";
  const multi = videos.length > 1 ? " is-multi" : "";
  // 2 vidéos dont exactement une portrait : on les aligne 2/3 – 1/3
  const portraitCount = videos.filter((v) => {
    const d = videoDims(v.src);
    return d && d.w < d.h;
  }).length;
  const mixed = videos.length === 2 && portraitCount === 1 ? " is-mixed" : "";
  return `
    <div class="tweet-card-videos${multi}${mixed}">
      ${videos.map((v, i) => videoItemHTML(v, i, lang, priority)).join("")}
    </div>`;
}

// Variantes redimensionnées / WebP des images Twitter (pbs.twimg.com/media/...).
// name=small = 680 px de large max, name=medium = 1200 px. Les autres URLs
// (hors /media/) sont renvoyées telles quelles.
const TWIMG_RE = /^https:\/\/pbs\.twimg\.com\/media\//;
const twimgUrl = (url, name) =>
  TWIMG_RE.test(url) ? `${url.split('?')[0]}?format=webp&name=${name}` : url;

// Attributs src/srcset : image seule = small (écran 1x) ou medium (écran 2x) ;
// grille de 2 à 4 images (~340 px par vignette) = small suffit, même en 2x.
const imgSrcAttrs = (url, single) => {
  const small = escapeHTML(twimgUrl(url, 'small'));
  if (!single || !TWIMG_RE.test(url)) return `src="${small}"`;
  const medium = escapeHTML(twimgUrl(url, 'medium'));
  return `src="${small}" srcset="${small} 680w, ${medium} 1200w" sizes="680px"`;
};

function imagesHTML(images, priority = false, username = "", lang = "fr") {
  images = (images || []).filter(isValidUrl);
  if (images.length === 0) return '';
  const count = images.length;
  const altFn = getUI(lang).imageAlt;
  // Attributs communs : alt + chargement (la toute première image prend la
  // priorité, les suivantes sont différées).
  const at = (i) =>
    `alt="${escapeHTML(altFn(username, i, count))}" ${imgLoadAttrs(priority && i === 0)}`;

  if (count === 1) return `
    <div class="tweet-card-images single">
      <img ${imgSrcAttrs(images[0], true)} ${at(0)} onerror="this.parentElement.style.display='none'">
    </div>`;

  if (count === 2) return `
    <div class="tweet-card-images double">
      ${images.map((img, i) => `<img ${imgSrcAttrs(img)} ${at(i)} onerror="this.style.display='none'">`).join('')}
    </div>`;

  if (count === 3) return `
    <div class="tweet-card-images triple">
      <img ${imgSrcAttrs(images[0])} class="main-img" ${at(0)} onerror="this.style.display='none'">
      <div class="secondary-imgs">
        <img ${imgSrcAttrs(images[1])} ${at(1)} onerror="this.style.display='none'">
        <img ${imgSrcAttrs(images[2])} ${at(2)} onerror="this.style.display='none'">
      </div>
    </div>`;

  const display = images.slice(0, 4);
  const remaining = count - 4;
  return `
    <div class="tweet-card-images quad">
      ${display.map((img, i) => `
        <div class="img-wrapper${i === 3 && remaining > 0 ? ' has-more' : ''}">
          <img ${imgSrcAttrs(img)} ${at(i)} onerror="this.style.display='none'">
          ${i === 3 && remaining > 0 ? `<div class="more-overlay">+${remaining}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

// ── Carrousel : toutes les vidéos puis toutes les images sur UNE ligne, défilement manuel
// (scroll-snap) + flèches gauche/droite, comme sur X. Utilisé dès qu'il y a 2 médias ou plus.
// Les dimensions d'une image ne sont connues qu'au chargement : on les range dans --w/--h du cadre.
const SLIDE_ONLOAD =
  "var s=this.closest('.tweet-card-slide');if(s&&!s.style.getPropertyValue('--w')&&this.naturalWidth){s.style.setProperty('--w',this.naturalWidth);s.style.setProperty('--h',this.naturalHeight)}window.syncTweetCarousel&&window.syncTweetCarousel(this)";

const CAROUSEL_ARROW = (d) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

function imageSlideHTML(url, i, count, priority, username, lang) {
  const altFn = getUI(lang).imageAlt;
  return `
        <div class="tweet-card-images tweet-card-slide">
          <img ${imgSrcAttrs(url)} alt="${escapeHTML(altFn(username, i, count))}" ${imgLoadAttrs(priority && i === 0)} onload="${SLIDE_ONLOAD}" onerror="this.parentElement.style.display='none'">
        </div>`;
}

function carouselHTML(videos, images, lang, priority, username) {
  const vids = videos || [];
  const imgs = (images || []).filter(isValidUrl);
  const labels = [getUI(lang).carouselPrev, getUI(lang).carouselNext];
  const slides = [
    ...vids.map((v, i) => videoItemHTML(v, i, lang, priority, " tweet-card-slide")),
    ...imgs.map((url, i) => imageSlideHTML(url, i, imgs.length, priority && vids.length === 0, username, lang)),
  ].join("");
  return `
    <div class="tweet-card-carousel" onanimationstart="window.syncTweetCarousel&&window.syncTweetCarousel(this)">
      <div class="tweet-card-track" onscroll="window.syncTweetCarousel(this)">${slides}
      </div>
      <button type="button" class="tweet-card-carousel-btn prev" aria-label="${labels[0]}" onclick="window.scrollTweetCarousel(this,-1)">${CAROUSEL_ARROW("m15 18-6-6 6-6")}</button>
      <button type="button" class="tweet-card-carousel-btn next" aria-label="${labels[1]}" onclick="window.scrollTweetCarousel(this,1)">${CAROUSEL_ARROW("m9 18 6-6-6-6")}</button>
    </div>`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Liens cliquables dans le texte des tweets ──
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]»…]+$/;

// Échappe le texte ET transforme les URL en <a>. On travaille sur le texte brut
// (pas sur du HTML déjà échappé) pour ne pas embarquer des "&quot;" dans les URL.
function linkifyText(raw) {
  const str = String(raw ?? "");
  let out = "";
  let last = 0;
  for (const m of str.matchAll(URL_RE)) {
    let url = m[0];
    // La ponctuation finale ("...fin de phrase.") ne fait pas partie du lien
    const trail = url.match(TRAILING_PUNCT_RE)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);

    out += escapeHTML(str.slice(last, m.index));
    const href = escapeHTML(url);
    const label = escapeHTML(url.replace(/^https?:\/\//, ""));
    out += `<a href="${href}" class="tweet-card-text-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
    last = m.index + url.length;
  }
  return out + escapeHTML(str.slice(last));
}

// Tronque à `max` caractères sans couper une URL en deux (sinon le lien serait cassé).
function truncateKeepingUrls(str, max = 500) {
  if (!str || str.length <= max) return str;
  let end = max;
  for (const m of str.matchAll(URL_RE)) {
    if (m.index < max && m.index + m[0].length > max) {
      end = m.index + m[0].length;
      break;
    }
  }
  return str.slice(0, end) + "…";
}

// Nom du lieu dans la langue demandée, sinon anglais, sinon valeur brute
// (tweet pas encore traduit). Lit `location_translations` (cf. /bootstrap).
export function getLocationName(props, lang) {
  const t = parseJSONProp(props.location_translations, {});
  return t?.[lang] || t?.en || props.location_name || "";
}

// Tri chronologique décroissant (le plus récent en premier). À importance égale
// l'ordre d'origine est conservé (Array.sort est stable). Utilisé par MapView
// AVANT de construire la pile : la liste ET la vue détaillée (flèches ◀ ▶, index)
// partagent ainsi exactement le même ordre.
const featureTime = (f) => {
  const p = f?.properties ?? {};
  const t = new Date(p.created_at ?? p.date ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
};
export const sortFeaturesByDateDesc = (features) =>
  [...features].sort((a, b) => featureTime(b) - featureTime(a));

const LIST_SUMMARY_MAX = 140; // longueur max du texte dans la vue liste

function truncate(value, max) {
  const chars = Array.from(String(value ?? "").trim().replace(/\s+/g, " "));
  if (chars.length <= max) return chars.join("");
  const cut = chars.slice(0, max).join("");
  // coupe au dernier espace pour éviter de casser un mot (si pas trop loin)
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

// Vue "liste" d'une pile de tweets (plusieurs événements au même endroit).
// `features` doit déjà être triée par date décroissante (sortFeaturesByDateDesc) :
// le plus récent apparaît en premier, sur une frise verticale (ligne + point). Un clic sur une ligne appelle
// window.navigateTweet(index), qui ouvre la vue détaillée de ce tweet.
// `selectedId` : id du tweet sélectionné dans le SidePanel (facultatif). La ligne
// correspondante est surlignée (classe "selected" + aria-current).
export function createPopupListHTML(features, lang = getCurrentLang(), selectedId = null) {
  const ui = getUI(lang);

  const items = features.map((feature, index) => {
    const props = feature.properties;
    const isImportant = ['4', '5'].includes(String(props.importance_score || '0').trim());
    const rawDate = props.created_at ?? props.date ?? new Date();
    const images = parseJSONProp(props.images, []);
    const thumb = Array.isArray(images)
      ? images.find((img) => img && typeof img === 'string' && img.trim() !== '')
      : null;

    // résumé traduit si dispo, sinon traduction du texte, sinon texte brut ; tronqué
    const translations = parseJSONProp(props.translations, {});
    const summaryTranslations = parseJSONProp(props.summary_translations, {});
    // résumé : texte complet (sans limite) ; sinon texte tronqué
    const summaryText = summaryTranslations?.[lang] || '';
    const isSummary = Boolean(summaryText);
    const summary = isSummary
      ? summaryText
      : truncate(translations?.[lang] || props.text || '', LIST_SUMMARY_MAX);

    const username = String(props.username ?? '').replace(/^@/, '');

    const isSelected = selectedId != null && props.id != null && String(props.id) === String(selectedId);

    return `
      <div class="tweet-timeline-row${isImportant ? ' important' : ''}${isSelected ? ' selected' : ''}">
        <span class="tweet-timeline-rail" aria-hidden="true"><span class="tweet-timeline-dot"></span></span>
      <button type="button" class="tweet-list-item${isImportant ? ' important' : ''}${isSelected ? ' selected' : ''}"${isSelected ? ' aria-current="true"' : ''} onclick="window.navigateTweet(${index})">
        <div class="tweet-list-item-body">
          <div class="tweet-list-item-meta">
            ${isImportant ? '<span class="tweet-list-item-flag" aria-hidden="true"></span>' : ''}
            <span class="tweet-list-item-user">${escapeHTML(username)}</span>
            <span class="tweet-card-dot">·</span>
            <span class="tweet-list-item-time">${getTimeAgo(rawDate, lang)}</span>
          </div>
          <div class="tweet-list-item-summary${isSummary ? ' is-summary' : ''}">${escapeHTML(summary)}</div>
        </div>
        ${thumb ? `<img class="tweet-list-item-thumb" src="${escapeHTML(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      </button>
      </div>`;
  }).join('');

  return `
  <div class="tweet-card tweet-list">
    <div class="tweet-list-header">
      <span class="tweet-list-title">${ui.eventsAtLocation(features.length)}</span>
      <button onclick="window.closePopup()" class="close-btn"><svg width="8" height="8" viewBox="0 0 14 14" fill="none">
        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg></button>
    </div>
    <div class="tweet-list-items">${items}</div>
  </div>`;
}

export function createPopupGridHTML(features, lang = getCurrentLang()) {
  return createPopupHTML(
    features[0].properties,
    false,
    0,
    features.length,
    true,
    false,
    true,
    lang
  );
}

function tagsHTML(props, lang) {
  const tags = [];

  if (props.conflict_typology) {
    tags.push(`<span class="tweet-card-tag conflict_typology">${translateConflictTypology(props.conflict_typology, lang)}</span>`);
  }

  if (props.aggressor) {
    tags.push(`<span class="tweet-card-tag aggressor">${escapeHTML(translateAggressor(props.aggressor, lang))}</span>`);
  }

  if (props.weapon_type) {
    tags.push(`<span class="tweet-card-tag weapon-type">${translateWeaponType(props.weapon_type, lang)}</span>`);
  }

  if (props.target) {
    tags.push(`<span class="tweet-card-tag target">${escapeHTML(translateTarget(props.target, lang))}</span>`);
  }

  if (props.objective_type) {
    tags.push(`<span class="tweet-card-tag objective-type">${translateObjectiveType(props.objective_type, lang)}</span>`);
  }

  if (!tags.length) return '';

  return `<div class="tweet-card-tags">${tags.join('')}</div>`;
}

function locationSourceIcon(locationSource, lang) {
  const ui = getUI(lang);
  if (!locationSource) {
    return `<span class="location-source-icon" title="${ui.unknownSource}" style="color:#94a3b8;">•</span>`;
  }

  const source = String(locationSource).toUpperCase().trim();

  if (source === 'LLM' || source.includes('MISTRAL') || source.includes('DEEPSEEK')) {
    return `
    <span class="location-source-icon deepseek-icon" title="${ui.locatedByDeepseek}">
      <svg fill="currentColor" height="14" style="flex:none;line-height:1" viewBox="0 0 56 36" width="18" xmlns="http://www.w3.org/2000/svg"><title>${ui.locatedByDeepseek}</title><path d="M 55.6128 3.4712 c -0.5953 -0.2917 -0.8517 0.2642 -1.1998 0.5466 c -0.1191 0.0911 -0.2198 0.2095 -0.3206 0.3188 c -0.8701 0.9292 -1.8867 1.5398 -3.2148 1.4668 c -1.9417 -0.1094 -3.5995 0.5012 -5.065 1.9863 c -0.3114 -1.8313 -1.3463 -2.9248 -2.9217 -3.6262 c -0.8242 -0.3645 -1.6577 -0.729 -2.2348 -1.5217 c -0.403 -0.5647 -0.5129 -1.1934 -0.7144 -1.813 c -0.1283 -0.3735 -0.2565 -0.7563 -0.687 -0.8201 c -0.4671 -0.0728 -0.6503 0.3188 -0.8335 0.647 c -0.7327 1.3394 -1.0166 2.8154 -0.9892 4.3096 c 0.0641 3.3621 1.4838 6.0406 4.3047 7.9449 c 0.3206 0.2187 0.403 0.4372 0.3023 0.7563 c -0.1924 0.656 -0.4214 1.2937 -0.6228 1.9497 c -0.1283 0.4192 -0.3207 0.5103 -0.7694 0.3279 c -1.5479 -0.6467 -2.8852 -1.6035 -4.0667 -2.7605 c -2.0058 -1.9407 -3.8193 -4.0818 -6.0815 -5.7583 c -0.5312 -0.3918 -1.0625 -0.7561 -1.6121 -1.1025 c -2.3081 -2.2412 0.3023 -4.0818 0.9068 -4.3003 c 0.6319 -0.2278 0.2198 -1.0115 -1.8227 -1.0022 c -2.0425 0.009 -3.9109 0.6924 -6.2922 1.6035 c -0.348 0.1367 -0.7145 0.2368 -1.09 0.3188 c -2.1615 -0.4099 -4.4055 -0.5012 -6.7502 -0.2368 c -4.4147 0.4919 -7.9408 2.5784 -10.5328 6.1409 C 0.1914 13.1289 -0.5413 17.9941 0.3563 23.0691 c 0.9434 5.3481 3.6727 9.7761 7.8676 13.2385 c 4.3506 3.5896 9.3606 5.3481 15.0758 5.011 c 3.4713 -0.2004 7.3364 -0.665 11.6961 -4.355 c 1.099 0.5467 2.2531 0.7652 4.1674 0.9292 c 1.4746 0.1367 2.8943 -0.0728 3.9933 -0.3005 c 1.7219 -0.3645 1.6029 -1.959 0.9801 -2.2505 c -5.0466 -2.3506 -3.9385 -1.394 -4.9459 -2.1685 c 2.5645 -3.0339 6.4297 -6.1865 7.9409 -16.4001 c 0.119 -0.8108 0.0183 -1.3211 0 -1.9771 c -0.0092 -0.4008 0.0824 -0.5556 0.5404 -0.6013 c 1.2639 -0.1458 2.4912 -0.4919 3.6178 -1.1115 c 3.2698 -1.7857 4.5886 -4.7195 4.9 -8.2364 c 0.0459 -0.5376 -0.0091 -1.0935 -0.577 -1.3757 Z M 27.119 35.123 c -4.8909 -3.8447 -7.263 -5.1113 -8.2431 -5.0566 c -0.9159 0.0547 -0.751 1.1025 -0.5496 1.7859 c 0.2107 0.6741 0.4855 1.1389 0.8701 1.731 c 0.2656 0.3918 0.4489 0.9748 -0.2655 1.4123 c -1.5754 0.9749 -4.314 -0.3281 -4.4423 -0.3918 c -3.1872 -1.877 -5.8525 -4.3553 -7.7302 -7.7444 c -1.8135 -3.262 -2.8667 -6.7605 -3.0408 -10.4961 c -0.0458 -0.9019 0.2198 -1.221 1.1174 -1.3848 c 1.1815 -0.2187 2.3997 -0.2644 3.5812 -0.0913 c 4.9918 0.729 9.2415 2.9612 12.8043 6.4963 c 2.0333 2.0135 3.572 4.419 5.1566 6.7696 c 1.6852 2.4963 3.4987 4.8745 5.8068 6.8242 c 0.8151 0.6833 1.4654 1.2026 2.0882 1.5854 c -1.8775 0.2095 -5.01 0.2552 -7.1532 -1.4397 Z M 29.4637 20.0442 c 0 -0.4009 0.3206 -0.7197 0.7237 -0.7197 c 0.0916 0 0.174 0.018 0.2473 0.0453 c 0.1008 0.0366 0.1924 0.0913 0.2656 0.1731 c 0.1283 0.1277 0.2015 0.3098 0.2015 0.5012 c 0 0.4009 -0.3205 0.7197 -0.7234 0.7197 s -0.7145 -0.3188 -0.7145 -0.7197 Z M 36.7452 23.7798 c -0.4671 0.1914 -0.9342 0.3552 -1.383 0.3735 c -0.6961 0.0364 -1.4563 -0.2461 -1.8684 -0.5923 c -0.6411 -0.5376 -1.0991 -0.8381 -1.2914 -1.7766 c -0.0825 -0.4009 -0.0367 -1.0205 0.0367 -1.3757 c 0.1648 -0.7654 -0.0184 -1.2573 -0.5587 -1.7039 c -0.4397 -0.3645 -0.9984 -0.4646 -1.6121 -0.4646 c -0.229 0 -0.4395 -0.1003 -0.5953 -0.1823 c -0.2565 -0.1275 -0.467 -0.4464 -0.2656 -0.8382 c 0.0641 -0.1274 0.3756 -0.4373 0.4489 -0.4919 c 0.8335 -0.4739 1.7952 -0.3189 2.6836 0.0364 c 0.8244 0.3371 1.4472 0.9567 2.3447 1.8313 c 0.9159 1.0568 1.0807 1.3486 1.6028 2.1411 c 0.4123 0.6196 0.7878 1.2573 1.0442 1.9863 c 0.1557 0.4556 -0.0458 0.8291 -0.5862 1.0569 Z"/></svg>
    </span>`;
  }

  if (source === 'NOMINATIM' || source.includes('OSM') || source.includes('OPENSTREETMAP')) {
    return `
    <span class="location-source-icon mistral-icon" title="${ui.locatedByNominatim}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.672 23.969c-.352-.089-.534-.234-1.471-1.168C.085 21.688.014 21.579.018 20.999c0-.645-.196-.414 3.368-3.986 3.6-3.608 3.415-3.451 4.064-3.449.302 0 .378.016.62.14l.277.14 1.744-1.744-.218-.343c-.425-.662-.825-1.629-1.006-2.429a7.657 7.657 0 0 1 1.479-6.44c2.49-3.12 6.959-3.812 10.26-1.588 1.812 1.218 2.99 3.099 3.328 5.314.07.467.07 1.579 0 2.074a7.554 7.554 0 0 1-2.205 4.402 6.712 6.712 0 0 1-1.943 1.401c-.959.483-1.775.71-2.881.803-1.573.131-3.32-.305-4.656-1.163l-.343-.218-1.744 1.744.14.28c.125.241.14.316.14.617.003.651.156.467-3.426 4.049-2.761 2.756-3.186 3.164-3.398 3.261-.271.125-.69.171-.945.106zM17.485 13.95a6.425 6.425 0 0 0 4.603-3.51c1.391-2.899.455-6.306-2.227-8.108-.638-.43-1.529-.794-2.367-.962-.581-.117-1.809-.104-2.414.025a6.593 6.593 0 0 0-2.452 1.064c-.444.315-1.177 1.048-1.487 1.487a6.384 6.384 0 0 0 .38 7.907 6.406 6.406 0 0 0 3.901 2.136c.509.078 1.542.058 2.065-.037zm-3.738 7.376a80.97 80.97 0 0 1-2.196-.651c-.025-.028 1.207-4.396 1.257-4.449.023-.026 4.242 1.152 4.414 1.236.062.026-.003.288-.525 2.102a398.513 398.513 0 0 0-.635 2.236c-.025.087-.069.156-.097.156-.028-.003-1.028-.287-2.219-.631zm2.912.524c0-.053 1.227-4.333 1.246-4.347.047-.034 4.324-1.23 4.341-1.211.019.019-1.199 4.337-1.23 4.36-.02.019-4.126 1.191-4.259 1.218-.054.011-.098 0-.098-.019zm-7.105-1.911c.846-.852 1.599-1.627 1.674-1.728.171-.218.405-.732.472-1.015.026-.118.053-.352.058-.522l.011-.307.182-.051c.103-.028.193-.044.202-.034.023.025-1.207 4.321-1.246 4.36-.02.016-.677.213-1.464.436l-1.425.405 1.537-1.542zm8.289-3.06a1.371 1.371 0 0 1-.059-.187l-.044-.156.156-.028c1.339-.227 2.776-.856 3.908-1.713.16-.125.252-.171.265-.134.054.165.272.95.265.959-.034.034-4.48 1.282-4.492 1.261zm-15.083-1.3c-.05-.039-1.179-3.866-1.264-4.29-.016-.084.146-.044 2.174.536 2.121.604 2.192.629 2.222.74.028.098.011.129-.125.223-.084.059-.769.724-1.523 1.479a63.877 63.877 0 0 1-1.39 1.367c-.016 0-.056-.025-.093-.054zm.821-4.378c-1.188-.343-2.164-.623-2.167-.626-.016-.012 1.261-4.433 1.285-4.46.022-.022 4.422 1.211 4.469 1.252.009.009-.269 1.017-.618 2.239-.576 2.02-.643 2.224-.723 2.22-.05-.003-1.059-.285-2.247-.626zm2.959.538c.012-.031.212-.723.444-1.534l.42-1.476.056.321c.093.556.265 1.188.464 1.741.106.296.187.539.181.545-.008.006-.332.101-.719.212-.389.109-.741.21-.786.224-.058.016-.075.006-.059-.034zM4.905 6.112c-1.187-.339-2.167-.635-2.18-.654-.04-.062-1.246-4.321-1.23-4.338.026-.025 4.31 1.204 4.351 1.246.047.051 1.28 4.379 1.246 4.376L4.91 6.113zm2.148-1.713l-.519-1.806-.078-.28 1.693-.483c.934-.265 1.724-.495 1.76-.508.034-.016-.083.14-.26.336A8.729 8.729 0 0 0 7.69 5.23a4.348 4.348 0 0 0-.132.561c0 .293-.115-.025-.505-1.39z"/>
      </svg>
    </span>`;
  }
}

export const getTimeAgo = (dateString, lang = getCurrentLang()) => {
  const ui = getUI(lang);
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return ui.justNow;
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}${ui.minute}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${ui.hour}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${ui.day}`;
  return date.toLocaleDateString((DATE_LOCALES[lang] || DATE_LOCALES.en), { day: 'numeric', month: 'short' });
};

const avatarCache = {};

// true : les médias des popups sont repliés par défaut (bouton "Afficher les médias").
// false : ils sont affichés directement comme avant.
const COLLAPSE_MEDIA = true;

const MEDIA_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`;
const MEDIA_CHEVRON = `<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

// 2 médias ou plus (vidéos + images) : carrousel sur une seule ligne (voir carouselHTML).
// Un seul média : rendu d'origine (vidéo seule ou image seule).
function mediaHTML(videos, images, showImages, lang, priority, username, collapse = COLLAPSE_MEDIA) {
  if (!showImages) return "";
  const count = (videos ? videos.length : 0) + (images || []).filter(isValidUrl).length;
  if (count === 0) return "";

  // Repliés : pas de chargement prioritaire (rien n'est visible), contenu dans un <template>.
  const inner = count >= 2
    ? carouselHTML(videos, images, lang, collapse ? false : priority, username)
    : videosHTML(videos, lang, collapse ? false : priority) + imagesHTML(images, collapse ? false : priority, username, lang);
  if (!collapse) return inner;

  const ui = getUI(lang);
  const showLabel = ui.showMedia(count);
  return `
    <div class="tweet-card-media-toggle">
      <button type="button" class="tweet-card-media-btn" aria-expanded="false"
        data-show="${escapeHTML(showLabel)}" data-hide="${escapeHTML(ui.hideMedia)}"
        onclick="window.toggleTweetMedia(this)">
        ${MEDIA_ICON}<span class="tweet-card-media-label">${escapeHTML(showLabel)}</span>${MEDIA_CHEVRON}
      </button>
      <div class="tweet-card-media-body" hidden></div>
      <template>${inner}</template>
    </div>`;
}

export function createPopupHTML(props, pinned, currentIndex, totalCount, showImages = true, showBack = false, useRelativeTime = false, lang = getCurrentLang(), showListButton = false, priority = false, collapseMedia = COLLAPSE_MEDIA) {
  const isImportant = ['4', '5'].includes(String(props.importance_score || '0').trim());
  const rawDate = props.created_at ?? props.date ?? new Date();
  const { photos: images, videos } = splitMedia(props);
  const translations = parseJSONProp(props.translations, {});
  const displayTime = getTimeAgo(rawDate, lang);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;
  const showNav = totalCount > 1;
  // Avatar : d'abord la copie locale /img/@compte.jpg (même origine, pas de connexion
  // externe), puis unavatar.io en repli si le fichier n'existe pas (voir onerror plus bas).
  const avatar = avatarCache[props.username]
    ?? (avatarCache[props.username] = {
      local: `${process.env.PUBLIC_URL || ""}/img/${encodeURI(props.username)}.jpg`,
      remote: `https://unavatar.io/twitter/${props.username.slice(1)}`,
    });
  const rawText = translations?.[lang] || props.text;
  const locationName = getLocationName(props, lang);
  const text = linkifyText(truncateKeepingUrls(rawText, 500));
  const LIST_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
  const CHEVRON_LEFT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`;
  const CHEVRON_RIGHT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
  return `
  <div class="tweet-card${isImportant ? ' important-tweet' : ''}">
    <div class="tweet-card-header">
      <div class="tweet-card-avatar">
            <img src="${avatar.local}" data-fallback="${avatar.remote}" alt="${props.username}" width="32" height="32" ${imgLoadAttrs(priority)} onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else{this.style.display='none'}">
      </div>
      <div class="tweet-card-meta">
        <span class="tweet-card-username">${props.username.replace(/^@/, '')}</span>
        ${(props.verified === true || props.verified === 'true') ? `
        <span class="tweet-card-badge verified" title="OSINT Observer verified">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1.5L2 4v4c0 3.5 2.5 5.8 6 7 3.5-1.2 6-3.5 6-7V4L8 1.5z" fill="rgba(79,157,255,0.22)" stroke="#4f9dff" stroke-width="1"/>
            <path d="M5.5 8l2 2 3-3" stroke="#4f9dff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>` : ''}
        <span class="tweet-card-dot">·</span>
        <span class="tweet-card-time">${displayTime}</span>
      </div>
      ${showBack ? '' : `
      <button onclick="window.closePopup()" class="close-btn"><svg width="8" height="8" viewBox="0 0 14 14" fill="none">
        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg></button>`}
    </div>
    ${tagsHTML(props, lang)}

    <div class="tweet-card-text">${text}</div>
    ${mediaHTML(videos, images, showImages, lang, priority, props.username, collapseMedia)}
    ${locationName || props.latitude ? `
      <div class="tweet-card-location">
        <span class="location-name">
          ${locationSourceIcon(props.location_source, lang)}
          ${locationName ? escapeHTML(locationName) + ' ' : ''} -
          ${props.latitude}°, ${props.longitude}°
        </span>
      </div>` : ''}
    <div class="tweet-card-actions">
      <a href="${props.url}" class="tweet-card-link" target="_blank">Source ↗</a>
      ${showNav ? `
      <div class="tweet-card-nav">
        ${showListButton ? `
        <button
          type="button"
          class="tweet-card-nav-btn tweet-card-list-btn"
          title="${getUI(lang).backToList}"
          aria-label="${getUI(lang).backToList}"
          onclick="window.showTweetList()"
        >${LIST_ICON}</button>` : ''}
        <button
          class="tweet-card-nav-btn${hasPrev ? '' : ' disabled'}"
          onclick="${hasPrev ? `window.navigateTweet(${currentIndex - 1})` : ''}"
          ${hasPrev ? '' : 'disabled'}
        >${CHEVRON_LEFT}</button>
        <span class="tweet-card-nav-count">${currentIndex + 1}/${totalCount}</span>
        <button
          class="tweet-card-nav-btn${hasNext ? '' : ' disabled'}"
          onclick="${hasNext ? `window.navigateTweet(${currentIndex + 1})` : ''}"
          ${hasNext ? '' : 'disabled'}
        >${CHEVRON_RIGHT}</button>
      </div>` : ''}
    </div>
  </div>`;
}