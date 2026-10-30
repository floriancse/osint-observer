// Hauteur de la barre « Chronologie » (EventsChart repliée ou ouverte, en-tête seul).
// Partagée entre EventsChart (qui l'impose à son bouton d'en-tête) et MapApp (qui réserve
// cette place avant que le graphique soit monté) : la carte ne bouge plus à son arrivée,
// même si le texte, les dates ou la police web se chargent après coup.
// Module minuscule, volontairement séparé : MapApp l'importe sans tirer le chunk du graphique.
export const CHART_BAR_HEIGHT = 52;