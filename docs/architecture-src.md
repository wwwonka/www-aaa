# Architecture — `src/`

## Vue d'ensemble : threads et flux de données

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MAIN THREAD                                                            │
│                                                                         │
│  main.ts                                                                │
│    └─ new AppHost().start()                                             │
│                                                                         │
│  AppHost  (src/app/AppHost.ts)                                          │
│    ├─ détecte le mode hôte  (browser / pwa-standalone / pwa-fullscreen) │
│    ├─ crée le canvas HTML + transfère en OffscreenCanvas                │
│    ├─ lance render.worker  via Comlink                                  │
│    └─ monte les event handlers DOM  (resize, visibility)                │
│                                                                         │
│  Events  (src/app/events/)                                              │
│    ├─ resizeHandler   — ResizeObserver → postMessage resize au worker   │
│    └─ visibilityHandler — document hidden → postMessage visibility      │
│                                                                         │
│  (DOM events ne peuvent pas atteindre le worker directement)            │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ OffscreenCanvas (transfert unique)
                           │ postMessage { resize, visibility }
                           │ Comlink RPC { init, setFps, dispose }
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RENDER WORKER  (src/render/render.worker.ts)                           │
│                                                                         │
│  Comlink expose { init, setFps, dispose }                               │
│    └─ délègue tout à RenderManager                                      │
│                                                                         │
│  RenderManager  (src/render/RenderManager.ts)                           │
│    ├─ Babylon Engine + Scene  (sceneSetup → camera, lights, objets 3D)  │
│    ├─ récupère le contexte GL de Babylon                                │
│    ├─ crée PixiGameUI avec ce même GL  (même framebuffer, zéro copie)  │
│    ├─ startRenderLoop  → _frame() à chaque tick                         │
│    └─ écoute postMessage { resize, visibility }                         │
│                                                                         │
│  _frame()  (ordre fixe, UN seul framebuffer)                            │
│    1. scene.render()          — Babylon dessine la scène 3D             │
│    2. gameUI.render()         — PixiJS composite par-dessus             │
│    3. engine.wipeCaches(true) — réinitialise l'état GL pour Babylon     │
│                                                                         │
│  renderLoop  (src/render/renderLoop.ts)                                 │
│    └─ requestAnimationFrame avec cap FPS + correction de drift          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  COUCHES DE RENDU  (bas → haut sur le même framebuffer)      │       │
│  │                                                              │       │
│  │  Babylon Scene          — scène 3D (meshes, caméra, lumières)│       │
│  │  PixiJS gameContainer   — HUD in-game, barres de vie, etc.   │       │
│  │  PixiJS shellContainer  — menus, overlays, pause screen       │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                         │
│  PixiGameUI  (src/render/layers/pixiGameUI.ts)                          │
│    ├─ WebGLRenderer PixiJS initialisé sur le GL de Babylon              │
│    ├─ clearBeforeRender: false  → composition naturelle                 │
│    └─ unbind VAO après render  → empêche corruption état Babylon        │
│                                                                         │
│  pixiShellUI.ts  — vide (à implémenter)                                 │
│                                                                         │
│  src/render/scene/                                                      │
│    ├─ sceneSetup.ts   — initialise la scène Babylon                     │
│    ├─ camera.ts       — configuration caméra                            │
│    └─ lights.ts       — éclairage                                       │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ SharedArrayBuffer (à implémenter)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SIMULATION WORKER  (src/simulation/simulation.worker.ts)               │
│                                                                         │
│  Entrée de boucle — Boids AI + Physics + FSM                           │
│    └─ stub : reçoit des messages, ne fait rien encore                   │
│                                                                         │
│  BoidSimulation.ts    — vide (à implémenter)                            │
│  PhysicsEngine.ts     — vide (à implémenter)                            │
│  spatialPartitioning.ts — vide (à implémenter)                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ SharedArrayBuffer  (à implémenter)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AUDIO WORKER  (src/audio/audio.worker.ts)                              │
│                                                                         │
│  Consomme des AudioTrigger depuis le SAB via Atomics                   │
│    └─ stub : reçoit des messages, ne fait rien encore                   │
│                                                                         │
│  AudioAggregator.ts  — vide (à implémenter)                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SHARED  (src/shared/)                                                  │
│                                                                         │
│  config.ts     — constantes runtime : BOID_COUNT, TARGET_FPS,          │
│                  CAMERA_*, BLOOM_*, MASTER_VOLUME, etc.                 │
│  constants.ts  — constantes structurelles (SAB_BOID_STRIDE, etc.)      │
│  types.ts      — interfaces partagées entre workers :                   │
│                  BoidState, AudioTrigger, SimToRenderMessage            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  CORE  (src/core/)  — partiellement implémenté, voir docs/assets-manager.md │
│                                                                         │
│  AppOrchestrator.ts  — classe, FSM xstate du Shell + cycle de vie       │
│                         startUp()/shutDown() (renommé depuis            │
│                         AppStateMachine.ts/appActor)                    │
│  AssetsManager.ts    — warm-up IDB des assets statiques (voir doc dédiée)│
│  assetDb.ts          — wrapper IndexedDB natif, DB AssetsDB             │
│  assetPath.ts        — (namespace,type,filename) → chemin réel          │
│  SystemAllocator.ts  — décide worker vs inline pour les systèmes agiles │
│                         selon hardwareConcurrency (règle N-1)           │
│  SystemHost.worker.ts — host générique, multiplexage lazy get(id)      │
│                         (remplace assetsManager.worker.ts)              │
│  systems/                                                               │
│    SystemLifecycle.ts — interface startUp()/shutDown() commune         │
│    registry.ts        — SystemId → factory (assetsManager aujourd'hui) │
│  gameLoop.ts         — boucle de simulation principale  — 🚧 stub       │
│  sab-manager.ts      — alloue et slice le SharedArrayBuffer global      │
│                         (matrixBytes + stateBytes + audioBytes)         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  INPUT  (src/input/)                                                    │
│                                                                         │
│  CommandBuffer.ts  — buffer circulaire de GameCommand                   │
│                      (MOVE_*, DASH, PAUSE, CONFIRM, CANCEL)             │
│                      TODO: migrer vers SAB pour éviter postMessage      │
│  InputProxy.ts     — vide (à implémenter)                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  UI  (src/ui/)                                                          │
│                                                                         │
│  components/Button.ts  — composant PixiJS de base (à implémenter)      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  HTML / META  (src/app/meta/)  — injectés à build-time par             │
│               vite-html-include-plugin, zéro coût runtime              │
│                                                                         │
│  pwa-meta.html          — manifest, favicons, theme-color, description  │
│  ios-meta.html          — apple-mobile-web-app-*, format-detection,     │
│                           apple-touch-icon                              │
│  ios-splash-screens.html — <link apple-touch-startup-image> par device  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Flux SharedArrayBuffer (prévu, pas encore câblé)

```
sab-manager.ts alloue un seul SAB découpé en 3 zones :

  [ matrixBytes ][ stateBytes ][ audioBytes ]
        │               │            │
        ▼               ▼            ▼
  Simulation      Simulation     Audio worker
  écrit les       écrit l'état   lit les
  positions       FSM boids      AudioTrigger
  /rotations
        │
        ▼
  Render worker lit les matrices → met à jour les transforms Babylon
```

## Ce qui est fonctionnel vs. à implémenter

| Module | Statut |
|--------|--------|
| AppHost + OffscreenCanvas + Comlink | ✅ fonctionnel |
| Event handlers (resize, visibility) | ✅ fonctionnel |
| Render worker (Babylon + PixiJS partagé) | ✅ fonctionnel |
| renderLoop (RAF + cap FPS + drift) | ✅ fonctionnel |
| PixiGameUI (gameContainer + shellContainer) | ✅ fonctionnel |
| shared/config + types + constants | ✅ fonctionnel |
| sab-manager (allocation SAB) | ✅ structure prête |
| CommandBuffer (GameCommand) | ✅ structure prête |
| AppOrchestrator (ex-AppStateMachine) | ✅ fonctionnel |
| AssetsManager + IndexedDB + SW double-cache | ✅ fonctionnel — voir docs/assets-manager.md |
| Simulation worker | 🚧 stub |
| Audio worker | 🚧 stub |
| gameLoop | 🚧 stub |
| InputProxy | 🚧 stub |
| pixiShellUI | 🚧 stub |
| ui/Button | 🚧 stub |
| BoidSimulation / PhysicsEngine / spatialPartitioning | 🚧 stub |
| AudioAggregator | 🚧 stub |
| SAB câblé entre workers | ⏳ à faire |
