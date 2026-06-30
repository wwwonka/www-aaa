# Dev Tooling

Tous les outils de debug sont dans `src/_dev/`. Rien de ce dossier n'atterrit dans le bundle prod — les imports sont dynamiques et gardés par `if (import.meta.env.DEV)`.

---

## Structure

```
src/_dev/
  inspectors/
    monolith.ts          — Mode monolith : Babylon + PixiJS sur le main thread + Babylon Inspector
    workerExtensions.ts  — Étend l'API Comlink du render worker avec les commandes debug
  overlay/
    DebugOverlay.ts      — Overlay PixiJS : FPS, frame time
  tools/
    queryState.ts        — Navigation par query string (?state=)
  scenarios/             — Mocks réseau et d'état (à venir)
  logger.ts              — createLogger / createGroupLogger avec styles console
  setup.ts               — Point d'entrée DEV : logs, raccourcis clavier, query strings
```

---

## Modes de lancement

### Mode normal (worker)
```
http://localhost:5173/
```
Babylon + PixiJS dans le render worker (OffscreenCanvas). Raccourcis clavier actifs.

### Mode monolith
```
http://localhost:5173/?monolith
```
Tout tourne sur le main thread. Donne accès au DOM → **Babylon Inspector s'ouvre automatiquement**.
Même `RenderManager`, zéro divergence de logique. Utilisé pour inspecter la scène, débugger les matériaux, sélectionner des meshes.

---

## Raccourcis clavier (dev uniquement)

| Raccourci | Effet |
|---|---|
| `Ctrl+D` | Toggle overlay FPS / frame time |
| `Ctrl+W` | Toggle wireframe |
| `Ctrl+B` | Toggle bounding boxes |
| `Ctrl+S` | Dump stats scène dans la console |
| `Space`  | Force l'état IN_GAME (simule controller connecté) |
| `Enter`  | Toggle pause / resume |

---

## Navigation par query string

Saute directement à un état sans passer par les menus. Utile pour itérer sur un écran précis.

| Query string | Effet |
|---|---|
| `?state=IN_GAME` | Démarre directement en jeu |
| `?state=PAUSED`  | Démarre en pause (pour débugger l'écran de pause) |
| `?monolith`      | Mode monolith + Babylon Inspector |

Les paramètres se combinent : `?monolith&state=IN_GAME` lance le monolith directement en jeu.

---

## Règles d'architecture

1. **`if (import.meta.env.DEV)` toujours en fin de fichier**, jamais au milieu de la logique métier.
2. Ces blocs **n'importent que depuis `src/_dev/`** — jamais de code app conditionnel inline.
3. Les fichiers `src/_dev/` **n'importent jamais** `@babylonjs/inspector` ou tout autre devDependency de manière statique — uniquement via `await import(...)` dynamique.

---

## Roadmap

### `scenarios/` — Mocks réseau (quand WebRTC arrive)
- `offline-mock.ts` — Simule `navigator.onLine = false`
- `turn-relay-mock.ts` — Force le passage par un serveur TURN
- `input-emulator.ts` — Simule des inputs WebRTC sans téléphone

### `overlay/` — Graphes défilants (quand la simulation boids existe)
- Graphique scrollant de vélocité / énergie par boid (inspiré de Mick West)
- Visualisation des vecteurs de force dans l'espace 3D via Babylon debug drawing

### `tools/sab-viewer.ts` — Quand le SharedArrayBuffer est peuplé
- Lecture et affichage brut des sections MATRICES / STATES / AUDIO du SAB

### HMR + SAB "zero reload"
L'architecture est déjà prête : l'état des boids réside dans le SharedArrayBuffer, qui survit au remplacement de code par Vite HMR. Le nouveau worker se reconnecte au SAB existant sans réinitialiser la simulation — et sans perdre l'appairage WebRTC.
