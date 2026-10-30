import { useEffect } from "react";
import { useTime } from "../../context/TimeContext";
import { readUrlState } from "../../utils/urlState";

// À rendre À L'INTÉRIEUR de <TimeProvider> (il écrit la période).
// Au montage : applique la période de l'URL (si présente), EventsChart saute
// alors sa sélection automatique.
// L'URL n'est plus réécrite en continu (ça remplissait l'historique du
// navigateur) : le permalink est construit à la demande par le bouton
// "Copier le lien" de la toolbar de MapView.
export default function UrlStateSync() {
  const { setRange } = useTime();

  useEffect(() => {
    const s = readUrlState();
    if (s.from && s.to) setRange(s.from, s.to);

    // Paramètres lus et appliqués : on nettoie la barre d'adresse pour ne garder
    // que https://osintwatch.app/. (replaceState => pas de nouvelle entrée dans
    // l'historique.) Le permalink reste généré à la demande par "Copier le lien".
    if (window.location.search) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.hash
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}