import { create as createQrModel } from 'qrcode';

/** Marge blanche autour des modules — la spec QR exige >= 4 modules de quiet zone. */
const QUIET_ZONE_MODULES = 4;
const CARD_RADIUS_RATIO = 0.06;

/**
 * Carte QR code DOM : matrice calculée par `qrcode` (aucun canvas), modules rendus en un seul
 * `<path>` SVG sur fond blanc arrondi — net à toute taille/DPR, dimensionné par le CSS du parent.
 * Équivalent DOM de l'ancien composant Pixi `ui/components/QR`.
 */
export function createQrCard(text: string): HTMLElement {
  // Niveau 'M' (~15% de redondance) — suffisant pour un écran, garde la matrice petite donc
  // des modules plus gros, plus faciles à scanner qu'un niveau 'H' surdimensionné.
  const { modules } = createQrModel(text, { errorCorrectionLevel: 'M' });
  const size = modules.size + QUIET_ZONE_MODULES * 2;

  let d = '';
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      d += `M${QUIET_ZONE_MODULES + col} ${QUIET_ZONE_MODULES + row}h1v1h-1z`;
    }
  }

  const el = document.createElement('div');
  el.className = 'shell-qr';
  el.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" rx="${(size * CARD_RADIUS_RATIO).toFixed(2)}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#000000"/></svg>`;
  return el;
}
