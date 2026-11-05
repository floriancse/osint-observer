import { useBootstrap } from "../../context/BootstrapContext";
import { useLang } from "../../context/LangContext";
import { useTime } from "../../context/TimeContext";
import "./NewEventsBanner.css";

// Textes du bouton. À déplacer dans LangContext si vous préférez tout centraliser.
const LABELS = {
  fr: {
    count: (n) => `${n} ${n > 1 ? "nouveaux événements" : "nouvel événement"}`,
    loading: "Actualisation…",
  },
  en: {
    count: (n) => `${n} new event${n > 1 ? "s" : ""}`,
    loading: "Updating…",
  },
  es: {
    count: (n) => `${n} evento${n > 1 ? "s" : ""} nuevo${n > 1 ? "s" : ""}`,
    loading: "Actualizando…",
  },
};
export default function NewEventsBanner({ onApplied }) {
    const { newCount, updating, applyUpdates } = useBootstrap();
    const { lang } = useLang();
    const { refreshRange } = useTime();
    if (!newCount) return null;
    const L = LABELS[lang] || LABELS.en;

    return (
        <div className="sp-new-events" role="status" aria-live="polite">
            <button
                type="button"
                className="sp-new-events-btn"
                disabled={updating}
                onClick={() => applyUpdates().then(() => {
                    refreshRange(); // la fin de période avance jusqu'à maintenant : les nouveaux tweets ne sont plus filtrés
                    onApplied?.();
                })}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                {updating ? L.loading : L.count(newCount)}
            </button>
        </div>
    );
}