# Render Stack

Un seul canvas WebGL 2. Babylon.js possède le canvas et le contexte GL.
PixiJS est initialisé avec ce même contexte (`{ canvas, context: gl }`).

```
┌─────────────────────────────────────┐  (optionnel)
│  DOM / CSS                          │  ← overlays système, accessibilité
├─────────────────────────────────────┤
│  2D shell UI — PixiJS (pixiShell)   │  ← menus, PWA chrome — NON affecté par pixi-filters
├─────────────────────────────────────┤  ↑ pixi-filters s'arrêtent ici
│  pixi-filters post-process          │  ← Bloom, CRT, etc. — s'applique à PixiJS world + Babylon en dessous
├─────────────────────────────────────┤
│  2D world UI — PixiJS (pixiWorld)   │  ← HUD in-world, scores, éléments de jeu 2D
├─────────────────────────────────────┤
│  3D world post-process              │  ← post-process Babylon (propre à la scène 3D)
├─────────────────────────────────────┤
│  3D World — Babylon.js              │  ← scène, boids, environnement
└─────────────────────────────────────┘
         ↑ un seul canvas WebGL 2 — 100% WebGL, zéro DOM pour le jeu
```

## Ordre de rendu par frame

1. `babylon.scene.render()` — post-process Babylon s'applique ici (3D seulement)
2. `engine.wipeCaches(true)` — reset de l'état WebGL avant PixiJS
3. `pixiWorld.render()` — PixiJS filters sur ce stage voient Babylon en dessous (`clearBeforeRender: false`)
4. `pixiShell.render()` — hors scope des PixiJS filters

## Deux systèmes de post-process distincts

- **Babylon post-process** → affecte uniquement la scène 3D, s'exécute pendant `scene.render()`
- **PixiJS filters** (pixi-filters) → appliqués au stage `pixiWorld`, affectent visuellement le HUD + Babylon en dessous car le framebuffer Babylon est déjà présent quand PixiJS rend

## Deux instances PixiJS

- **`pixiWorld`** — dans le scope des pixi-filters (HUD in-world, effets visuels de jeu)
- **`pixiShell`** — hors scope des pixi-filters (menus, overlays PWA, debug UI)

Les deux partagent le même canvas et contexte GL que Babylon.

## Initialisation PixiJS avec le contexte Babylon

```ts
const gl = engine.getRenderingCanvas()!.getContext('webgl2')!
await pixiWorld.init({ canvas: babylonCanvas, context: gl, clearBeforeRender: false })
await pixiShell.init({ canvas: babylonCanvas, context: gl, clearBeforeRender: false })
```

`clearBeforeRender: false` — critique pour ne pas effacer les layers précédents.

## Pourquoi un seul canvas

- Post-process unifié possible (le shader final voit les deux layers)
- Zéro overhead de composition du navigateur entre deux canvases
- Un seul transfert `transferControlToOffscreen()` vers le render worker
