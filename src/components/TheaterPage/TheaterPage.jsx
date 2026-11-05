import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./TheaterPage.css";
import { useBootstrap } from "../../context/BootstrapContext";
import { useLang } from "../../context/LangContext";
import { translateTheaterLabel, translateTheaterSummary } from "../../utils/theaterLabels";
import { getInitialTheaterLang, getInitialTheaterSlug, localizedSlug, matchesTheaterSlug, theaterPath, theaterTitle } from "../../utils/theaterRoute";
import { buildTheaters, getFreshness, imageUrl } from "../../utils/theaters";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { getImageCredit } from "../../utils/theaterImageCredits";
import { localizeCredit } from "../../utils/theaterCaptions";
import CountryMap from "./CountryMap";
import { TWEET_REF_RE, getTheaterEvents, hasTweetRefs } from "../../utils/theaterEvents";

// Page autonome /content/<slug>/ : uniquement le théâtre et ses résumés
// quotidiens. Ni carte, ni SidePanel, ni tweets.

// Les textes de la page vivent dans LangContext (t.theaterPage).

// Date d'un résumé quotidien, dans la locale de la langue active.
const formatEventDate = (iso, locale) =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

// Titre raccourci pour le sommaire (colonne étroite) : coupe à la dernière limite de mot
// avant `max` caractères et ajoute « … ». Le titre complet reste dans l'article et en infobulle.
const TOC_TITLE_MAX = 48;
function shortenTocTitle(title, max = TOC_TITLE_MAX) {
  const t = String(title).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const sp = head.lastIndexOf(" ");
  const base = sp > max * 0.6 ? head.slice(0, sp) : t.slice(0, max);
  return `${base.replace(/[\s,;:–—-]+$/, "")}…`;
}

// ── Références aux tweets dans les résumés ──────────────────────────────────
// Le texte d'un résumé peut contenir [texte](tweet:123456789) : « texte » est alors
// rendu souligné et, au survol (ou au toucher / focus clavier), affiche le tweet.
// Contenu des tweets : data.topic_summary_tweets (voir main.py).
// Le parsing (TWEET_REF_RE, sources, tri) est dans utils/theaterEvents.js, partagé avec
// TheatersDrawer pour que les deux affichent le même nombre de résumés.

const TWEET_PREVIEW_MAX = 420;

// Une seule carte ouverte à la fois : en ouvrir une ferme aussitôt la précédente
// (sinon, en passant d'une source à l'autre, les deux cartes se superposent).
let closeActiveRef = null;

function TweetRef({ tweet, lang, dateLocale, children }) {
  const { t } = useLang();
  const labels = t.theaterPage;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left } en coordonnées écran (carte en fixed)
  const wrapRef = useRef(null);
  const linkRef = useRef(null);
  const cardRef = useRef(null);
  const closeTimer = useRef(null);
  const lastPointer = useRef("mouse");
  const cardId = useId();

  const closeNow = useCallback(() => {
    clearTimeout(closeTimer.current);
    setOpen(false);
    if (closeActiveRef === closeNow) closeActiveRef = null;
  }, []);
  const show = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (closeActiveRef && closeActiveRef !== closeNow) closeActiveRef(); // ferme l'autre carte tout de suite
    closeActiveRef = closeNow;
    setOpen(true);
  }, [closeNow]);
  // Court délai : laisse le temps de passer du texte à la carte sans la fermer.
  const hideSoon = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeNow, 70);
  }, [closeNow]);
  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    if (closeActiveRef === closeNow) closeActiveRef = null;
  }, [closeNow]);

  // Place la carte sous le texte (ou au-dessus s'il n'y a pas la place), sans sortir de l'écran.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const link = linkRef.current;
    const card = cardRef.current;
    if (!link || !card) return;
    const rects = link.getClientRects();
    const r = rects[0] || link.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const m = 12;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let top = r.bottom + 4;
    if (top + h > vh - m && r.top - h - 4 > m) top = r.top - h - 4;
    const left = Math.max(m, Math.min(r.left, vw - w - m));
    setPos({ top, left });
  }, [open]);

  // Fermeture : Échap, toucher en dehors, défilement.
  useEffect(() => {
    if (!open) return undefined;
    const close = closeNow;
    const onKey = (e) => e.key === "Escape" && close();
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, closeNow]);

  const raw = tweet.translations?.[lang] || tweet.text || "";
  const text = raw.length > TWEET_PREVIEW_MAX ? `${raw.slice(0, TWEET_PREVIEW_MAX).trimEnd()}…` : raw;
  const user = `@${String(tweet.username || "").replace(/^@/, "")}`;
  const date = tweet.created_at
    ? new Date(tweet.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })
    : "";

  return (
    <span
      className="tp-ref"
      ref={wrapRef}
      onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
      onPointerEnter={(e) => { lastPointer.current = e.pointerType; if (e.pointerType === "mouse") show(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hideSoon(); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeNow(); }}
    >
      <span
        className="tp-ref-link"
        ref={linkRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={open ? cardId : undefined}
        // Focus clavier uniquement : au toucher, le focus précède le clic et ouvrait la carte,
        // que le clic (bascule) refermait aussitôt → il fallait toucher deux fois.
        onFocus={(e) => {
          let keyboard = true;
          try { keyboard = e.currentTarget.matches(":focus-visible"); } catch { /* vieux navigateurs */ }
          if (keyboard) show();
        }}
        // souris : le survol a déjà ouvert la carte, on la garde ; tactile : on bascule
        onClick={() => setOpen((o) => (lastPointer.current === "mouse" ? true : !o))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
        }}
      >
        {children}
      </span>
      {open && (
        <span
          className="tp-ref-card"
          id={cardId}
          role="tooltip"
          ref={cardRef}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
        >
          <span className="tp-ref-meta">{user}{date ? ` · ${date}` : ""}</span>
          <span className="tp-ref-text">{text}</span>
          {tweet.url && (
            <a className="tp-ref-open" href={tweet.url} target="_blank" rel="noopener noreferrer">
              {labels.viewTweet} ↗
            </a>
          )}
        </span>
      )}
    </span>
  );
}

// Découpe `text` autour des marqueurs et remplace chacun par un <TweetRef>.
// Si le tweet n'est pas dans le payload, on garde le texte brut (sans soulignement).
function renderWithRefs(text, tweetMap, lang, dateLocale) {
  const nodes = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TWEET_REF_RE)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tweet = tweetMap[m[2]];
    nodes.push(
      tweet
        ? <TweetRef key={`ref-${n++}`} tweet={tweet} lang={lang} dateLocale={dateLocale}>{m[1]}</TweetRef>
        : m[1]
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Légende + crédit stockés en base (TOPICS.CREDIT), ex. « Légende. Photo : Auteur / Source », avec, éventuellement, des liens
// <a href="https://...">Auteur</a>. On ne le passe pas par dangerouslySetInnerHTML : seuls
// les liens http(s) sont reconnus et reconstruits en éléments React, le reste est du texte.
const CREDIT_LINK_RE = /<a\s[^>]*?href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function renderCredit(html) {
  const nodes = [];
  let last = 0;
  let n = 0;
  for (const m of html.matchAll(CREDIT_LINK_RE)) {
    if (m.index > last) nodes.push(html.slice(last, m.index));
    nodes.push(
      <a key={`credit-${n++}`} href={m[1]} target="_blank" rel="noopener noreferrer">
        {m[2].replace(/<[^>]+>/g, "")}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < html.length) nodes.push(html.slice(last));
  return nodes;
}

function setMeta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(name) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function TheaterPage() {
  const { lang, dateLocale, translateEntity, t } = useLang();
  const { data, error } = useBootstrap();
  const ui = t.theaters;      // fallback de titre
  const copy = t.theaterPage; // textes de la page
  const slug = getInitialTheaterSlug();
  const urlLang = getInitialTheaterLang() || lang; // langue de l'URL (pas celle du sélecteur)

  const theaters = useMemo(
    () => (data ? buildTheaters(data.topics, data.topic_summaries) : []),
    [data]
  );
  const theater = useMemo(
    () => theaters.find((x) => matchesTheaterSlug(x, slug, urlLang)) || null,
    [theaters, slug, urlLang]
  );

  // Ancien slug canonique (ex. /content/fr/ukraine-and-russia-at-war/) : on corrige l'URL.
  useEffect(() => {
    if (!theater) return;
    const good = localizedSlug(theater, urlLang);
    if (good !== slug) {
      window.history.replaceState(null, "", `${theaterPath(urlLang, good)}${window.location.search}${window.location.hash}`);
    }
  }, [theater, slug, urlLang]);

  const status = error ? "error" : !data ? "loading" : theater ? "ok" : "notfound";

  const label = theater ? translateTheaterLabel(theater.LABEL, lang) || ui.fallback : "";
  const summary = theater ? translateTheaterSummary(theater.LABEL, lang, theater.TOPIC_SUMMARY) : "";

  const tweetMap = useMemo(() => data?.topic_summary_tweets || {}, [data]);
  // Crédit : colonne CREDIT de la base en priorité, ancien fichier local en repli.
  const creditHtml = theater?.CREDIT?.trim() || "";
  const imageCredit = theater && !creditHtml ? getImageCredit(theater.LABEL) : null;

  const events = useMemo(
    () => (theater ? getTheaterEvents(data?.topic_summaries?.[String(theater.TOPIC_ID)], tweetMap, lang) : []),
    [theater, data, lang, tweetMap]
  );

  // <title>, meta description, canonical, robots.
  // Note : LangProvider ne touche plus au titre sur /content/ (voir LangContext).
  useEffect(() => {
    // Page générée par inject-seo (<html data-seo>) : titre, description, canonical,
    // hreflang et og:* sont déjà corrects pour cette langue dans le HTML statique.
    const prerendered = document.documentElement.dataset.seo === "1";
    if (status === "ok" && prerendered) return;
    if (status === "ok") {
      document.title = theaterTitle(theater.LABEL, label, lang);
      setMeta("description", (summary || label).replace(/\s+/g, " ").trim().slice(0, 160));
      setCanonical(`${window.location.origin}${theaterPath(lang, localizedSlug(theater, lang))}`);
      removeMeta("robots");
    } else if (status === "notfound") {
      document.title = `${copy.notFoundTitle} – ${t.pageTitle}`;
      setMeta("robots", "noindex, follow");
    }
  }, [status, theater, label, summary, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Colonne de droite : théâtres actifs (mis à jour il y a < 72 h, du plus récent
  // au plus ancien), puis les autres en simple liste de liens.
  const active = theaters
    .filter((x) => x !== theater && getFreshness(x.LATEST_UPDATE) !== "stale")
    .slice(0, 8);
  const others = theaters.filter((x) => x !== theater && !active.includes(x));
  const countries = theater?.COUNTRIES || [];
  // Indicateurs sous le titre : type (guerre civile si un seul pays concerné, sinon conflit)
  // et statut (actif tant que le dernier résumé a moins de 14 jours, voir getFreshness).
  const isCivilWar = countries.length === 1;
  const isActive = !!theater && getFreshness(theater.LATEST_UPDATE) !== "stale";
  const hasMap = status === "ok" && countries.length > 0;
  const hasAside = hasMap; // la colonne de droite ne contient plus que la carte
  const hasTopics = status === "ok" && (active.length > 0 || others.length > 0);
  const mapTitle = copy.mapTitle;

  // ── Sommaire sticky (colonne de gauche) : 3 entrées, chacune pointe vers une ancre ──
  // « Événements récents » porte en plus une sous-entrée par résumé quotidien (son titre),
  // qui pointe vers l'ancre #tp-ev-<i> de l'<li> correspondant.
  const hasToc = status === "ok";
  const tocTitle = copy.tocTitle;
  const tocItems = useMemo(() => {
    if (status !== "ok") return [];
    return [
      { id: "tp-summary", label: copy.tocSummary },
      {
        id: "tp-events",
        label: copy.tocRecent,
        children: events
          .map(({ title }, i) => ({ id: `tp-ev-${i}`, label: title ? shortenTocTitle(title) : "", full: title }))
          .filter((c) => c.label), // un résumé sans titre n'apparaît pas dans le sommaire
      },
      ...(hasTopics ? [{ id: "tp-topics", label: copy.tocTopics }] : []),
    ];
  }, [status, hasTopics, copy, events]);
  const rootRef = useRef(null);
  const [activeId, setActiveId] = useState("tp-summary");
  // Liste plate des ancres, dans l'ordre du DOM : sert au scroll-spy.
  // Tous les résumés y figurent, même sans titre : l'article visible pilote aussi la carte.
  const tocKey = useMemo(
    () =>
      tocItems
        .flatMap((i) => (i.id === "tp-events" ? [i.id, ...events.map((_, k) => `tp-ev-${k}`)] : [i.id]))
        .join("|"),
    [tocItems, events]
  );

  // Scroll-spy : la section active est la dernière dont le haut a dépassé la ligne
  // située sous l'en-tête collant. Tout en bas de page, on force la dernière entrée
  // (une section courte comme « Autres sujets » n'atteindrait jamais la ligne).
  useEffect(() => {
    const root = rootRef.current;
    if (!tocKey || !root) return undefined;
    const ids = tocKey.split("|");
    const update = () => {
      const rootTop = root.getBoundingClientRect().top;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
      let current = ids[0];
      if (atBottom) {
        current = ids[ids.length - 1];
      } else {
        ids.forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top - rootTop <= 140) current = id;
        });
      }
      setActiveId(current);
    };
    update();
    root.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      root.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tocKey]);

  // Résumé affiché sur la carte : celui survolé / touché / focalisé s'il y en a un, sinon celui
  // qui est à l'écran (scroll-spy) : ses tweets sources sont marqués sans qu'il faille survoler.
  const [hoverIdx, setHoverIdx] = useState(null);
  // Dans la section sans avoir encore franchi un titre, le premier article est déjà à l'écran.
  const scrollIdx = activeId.startsWith("tp-ev-")
    ? Number(activeId.slice(6))
    : activeId === "tp-events" && events.length ? 0 : null;
  // Quand on change d'article en défilant, le défilement reprend la main (au tactile, la
  // sélection par toucher ne se relâche jamais d'elle-même).
  useEffect(() => { setHoverIdx(null); }, [scrollIdx]);
  const mapIdx = hoverIdx ?? scrollIdx;
  const hoverPoints = useMemo(() => {
    const ev = mapIdx == null ? null : events[mapIdx];
    if (!ev) return null;
    const seen = new Set();
    const pts = ev.sources
      .filter((tw) => Number.isFinite(tw.latitude) && Number.isFinite(tw.longitude) && !seen.has(tw.id) && seen.add(tw.id))
      .map((tw) => ({
        id: tw.id,
        lat: tw.latitude,
        lon: tw.longitude,
        typology: tw.conflict_typology,
        importance: tw.importance_score,
      }));
    return pts.length ? pts : null;
  }, [mapIdx, events]);

  const goTo = (id) => (e) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <div className="tp-root" ref={rootRef}>
      <header className="tp-header">
        <a className="tp-back" href="/">
          <span aria-hidden="true">←</span> {copy.backToConflictMap}
        </a>
        <a className="tp-brand" href="/">{copy.brand}</a>
        <span className="tp-header-spacer" aria-hidden="true" />
      </header>

      <main className={`tp-page${status !== "ok" ? " tp-page--single" : hasAside ? "" : " tp-page--nomap"}`}>
        {hasToc && (
          <nav className="tp-toc" aria-label={tocTitle}>
            <h2 className="tp-toc-title">{tocTitle}</h2>
            <ul className="tp-toc-list">
              {tocItems.map((item) => {
                // Parent d'une sous-entrée active : mis en avant, sans flèche (une seule flèche à la fois).
                const childActive = item.id === "tp-events" && activeId.startsWith("tp-ev-");
                return (
                  <li key={item.id}>
                    <a
                      className={`tp-toc-link${activeId === item.id ? " is-active" : ""}${childActive ? " is-open" : ""}`}
                      href={`#${item.id}`}
                      aria-current={activeId === item.id ? "true" : undefined}
                      onClick={goTo(item.id)}
                    >
                      {item.label}
                    </a>
                    {item.children?.length > 0 && (
                      <ul className="tp-toc-sub">
                        {item.children.map((c) => (
                          <li key={c.id}>
                            <a
                              className={`tp-toc-link tp-toc-link--sub${activeId === c.id ? " is-active" : ""}`}
                              href={`#${c.id}`}
                              aria-current={activeId === c.id ? "true" : undefined}
                              onClick={goTo(c.id)}
                              title={c.full}
                            >
                              <span className="tp-toc-sub-text">{c.label}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <article className="tp-article">
          {status === "loading" && <p className="tp-status" role="status">{copy.loading}</p>}
          {status === "error" && <p className="tp-status" role="alert">{copy.error}</p>}

          {status === "notfound" && (
            <>
              <h1 className="tp-title">{copy.notFoundTitle}</h1>
              <p className="tp-chapo">{copy.notFoundText}</p>
              <a className="tp-cta" href="/">{copy.backToMap}</a>
            </>
          )}

          {status === "ok" && (
            <>
              <header className="tp-article-head" id="tp-summary">
                <h1 className="tp-title">{label}</h1>
                <ul className="tp-tags" aria-label={copy.tagsLabel}>
                  <li className="tp-tag">{isCivilWar ? copy.tagCivilWar : copy.tagConflict}</li>
                  <li className={`tp-tag tp-tag--${isActive ? "active" : "inactive"}`}>
                    {isActive ? copy.tagActive : copy.tagInactive}
                  </li>
                </ul>
                <p className="tp-meta">
                  <span className={`tp-dot tp-dot--${getFreshness(theater.LATEST_UPDATE)}`} aria-hidden="true" />
                  <span>{formatRelativeTime(theater.LATEST_UPDATE, lang)}</span>
                </p>
                {summary && <p className="tp-chapo">{summary}</p>}
              </header>

              <figure className="tp-figure">
                <img
                  src={imageUrl(theater.LABEL)}
                  alt={label}
                  onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                />
                {(creditHtml || imageCredit) && (
                  <figcaption className="tp-figure-credit">
                    {creditHtml ? (
                      // légende complète en base (anglais) : traduite côté client, pas de préfixe
                      renderCredit(localizeCredit(creditHtml, lang))
                    ) : (
                      <>
                        {copy.imageCredit}{" "}
                        {imageCredit.url ? (
                          <a href={imageCredit.url} target="_blank" rel="noopener noreferrer">{imageCredit.credit}</a>
                        ) : (
                          imageCredit.credit
                        )}
                      </>
                    )}
                  </figcaption>
                )}
              </figure>

              <section className="tp-body" id="tp-events">
                <h2 className="tp-h2">{copy.events}</h2>
                {events.length === 0 ? (
                  <p className="tp-empty">{copy.noEvents}</p>
                ) : (
                  <ol className="tp-events">
                    {events.map(({ ev, title, text, sources }, i) => {
                      // Une puce par ligne du résumé (structure CFR : titre, date, puces).
                      const points = (text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
                      return (
                        <li
                          className="tp-event"
                          id={`tp-ev-${i}`}
                          key={`${ev.created_at}-${i}`}
                          // souris : survol ; clavier : focus ; tactile : un toucher le sélectionne
                          onPointerEnter={(e) => { if (e.pointerType === "mouse") setHoverIdx(i); }}
                          onPointerLeave={(e) => { if (e.pointerType === "mouse") setHoverIdx(null); }}
                          onFocus={() => setHoverIdx(i)}
                          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHoverIdx(null); }}
                          onClick={() => setHoverIdx(i)}
                        >
                          <article>
                            <time className="tp-event-date" dateTime={ev.created_at}>
                              {formatEventDate(ev.created_at, dateLocale)}
                            </time>
                            {title && <h3 className="tp-event-title">{title}</h3>}
                            {points.length > 0 && (
                              <ul className="tp-event-points">
                                {points.map((pt, j) => <li key={j}>{renderWithRefs(pt, tweetMap, lang, dateLocale)}</li>)}
                              </ul>
                            )}
                            {/* Sans marqueur inline, on liste les tweets sources sous les puces. */}
                            {!hasTweetRefs(text) && (
                              <p className="tp-event-sources">
                                <span className="tp-event-sources-label">{copy.sources} <span aria-hidden="true">↗</span></span>
                                {sources.slice(0, 8).map((tw) => (
                                  <TweetRef key={tw.id} tweet={tw} lang={lang} dateLocale={dateLocale}>
                                    {`@${String(tw.username || "").replace(/^@/, "")}`}
                                  </TweetRef>
                                ))}
                              </p>
                            )}
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <a className="tp-cta" href={`/?topic=${encodeURIComponent(theater.LABEL)}`}>
                {copy.viewOnMap}
              </a>

              {hasTopics && (
                <section className="tp-topics" id="tp-topics">
              {active.length > 0 && (
                <nav className="tp-panel" aria-label={copy.activeTitle}>
                  <h2 className="tp-panel-title">{copy.activeTitle}</h2>
                  <ol className="tp-ranked">
                    {active.map((x, i) => (
                      <li key={x.TOPIC_ID}>
                        <span className="tp-rank" aria-hidden="true">{i + 1}</span>
                        <a className="tp-ranked-link" href={theaterPath(lang, localizedSlug(x, lang))}>
                          <span className="tp-ranked-title">
                            {translateTheaterLabel(x.LABEL, lang) || ui.fallback}
                          </span>
                          <span className="tp-ranked-meta">
                            <span className={`tp-dot tp-dot--${getFreshness(x.LATEST_UPDATE)}`} aria-hidden="true" />
                            {formatRelativeTime(x.LATEST_UPDATE, lang)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}

              {others.length > 0 && (
                <nav className="tp-panel" aria-label={copy.otherTheaters}>
                  <h2 className="tp-panel-title tp-panel-title--small">{copy.otherTheaters}</h2>
                  <ul className="tp-others">
                    {others.map((x) => (
                      <li key={x.TOPIC_ID}>
                        <a href={theaterPath(lang, localizedSlug(x, lang))}>
                          {translateTheaterLabel(x.LABEL, lang) || ui.fallback}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
                </section>
              )}
            </>
          )}
        </article>

        {hasAside && (
          <aside className="tp-aside">
            {hasMap && (
              <section className="tp-panel tp-panel--map" aria-label={mapTitle}>
                <h2 className="tp-panel-title">{mapTitle}</h2>
                <CountryMap
                  names={countries}
                  title={mapTitle}
                  lang={lang}
                  translate={translateEntity}
                  href={`/?topic=${encodeURIComponent(theater.LABEL)}`}
                  linkLabel={copy.viewOnMap}
                  points={hoverPoints}
                />
              </section>
            )}

          </aside>
        )}
      </main>
    </div>
  );
}