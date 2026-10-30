// Crédit de l'image d'illustration de chaque théâtre (affiché sous l'image, page /content/<slug>/).
// Clé : theater.LABEL (la valeur brute de la DB, la même que celle passée à imageUrl()).
// Un théâtre absent de la liste n'affiche aucune légende.
//
//   credit : nom de l'auteur / de l'agence / du site, tel qu'il doit apparaître
//   url    : page d'origine de l'image (facultatif) ; si présent, le crédit devient un lien
export const IMAGE_CREDITS = {
  // "Ukraine and Russia at war": { credit: "Wikimedia Commons / Auteur", url: "https://commons.wikimedia.org/wiki/File:..." },
};

export const getImageCredit = (label) => IMAGE_CREDITS[label] || null;