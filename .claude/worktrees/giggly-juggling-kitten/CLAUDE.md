# Game Architecture — Notes pour Claude

## Contraintes d'architecture

### Rendu : UN SEUL CANVAS, JAMAIS DEUX
Ne jamais proposer ni implémenter une approche avec deux canvas DOM ou deux OffscreenCanvas séparés.
L'utilisateur veut un seul canvas visible, un seul contexte WebGL géré par PixiJS.

### Architecture de rendu : Babylon + PixiJS sur le même framebuffer
Babylon rend la scène 3D en premier dans le framebuffer principal.
PixiJS rend ensuite par-dessus avec `clearBeforeRender: false` — composition naturelle, zéro copie de texture.
Babylon possède le canvas et le contexte WebGL. PixiJS reçoit ce même contexte GL via `createPixiGameUI(gl)`.

Structure des couches (bas → haut) :
- Babylon         — scène 3D (rendu dans le framebuffer principal)
- `gameContainer` — UI 2D in-game (HUD, barres de vie, etc.)
- `shellContainer` — UI système (menus, overlays, pause screen)

La RenderTexture n'est PAS utilisée — inutile tant qu'on ne veut pas manipuler le rendu Babylon comme un objet PixiJS.
