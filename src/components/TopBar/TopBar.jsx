import { useState, useEffect, useRef } from "react";
import "./TopBar.css";
import { useTime } from "../../context/TimeContext";

const API = process.env.REACT_APP_API_URL;

/* ─── Freshness helpers ─── */
const getFreshness = (isoDate) => {
  if (!isoDate) return "stale";
  const diffH = (Date.now() - new Date(isoDate).getTime()) / 36e5;
  if (diffH < 6)  return "hot";     // < 6h  → rouge vif
  if (diffH < 24) return "warm";    // < 24h → orange
  if (diffH < 72) return "cool";    // < 3j  → jaune
  return "stale";                   // > 3j  → gris
};

const formatRelative = (isoDate) => {
  if (!isoDate) return null;
  const diffH = (Date.now() - new Date(isoDate).getTime()) / 36e5;
  if (diffH < 1)   return `${Math.round(diffH * 60)}m ago`;
  if (diffH < 24)  return `${Math.round(diffH)}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
};

/* ─── TopBar ─── */
export default function TopBar({ tweets, onTopicSelect }) {
  const [topics,      setTopics]      = useState([]);
  const { selectedPeriod, changePeriod } = useTime();
  const [openPanel, setOpenPanel] = useState(null);

  /* Topic drill-down */
  const [activeTopic,  setActiveTopic]  = useState(null);
  const [topicTweets,  setTopicTweets]  = useState([]);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicError,   setTopicError]   = useState(null);

  const menuRef      = useRef(null);
  const scrollRef    = useRef(null);  // ref sur topics-panel-content
  const scrollPosRef = useRef(0);     // position de scroll sauvegardée

  const timeOptions = [
    { value: "6h",  label: "6h"  },
    { value: "24h", label: "24h" },
    { value: "7d",  label: "7d"  },
    { value: "14d", label: "14d" },
  ];

  /* ─── Fetch Topics ─── */
  useEffect(() => {
    async function fetchTopics() {
      try {
        const response = await fetch(`${API}/topics`);
        const data = await response.json();
        setTopics(data.topics || []);
      } catch (error) {
        console.error("Erreur lors du fetch topics:", error);
      }
    }
    fetchTopics();
  }, []);

  /* ─── Restaurer le scroll à la réouverture ─── */
  useEffect(() => {
    if (openPanel === "topics" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosRef.current;
    }
  }, [openPanel]);

  /* ─── Toggle panel (sauvegarde le scroll à la fermeture) ─── */
  const togglePanel = (panel) => {
    setOpenPanel((current) => {
      if (current === panel) {
        if (scrollRef.current) {
          scrollPosRef.current = scrollRef.current.scrollTop;
        }
        return null;
      }
      return panel;
    });
  };

  /* ─── Drill into a topic ─── */
  const handleTopicClick = async (topic) => {
    // Sauvegarder le scroll de la liste avant de changer de vue
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop;
    }
    setActiveTopic(topic);
    setTopicTweets([]);
    setTopicError(null);
    setTopicLoading(true);

    // Pan la map vers le topic
    if (topic.LNG != null && topic.LAT != null) {
      onTopicSelect?.({ lng: topic.LNG, lat: topic.LAT });
    }

    try {
      const response = await fetch(`${API}/topics/${topic.TOPIC_ID}/tweets`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const sorted = (data.tweets || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setTopicTweets(sorted);
    } catch (err) {
      console.error("Erreur fetch topic tweets:", err);
      setTopicError("Impossible de charger les événements.");
    } finally {
      setTopicLoading(false);
    }
  };

  /* ─── Back to topic list ─── */
  const handleBack = () => {
    setActiveTopic(null);
    setTopicTweets([]);
    setTopicError(null);
    // Le scroll de la liste sera restauré au prochain render via scrollRef
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="topbar">
      <div className="topbar-left" ref={menuRef}>

        {/* ─── Time period ─── */}
        <div className="time-period-group">
          {timeOptions.map((option) => (
            <button
              key={option.value}
              className={`time-btn ${selectedPeriod === option.value ? "active" : ""}`}
              onClick={() => changePeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* ─── Topics Button ─── */}
        <button
          className={`topbar-btn ${openPanel === "topics" ? "active topics-active" : ""}`}
          onClick={() => togglePanel("topics")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h18M3 12h12M3 17h8" />
          </svg>
          Theaters
        </button>

        {/* ─── Topics Panel ─── */}
        {openPanel === "topics" && (
          <div className="topics-panel">

            {/* ══ Vue : liste des topics ══ */}
            {!activeTopic && (
              <>
                <div className="topics-panel-header">
                  <h3>Active Theaters</h3>

                </div>
                <div className="topics-panel-content" ref={scrollRef}>
                  {topics.length === 0 ? (
                    <p className="topics-empty">No topics found</p>
                  ) : (
                    <div className="topics-list">
                      {topics.map((topic, i) => (
                        <button
                          key={i}
                          className={`topics-item ${topic.ACTIVE ? "topics-item--active" : "topics-item--inactive"}`}
                          onClick={() => handleTopicClick(topic)}
                        >
                          <div className="topics-item-main">
                            <div className="topics-item-top">
                              <span className={`topics-live-dot topics-live-dot--${getFreshness(topic.LATEST_UPDATE)}`} />
                              <span className="topics-item-label">{topic.LABEL}</span>
                            </div>
                            <div className="topics-item-countries">
                              {(topic.COUNTRIES || []).map((c, j) => (
                                <span key={j} className="topics-country-tag">{c}</span>
                              ))}
                            </div>
                            {topic.LATEST_UPDATE && (
                              <div className="topics-item-update">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                                {formatRelative(topic.LATEST_UPDATE)}
                              </div>
                            )}
                          </div>
                          <svg className="topics-item-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══ Vue : tweets d'un topic ══ */}
            {activeTopic && (
              <>
                <div className="topics-panel-header topics-panel-header--detail">
                  <button className="topics-back-btn" onClick={handleBack}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <div className="topics-detail-title">
                    <span className="topics-detail-label">{activeTopic.LABEL}</span>

                  </div>
                </div>

                <div className="topics-panel-content" ref={scrollRef}>
                  {/* ── Résumé du topic ── */}
                  {activeTopic.TOPIC_SUMMARY && (
                    <div
                      className="topics-summary-block"
                      style={{
                        backgroundImage: `url(${process.env.PUBLIC_URL}/img/${activeTopic.LABEL.replace(/ /g, '%20')}.png)`,
                      }}
                    >
                      <div className="topics-summary-overlay" />
                      <div className="topics-summary-inner">
                        <div className="topics-summary-label">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                          </svg>
                          Situation summary
                        </div>
                        <p className="topics-summary-text">{activeTopic.TOPIC_SUMMARY}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Séparateur événements ── */}
                  {!topicLoading && !topicError && topicTweets.length > 0 && (
                    <div className="topics-events-divider">
                      <span>Major events</span>
                    </div>
                  )}

                  {/* ── États loading / erreur / vide ── */}
                  {topicLoading && (
                    <div className="topics-loading">
                      <span className="topics-loading-dot" />
                      <span className="topics-loading-dot" />
                      <span className="topics-loading-dot" />
                    </div>
                  )}
                  {topicError && (
                    <p className="topics-empty">{topicError}</p>
                  )}
                  {!topicLoading && !topicError && topicTweets.length === 0 && (
                    <p className="topics-empty">No significant events found for this theater.</p>
                  )}

                  {/* ── Liste des tweets ── */}
                  {!topicLoading && !topicError && topicTweets.length > 0 && (
                    <div className="topics-tweet-list">
                      {topicTweets.map((tweet) => (
                        <div key={tweet.tweet_id} className="topics-tweet-card">
                          <div className="topics-tweet-date">{formatDate(tweet.created_at)}</div>
                          <p className="topics-tweet-summary">"{tweet.summary_text}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        )}

      </div>
    </div>
  );
}