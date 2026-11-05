import { lazy, Suspense } from "react";
import { LangProvider } from "./context/LangContext";
import BootScreen from "./components/BootScreen/BootScreen";
import AppSkeleton from "./components/AppSkeleton/AppSkeleton";
import { BootstrapProvider } from "./context/BootstrapContext";
import { isTheaterPagePath } from "./utils/theaters";
import { readTheaterSeed } from "./utils/theaterSeed";

// Deux "apps" séparées, chargées à la demande : la page théâtre n'embarque ni
// MapLibre, ni SidePanel, ni EventsChart, ni les providers Time / Layer.
const MapApp = lazy(() => import("./MapApp"));
const TheaterPage = lazy(() => import("./components/TheaterPage/TheaterPage"));

// false = pas de spinner pendant le téléchargement du chunk carte : on affiche seulement
// la structure de la page (AppSkeleton : panneau à gauche, carte à droite).
// true = écran de chargement d'origine.
const SHOW_BOOT_SCREEN = false;

export default function App() {
  // Le chemin est lu une fois : /content/<slug>/ s'ouvre dans un nouvel onglet
  // (rechargement complet), on n'a donc pas besoin de routeur côté client.
  if (isTheaterPagePath()) {
    return (
      <LangProvider>
        {/* Données du théâtre embarquées au build : pas de fetch /bootstrap (repli sur le fetch si absentes) */}
        <BootstrapProvider initialData={readTheaterSeed()}>
          <Suspense fallback={null}>
            <TheaterPage />
          </Suspense>
        </BootstrapProvider>
      </LangProvider>
    );
  }

  return (
    <LangProvider>
      <Suspense fallback={SHOW_BOOT_SCREEN ? <BootScreen /> : <AppSkeleton />}>
        <MapApp />
      </Suspense>
    </LangProvider>
  );
}