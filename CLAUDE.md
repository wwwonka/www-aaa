# Game Architecture — Notes pour Claude

## Contraintes d'architecture

### Rendu : UN SEUL CANVAS, JAMAIS DEUX
Ne jamais proposer ni implémenter une approche avec deux canvas DOM ou deux OffscreenCanvas séparés.
L'utilisateur veut un seul canvas visible, un seul contexte WebGL géré par PixiJS.

### Architecture cible : Babylon → texture → PixiJS
PixiJS est le compositeur maître. Babylon rend sa scène 3D dans une RenderTexture (framebuffer),
puis PixiJS l'affiche comme un Sprite dans son propre conteneur.

Structure des couches (bas → haut) :
- `GameContainer`  — Sprite affichant la RenderTexture Babylon (scène 3D)
- `GameUI`         — UI 2D in-game (HUD, barres de vie, etc.)
- `ShellUI`        — UI système (menus, overlays, pause screen)

PixiJS possède le canvas et le contexte WebGL. Babylon reçoit le contexte de PixiJS (pas l'inverse).
