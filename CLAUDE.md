# CLAUDE.md — Règles minimales (token-efficient)

## 1) Mission produit

- Console web type Nintendo Switch.
- Jeu solo.
- Receiver (desktop) + Controller (phone).
- Handoff bidirectionnel: on peut "amener le jeu" d'un device à l'autre.

## 2) Priorités d'arbitrage (ordre strict)

1. Architecture multi-thread robuste.
2. Flow d'écrans stable.
3. DX rapide (itération).
4. Connectivité fiable.

## 3) Runtime cible

- Threads de base: `main` + `system-host` + `sim` + `render` + `audio`.
- Profil adaptatif par device: micro-benchmark boot + fallback heuristique (cores/capacités).
- `dev-worker` autorisé uniquement en debug.

## 4) Ownership état jeu (non négociable)

- Le device actif est l'unique autorité du game state.
- Transfert = snapshot complet + ACK + switch d'autorité.
- Pas de double autorité.

## 5) Structure dossiers (non négociable)

- `src/main/` UI/CSS boot, input capture, orchestration.
- `src/system/` I/O asynchrone (assets, connectivité, IndexedDB).
- `src/sim/` logique pure (FSM, boids, physique), sans DOM/rendu.
- `src/render/` Babylon+Pixi, OffscreenCanvas.
- `src/audio/` synthèse/queue audio.
- `src/shared/` schémas SAB, types, constantes pures (aucun état global, aucun import UI/rendu).

## 6) Contrats inter-threads

- Hot loop: SAB uniquement.
- `postMessage`/transferables: init + assets froids seulement.
- DOD/SoA pour buffers.
- `Atomics` pour index/flags partagés.
- Pas de classes/objets dans le buffer de commandes.

## 7) Input pipeline unifié

- Input physique -> `ActionId` numérique.
- Axes normalisés `[-1, 1]` (ou fixed-point dans `Int32` pour atomics).
- Ring buffer SAB Main -> Sim.
- Dispatcher central en simulation, séquentiel et déterministe.
- Policy axes: latest-wins pour limiter la latence perçue.

## 8) Gameplay boids

- Boids pilotés par une sphère invisible.
- 2 joysticks controller.
- Poids/physique via Havok (Babylon-compatible).

## 9) Rendu (non négociable)

- Un seul canvas, un seul contexte WebGL.
- Babylon d'abord, Pixi ensuite (`clearBeforeRender: false`).
- Après rendu Pixi: `gl.bindVertexArray(null)` puis `engine.wipeCaches(true)`.
- Couches: Babylon -> `gameContainer` -> `shellContainer` (+ overlays RTC/toasts).

## 10) Flow UI canonique

- `BOOT` (CSS only, unique exception) -> `TITLE_SCREEN` -> `IN_GAME` <-> `PAUSED` -> `PLAYING_ON_PHONE` (`transferring`).
- Overlays au-dessus du jeu: RTC connection + toast notifications.
- Sortie `BOOT` uniquement quand le Title Screen est réellement prêt dans le canvas.

## 11) Routing / query params

- URL vierge: `TITLE_SCREEN`.
- `?controller`: pairing plein écran mobile.
- `?receiver`: mode receiver forcé.
- `?monolith`: debug local mono-thread.
- `?dev`: outils/debug dev.

## 12) Connectivité

- Stratégie hybride: API réseau exposée au main; exécution worker quand supportée.
- Trystero/WebRTC pour online.
- Objectif serverless-first, sans serveur autant que possible.
- Cas offline local: privilégier app installée/PWA sur les 2 devices.

## 13) DX / qualité

- Worker-first par défaut.
- Monolith seulement pour itération locale ciblée.
- Validation finale toujours en mode workers.
- Code dev dans `_dev/` uniquement, jamais dans `src/`.

## 14) Conventions de code

- Modules petits, responsabilité unique, cible `<= 300` lignes/fichier (exception justifiée).
- Pas de singleton global.
- Composition > héritage.
- Vocabulaire métier explicite (`Boid`, `InputBuffer`, `TargetMatrix`).
- Unités dans les noms si utile (`rotationRad`, `deltaMs`).
- Paramètres `readonly` par défaut.
- Fail-fast en dev (assertions), logs taggés par thread.

## 15) Playbook obligatoire (chaque tâche)

1. Critique architecture + alternatives + thread-safety.
2. Attendre validation utilisateur.
3. Implémenter dans le bon domaine (pas d'imports croisés interdits).
4. Vérifier mode workers.
5. Livrer résultat concis + risques restants.

## 16) QA minimale

- Build vert.
- Smoke flows (desktop+mobile).
- Playwright: snapshots visuels déterministes (canvas) + flows critiques.

## 17) Documentation détaillée

Ce fichier reste volontairement minimal. Pour le détail, voir `docs/` :

- `docs/code-conventions.md` — naming, classes vs fonctions, conventions Babylon.js.
- `docs/architecture-src.md` — structure réelle du code (noms actuels: `app`/`core`/`simulation`, distincts de la cible §5).
- `docs/threading-model.md`, `docs/worker-adaptive-strategy.md`, `docs/system-allocator.md` — allocation des workers, heuristiques.
- `docs/render-stack.md` — détail de la composition Babylon+Pixi (§9).
