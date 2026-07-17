# Brief — Démo jouable pour Fable

> **État d'avancement (2026-07-06)** : Étapes 0 et 1 terminées et pushées sur
> `feature/title-screen-theatre`.
>
> - **Étape 0** (`22be292`) — ESLint 10 flat config + Prettier + vite-plugin-checker,
>   conventions encodées en règles, `"strict": true` (0 erreur).
> - **Étape 1** (`a911c26`, élargie au-delà du brief) — routing `?controller`/`?receiver`
>   (`queryFlags.ts`, override session-only, jamais persisté ; pas de `?dev`, les outils
>   chargent sous `import.meta.env.DEV` via `initDevMode`) **+ UI de pairing complète** :
>   état `PAIRING_MODE` dans l'orchestrateur (`OPEN_PAIRING`/`CLOSE_PAIRING`, ouvert depuis
>   "CONNECT CONTROLLER" du Title Screen, plus tard depuis le Pause Menu), écrans overlay
>   dans `ScreenManager` (le screen sous-jacent reste visible), `PairingOverlayScreen`
>   (sheet glissante receiver / quasi-plein-écran controller), `PairingPanel` (états
>   searching/paired — le trigger réseau réel arrive à l'étape 2), composant `QR`
>   (matrice `qrcode` → Graphics, encode `origin/?controller`). Un device controller boote
>   directement sur le pairing plein écran.
> - **Corrections transverses au passage** (`a911c26`…`4e48851`) :
>   - `pointerBridge` : les clics Pixi n'avaient jamais fonctionné en mode workers
>     (`pointerup` sur `self` → `pointerupoutside`, jamais de `pointertap`) — corrigé.
>   - Certs dev openssl (`_dev/certs/`) au lieu de vite-plugin-mkcert, dont la CA
>     contenait des octets Unicode invalides que Safari rejette (voir
>     `_dev/certs/README.md` pour régénération + trust macOS/simulateur).
>   - **Écran noir Safari iOS résolu** : cause principale = `@babylonjs/core/pure` exclu
>     du pre-bundling (~1400 modules ES dans le module worker → limite WebKit, worker tué) ;
>     désormais `optimizeDeps.include`, sûr grâce à `RegisterStandardEngineExtensions()`.
>     Aussi : anti-304 workers réparé (validateurs conditionnels supprimés, en-têtes COEP
>     garantis) et en-tête CORP ajouté aux réponses synthétisées par le service worker.
>   - Outillage debug device (dev only) : `remoteConsole`/`workerErrorRelay` relaient les
>     erreurs page+workers vers `/__devlog` → terminal Vite + `_dev/.devlog`.
>
> - **Étape 2** (2026-07-06) — **Pairing WebRTC/Trystero, scénario 1** : signaling réel dans
>   `src/input/signaling/` (`PairingChannel.ts` — factory Trystero MQTT derrière une interface
>   swappable, actions `presence`/`connect`/`paired`/`start`, discovery filtrée par rôle
>   opposé ; `identity.ts` — code de room 5 chars + nom de device lisible). Room = code de
>   session : le QR encode `origin/?r=CODE` et `?r=` seul implique le rôle controller
>   (`queryFlags.ts`) ; receiver joint la room en lazy à `OPEN_PAIRING` (`app/pairingHost.ts`),
>   controller au boot. Flow de confirmation : les controllers découverts apparaissent en chips
>   cliquables à la place du QR → `connect` → `paired` des deux côtés. Post-pairing : toasts
>   (`ToastOverlayScreen`/`ToastPanel`/`ToastCard`, couche notifications hors `ScreenManager`,
>   slide-in du haut), sheet fermée, prompt title "CONNECT CONTROLLER" → "START GAME",
>   `GamepadScreen` (fond noir + START) comme écran de base du controller ; un `PLAY` local est
>   propagé au peer via l'action `start` (interception dans le proxy `sendToAsm` d'`AppHost`)
>   → `IN_GAME` synchronisé des deux côtés. Vérifié en mode workers sur deux onglets Chrome
>   (discovery, pairing, toasts, START croisé, départ de peer → retour searching).
>
> - **Étape 3** (2026-07-06) — **Boids + Havok en local, validée en `?monolith`** :
>   `@babylonjs/havok` via le **binding wasm brut** (`hknp`, choix validé utilisateur — zéro
>   import Babylon dans `src/sim/`, portable worker à l'étape 4). `src/simulation/` renommé
>   `src/sim/`. `PhysicsEngine.ts` (monde, corps, lecture zéro-alloc des transforms via
>   `HP_World_GetBodyBuffer`+`HEAPF32`), `BoidSimulation.ts` (steering sep/align/coh+seek,
>   DOD, forces clampées), `spatialPartitioning.ts` (grille uniforme Int32), `GameSim.ts`
>   (composition, pas fixe 60 Hz + accumulateur, écrit les matrices dans le SAB via
>   `createSAB` — enfin câblé). Rendu : `BoidsRenderer` (thin instances, copie SAB→buffer
>   local car WebGL refuse les vues SAB), `gameScene.ts` (arène, props, marqueur cible),
>   hooks `RenderManager.attachGameBuffers`/`_setGameVisible` (bascule title↔jeu sur
>   `showScreen`). Monolith : sim steppée depuis la boucle de rendu (delta mesuré à la main,
>   `engine.getDeltaTime()` reste à 0 hors `runRenderLoop`), `CONTROLLER_CONNECTED` auto,
>   WASD/flèches (`_dev/inspectors/simControls.ts`), UI complète (setSendToAsm + relais
>   pointer/resize via `window.postMessage`). Corrections transverses : `self.fonts` →
>   helper `ui/registerFontFace.ts` (main thread = `document.fonts`), `TitleScreen.onLeave`
>   masque désormais le node (il restait affiché par-dessus le jeu). `BOID_COUNT` 500→24,
>   constantes physique + `PROP_DEFS` dans `shared/config.ts`.
>   Vérifié Chrome (monolith) : PLAY→IN_GAME, flock suit la cible, **pousse les caisses**
>   (masse 8-14 vs 1), ~60fps+, zéro erreur console ; mode workers intact (title screen).
>
> - **Étape 4a** (2026-07-06) — **Sim multithread + SAB + `?dev`** (scope validé utilisateur ;
>   l'heuristique adaptative reste à faire, voir 4b ci-dessous) : `simulation.worker.ts` héberge
>   `GameSim` (Comlink : `init`/`start`/`stop`/`setMoveInput`), boucle auto-cadencée 60 Hz
>   (`setTimeout` demi-pas + accumulateur GameSim), `targetPosition` passé en SAB. AppHost
>   (receiver uniquement, §4 autorité unique) spawne le worker au boot (préchauffe wasm pendant
>   le title), relaie les vues SAB au render worker via `attachGameBuffers` (clone structuré
>   d'une TypedArray sur SAB = mémoire partagée, zéro copie), start/stop sur les transitions
>   IN_GAME (dans le subscribe dédupliqué). Flag **`?dev`** (`queryFlags.ts`, honoré uniquement
>   sous `import.meta.env.DEV` — tree-shaké en prod, la garde `hasController` reste le seul
>   chemin vers IN_GAME) : `CONTROLLER_CONNECTED` simulé + prompt START GAME + clavier
>   WASD/flèches → Comlink → sim worker.
>   Vérifié Chrome : `?dev` → title → clic START GAME → IN_GAME, flock piloté clavier pousse
>   les props (sim worker + render worker + SAB), zéro erreur console ; URL vierge → clic
>   prompt = PAIRING_MODE et un `PLAY` forcé reste bloqué (guard).
>
> - **Étape 4b** (2026-07-07) — **Tier adaptatif** (section 7) :
>   `src/app/platform/workerStrategy.ts` (`benchmarkCompute` — batch Float32 chunké, budget
>   40 ms ; `resolveTier` — benchmark, cœurs en secours si zone ambiguë, `?forceTier=low|high`
>   DEV-only en override, log au boot pour calibrage). Fusion tier low : la sim est hébergée
>   dans le render worker — nommé **`Render+SimWorker`** dans DevTools — via `src/sim/simHost.ts`
>   (boucle 60 Hz extraite de `simulation.worker.ts`, partagée par les deux topologies ;
>   composition dans l'entry `render.worker.ts` : API `simInit`/`simStart`/`simStop`,
>   `RenderManager` non touché), et les systèmes agiles passent inline. AppHost : façade
>   `simControl` unique (worker dédié vs hébergée), tier résolu avant tout spawn.
>   Vérifié Chrome : `?dev&forceTier=low` → IN_GAME jouable WASD, pas de SimulationWorker ;
>   `?dev` nominal → tier=high, SimulationWorker dédié, comportement inchangé ; zéro erreur.
>   **Seuils (30k/12k ops/ms) calibrés desktop uniquement — à recalibrer sur vrais devices.**
>
> **Prochaine étape : Étape 7 — asset caching réel + DX finale** (section 8), plus le
> test des étapes 5b/6 sur vrais devices (iPhone + desktop) par l'utilisateur.
> Le playbook CLAUDE.md §15 s'applique : critique d'architecture + validation utilisateur
> AVANT d'implémenter.
>
> - **Étape 5a** (2026-07-07) — **SAB de contrôle + dispatcher** (`docs/plans/design-etapes-5-6.md`
>   §A.4/A.5) : constantes `CTRL_*` + `ACTION_ID` (`shared/constants.ts`), `createControlSAB`
>   (`core/sab-manager.ts`), écrivains main-thread `writeAxes`/`pushAction`
>   (`input/controlChannel.ts`), `drainControl` en tête de `stepOnce` dans `GameSim`
>   (ring d'actions séquentiel + axes atomiques latest-wins), `simulation.worker.init(controlSab)`,
>   `setMoveInput` supprimé partout — le clavier `?dev` et le monolith empruntent le pipeline
>   prod. Vérifié Chrome : workers `?dev` (title → START → WASD déplace cible+flock, caisse
>   poussée, zéro erreur) et `?monolith` (cible (0,0)→(−10,−10) en 2 s de S+A). Reste 5b :
>   joysticks + transport RTC.
>
> - **Étape 5b** (2026-07-09) — **Transport joysticks → sim** (§A.2/A.3/A.6 du design ; les
>   `VirtualStick` de `GamepadScreen` et `stickReducer` existaient déjà) : `input/inputCodec.ts`
>   (encode/décode 6 octets LE int16×2+uint16 seq, `INPUT_PAYLOAD_BYTES`/`INPUT_AXIS_QUANT`
>   dans `shared/constants.ts`, tampons réutilisés zéro-alloc), `pairingHost` câble les deux
>   sens — proxy `setPairingActions.sendInput` (encode + envoi au peer pairé, no-op sinon) et
>   callback `onInput` (filtre peer pairé → décode → `onRemoteAxes` fourni par AppHost =
>   `writeAxes` sur le SAB de contrôle, receiver only). Cas limites §A.6 : axes remis à zéro
>   sur `onPeerLost` du peer pairé ET à la sortie d'`IN_GAME` (AppHost). Corrections au
>   passage : `GamepadScreen` enregistré pour `TITLE_SCREEN` **et** `IN_GAME` côté controller
>   (sinon les joysticks mouraient au START — écran noir), log DEV du room code au boot
>   receiver (test 2 onglets sans scanner le QR), `docs/**` ignoré par ESLint (les plugins
>   Obsidian pollués par vite-checker). Vérifié Chrome headless 2 onglets (mode workers,
>   vrais clics CDP `click_at`) : pairing → START croisé → stick gauche tenu = le flock
>   traverse l'arène et pousse les caisses, relâché = arrêt, onglet controller tué en plein
>   hold = arrêt (peer lost) ; `?dev` clavier intact ; tsc+eslint+build prod verts, zéro
>   erreur console. **Piège découvert** : le daemon chrome-devtools lancé depuis le shell
>   sandboxé hérite du blocage des ports non-443 → les relays MQTT (8084/8884) échouent ;
>   relancer le daemon hors sandbox.
>
> - **Étape 6a** (2026-07-09) — **Snapshot round-trip local** (§B.3/B.4) : `PhysicsEngine`
>   gagne `readQTransform`/`readAngularVelocity`/`restoreBody` (Set batch → resynchro body
>   buffer immédiate, piège C.2), codec binaire dans **`src/sim/snapshot.ts`** (layout §B.3
>   versionné, constantes `SNAPSHOT_*` dans `shared/constants.ts`, 1060 octets pour 24 boids
>   + 5 props — GameSim restait sous les 300 lignes en déléguant via `SimSnapshotState`).
>   `GameSim.captureSnapshot/restoreSnapshot` : vitesses physiques (pas les dérivées), au
>   restore `prevPositions = pos - vel·dt` (piège §B.4 anti-hoquet), `targetPosition`
>   in-place (SAB), `writeMatrices()` immédiat. Surface Comlink `capture()`/`restore()`
>   (transfert, pas copie) sur les deux topologies (worker dédié + `simCapture`/`simRestore`
>   du worker fusionné), façade `simControl` étendue. Touches DEV C/R
>   (`attachSnapshotDevKeys`) en `?dev` et monolith. Vérifié : capture → 2 s de fuite →
>   restore = état pixel-identique (workers) et cible restaurée à l'exact (monolith).
>
> - **Étape 6b** (2026-07-09) — **Handoff bidirectionnel** (§B.1/B.2/B.5) : actions Trystero
>   `hoReq`/`hoState`/`hoAck` (PairingChannel + types), **`src/app/HandoffCoordinator.ts`**
>   (FSM ACTIVE→CAPTURING→AWAITING_ACK→PASSIVE / PASSIVE→RESTORING→ACTIVE, orthogonale au
>   rôle ; stop AVANT capture, autorité cédée à l'ACK seulement, timeout 5 s + rollback,
>   hoReq croisés ignorés hors ACTIVE, garde IN_GAME ; peer perdu en PASSIVE côté receiver =
>   reprise locale au dernier état — pas d'écran mort). AppHost : SAB de contrôle + sim
>   init sur **les deux rôles** (seule l'autorité `start()`, garde `isActive()` dans le
>   subscribe), événement `REQUEST_HANDOFF` (UI → FSM, jamais l'orchestrateur — c'est la FSM
>   qui émet `TRANSFER`/`TRANSFER_BACK`). pairingHost : senders/callbacks handoff filtrés
>   par peer pairé + switch d'autorité du sampler §B.5 (sticks → SAB local quand ACTIVE,
>   sinon RTC — un seul chemin d'écriture). UI : `VirtualStick` extrait en composant,
>   GamepadScreen gagne « PLAY HERE » (pairé) + `setGameMode` (fond effacé quand autorité,
>   le jeu local apparaît sous les sticks), nouvel écran `PlayingOnPhoneScreen`
>   (« BRING IT BACK ») pour `PLAYING_ON_PHONE` ; fix transverse : labels sortis du flux
>   Yoga (`layout = null`) — corrige aussi le START qui dérivait à droite depuis l'étape 2.
>   Vérifié Chrome 2 onglets (workers, tier high) : 2 cycles aller/retour complets sans
>   flash ni réinit WebGL, état continu (caisses poussées sur le phone retrouvées déplacées
>   au retour), joysticks pilotent la sim locale du phone quand il est autorité, onglet
>   controller tué pendant PLAYING_ON_PHONE → toast « CONTROLLER LOST — RESUMING HERE » +
>   reprise auto (<12 s, délai Trystero compris), zéro erreur console. Non couvert par le
>   test auto : fenêtre AWAITING_ACK exacte (<1 s — même chemin `rollbackToActive` que le
>   timeout), tier low, vrais devices.
>
> **La conception complète des étapes 5 et 6 est déjà faite et validée** (2026-07-07) :
> `docs/plans/design-etapes-5-6.md` — pipeline input (SAB de contrôle, transport binaire,
> dispatcher), protocole de handoff (FSM d'autorité, format de snapshot, API sim), ordre
> d'implémentation en sous-étapes 5a/5b/6a/6b. L'implémenteur suit ce document ; le
> playbook §15 reste dû à chaque sous-étape (présenter les ajustements, attendre le go).
>
> **Backlog hors-brief** (repris de l'ancien `AGENT_BOARD.md`, supprimé le 2026-07-07
> car il dupliquait cet encadré) :
>
> - Workbox dans le Service Worker pour le cache offline de l'App Shell (JS/CSS).
> - Séquencer le chargement : `warmUp('app')` puis `warmUp('game')` dans `AppOrchestrator`.

## 0. Contexte et lecture préalable

Ce projet est une console web type Nintendo Switch : un `receiver` (desktop) affiche le
jeu, un `controller` (phone) le pilote via WebRTC, et le jeu peut être "amené" d'un
device à l'autre (handoff bidirectionnel, autorité unique du game state).

**Avant de commencer, lis dans l'ordre** :

1. `/CLAUDE.md` — règles d'arbitrage non-négociables du projet.
2. `/CLAUDE_backup.md` — détails additionnels (rendu single-canvas, playbook de validation).
3. `docs/architecture/threading-model.md`, `docs/architecture/worker-adaptive-strategy.md`, `docs/architecture/system-allocator.md`,
   `docs/architecture/code-conventions.md`, `docs/architecture/src-layout.md` — état de l'architecture actuelle.
4. Ce document — le brief de la démo à construire.

**Playbook obligatoire (CLAUDE.md §15) : pour chaque étape ci-dessous, commence par une
critique d'architecture + alternatives + analyse thread-safety, attends la validation de
l'utilisateur, PUIS implémente.** Ne saute pas cette étape même si le brief te semble déjà
précis — le brief cadre le _quoi_, pas les détails d'implémentation, qui restent à ta charge
et à valider.

---

## 1. Objectif de la démo

Un flow complet et jouable : `TITLE_SCREEN` → pairing WebRTC receiver↔controller →
contrôle en temps réel d'une simulation de boids ayant un poids physique (Havok) qui
poussent des objets dans une scène → transfert bidirectionnel du jeu entre les deux
devices sans coupure perçue. Le tout avec un multithreading qui s'adapte dynamiquement
aux capacités du device, un asset loading/caching hybride service worker + IndexedDB, et
une expérience de développement (HMR, debug layer) qui reste utilisable malgré
l'architecture en workers.

Ce n'est **pas** un jeu fini — c'est une démo technique qui prouve que toutes les briques
du projet fonctionnent ensemble.

---

## 2. État existant du repo — à réutiliser, ne pas recréer

| Brique                            | Fichier(s)                                                                                                                                | État                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Render worker + Comlink           | `src/render/render.worker.ts`, `src/render/RenderManager.ts`                                                                              | Fonctionnel                                                              |
| Orchestration boot                | `src/app/AppHost.ts`, `src/app/AppOrchestrator.ts` (xstate)                                                                               | Fonctionnel                                                              |
| Allocation adaptative (règle N-1) | `src/core/SystemAllocator.ts`                                                                                                             | Fonctionnel, mais seulement câblé à `AssetsManager`                      |
| Détection de rôle device          | `src/app/ContextManager.ts` (`detectAppContext()`)                                                                                        | Fonctionnel (UA/touch/localStorage), pas de override query-param         |
| Cache assets SW + IndexedDB       | `src/app/platform/serviceWorker.ts`, `serviceWorkerRegister.ts`, `assetCacheFetch.ts`, `src/core/assetDb.ts`, `src/core/AssetsManager.ts` | Fonctionnel — manifeste diffé par hash, `public/assets.json` déjà généré |
| Layout SAB                        | `src/core/sab-manager.ts`, `src/shared/constants.ts` (`SAB_BOID_STRIDE`, `SAB_SECTION.{MATRICES,STATES,AUDIO}`)                           | Défini, **non câblé** dans les workers                                   |
| Constantes boids                  | `src/shared/config.ts` (`BOID_COUNT`, vitesses, séparation/alignement/cohésion)                                                           | Définies, à ajuster pour 10-30 boids                                     |
| Mode dev mono-thread              | `src/_dev/inspectors/monolith.ts`, activé via `?monolith` dans `src/main.ts`                                                              | Fonctionnel                                                              |

**À construire — actuellement vide, stub, ou absent :**

| Brique                  | Fichier(s)                                                    | État                                                                               |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pairing WebRTC/Trystero | `src/input/signaling/`                                        | Dossier vide ; dépendance `@trystero-p2p/mqtt` installée mais inutilisée           |
| Protocole de connexion  | —                                                             | Aucun code                                                                         |
| Simulation worker       | `src/sim/simulation.worker.ts` (renommé depuis `simulation/`) | Stub `console.log`                                                                 |
| Audio worker            | `src/audio/audio.worker.ts`                                   | Stub `console.log`                                                                 |
| Boids                   | `src/sim/BoidSimulation.ts`, `spatialPartitioning.ts`         | Fichiers vides                                                                     |
| Physique                | `src/sim/PhysicsEngine.ts`                                    | Fichier vide ; `@babylonjs/havok` absent de `package.json`                         |
| Rendu boids             | `src/render/scene/BoidsRenderer.ts`                           | Stub commentaire seulement (thin instances depuis SAB)                             |
| Routing query params    | `src/main.ts`                                                 | Seul `?monolith` existe ; `?controller`/`?receiver`/`?dev` absents                 |
| Micro-benchmark boot    | —                                                             | Seule une heuristique statique `hardwareConcurrency` existe (`SystemAllocator.ts`) |

**Note de structure de dossiers** : le repo utilise `src/app`, `src/core`, `src/render`,
`src/audio`, `src/shared`, `src/input`, `src/ui` comme noms réels. **Renomme
`src/simulation/` en `src/sim/`** (seul changement demandé) — ne crée PAS de `src/main/`
ou `src/system/` parallèles même si un ancien CLAUDE.md les mentionne : ce sont les noms
`app`/`core` qui font foi.

---

## 3. Contraintes non-négociables (CLAUDE.md / CLAUDE_backup.md)

- **Ownership d'état** : le device actif est l'unique autorité du game state. Transfert =
  snapshot complet + ACK + switch d'autorité. Jamais de double autorité.
- **Rendu** : un seul canvas, un seul contexte WebGL. Babylon rend d'abord, Pixi ensuite
  (`clearBeforeRender: false`). Après le rendu Pixi : `gl.bindVertexArray(null)` puis
  `engine.wipeCaches(true)`. Ordre des couches : Babylon → `gameContainer` →
  `shellContainer` (+ overlays RTC/toasts).
- **Hot loop** : SAB uniquement. `postMessage`/transferables réservés à l'init et aux
  assets froids. DOD/SoA pour les buffers. `Atomics` pour index/flags partagés. Pas de
  classes/objets dans le buffer de commandes.
- **WebRTC est main-thread only** : `RTCDataChannel` et l'API Gamepad ne peuvent pas
  tourner en Worker (contrainte documentée dans `docs/architecture/threading-model.md`) — le pairing et
  la réception des inputs réseau vivent sur le thread principal.
- **Input pipeline** (CLAUDE.md §7) : input physique → `ActionId` numérique, axes
  normalisés `[-1,1]` (ou fixed-point `Int32` pour atomics), ring buffer SAB Main→Sim,
  dispatcher séquentiel et déterministe en simulation, policy axes latest-wins.
- **Conventions de code** (`docs/architecture/code-conventions.md`, déjà en vigueur — respecte-les
  telles quelles) : PascalCase classes, camelCase fonctions/variables/fichiers utilitaires,
  suffixe `.worker.ts`, `SCREAMING_SNAKE_CASE` constantes, pas de classes utilitaires
  statiques (module ES6 à la place), commentaires uniquement sur le _pourquoi_.
- **En plus des conventions ci-dessus, applique le style Babylon.js** (le codebase est
  Babylon-first, ces règles s'ajoutent sans contredire `code-conventions.md`) :
  - Pas de préfixe `I` sur les interfaces (`PeerConnection`, pas `IPeerConnection`).
  - Champs privés/protégés préfixés `_` (`this._engine`).
  - **Zéro allocation dans les boucles de rendu/sim** : jamais `position.add(velocity)`
    dans une boucle — utilise `position.addInPlace(velocity)` ou
    `position.addToRef(velocity, target)`.
  - Privilégier les builders/méthodes statiques de création (`MeshBuilder.CreateGround`)
    plutôt que des constructeurs surchargés d'options.
  - TypeScript strict : jamais `any`, `Nullable<T>` si type inconnu, `readonly` explicite
    sur les propriétés immuables, type de retour explicite sur les méthodes publiques.
- **Fichiers `<= 300` lignes** (exception justifiée), pas de singleton global, composition
  plutôt qu'héritage, vocabulaire métier explicite (`Boid`, `InputBuffer`, `TargetMatrix`),
  unités dans les noms si utile (`rotationRad`, `deltaMs`), paramètres `readonly` par défaut.

---

## 4. Specs gameplay

- **Boids** : 10 à 30, simulés avec Havok complet (poids réel, collisions précises).
- **Objets poussables** : masse Havok strictement supérieure à celle des boids — la
  poussée doit être visible mais pas triviale (pas d'objets qui s'envolent au moindre
  contact).
- **Scène** : petite scène thématique avec assets custom (pas juste des primitives) —
  exerce réellement le pipeline manifest → service worker → IndexedDB déjà en place. Le
  modèle `game.models.shiny_fish.glb` est déjà référencé dans `public/assets.json` et sert
  de bon cas de test pour le warm-up/caching (fichier volumineux, ~19MB).
- **Contrôle** : 2 joysticks sur le controller, **moyennés** pour donner une direction
  unique à la sphère invisible qui pilote les boids. Les comportements de divergence
  (joysticks pointant dans des directions différentes) et de tap-sans-direction
  (détection d'un joystick touché sans mouvement, utilisé comme bouton) sont une évolution
  **future** — ne les implémente pas, mais garde l'architecture input assez découplée
  pour les ajouter plus tard sans tout réécrire.

---

## 5. Pairing WebRTC — scénario 1 uniquement (pas de reconnexion)

Un prototype existant (`github.com/wwwonka/webrtc-switch-system`, projet séparé, à lire
pour référence de flow uniquement — pas de CSS, pas de code à copier tel quel) a déjà
validé le pattern de pairing suivant, à porter dans `src/input/signaling/` :

- `joinRoom` via Trystero (`@trystero-p2p/mqtt`, déjà une dépendance du projet actuel).
- Trois actions réseau : `presence` (annonce de rôle), `connect` (demande de connexion),
  `paired` (confirmation).
- Discovery filtrée par rôle : un `controller` ne voit que les `receiver` et vice-versa
  (`targetRole`).
- **Scénario couvert : les deux devices sur le même réseau, avec accès internet.** C'est
  le seul scénario à gérer dans cette démo.

**Explicitement hors scope pour cette démo** (à ne pas implémenter) :

- Configuration TURN server.
- ICE restart automatique en cas de coupure réseau.
- Fallback QR code (signaling sans internet).
- Toute logique de reconnexion, snapshot périodique de session, ou détection de réseau
  captif/offline.

Ces sujets existent dans le prototype de référence (`docs/connectivity.md` de ce
prototype, scénarios 2 à 8) mais sont **hors scope ici** — ne les porte pas, même
partiellement.

---

## 6. Handoff bidirectionnel

Protocole de référence, adapté du même prototype (`src/controller/transfer.js` /
`src/receiver/transfer.js`), à reprendre pour la structure des messages — mais le contenu
de `state` doit être étendu pour couvrir l'état complet boids+physique, pas seulement des
positions de joueurs :

```
controller → receiver  { request: true }     demande l'état actuel
receiver   → controller { state }             snapshot complet, scène mise en pause
controller → receiver  { confirmed: true }    scène prête côté controller, affichée
controller → receiver  { state }              renvoie le jeu (au retour)
receiver   → controller { returned: true }    confirme la réception, ferme l'overlay
```

`state` doit inclure : positions/vélocités de chaque boid (depuis le SAB), état de la
sphère invisible de contrôle, et position/rotation/vélocité de chaque objet Havok
poussé.

**Invariant à respecter** : la scène Babylon locale n'est **jamais détruite** pendant un
transfert — elle est masquée et mise en pause, puis réaffichée. Ça évite un re-init WebGL
et un retour visuel à la position de repos initiale. Ceci découle directement de la règle
CLAUDE.md : autorité unique + snapshot complet + ACK + switch (pas de double autorité
pendant la transition).

---

## 7. Multithreading adaptatif

- Complète l'heuristique de `docs/architecture/worker-adaptive-strategy.md` (2 cœurs → 1 worker
  unifié ; 4 cœurs → 2 workers ; >4 cœurs → 3 workers dédiés), actuellement documentée
  mais pas implémentée pour sim/render/audio (seul `AssetsManager` est câblé à
  `SystemAllocator`).
- Ajoute un **micro-benchmark boot réel** (CLAUDE.md §3 l'exige, actuellement absent — il
  n'y a qu'un check statique `navigator.hardwareConcurrency`) : un test synthétique court
  (**< 50ms**, pour ne pas pénaliser le temps de boot) — par exemple un batch fixe
  d'opérations Vector3/Matrix (`addInPlace`/`multiplyToRef`) mesuré en ops/ms — combiné à
  `hardwareConcurrency` comme heuristique de secours si le résultat est ambigu.
- Ajoute un query param **`?forceTier=low`** qui court-circuite la détection et force le
  mode dégradé, pour pouvoir tester le fallback de façon déterministe sans dépendre d'un
  vrai device faible.

---

## 8. Asset loading & DX

- Le pipeline SW + IndexedDB existant (`src/core/AssetsManager.ts`, `assetDb.ts`,
  `serviceWorker.ts`) doit être exercé réellement par les assets de la scène thématique —
  pas juste laissé en place sans être utilisé.
- **`initDevMode()`** : point d'entrée unique appelé depuis `main.ts` (sous `?dev` ou en
  DEV) qui greffe le debug layer + inspecteur Babylon + tout outil de simulation
  visuelle. Aucun code dev ne doit fuiter ailleurs dans `src/` — tout vit sous `src/_dev/`
  (déjà en place, voir `src/_dev/inspectors/monolith.ts` comme référence de style).
- HMR Vite doit rester fonctionnel malgré l'architecture worker.

---

## 9. Critères de succès

- 60 fps sur desktop, 30 fps+ sur phone, y compris en mode `?forceTier=low`.
- Handoff sans coupure perçue (pas de flash, pas de saut de position, état physique
  cohérent après transfert).
- Reload = cache hit instantané (zéro re-téléchargement réseau visible dans l'onglet
  Network des devtools).
- Code conforme aux conventions de la section 3 (naming, zéro allocation en boucle chaude,
  pas de `any`, fichiers `<=300` lignes).

---

## 10. Hors scope pour ce brief (ne pas construire)

- Plugin Vite d'automatisation iOS Simulator (ouverture PWA/Safari automatique) — sujet
  distinct, traité séparément plus tard.
- Agent de documentation externe (ex. via GitHub Copilot) qui générerait une page web de
  suivi — idée notée mais hors scope de cette démo.
- Tout ce qui est listé comme hors scope en section 5 (TURN, ICE restart, QR fallback,
  reconnexion).

---

## 11. Stratégie de livraison — étapes séquencées, PAS un seul dump de code

Livre par étapes numérotées, chacune vérifiable/lançable avant de passer à la suivante.
Après chaque étape : un message de résumé (ce qui a été fait, risques restants, ce qu'il
reste à faire) puis **attendre un go explicite de l'utilisateur** avant de continuer —
conforme au playbook CLAUDE.md §15.

**Étape 0 — Outillage qualité** ✅ FAIT (commit `22be292`)

- Configurer ESLint + Prettier alignés sur les conventions de la section 3 (actuellement
  absents du repo).
- Vérification : le lint/format tourne sans erreur sur le code existant.

**Étape 1 — Routing & rôles** ✅ FAIT (commits `a911c26` → `4e48851`, élargie : voir
l'encadré d'avancement en tête de document)

- ~~Ajouter `?controller` / `?receiver` / `?dev` dans `src/main.ts`~~ — fait pour
  `?controller`/`?receiver` (`src/app/platform/queryFlags.ts`) ; `?dev` abandonné par
  décision utilisateur (les outils dev chargent sous `import.meta.env.DEV`).
- En plus du brief : UI de pairing complète (`PAIRING_MODE`, overlay, QR) — voir encadré.
- Vérification ✅ : URL vierge → Title Screen ; clic "CONNECT CONTROLLER" → sheet QR ;
  `?controller` → pairing plein écran au boot ; validé en mode workers sur Chrome desktop
  ET simulateur iPhone (iOS 18.6).

**Étape 2 — Pairing WebRTC (scénario 1 uniquement)** ✅ FAIT (voir l'encadré d'avancement
en tête de document — élargie : toasts, START GAME synchronisé, GamepadScreen)

- ~~Porter le flow de la section 5 dans `src/input/signaling/`~~ — fait, plus le flow de
  confirmation par chip cliquable côté receiver et le lancement de partie synchronisé.
- Vérification ✅ : deux devices sur le même réseau se découvrent, atteignent "paired",
  et un START d'un côté passe les deux devices en `IN_GAME`.

**Étape 3 — Boids + Havok en local (sans réseau)** ⬅️ **PROCHAINE ÉTAPE**

- Implémenter `BoidSimulation.ts`, `PhysicsEngine.ts`, `spatialPartitioning.ts` ; ajouter
  `@babylonjs/havok` ; construire la scène thématique avec 10-30 boids + objets
  poussables plus lourds.
- Valider d'abord en mode `?monolith` (un seul thread) avant de répartir dans les
  workers.
- Vérification : les boids poussent visiblement les objets, comportement physique
  crédible.

**Étape 4 — Répartition multithread + SAB**

- Câbler réellement `src/core/sab-manager.ts` / `src/shared/constants.ts` entre
  `src/sim/simulation.worker.ts` et `render.worker.ts`.
- Implémenter l'heuristique adaptative + micro-benchmark boot + `?forceTier=low` (section
  7).
- Vérification : `?forceTier=low` force le mode dégradé et reste jouable ; le mode
  nominal utilise les workers dédiés.

**Étape 5 — Input controller → sim via WebRTC**

- Les joysticks (moyennés) du controller pairé pilotent la sphère invisible côté
  receiver, via le pairing de l'étape 2 et le pipeline input de CLAUDE.md §7.
- Vérification : bouger les joysticks sur le controller déplace la sphère/boids sur le
  receiver en temps réel.

**Étape 6 — Handoff bidirectionnel**

- Implémenter le protocole de la section 6, adapté à l'état boids+Havok+SAB.
- Vérification : transfert controller↔receiver sans réinit WebGL, sans saut visuel, état
  physique cohérent après transfert.

**Étape 7 — Asset caching réel + DX finale**

- Exercer réellement le pipeline SW+IndexedDB avec les assets de la scène (section 8).
- Implémenter `initDevMode()` (section 8).
- Vérification : cache hit instantané au reload, HMR fonctionnel malgré les workers.
