# Plan — Système d'input agnostique (multi-sources) + manette

**Statut : code livré — Phases 1→4 + nettoyage structurel (2026-07-17). Reste : validation sur devices réels.**

> **Nettoyage post-Phase 3** : `setup/` fusionné dans `boot/` (la distinction boot/setup ne tenait
> pas ; les 7 fichiers = la séquence de boot du receiver). Assets regroupés dans `core/assets/`
> (`AssetsManager` + `assetDb` + `assetPath` + `assetCacheFetch` = un seul mécanisme SW+IndexedDB).
> Lint `explicit-module-boundary-types` corrigé sur `benchmarkDevice`. Verts : tsc, eslint, 44 tests,
> build, smoke. En Phase 4, le `setup/input` prévu devient **`boot/input`**.
(Statut possible : proposé | décidé | en cours | livré. Cocher les cases à mesure.)

## Context

Le pipeline d'input a **une seule source câblée en dur** : le tactile (`src/app/shell/components/Joysticks.ts`) appelle `onInput(x,z)` → `pairingHost.sendInput`. Le clavier n'existe qu'en dev (`src/_dev/inspectors/simControls.ts`). Aucune manette, **aucun contrat commun** entre sources → impossible d'en brancher plusieurs proprement.

L'utilisateur a une **manette (DualShock 4)** et veut un système **agnostique** : plusieurs sources interchangeables (tactile, manette) alimentant le même pipeline, **gamepad-agnostic** (n'importe quelle manette capturée), avec une arborescence qui **se lit seule** et **zéro code DEV dans le `src/` prod**.

Le bon seam existe déjà : `pairingHost.sendInput(dirX, dirZ)` (`src/app/pairingHost.ts:208`) route les axes vers le SAB local (`applyAxes`→`writeAxes`) OU le RTC (`encodeInput`→canal) selon l'autorité. **L'input ne doit pas savoir lequel** — c'est LE point qui garantit "mêmes inputs partout".

### Décisions cadrées avec l'utilisateur
- **Arbitrage multi-source : latest-active-wins** (la dernière source qui bouge un stick possède la sortie jusqu'à recentrage).
- **Périmètre 1re passe : sticks uniquement.** Boutons/actions (dash, split) → `ActionId` → ring SAB + fil RTC = passe suivante. `ControllerFrame` réserve déjà le champ `actions`.
- **Cible : manette sur le desktop receiver d'abord** (SAB local, zéro RTC). Mais le hub est **identique** sur les deux devices → on enregistre aussi la source manette dans `ControllerHost` (inerte sans manette, gratuit).
- **Clavier ≠ input gameplay.** Le jeu ne se contrôle **jamais** au clavier (vision console-sur-web). Deux conséquences :
  - Le clavier WASD→axes reste **DEV-only** : `src/_dev/sources/DevKeyboardSource.ts`, enregistré dans le hub **via l'unique porte `initDev`**. Rien de `_dev` n'est importé par `src/input/`.
  - Les raccourcis **UI/système** (ENTER=pause, ESCAPE=sortir pairing, flèches=nav menu pause) sont une **couche shell séparée**, **hors** du pipeline d'input. **Hors périmètre de cette passe** (aucun handler menu n'existe encore ; `guards/keyboardShortcuts.ts` ne fait que bloquer les raccourcis navigateur).
- **Joysticks tactiles en `<template>` HTML déclaratif** (voir §Perf).

### Ce que le transcript (HTTP203 Gamepad API, `refs/HTTP203 Gamepad API.txt`) impose
- `getGamepads()` = **polling**, aucun event de valeur → un poll par frame, on garde `lastState` (utile aux boutons, passe suivante).
- Array **creux** (trous `null`) + ids **non uniques** → filtrer, tracker par **index**.
- **`mapping === "standard"`** = axes 0/1 (stick gauche) · 2/3 (droit), boutons à index stable, **identique DS4/Xbox/Joy-Con** → c'est CE qui rend l'agnosticisme réel. On code le **mapping standard**, jamais une table par marque.
- **`gamepadconnected`/`disconnected`** → pattern park-on-connect : coût **zéro** quand rien n'est branché.

## Architecture

Une **frame agnostique** (`ControllerFrame`) que chaque source remplit à l'identique, et un **hub** qui, dans une **unique** boucle rAF, collecte les sources actives, arbitre (latest-active-wins), réduit les 2 sticks (`reduceSticks` existant) et émet vers **un seul sink canonique** `(x,z)=>void`. Le hub est transport-agnostic ; le split SAB/RTC reste dans `sendInput`, invisible à l'input.

**Thread-safety** : capture 100% main-thread (`getGamepads()`/pointer sont main-only). Aucune nouvelle concurrence SAB — on réutilise `writeAxes` (latest-wins, 1 writer/1 reader, déjà `Atomics`). **Une seule** boucle rAF (le hub) remplace le `_tick` propre à `Joysticks`.

Alternatives écartées : chaque source appelant `sendInput` direct (pas de point d'arbitrage) ; bus `GameCommand` strings (viole le DOD §6, le chemin `ActionId`+ring existe déjà → fichiers supprimés).

## Séquences / combos / moves (où ça vit — rien n'est foreclos)

`CommandBuffer` actuel = **FIFO vidée à chaque tick**, sans fenêtre ni motif ni rétention → **ce n'est PAS un système de combos**, le supprimer ne retire aucune capacité. La détection de séquences est une **règle de gameplay déterministe → `src/sim/`**, jamais la couche input :
- **Déterminisme** : fenêtres mesurées en **ticks de sim** (le thread input a du jitter rAF/RTC).
- **Substrat déjà présent** : le **ring d'actions** (`ACTION_ID`, `pushAction`/`drainControl`, `CTRL_RING_*`) est **ordonné, monotone, sans perte** — flux idéal pour un reconnaisseur. `argFixedPoint` par slot peut porter la **charge** (dash chargé). La sim estampille au `drain` → fenêtres exactes sans toucher au fil.
- **Ownership** (§4) : seule l'autorité (sim du device actif) interprète.

Demain = un **FSM/rolling-window côté sim** sur le flux ActionId + la frame par tick → émet les moves. Plus puissant que l'ancienne FIFO, et déterministe.

**Implication à prendre en compte MAINTENANT** : split (sticks divergents) et dash chargé (hold & swipe) ont besoin des **2 sticks + timing dans la sim**. Or le pipeline **réduit** en 1 vecteur (`reduceSticks`) avant envoi (SAB = 1 vecteur). Donc : **la `ControllerFrame` porte les 2 sticks** (pleine fidélité) ; la réduction du hub est un **adaptateur transport explicitement temporaire**, à remplacer par un **contrat de contrôle élargi** (2 sticks + ring d'actions → sim) quand on fera les moves. Les sources/frame restent full-fidelity dès maintenant.

## Arborescence cible

```
src/input/
├── InputHub.ts          NOUVEAU — orchestrateur ; SEUL point d'entrée des Hosts (register + boucle rAF unique + arbitrage + emit).
├── ControllerFrame.ts   NOUVEAU — donnée agnostique { leftStick{x,z}, rightStick{x,z}, actions } remplie in-place, zéro alloc.
├── sources/
│   ├── InputSource.ts    NOUVEAU — contrat : start()/stop(), readInto(frame) (ou getter), kind, isActive.
│   ├── GamepadSource.ts  NOUVEAU — poll getGamepads(), mapping "standard" (agnostique), park-on-connect, deadzone. Sticks only.
│   └── TouchSource.ts    NOUVEAU — events pointer + sampleStick extraits de Joysticks.ts ; remplit la frame + pilote le visuel.
├── math/
│   ├── stickMath.ts       DÉPLACÉ — deadzone radiale + sampling (partagé tactile ↔ manette).
│   └── stickReducer.ts    DÉPLACÉ — 2 sticks → 1 direction.
├── transport/            (comment l'input voyage jusqu'à son consommateur ; ≠ signaling qui ouvre la connexion)
│   ├── controlChannel.ts  DÉPLACÉ — writers SAB local (writeAxes + pushAction).
│   └── inputCodec.ts      DÉPLACÉ — codec payload RTC distant (encode côté émetteur, decode côté receiver).
└── signaling/            INCHANGÉ (pairing FSM, RTC, ICE, QR, identity).

Supprimés : src/input/CommandBuffer.ts (FIFO morte, PAS un système de combos — voir §Séquences) · src/input/InputProxy.ts (vide).
NOUVEAU  : src/_dev/input/DevKeyboardSource.ts (WASD→axes, dev-only ; miroir de src/input/, enregistré via initDev).
NOUVEAU  : src/app/shell/joysticks.html (<template> des joysticks, inclus via @include).
```

Root de `src/input/` = 2 fichiers + 4 dossiers qui racontent l'histoire : *un hub consomme des frames de sources, via de la math, acheminées par transport (SAB/RTC), la connexion étant négociée par signaling.*

## Perf (contrainte explicite : économe, gentil avec la machine)

- **Joysticks en `<template>`** : `<!-- @include src/app/shell/joysticks.html -->` dans `index.html` (plugin `vite-html-include-plugin` déjà en place). Le markup est **parsé une fois** au load, inerte (non rendu). `Joysticks.ts` fait **un seul `template.content.cloneNode(true)`** quand le controller monte — **fini le `createElement` par élément**. Moins de JS sur le chemin critique du boot léger controller.
- **Une seule boucle rAF** (le hub) ; se met en pause quand aucune source active (park-on-connect côté manette).
- **Frame zéro-alloc** (remplie in-place, vues réutilisées, style existant du codebase).

## Découplage des tests hors de `src/` (zéro pollution, miroir)

Aujourd'hui les tests unitaires vitest sont colocalisés dans `src/` (`vitest.config.ts` → `include: ['src/**/*.test.ts']`), et pire, `src/input/signaling/loopbackChannel.ts` est un **helper test-only** vivant en prod. On sort tout dans `tests/` (qui existe déjà pour Playwright), en **miroir de `src/`** :

```
tests/
├── unit/                    (vitest — miroir de src/)
│   ├── input/signaling/connectionMachine.test.ts   (déplacé)
│   ├── input/signaling/identity.test.ts            (déplacé)
│   ├── input/signaling/loopbackChannel.test.ts     (déplacé)
│   ├── input/signaling/loopbackChannel.ts          (helper test-only, SORT de src/)
│   └── app/shell/components/PairingOverlay.test.ts (déplacé)
└── e2e/
    └── smoke.spec.ts        (Playwright — déplacé de tests/)
```

Config : `vitest.config.ts` include → `['tests/unit/**/*.test.ts']` ; `playwright.config.ts` `testDir` → `./tests/e2e` ; `tsconfig.json` include → `["src", "tests"]`. Imports des tests déplacés : alias de chemin existant si présent, sinon relatif `../../../src/...`. **Tout nouveau test de cette passe suit cette convention** (`tests/unit/input/...`).

## Décomposition d'AppHost (god file → chef d'orchestre)

`AppHost.start()` = ~408 lignes / ~18 responsabilités. On le ramène à un **chef d'orchestre mince** qui appelle des modules cohésifs. **Refactor structurel pur (zéro changement de comportement)**, vérifié par build + smoke.

```
src/app/
├── AppHost.ts               chef d'orchestre : séquence d'étapes nommées (~80-100 l).
├── boot/
│   ├── bootSplash.ts        (existe)
│   ├── deviceBenchmark.ts   NOUVEAU — benchmarkDevice() → { tier, allocation } : benchmarkCompute + resolveTier + allocateSystems.
│   ├── renderThread.ts      NOUVEAU — démarre le worker de rendu : canvas sizing + transferControlToOffscreen + spawn + init ; expose renderApi, renderWorker, getOverGameUI.
│   └── simControl.ts        NOUVEAU — createSimControl(tier, controlSab, renderApi) + façade paresseuse title-first + ready.catch.
├── setup/                   (connecte appOrchestrator aux sous-systèmes)
│   ├── pairing.ts           NOUVEAU — setupPairing() : ShellHost + PairingHost + HandoffCoordinator + scanner QR + setSendToAsm ; circularité shell⇄pairing INTERNE ; expose { shellHost, pairing, handoff, sendInput }.
│   ├── input.ts             NOUVEAU — setupInput({ axisSink, root }) : InputHub + sources (Touch + Gamepad). **PARTAGÉ par AppHost ET ControllerHost**.
│   ├── screens.ts           NOUVEAU — setupScreens() : appOrchestrator.subscribe → showScreen + start/stop sim + reset axes.
│   └── soloMode.ts          NOUVEAU — setupSoloMode() : déblocage solo (CONTROLLER_CONNECTED) + gate d'orientation.
└── (le bloc ?dev migre vers) src/_dev/app/devController.ts — controller simulé + DevKeyboardSource + snapshot C/R ; appelé par initDev.
```

**Séquence AppHost.start() (ordre préservé)** : guards/SW → `benchmarkDevice` → `bootAssets` (+warmUp) → `startRenderThread` → identité + `setShellContext` → `createControlSAB` → `createDeferredSim` → `setupPairing` (shell d'abord : monte le template joysticks) → `setupInput({ axisSink: pairing.sendInput, root: shell })` → `setupScreens` → `startUp()` → `runWhenIdle(initReal sim)` → (DEV) `initDev(...)` → `setupSoloMode` → `mountEventHandlers` + `setupPwaExperience(getOverGameUI)` → `return { assetsManager, renderApi, inputHub, simControl }`.

**Ordre = le vrai risque** (extraction mécanique, à ne pas casser) :
- Holders mutables `let handoff` / `actingAsController` : encapsulés dans `setup/pairing.ts` (le flag et le late-binding de handoff y vivent).
- Circularité shell⇄pairing (`onInput→sendInput`, `pairing→showToast`) : reste **interne** à `setup/pairing.ts`.
- `setSendToAsm` (proxy appelé plus tard) peut être enregistré avant que `handoff` soit assigné — inchangé.
- `setupInput` **après** `setupPairing` (le hub a besoin de `pairing.sendInput` comme sink ET du DOM joysticks du shell pour `TouchSource`).
- ~~`onInput` du shell~~ disparaît : le tactile passe par `TouchSource` dans le hub, plus par un callback shell.

## Phases livrables (todo)

Chaque phase se termine **build + smoke verts** avant la suivante. Ordre = feature d'abord, refactor structurel après.

### Phase 1 — Fondations propres (faible risque) — ✅ livrée
- [x] Réorg docs : `git mv docs/progress → docs/plans` ; MAJ `CLAUDE.md` §17 + `docs/README.md` + refs mortes dans docs vivants (sessions/ intactes).
- [x] Copier ce plan en `docs/plans/input-system-agnostic.md` (avec cet en-tête `Statut`).
- [x] Découpler les tests hors de `src/` : 4 `.test.ts` + helper `loopbackChannel.ts` → `tests/unit/` (miroir) ; `smoke.spec.ts` → `tests/e2e/` ; MAJ `vitest.config.ts` / `playwright.config.ts` / `tsconfig.json` (imports relatifs vers `src/`). **pnpm test vert (31/31), typecheck TS 6.0.3 vert, Playwright découvre le spec.**

### Phase 2 — Système d'input agnostique (câblé dans les Hosts actuels) — ✅ livrée
- [x] `ControllerFrame.ts` — factory mutable ; **2 sticks pleine fidélité** ; `actions` réservé.
- [x] `sources/InputSource.ts` — contrat `poll(): ControllerFrame | null` (arbitrage = transitions d'engagement côté hub, pas de `seq` par la source — plus simple, immunisé au jitter).
- [x] `math/` — `stickMath.ts` + `stickReducer.ts` déplacés ; `math/deadzone.ts` (radialDeadzone pure) extrait et réutilisé par le tactile ET la manette.
- [x] `sources/GamepadSource.ts` — poll `getGamepads()`, trous filtrés, `mapping==="standard"` (agnostique), axes 0/1 & 2/3 → sticks + deadzone, park-on-connect (suivi par index, ids non uniques).
- [x] `sources/TouchSource.ts` — **100% de la logique** (contrôleur) : events pointer, détection du côté, `sampleStick` → axes (frame) **+ calcul offsets nub** ; pilote la vue via `JoystickVisual` (interface définie dans `input/`) ; **zéro classe CSS**.
- [x] `src/app/shell/` — **présentation seule** : `<template>` (`@include src/app/shell/joysticks.html` dans `index.html`) + `joysticks.css` dédié (extrait de `shell.css`) + `JoysticksView` (vue bête : clone + `transform`). MVC : contrôleur `input/`, vue `shell/`.
- [x] `transport/` — `controlChannel.ts` + `inputCodec.ts` déplacés ; imports MAJ (`../../shared/...`).
- [x] `InputHub.ts` — rAF unique, **latest-active-wins**, `reduceSticks` (adaptateur transport temporaire), politique d'émission 30 Hz + change-detection + keepalive + axes nuls à l'arrêt (reprise de l'ancien `Joysticks._tick`).
- [x] Câblé dans `ShellHost` (pilote le cycle de vie du hub) + `AppHost` + `ControllerHost` (remplace `onInput`). Manette branchée = déblocage PLAY sur desktop (autorité déjà locale). **Câblé et build/smoke verts — pilotage réel du flock à valider sur device.**
- [x] Supprimer `CommandBuffer.ts`, `InputProxy.ts`.
- [x] Tests `tests/unit/input/` — deadzone, `stickReducer`, arbitrage hub (rAF simulé, sources factices). **44/44 verts, typecheck vert, build vert, smoke vert.**
- [→] `DevKeyboardSource` **déplacé en Phase 4** (a besoin du seam `initDev` ; `attachKeyboardSimControls` reste tel quel d'ici là).

### Phase 3 — Décomposition AppHost (structural, zéro régression) — ✅ livrée
- [x] Extraits `boot/deviceBenchmark.ts` (benchmark + topologie), `boot/renderThread.ts` (canvas/offscreen/worker/init + miroir survol UI), `boot/simControl.ts` (façade sim différée).
- [x] Extraits `setup/pairing.ts` (shell + hub + pairing + handoff + scanner + setSendToAsm ; holders & circularité internes), `setup/screens.ts` (AppState → showScreen + start/stop sim), `setup/soloMode.ts` (déblocage solo tactile OU manette + gate orientation).
- [x] `AppHost.start()` → séquence d'étapes nommées, ordre préservé (setShellContext avant setSendToAsm ; sim créée avant handoff). **448 → 152 lignes.**
- [x] Extraction mécanique, zéro changement de comportement : typecheck + 44 tests + build + **smoke vert**.
- [→] `AppHost` retournera `{ …, inputHub, simControl }` en **Phase 4** (quand `initDev` en aura besoin). `?dev` reste inline d'ici là.
- [ ] **À re-valider manuellement** (hors couverture smoke) : pairing 2-devices + handoff + scanner « use as controller ». Manette desktop : re-tester (chemin déplacé dans `setup/soloMode`).

### Phase 4 — Câblage partagé + dev + vérif finale — ✅ livrée (code)
- [x] `boot/input.ts` = `setupInput({ axisSink, joysticksView })` (hub + sources). **`ShellHost` le possède** → les deux hosts passent juste un `axisSink` : littéralement « mêmes inputs partout ». Le hub est exposé via `ShellHost.inputHub` → remonté par `setupPairing` → `AppHost.start()` retourne `{ …, inputHub, simControl }`.
- [x] `src/_dev/input/DevKeyboardSource.ts` — clavier WASD/flèches en `InputSource` (miroir de `src/input/`).
- [x] Bloc `?dev` migré → `src/_dev/app/devController.ts`, appelé par `initDev` (register `DevKeyboardSource` dans le hub + unlock simulé + snapshot C/R). `attachKeyboardSimControls` retiré du chemin prod. **Zéro import `_dev` statique en prod** (seule porte : `import.meta.env.DEV` dans `main.ts`).
- [x] Verts : tsc, eslint, 44 tests, build, smoke.
- [ ] **Vérif device réelle (en attente)** : manette 2 marques (agnosticisme), arbitrage manette↔tactile, non-régression tactile, pairing 2-devices + handoff, garde légèreté `?r=` (Playwright).

## Fichiers critiques
- `src/app/pairingHost.ts:208` (`sendInput`) — seam d'axes, **inchangé**, devient l'`axisSink` du hub.
- `src/app/AppHost.ts` — éclaté en `boot/*` + `setup/*` ; devient chef d'orchestre ; retourne `{ …, inputHub, simControl }`.
- `src/app/ControllerHost.ts:72-89` — consomme `setupInput` partagé à la place du `onInput` direct.
- `src/app/shell/components/Joysticks.ts` → `JoysticksView` (vue bête : clone template + applique `transform`) ; toute la logique part dans `input/sources/TouchSource.ts`.
- `src/main.ts:29-32`, `src/_dev/initDev.ts`, `src/_dev/app/devController.ts` — passer/register le hub + migrer le bloc `?dev`.
- `index.html:70` — ajouter `@include` du template joysticks.
- Configs : `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json` (découplage tests).

## Vérification (end-to-end)
- **Build vert** : `pnpm build` (validation mode workers §15).
- **Décompo AppHost = zéro régression** : refactor structurel pur → smoke des DEUX rôles (receiver desktop title→play→pause ; controller `?r=` pairing) identiques à avant. Diff comportemental attendu = nul.
- **Manette desktop** : brancher la manette, receiver → title → play, stick gauche pilote le flock (axes au SAB via hub) ; débrancher → axes à 0 (§A.6, pas d'axes fantômes). Tester avec au moins **2 marques différentes** si dispo → confirme l'agnosticisme (mapping "standard").
- **Arbitrage** : DevKeyboard (dev) + manette ; bouger l'un puis l'autre → latest-active-wins ; recentrage libère.
- **Non-régression tactile** : `?controller`, joysticks DOM (clonés du template) pilotent toujours via `TouchSource`, nub s'affiche.
- **Garde légèreté** : Playwright `?r=` ne régresse pas (hub + GamepadSource légers, aucun import render/sim ajouté).
- **Tests** : `pnpm test`.

## Hors périmètre (passes suivantes)
- Boutons/actions manette → `ActionId` → ring SAB (`pushAction`) + **encodage action sur le fil RTC** (extension `inputCodec.ts` + protocole canal). Réutilise le `lastState`/edge-detection du transcript.
- **Contrat de contrôle élargi** (2 sticks + ring d'actions → sim) + **reconnaisseur de séquences/combos côté `src/sim/`** (FSM/rolling-window), pour split & dash chargé. Remplace la réduction temporaire du hub.
- Manette appairée au **téléphone** (déjà supportée par le hub identique — juste à valider ; API Gamepad mobile + chemin actions-RTC).
- **Raccourcis clavier UI/système** (ENTER=pause, ESC=sortir pairing, flèches=nav menu pause) — couche shell dédiée, dispatch vers `appOrchestrator`, **jamais** dans `src/input/`.
- Rumble/gyro (extensions Chrome-only).
- Remapping utilisateur / profils manette.
