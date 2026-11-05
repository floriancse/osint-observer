import { useEffect, useMemo } from "react";
import "../TheaterPage/TheaterPage.css"; // tokens (--tp-*), .tp-root, .tp-page, .tp-dot, .tp-title...
import "./TheatersIndexPage.css";
import { useBootstrap } from "../../context/BootstrapContext";
import { useLang } from "../../context/LangContext";
import { translateTheaterLabel } from "../../utils/theaterLabels";
import { localizedSlug, theaterPath } from "../../utils/theaterRoute";
import { getTheatersIndexLang } from "../../utils/theatersIndexRoute";
import { countTheaterEvents } from "../../utils/theaterEvents";
import { buildTheaters, getFreshness, imageUrl } from "../../utils/theaters";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import TopBar from "../TopBar/TopBar";

// Page /content/<lang>/theaters/ : la liste de tous les théâtres (ex-contenu du tiroir).
// Un clic sur une carte ouvre la page du théâtre dans le même onglet.
export default function TheatersIndexPage() {
  const { t, lang, translateEntity } = useLang();
  const { data, error } = useBootstrap();
  const ui = t.theaters;
  const copy = t.theaterPage;
  const urlLang = getTheatersIndexLang() || lang;

  const theaters = useMemo(
    () => (data ? buildTheaters(data.topics, data.topic_summaries) : []),
    [data]
  );
  const activeCount = useMemo(
    () => theaters.filter((x) => getFreshness(x.LATEST_UPDATE) !== "stale").length,
    [theaters]
  );
  const tweetMap = data?.topic_summary_tweets;
  const status = error ? "error" : !data ? "loading" : "ok";

  useEffect(() => {
    // Page prérendue (inject-seo) : le <head> est déjà bon.
    if (document.documentElement.dataset.seo === "1") return;
    document.title = `${ui.title} – ${t.pageTitle}`;
  }, [ui.title, t.pageTitle]);

  return (
    <div className="tp-root">
      <TopBar variant="bar" active="theaters" lang={urlLang} brand={copy.brand} />

      <main className="tp-page tp-page--single ti-page">
        <header className="ti-head">
          <h1 className="tp-title">{ui.title}</h1>
          {status === "ok" && <p className="tp-meta"><span>{ui.active(activeCount)}</span></p>}
        </header>

        {status === "loading" && <p className="tp-status" role="status">{copy.loading}</p>}
        {status === "error" && <p className="tp-status" role="alert">{copy.error}</p>}
        {status === "ok" && theaters.length === 0 && <p className="tp-empty">{ui.empty}</p>}

        {status === "ok" && theaters.length > 0 && (
          <ul className="ti-grid">
            {theaters.map((topic) => {
              const freshness = getFreshness(topic.LATEST_UPDATE);
              // Même règle que la page du théâtre : un résumé sans source n'y est pas affiché.
              const summaries = data.topic_summaries?.[String(topic.TOPIC_ID)] || [];
              const count = tweetMap ? countTheaterEvents(summaries, tweetMap, lang) : summaries.length;
              return (
                <li key={topic.TOPIC_ID}>
                  <a
                    className="ti-card"
                    href={theaterPath(urlLang, localizedSlug(topic, urlLang))}
                    style={{ backgroundImage: `url("${imageUrl(topic.LABEL)}")` }}
                  >
                    <span className="ti-card-overlay" />
                    <span className="ti-card-content">
                      <span className="ti-card-top">
                        <span className={`tp-dot tp-dot--${freshness}`} aria-hidden="true" />
                        <h2 className="ti-card-title">
                          {translateTheaterLabel(topic.LABEL, lang) || ui.fallback}
                        </h2>
                        <span className="ti-card-time">{formatRelativeTime(topic.LATEST_UPDATE, lang)}</span>
                      </span>
                      <span className="ti-card-bottom">
                        <span className="ti-card-countries">
                          {(topic.COUNTRIES || []).slice(0, 3).map((c) => (
                            <span key={c} className="ti-tag">{translateEntity(c)}</span>
                          ))}
                        </span>
                        <span className="ti-card-more">{ui.eventsCount(count)} →</span>
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}