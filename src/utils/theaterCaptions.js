// Traduction de la légende d'image des théâtres (TOPICS.CREDIT, stocké en anglais en base).
//
// Format en base : « English legend. Photo: Author / Source »  (liens <a href> possibles)
//   -> la partie « Photo: ... » (auteur / source) n'est jamais traduite, seul le mot « Photo » l'est ;
//   -> la légende est traduite via LEGENDS, clé = texte anglais EXACT de la base (sans le point final).
// Si la légende n'est pas dans LEGENDS (nouvelle image, texte modifié en base), on affiche
// l'anglais tel quel : une traduction périmée ne peut donc jamais s'afficher.
// Pour une nouvelle image : ajouter ici une entrée { fr, es } avec le même texte anglais que la base.

const PHOTO = { en: "Photo:", fr: "Photo :", es: "Foto:" };

const LEGENDS = {
  "Three-finger salute, Myitkyina, Myanmar": {
    fr: "Salut à trois doigts, Myitkyina, Birmanie",
    es: "Saludo de tres dedos, Myitkyina, Myanmar",
  },
  "Rusted tank on the side of a road": {
    fr: "Char rouillé au bord d'une route",
    es: "Tanque oxidado al borde de una carretera",
  },
  "Taliban insurgents surrender to Afghan National Security Forces": {
    fr: "Des insurgés talibans se rendent aux forces de sécurité afghanes",
    es: "Insurgentes talibanes se entregan a las Fuerzas Nacionales de Seguridad de Afganistán",
  },
  "Destroyed buildings and debris in Homs, Syria": {
    fr: "Bâtiments détruits et débris à Homs, en Syrie",
    es: "Edificios destruidos y escombros en Homs, Siria",
  },
  "Oil tankers at sea, on the horizon": {
    fr: "Pétroliers en mer, à l'horizon",
    es: "Petroleros en el mar, en el horizonte",
  },
  "Men holding assault rifles, Rumbek, South Sudan": {
    fr: "Hommes armés de fusils d'assaut, Rumbek, Soudan du Sud",
    es: "Hombres armados con fusiles de asalto, Rumbek, Sudán del Sur",
  },
  "White mosque with a green dome in a dusty landscape, Senegal": {
    fr: "Mosquée blanche à dôme vert dans un paysage poussiéreux, Sénégal",
    es: "Mezquita blanca con cúpula verde en un paisaje polvoriento, Senegal",
  },
  "Ethiopian AMISOM soldiers during a live-fire drill in Beletweyne, Somalia, July 2021": {
    fr: "Des soldats éthiopiens de l'AMISOM lors d'un exercice de tir réel à Beletweyne, en Somalie, en juillet 2021",
    es: "Soldados etíopes de la AMISOM durante un ejercicio de fuego real en Beletweyne, Somalia, en julio de 2021",
  },
  "Havana, Cuba": {
    fr: "La Havane, Cuba",
    es: "La Habana, Cuba",
  },
  "Gaza, Palestine. A huge explosion in a building as a result of a bombing by Israeli warplanes": {
    fr: "Gaza, Palestine. Une énorme explosion dans un bâtiment à la suite d'un bombardement par des avions de combat israéliens",
    es: "Gaza, Palestina. Una enorme explosión en un edificio a causa de un bombardeo de cazas israelíes",
  },
  "Aerial bombardment of Sana'a, Yemen": {
    fr: "Bombardement aérien de Sanaa, Yémen",
    es: "Bombardeo aéreo de Saná, Yemen",
  },
  "A dusty road in a Nigerian city": {
    fr: "Route poussiéreuse dans une ville nigériane",
    es: "Carretera polvorienta en una ciudad nigeriana",
  },
};

// Index de toutes les variantes (en base : anglais ; mais on accepte aussi une ancienne
// légende française / espagnole encore présente en base) -> { en, fr, es }.
const INDEX = {};
Object.entries(LEGENDS).forEach(([en, tr]) => {
  const entry = { en, ...tr };
  [en, tr.fr, tr.es].forEach((v) => { INDEX[v] = entry; });
});

// « Legend. Photo: Author / Source » -> même chaîne dans la langue demandée.
// Accepte aussi « Photo : » (français) et « Foto: » (espagnol) comme séparateur.
export function localizeCredit(credit, lang) {
  if (!credit) return "";
  const m = credit.match(/^([\s\S]*?)\.?\s*(?:Photo|Foto)\s?:\s*([\s\S]*)$/);
  if (!m) return credit; // format inattendu : affiché tel quel
  const legend = m[1].trim();
  const rest = m[2].trim();
  const photo = PHOTO[lang] || PHOTO.en;
  if (!legend) return `${photo} ${rest}`;
  const text = INDEX[legend]?.[lang] || legend;
  return `${text}. ${photo} ${rest}`;
}