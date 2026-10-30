import { useLang } from "../../context/LangContext";

// Écran de chargement UNIQUE, utilisé à la fois comme fallback Suspense (App.jsx)
// et comme overlay de MapApp : même composant => aucune coupure visuelle entre
// le téléchargement du chunk carte et le chargement des données.
// Animation CSS (transform) : continue même si le thread principal est saturé.
// `visible=false` joue le fondu de sortie (0.4s) ; MapApp démonte ensuite l'overlay.
export default function BootScreen({ visible = true }) {
  const { t } = useLang();
  return (
    <div
      role="status"
      aria-busy={visible}
      className="ox-boot-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--ox-bg, #0d1320)",
        color: "#e1e1e1",
        // IDENTIQUE à .ox-boot dans public/index.html (écran statique affiché avant React) :
        // même police système, même taille, même interligne. Sans ça, BootScreen héritait
        // de la police du <body> (@fontsource) et le texte changeait de taille au moment
        // où React prenait le relais. À modifier des deux côtés en même temps.
        font: '14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        letterSpacing: "0.3px",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.4s ease",
      }}
    >
      <style>{`
        @keyframes ox-boot-spin { to { transform: rotate(360deg); } }
        /* Typographie FORCÉE (identique à .ox-boot dans public/index.html) : aucune règle
           globale de l'app ne doit pouvoir changer la police / taille de ce texte. */
        .ox-boot-screen, .ox-boot-screen * {
          font: 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif !important;
          letter-spacing: 0.3px !important;
        }
        @media (prefers-reduced-motion: reduce) { .ox-boot-spinner { animation-duration: 3s !important; } }
      `}</style>
      <div
        className="ox-boot-spinner"
        aria-hidden="true"
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "3px solid rgba(225,225,225,0.2)",
          borderTopColor: "#e1e1e1",
          animation: "ox-boot-spin 0.9s linear infinite",
        }}
      />
      <span>{t.loading}…</span>
    </div>
  );
}