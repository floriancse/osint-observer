// Dictionnaires de noms traduits, accessibles hors React (popupUtils.js).
// Alimentés par LangContext (setEntityNames* / setActorNames*) dès que
// MapView a chargé le /bootstrap. Comme typeLabels.js, ce module n'a aucune
// dépendance React ; la différence est qu'il est rempli au runtime.
const dicts = { entity: {}, actor: {} };

export function setNameDictionary(kind, lang, dict) {
  dicts[kind][lang] = dict || {};
}

function lookup(name, lang, order) {
  for (const kind of order) {
    const hit = dicts[kind][lang]?.[name];
    if (hit) return hit;
  }
  return name;
}

// L'agresseur peut être un acteur non étatique ou un pays / une entité.
// Pas de dictionnaire (anglais) ou nom inconnu : valeur brute.
export function translateAggressor(name, lang) {
  return lookup(name, lang, ["actor", "entity"]);
}

// La cible est plutôt un pays / une entité, mais peut aussi être un acteur.
export function translateTarget(name, lang) {
  return lookup(name, lang, ["entity", "actor"]);
}