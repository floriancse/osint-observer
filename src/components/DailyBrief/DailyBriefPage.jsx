import { useEffect } from "react";
import "../../utils/popupUtils.css"; // tokens --ox-* (non chargés sur les pages /content/)
import { BootstrapProvider } from "../../context/BootstrapContext";
import { useLang } from "../../context/LangContext";
import { getBriefLang } from "../../utils/briefRoute";
import DailyRecap from "../DailyRecap/DailyRecap";

// Page autonome /content/<lang>/brief : topbar + résumé du jour. Ni carte ni SidePanel.
function BriefInner() {
  const { lang, setLang, t } = useLang();
  const urlLang = getBriefLang();

  // La langue de l'URL fait foi
  useEffect(() => {
    if (urlLang && urlLang !== lang) setLang(urlLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLang]);

  useEffect(() => {
    document.title = `${t.recap?.title ?? "Daily brief"} · OSINT Watch`;
  }, [t]);

  return <DailyRecap asPage />;
}

export default function DailyBriefPage() {
  // Sans initialData : télécharge /bootstrap/lite (tweets des dernières 24 h pour les chiffres et la carte).
  return (
    <BootstrapProvider>
      <BriefInner />
    </BootstrapProvider>
  );
}