import { useEffect, useMemo, useRef } from "react";
import "./TheatersDrawer.css";
import { translateTheaterLabel } from "../../utils/theaterLabels";
import { MdClose, MdChevronRight } from "react-icons/md";
import { useLang } from "../../context/LangContext";
import { useBootstrap } from "../../context/BootstrapContext";
import { countTheaterEvents } from "../../utils/theaterEvents";
import { localizedSlug, theaterPath } from "../../utils/theaterRoute";
import { buildTheaters, getFreshness, imageUrl } from "../../utils/theaters";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

export default function TheatersDrawer({
  open,
  onClose,
  topics = [],
  summariesByTopic = {},
  lang: langProp, // optionnel : par défaut, la langue active de LangContext
}) {
  const { t, lang: ctxLang, translateEntity } = useLang();
  const lang = langProp ?? ctxLang;
  const ui = t.theaters;
  // Tweets sources des résumés : sans eux, on ne peut pas savoir quels résumés la page affichera.
  const { data: bootstrapData } = useBootstrap();
  const tweetMap = bootstrapData?.topic_summary_tweets;

  // Théâtres nettoyés / dédoublonnés, triés du plus récent au plus ancien
  const sorted = useMemo(
    () => buildTheaters(topics, summariesByTopic),
    [topics, summariesByTopic]
  );

  // Théâtres "actifs" = mis à jour il y a moins de 72 h (tout sauf "stale")
  const activeCount = useMemo(
    () => sorted.filter((t) => getFreshness(t.LATEST_UPDATE) !== "stale").length,
    [sorted]
  );

  // Diagnostic : si la liste est vide, on le dit dans la console
  useEffect(() => {
    if (open && sorted.length === 0) {
      console.warn("[TheatersDrawer] aucun théâtre à afficher", {
        topics: Array.isArray(topics) ? topics.length : topics,
        summaries: Object.keys(summariesByTopic || {}).length,
      });
    }
  }, [open, sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Diagnostic images : à la 1re ouverture, on teste l'URL du 1er théâtre.
  const imgCheckedRef = useRef(false);
  useEffect(() => {
    if (!open || imgCheckedRef.current || sorted.length === 0) return;
    imgCheckedRef.current = true;
    const url = imageUrl(sorted[0].LABEL);
    fetch(url, { method: "HEAD", cache: "no-store" })
      .then((r) => {
        const type = r.headers.get("content-type");
        const ok = r.ok && /^image\//.test(type || "");
        (ok ? console.info : console.warn)(
          `[TheatersDrawer] image ${ok ? "OK" : "PROBLÈME"} : ${url} → HTTP ${r.status}, content-type: ${type}`
        );
      })
      .catch((e) => console.warn(`[TheatersDrawer] image inaccessible : ${url}`, e));
  }, [open, sorted]);

  // Échap : fermeture
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const renderTitle = (topic) => translateTheaterLabel(topic.LABEL, lang) || ui.fallback;

  return (
    <aside
      className={`theaters-drawer${open ? " theaters-drawer--open" : ""}`}
      aria-hidden={!open}
    >
      <div className="theaters-drawer-header">
        <div className="theaters-drawer-heading">
          <h2 className="theaters-drawer-title">{ui.title}</h2>
          <span className="theaters-drawer-subtitle">{ui.active(activeCount)}</span>
        </div>
        <button className="theaters-icon-btn" onClick={onClose} aria-label={ui.close}>
          <MdClose size={16} />
        </button>
      </div>

      <div className="theaters-drawer-body">
        {sorted.length === 0 && <p className="theater-popup-empty">{ui.empty}</p>}
        {sorted.map((topic) => {
          const freshness = getFreshness(topic.LATEST_UPDATE);
          // Même règle que la page du théâtre : un résumé sans source n'y est pas affiché,
          // donc il ne doit pas être compté ici non plus.
          const summaries = summariesByTopic[String(topic.TOPIC_ID)] || [];
          const count = tweetMap ? countTheaterEvents(summaries, tweetMap, lang) : summaries.length;
          return (
            <a
              key={topic.TOPIC_ID}
              href={theaterPath(lang, localizedSlug(topic, lang))}
              target="_blank"
              rel="noopener"
              className="theaters-card"
              style={{ backgroundImage: `url("${imageUrl(topic.LABEL)}")` }}
            >
              <span className="theaters-card-overlay" />
              <span className="theaters-card-content">
                <span className="theaters-card-top">
                  <span className={`theater-popup-freshness-dot theater-popup-freshness-dot--${freshness}`} />
                  <h3 className="theaters-card-title">{renderTitle(topic)}</h3>
                  <span className="theater-popup-rel-time">{formatRelativeTime(topic.LATEST_UPDATE, lang)}</span>
                </span>
                <span className="theaters-card-bottom">
                  <span className="theater-popup-countries">
                    {(topic.COUNTRIES || []).slice(0, 3).map((c) => (
                      <span key={c} className="theater-popup-tag">{translateEntity(c)}</span>
                    ))}
                  </span>
                  <span className="theaters-card-more">
                    {ui.eventsCount(count)}
                    <MdChevronRight size={16} />
                  </span>
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </aside>
  );
}