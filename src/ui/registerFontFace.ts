/**
 * Enregistre une FontFace dans le FontFaceSet du contexte courant : `self.fonts` en worker,
 * `document.fonts` sur le main thread (mode monolith dev).
 */
export function registerFontFace(face: FontFace): void {
  const scope = self as unknown as { fonts?: FontFaceSet; document?: { fonts: FontFaceSet } };
  (scope.fonts ?? scope.document?.fonts)?.add(face);
}
