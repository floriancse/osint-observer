// Structure de page affichée pendant le téléchargement du chunk MapApp (fallback Suspense
// d'App.jsx) : panneau à gauche, zone carte à droite. Aucune dépendance (ni contexte, ni
// CSS de l'app, qui n'est pas encore chargé) : styles inline + une petite balise <style>.
// Sur mobile (<= 768px) le SidePanel occupe tout l'écran, le squelette aussi.
//
// À ajuster pour coller au vrai SidePanel (sinon léger décalage au remplacement) :
const SIDEPANEL_WIDTH = 360;               // largeur du SidePanel sur desktop, en px (mesurée sur capture : ~717px à 2x, bordure incluse)
const PANEL_BG = "#0f1726";                // fond du SidePanel
const PANEL_BORDER = "rgba(255,255,255,0.08)";

export default function AppSkeleton() {
  return (
    <div
      className="ox-skeleton"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        background: "var(--ox-bg, #0d1320)",
      }}
    >
      <style>{`
        .ox-skeleton-panel { width: ${SIDEPANEL_WIDTH}px; }
        @media (max-width: 768px) { .ox-skeleton-panel { width: 100%; border-right: 0 !important; } .ox-skeleton-map { display: none; } }
      `}</style>
      <div
        className="ox-skeleton-panel"
        style={{
          flexShrink: 0,
          background: PANEL_BG,
          borderRight: `1px solid ${PANEL_BORDER}`,
        }}
      />
      <div className="ox-skeleton-map" style={{ flex: 1, minWidth: 0 }} />
    </div>
  );
}