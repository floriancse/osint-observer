// Résumés quotidiens d'un théâtre : logique PARTAGÉE entre la page /content/<slug>/ (TheaterPage)
// et le panneau « Théâtres » (TheatersDrawer), pour que le nombre affiché dans le panneau
// soit exactement le nombre de résumés visibles sur la page.

// Le texte d'un résumé peut contenir [texte](tweet:123456789).
export const TWEET_REF_RE = /\[([^\]]+)\]\(tweet:(\d+)\)/g;
export const hasTweetRefs = (text) => !!text && text.includes("](tweet:");
export const stripTweetRefs = (text) => (text || "").replace(TWEET_REF_RE, "$1");

// champ_<lang> (fr, en, es...), sinon anglais (hors fr), sinon valeur brute
const pick = (ev, base, lang) =>
  ev[`${base}_${lang}`] || (lang !== "fr" ? ev[`${base}_en`] : "") || ev[base];

// Sources résolubles d'un résumé : marqueurs [texte](tweet:id) présents dans le
// payload, sinon tweets is_source. Les marqueurs dont le tweet est absent de
// tweetMap ne comptent pas (ils s'afficheraient sans soulignement).
export const getEventSources = (ev, text, tweetMap) => {
  if (hasTweetRefs(text)) {
    return [...text.matchAll(TWEET_REF_RE)].map((m) => tweetMap[m[2]]).filter(Boolean);
  }
  return (ev.tweets || []).filter((t) => t.is_source).map((t) => tweetMap[t.id]).filter(Boolean);
};

// Résumés réellement affichés : sans source résoluble → pas d'affichage. Du plus récent au plus ancien.
export const getTheaterEvents = (summaries, tweetMap, lang) =>
  (summaries || [])
    .map((ev) => {
      const text = pick(ev, "summary", lang);
      return {
        ev,
        title: stripTweetRefs(pick(ev, "summary_title", lang)),
        text,
        sources: getEventSources(ev, text, tweetMap || {}),
      };
    })
    .filter((x) => x.sources.length > 0)
    .sort((a, b) => new Date(b.ev.created_at) - new Date(a.ev.created_at));

export const countTheaterEvents = (summaries, tweetMap, lang) =>
  getTheaterEvents(summaries, tweetMap, lang).length;