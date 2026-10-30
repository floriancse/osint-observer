import { useState, useEffect, useLayoutEffect, useRef } from "react";
import "./SidePanel.css";
import { createPortal } from "react-dom";
import { IoLanguage, IoCheckmark, IoCalendarClearOutline } from "react-icons/io5";
import { createPopupHTML } from "../../utils/popupUtils";
import { useBootstrap } from "../../context/BootstrapContext";
import { useTime, PERIOD_PRESETS } from "../../context/TimeContext";
import { useLang } from "../../context/LangContext";
import { translateTheaterLabel } from "../../utils/theaterLabels";

// Nom de chaque langue dans sa propre langue (entrées du menu de langue).
const LANG_NAMES = { fr: "Français", en: "English", es: "Español" };

const SkeletonLoader = () => (
    <div className="skeleton-list">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="skeleton-header">
                    <div className="skeleton-avatar" />
                    <div className="skeleton-meta">
                        <div className="skeleton-line skeleton-line--name" />
                        <div className="skeleton-line skeleton-line--handle" />
                    </div>
                    <div className="skeleton-badge" />
                </div>
                <div className="skeleton-body">
                    <div className="skeleton-line skeleton-line--full" />
                    <div className="skeleton-line skeleton-line--full" />
                    <div className="skeleton-line skeleton-line--short" />
                </div>
                <div className="skeleton-footer">
                    <div className="skeleton-line skeleton-line--date" />
                </div>
            </div>
        ))}
    </div>
);

// Moins de cartes au premier rendu (chaque carte = innerHTML + images) ; la
// sentinelle en charge davantage au défilement.
const PAGE_SIZE = 10;

// <article> d'un tweet dont le contenu HTML est injecté à la main.
// Avec dangerouslySetInnerHTML, React réécrit tout le contenu dès que la chaîne HTML
// change (ex. données rechargées après le vol de la carte vers le tweet cliqué) :
// les <video> sont alors détruites et recréées (retour à 0:00, l'ancienne continue
// parfois à jouer le son hors du DOM). Ici, on ne touche pas au DOM tant qu'une
// vidéo de CE tweet est en cours de lecture.
function TweetArticle({ feature, lang, priority = false, ...rest }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const id = String(feature.properties.id ?? "");
        // collapseMedia = false : dans le panneau latéral, les médias sont toujours affichés
        // (seuls les popups de la carte les replient derrière « Afficher les médias »).
        const html = createPopupHTML(feature.properties, false, 0, 1, true, true, false, lang, false, priority, false);
        if (el.__html === html) return;
        const sameTweet = id !== "" && el.__id === id && el.__lang === lang;
        const videoPlaying = Array.from(el.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
        if (sameTweet && videoPlaying) return; // on ne casse pas la lecture en cours
        el.innerHTML = html;
        el.__html = html;
        el.__id = id;
        el.__lang = lang;
    });
    return <article ref={ref} {...rest} />;
}

export default function SidePanel({ tweets, collapsed, activeLabel, onLabelChange, onTweetClick, selectedTweetId, onToggle, onResize }) {
    const isLoading = !tweets;
    const { t, dateLocale, lang, setLang, availableLangs } = useLang();

    // ── Menu de langue ──
    // Rendu dans un portail (<body>) en position fixe : il n'est ainsi ni rogné par l'overflow du
    // panneau ni recouvert par le contenu des cartes de tweet (z-index), sur desktop comme sur mobile.
    const langLabel = t.language ?? "Language";
    const [langMenu, setLangMenu] = useState(null); // null (fermé) | { top, right } en coordonnées écran
    const langBtnRef = useRef(null);
    const langMenuRef = useRef(null);
    const langMenuOpen = langMenu !== null;

    const toggleLangMenu = () => {
        if (langMenuOpen) { setLangMenu(null); return; }
        const r = langBtnRef.current?.getBoundingClientRect();
        if (r) setLangMenu({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };

    useEffect(() => {
        if (!langMenuOpen) return;
        langMenuRef.current?.querySelector('[aria-checked="true"]')?.focus();
        const close = () => setLangMenu(null);
        const onPointerDown = (e) => {
            if (langMenuRef.current?.contains(e.target) || langBtnRef.current?.contains(e.target)) return;
            close();
        };
        const onKey = (e) => {
            if (e.key === "Escape") { close(); langBtnRef.current?.focus(); }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true); // le menu est fixe : on le ferme si la page défile
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [langMenuOpen]);

    // Flèches haut / bas : déplace le focus entre les langues
    const onLangMenuKeyDown = (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(langMenuRef.current.querySelectorAll('[role="menuitemradio"]'));
        const i = items.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
    };

    const tweetFeatures = tweets?.features || [];
    const { data: bootstrapData } = useBootstrap();
    // Compteur d'événements : affiché seulement quand il est définitif.
    //  - rangeCovered : tant que /bootstrap/lite n'est pas complété par /tweets/older
    //    (data.partial), le décompte n'est exact que si la période ne remonte pas
    //    avant recent_cutoff.
    const { timeRange, selectedPeriod, changePeriod } = useTime();
    // Libellés du sélecteur de période (traductions dans LangContext : period*).
    const periodLabels = {
        today: t.periodToday,
        week: t.periodWeek,
        month: t.periodMonth,
        custom: t.periodCustom,
        group: t.periodGroup,
    };

    // ── Menu déroulant de période ──
    const [periodOpen, setPeriodOpen] = useState(false);
    const periodRef = useRef(null);
    useEffect(() => {
        if (!periodOpen) return;
        const root = periodRef.current;
        (root?.querySelector('[aria-checked="true"]') ?? root?.querySelector('[role="menuitemradio"]'))?.focus();
        const onPointerDown = (e) => { if (!root?.contains(e.target)) setPeriodOpen(false); };
        const onKey = (e) => {
            if (e.key === "Escape") { setPeriodOpen(false); root?.querySelector(".sp-pill")?.focus(); }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [periodOpen]);
    const onPeriodMenuKeyDown = (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(periodRef.current.querySelectorAll('[role="menuitemradio"]'));
        const i = items.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
    };
    const cutoffMs = bootstrapData?.recent_cutoff ? new Date(bootstrapData.recent_cutoff).getTime() : 0;
    const rangeCovered = !bootstrapData?.partial || new Date(timeRange.start).getTime() >= cutoffMs;
    const lastUpdate = bootstrapData?.last_update
        ? new Date(bootstrapData.last_update).toLocaleString(dateLocale, {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
        : null;
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [topicsOpen, setTopicsOpen] = useState(false);
    const [allUniqueLabels, setAllUniqueLabels] = useState([]);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const sentinelRef = useRef(null);

    // ── Largeur redimensionnable (desktop uniquement) ──
    const MIN_WIDTH = 280;
    const MOBILE_QUERY = '(max-width: 768px)';
    const panelRef = useRef(null);
    const [width, setWidth] = useState(() => {
        try {
            const saved = parseInt(localStorage.getItem("sidepanelWidth"), 10);
            return Number.isFinite(saved) ? saved : null; // null => largeur CSS par défaut (28vw)
        } catch {
            return null;
        }
    });

    const startResize = (e) => {
        // Pas de redimensionnement sur mobile (le panneau y est en plein écran)
        if (window.matchMedia(MOBILE_QUERY).matches) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId); // on continue de recevoir les events au-dessus de la carte
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        let lastWidth = null;
        const onMove = (ev) => {
            const left = panelRef.current.getBoundingClientRect().left;
            const max = Math.min(window.innerWidth * 0.6, 900);
            lastWidth = Math.round(Math.min(max, Math.max(MIN_WIDTH, ev.clientX - left)));
            setWidth(lastWidth);
            onResize?.();
        };
        const onUp = () => {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            if (lastWidth != null) {
                try { localStorage.setItem("sidepanelWidth", String(lastWidth)); } catch { /* ignore */ }
            }
            onResize?.();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    };

    const resetWidth = () => {
        if (window.matchMedia(MOBILE_QUERY).matches) return;
        setWidth(null);
        try { localStorage.removeItem("sidepanelWidth"); } catch { /* ignore */ }
        setTimeout(() => onResize?.(), 0);
    };

    // Mémorise le dernier compte connu par label. Comme `tweets` peut arriver
    // déjà filtré par activeLabel (fetch côté parent), on ne veut jamais
    // "oublier" le compte des labels qui ne sont plus dans le lot courant :
    // on fusionne au lieu d'écraser, ce qui garde l'ordre du dropdown stable.
    const labelCountsRef = useRef({});

    useEffect(() => {
        if (tweets?.availableLabelsForFilters) {
            setAllUniqueLabels(tweets.availableLabelsForFilters);
        }
        // Fallback pour le chargement initial
        else if (tweets?.allLabelsForTimeRange) {
            setAllUniqueLabels(tweets.allLabelsForTimeRange);
        }
        else if (tweets?.features) {
            const features = tweets.features.filter(f => Boolean(f.properties.label));
            const labels = [...new Set(features.map(f => f.properties.label))].sort();
            setAllUniqueLabels(labels);
        }

        // Met à jour le cache de comptage à partir des données courantes,
        // sans effacer les comptes des labels absents du lot actuel.
        if (tweets?.features) {
            const counts = tweets.features.reduce((acc, f) => {
                const label = f.properties.label;
                if (label) acc[label] = (acc[label] || 0) + 1;
                return acc;
            }, {});
            labelCountsRef.current = { ...labelCountsRef.current, ...counts };
        }
    }, [tweets]);

    // Réinitialise la pagination quand on change de filtre, de tri, ou que
    // de nouvelles données arrivent (sinon on garde un compte obsolète).
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    // `tweets?.features?.length` (et non `tweets`) : un recalcul qui redonne la même liste
    // (liste précoce -> liste de la carte, fusion des anciens tweets) ne fait pas
    // remonter la pagination.
    }, [activeLabel, sortConfig.key, sortConfig.direction, tweets?.features?.length]);

    const SORT_OPTIONS = [
        { key: 'date', direction: 'desc', label: t.sortRecent },
        { key: 'importance_score', direction: 'desc', label: t.sortRelevant },
    ];

    // Ordre des chips : volume décroissant (compte persistant, stable même filtré)
    const sortedLabels = [...allUniqueLabels].sort(
        (a, b) => (labelCountsRef.current[b] || 0) - (labelCountsRef.current[a] || 0)
    );

    const activeSortOption = SORT_OPTIONS.find(
        o => o.key === sortConfig.key && o.direction === sortConfig.direction
    ) || SORT_OPTIONS[0];

    const filteredTweets = activeLabel
        ? tweetFeatures.filter(f => f.properties.label === activeLabel)
        : tweetFeatures;

    const sortedTweets = [...filteredTweets].sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'date') {
            valA = new Date(a.properties.created_at || a.properties.date || 0).getTime();
            valB = new Date(b.properties.created_at || b.properties.date || 0).getTime();
        } else {
            valA = a.properties.importance_score || 0;
            valB = b.properties.importance_score || 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;

    });
    const currentCount = sortedTweets.length;
    const visibleTweets = sortedTweets.slice(0, visibleCount);
    const hasMore = visibleCount < sortedTweets.length;

    // Observe la sentinelle en bas de liste : quand elle devient visible,
    // on affiche PAGE_SIZE tweets de plus.
    useEffect(() => {
        const node = sentinelRef.current;
        if (!node || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(c => c + PAGE_SIZE);
                }
            },
            { root: node.closest('.sidepanel-content'), rootMargin: '200px' }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, sortedTweets.length]);
    return (
        <div
            ref={panelRef}
            className={`sidepanel${collapsed ? " sidepanel--collapsed" : ""}`}
            style={width ? { "--sp-width": `${width}px` } : undefined}
        >
            <div className="sidepanel-content">
                <div className="sidepanel-header">
                    {/* Barre du haut : titre + compteur à gauche, bouton replier à droite */}
                    <div className="sp-topbar">
                        <div className="sp-heading">
                            {/* Nom du site : seul <h1> de l'app (SEO / accessibilité) */}
                            <h1 className="sp-title">OSINT Watch</h1>
                            <div className="sp-title-group">
                                <h2 className="sp-feed">{t.feedTitle}</h2>
                                {!isLoading && rangeCovered && <span className="sp-count">{t.eventsCount(currentCount)}</span>}
                            </div>
                        </div>
                        <div className="sp-topbar-actions">
                            {/* Langue du site : l'icône ouvre un menu avec toutes les langues */}
                            <button
                                ref={langBtnRef}
                                type="button"
                                className="sp-lang-btn"
                                onClick={toggleLangMenu}
                                aria-haspopup="menu"
                                aria-expanded={langMenuOpen}
                                aria-label={langLabel}
                                title={langLabel}
                            >
                                <IoLanguage size={16} aria-hidden="true" />
                            </button>
                            {langMenu && createPortal(
                                <div
                                    ref={langMenuRef}
                                    className="sp-lang-menu"
                                    role="menu"
                                    aria-label={langLabel}
                                    style={{ top: langMenu.top, right: langMenu.right }}
                                    onKeyDown={onLangMenuKeyDown}
                                >
                                    {availableLangs.map((code) => (
                                        <button
                                            key={code}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={code === lang}
                                            lang={code}
                                            className="sp-lang-item"
                                            onClick={() => {
                                                setLang(code);
                                                setLangMenu(null);
                                                langBtnRef.current?.focus();
                                            }}
                                        >
                                            <span>{LANG_NAMES[code] ?? code}</span>
                                            {code === lang && <IoCheckmark size={16} aria-hidden="true" />}
                                        </button>
                                    ))}
                                </div>,
                                document.body
                            )}
                            <button
                                className="sidepanel-toggle"
                                onClick={onToggle}
                                aria-label={t.collapsePanel ?? "Collapse panel"}
                                aria-expanded={!collapsed}
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                    <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                    <path d="M9 8 L3 8 M6 5 L3 8 L6 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Filtre par sujet : une barre qui déplie tous les sujets d'un coup */}
                    <div
                        className="sp-topic"
                        onKeyDown={(e) => { if (e.key === 'Escape') setTopicsOpen(false); }}
                    >
                        <div className="sp-filters">
                            {/* Période : menu déroulant */}
                            <div className="sp-dd" ref={periodRef}>
                                <button
                                    type="button"
                                    className={`sp-pill${periodOpen ? " sp-pill--open" : ""}`}
                                    onClick={() => setPeriodOpen((o) => !o)}
                                    aria-haspopup="menu"
                                    aria-expanded={periodOpen}
                                    aria-label={periodLabels.group}
                                >
                                    <span className="sp-pill-text">{periodLabels[selectedPeriod] ?? selectedPeriod}</span>
                                    <svg className="sp-pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                {periodOpen && (
                                    <div className="sp-dd-menu" role="menu" aria-label={periodLabels.group} onKeyDown={onPeriodMenuKeyDown}>
                                        {PERIOD_PRESETS.map((key) => (
                                            <button
                                                key={key}
                                                type="button"
                                                role="menuitemradio"
                                                aria-checked={selectedPeriod === key}
                                                className="sp-dd-item"
                                                onClick={() => { changePeriod(key); setPeriodOpen(false); }}
                                            >
                                                <span>{periodLabels[key]}</span>
                                                {selectedPeriod === key && <IoCheckmark size={16} aria-hidden="true" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                        <div className={`sp-topic-bar${activeLabel ? ' sp-topic-bar--active' : ''}${topicsOpen ? ' sp-topic-bar--open' : ''}`}>
                            <button
                                className="sp-topic-trigger"
                                onClick={() => setTopicsOpen(o => !o)}
                                disabled={isLoading}
                                aria-expanded={topicsOpen}
                                aria-controls="sp-topic-panel"
                            >

                                <span className="sp-topic-text">
                                    {activeLabel ? translateTheaterLabel(activeLabel, lang) : t.allTopics}
                                </span>
                                <svg className="sp-topic-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </button>
                        </div>
                        </div>

                        {topicsOpen && !isLoading && (
                            <div className="sp-topic-panel" id="sp-topic-panel">
                                <button
                                    className="sp-chip"
                                    aria-pressed={!activeLabel}
                                    onClick={() => onLabelChange(null)}
                                >
                                    {t.allTopics}
                                </button>
                                {sortedLabels.map(label => (
                                    <button
                                        key={label}
                                        className="sp-chip"
                                        aria-pressed={activeLabel === label}
                                        onClick={() => onLabelChange(activeLabel === label ? null : label)}
                                    >
                                        {translateTheaterLabel(label, lang)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Tri : onglets façon X (soulignement sur l'onglet actif) */}
                    <div className="sp-tabs" role="tablist" aria-label={t.feedTitle}>
                        {SORT_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                role="tab"
                                aria-selected={activeSortOption.key === opt.key}
                                className="sp-tab"
                                disabled={isLoading}
                                onClick={() => setSortConfig({ key: opt.key, direction: opt.direction })}
                            >
                                <span className="sp-tab-label">{opt.label}</span>
                            </button>
                        ))}
                    </div>

                </div>

                {isLoading ? (
                    <SkeletonLoader />
                ) : sortedTweets.length > 0 ? (
                    <div className="osint-tweet-list">
                        {visibleTweets.map((feature, i) => (
                            <TweetArticle
                                key={feature.properties.id ?? i}
                                feature={feature}
                                lang={lang}
                                priority={i === 0}
                                className={`osint-tweet-card-wrapper${selectedTweetId != null && String(feature.properties.id) === String(selectedTweetId) ? ' osint-tweet-card-wrapper--selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                    if (e.target.closest('.tweet-card-link, .tweet-card-videos, .tweet-card-video, .tweet-card-carousel-btn')) return;
                                    const wasSelected = selectedTweetId != null
                                        && String(feature.properties.id) === String(selectedTweetId);
                                    onTweetClick?.(feature);
                                    // Sur mobile le SidePanel occupe tout l'écran (cf. media
                                    // query 768px) : on le referme après le clic pour laisser
                                    // voir la carte + la popup qui vient de s'ouvrir dessus.
                                    // Pas à la désélection : il n'y a rien à montrer sur la carte.
                                    if (!wasSelected && window.matchMedia('(max-width: 768px)').matches) {
                                        onToggle?.();
                                    }
                                }}
                            />
                        ))}
                        {hasMore && (
                            <div ref={sentinelRef} className="osint-tweet-list-sentinel" style={{ height: 1 }} />
                        )}
                    </div>
                ) : (
                    <div className="no-data"></div>
                )}
            </div>
            <div className="sidepanel-footer">
                <span className="sp-footer-stream">
                    {t.twitterStream}
                </span>
                {lastUpdate && (
                    <span className="sp-footer-update">
                        {t.lastUpdate} <time dateTime={bootstrapData.last_update}>{lastUpdate}</time>
                    </span>
                )}
            </div>

            {!collapsed && (
                <div
                    className="sidepanel-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={startResize}
                    onDoubleClick={resetWidth}
                />
            )}
        </div>
    );
}