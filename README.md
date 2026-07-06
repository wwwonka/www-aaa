# Game Architecture

Architecture de jeu hybride **Babylon.js + PixiJS** sur un seul canvas WebGL partagé.

---

## Stack de rendu

Babylon rend la scène 3D dans le framebuffer principal. PixiJS rend par-dessus avec `clearBeforeRender: false`. Un seul contexte GL, zéro copie de texture en mode normal.

```
Babylon 3D              ← framebuffer principal
layer1 — gameUI         ← HUD in-game (PixiJS Container)
layer2 — frozenGame     ← capture blur pendant transitions (inactif en gameplay)
layer3 — overlay        ← PauseScreen, PairingPanel, écrans système
layer4 — notifications  ← toasts, toujours sharp, jamais filtré
```

---

## Architecture de l'application

### AppStateMachine (`src/core/AppStateMachine.ts`)

XState v5. Tourne sur le **main thread**. États :

```
TITLE_SCREEN  ──PLAY (guard: hasController)──►  IN_GAME
IN_GAME       ──PAUSE──►  PAUSED
IN_GAME       ──TRANSFER (guard: hasController)──►  PLAYING_ON_PHONE
PAUSED        ──RESUME──►  IN_GAME
PAUSED        ──QUIT──►  TITLE_SCREEN
PLAYING_ON_PHONE  ──TRANSFER_BACK──►  IN_GAME
```

`CONTROLLER_CONNECTED` / `CONTROLLER_DISCONNECTED` fonctionnent depuis n'importe quel état.

### Render Worker (`src/render/`)

PixiJS et Babylon tournent dans un **render worker** (OffscreenCanvas). Le main thread communique via Comlink.

- `RenderManager` — orchestre Babylon + PixiJS + effets
- `uiRenderer.ts` — deux modes : `renderNormal()` (une passe) et `renderSplit()` (4 passes, pendant transitions)
- `PauseBlurEffect` — easing, animation, gestion du mode

### Effet Pause (`src/render/effects/PauseBlurEffect.ts`)

4 modes internes :

| Mode       | Babylon | Capture                               | Blur                  |
| ---------- | ------- | ------------------------------------- | --------------------- |
| `normal`   | tourne  | —                                     | off                   |
| `pausing`  | tourne  | readPixels once → sprite figé         | monte ease-out 350ms  |
| `frozen`   | stoppé  | figé                                  | stable                |
| `resuming` | tourne  | readPixels chaque frame → sprite live | descend ease-in 350ms |

La capture utilise `gl.readPixels` → flip Y → `OffscreenCanvas` → `ImageBitmap` → `Texture.from()`. KawaseBlurFilter (pixi-filters, quality 4).

---

## Structure des fichiers

```
src/
  app/
    AppHost.ts              ← point d'entrée, démarre ASM + render worker
    platform/
      ContextManager.ts     ← détection platform/role (receiver vs controller)
  core/
    AppStateMachine.ts      ← XState v5, states + guards + transitions
  render/
    RenderManager.ts        ← orchestration Babylon + PixiJS
    renderLoop.ts           ← rAF loop avec delta time
    layers/
      uiRenderer.ts         ← init WebGLRenderer PixiJS, assemble les layers
      layer1_gameUI.ts      ← HUD container
      layer2_frozenGame.ts  ← sprite capture + KawaseBlur
      layer3_overlay.ts     ← écrans système
      layer4_notifications.ts
    effects/
      PauseBlurEffect.ts    ← animation blur pause/resume
    scene/                  ← setup Babylon (scène, caméra, lumières)
  ui/
    screens/
      pause/
        PauseScreen.ts      ← orchestre overlay + panel
        PauseMenuPanel.ts   ← boutons Resume / Quit
    components/
      Button.ts             ← composant PixiJS réutilisable
```

---

## Raccourcis dev

| Touche  | Action                                       |
| ------- | -------------------------------------------- |
| `Space` | Force `IN_GAME` (simule contrôleur connecté) |
| `Enter` | Toggle `PAUSE` / `RESUME`                    |

---

## Contraintes importantes

- **Un seul canvas, jamais deux** — un seul contexte WebGL géré par Babylon, PixiJS reçoit ce même contexte GL
- **RenderTexture non utilisée** en mode normal — pas de copie de texture pendant le gameplay
- `preserveDrawingBuffer: true` sur Babylon — le framebuffer persiste entre frames, nécessaire pour la capture pause
- Les workers PixiJS nécessitent `DOMAdapter.set(WebWorkerAdapter)` avant toute création PixiJS
- `gl.bindVertexArray(null)` après chaque render PixiJS — empêche Babylon de corrompre ses vertex attrib
