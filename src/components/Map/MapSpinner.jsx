import { useState } from "react";

// Spinner de la carte : un écran radar. Cercles concentriques + réticule, faisceau bleu
// qui tourne, et des échos rouges qui s'allument au moment précis où le faisceau passe
// dessus (délai = angle / 360 * période). Animations transform / opacity uniquement.
// Styles dans MapControls.css (chargé avec MapApp, donc dispo immédiatement).
// Mettre à true pour réafficher le spinner radar pendant le chargement de la carte.
// À false : simple fond sombre de l'app, puis fondu quand la carte est prête.
export const SHOW_MAP_SPINNER = false;

const PERIOD_MS = 2400; // doit correspondre à --ox-sp-period dans MapControls.css

// Échos : angle (° depuis le haut, sens horaire) et distance au centre (% de la taille).
const BLIPS = [
    { angle: 50, r: 28 },
    { angle: 170, r: 16 },
    { angle: 250, r: 34 },
    { angle: 320, r: 22 },
].map(({ angle, r }) => {
    const rad = (angle * Math.PI) / 180;
    return {
        left: `${(50 + r * Math.sin(rad)).toFixed(1)}%`,
        top: `${(50 - r * Math.cos(rad)).toFixed(1)}%`,
        delay: `${((angle / 360) * (PERIOD_MS / 1000)).toFixed(3)}s`,
    };
});

export default function MapSpinner() {
    // Phase calquée sur l'horloge : quand le spinner du Suspense (MapApp) est remplacé par
    // celui de MapView, l'animation continue sans saut.
    const [phase] = useState(() => `${-((performance.now() % PERIOD_MS) / 1000).toFixed(3)}s`);

    return (
        <div className="ox-spinner" role="status" aria-label="Loading" style={{ "--ox-sp-t": phase }}>
            <span className="ox-spinner-ring" style={{ inset: "17%" }} />
            <span className="ox-spinner-ring" style={{ inset: "33.5%" }} />
            <div className="ox-spinner-sweep" />
            {BLIPS.map((b, i) => (
                <span key={i} className="ox-spinner-blip" style={{ left: b.left, top: b.top, "--d": b.delay }} />
            ))}
            <span className="ox-spinner-core" />
        </div>
    );
}