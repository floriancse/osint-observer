// Données du théâtre embarquées dans le HTML par scripts/inject-seo.js :
//   <script type="application/json" id="theater-data">{ topics, topic_summaries }</script>
// Même format que /bootstrap (limité à ce que lit buildTheaters), ce qui permet à
// TheaterPage de s'afficher sans télécharger tout /bootstrap.
// Renvoie null s'il n'y a rien (page non générée par inject-seo, JSON invalide...) :
// l'appelant retombe alors sur le fetch habituel.

let cached; // undefined = pas encore lu

export function readTheaterSeed() {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof document === "undefined") return cached;
  try {
    const el = document.getElementById("theater-data");
    const parsed = el ? JSON.parse(el.textContent) : null;
    if (parsed && Array.isArray(parsed.topics) && parsed.topic_summaries) cached = parsed;
  } catch (e) {
    console.warn("[theater-data] JSON embarqué illisible, fetch /bootstrap en repli", e);
  }
  return cached;
}