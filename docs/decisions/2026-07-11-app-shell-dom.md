# 2026-07-11 — Le shell applicatif passe en DOM/CSS ; le jeu reste en Pixi/Babylon

## Question tranchée

Toute l'UI (title, joysticks, pairing, toasts, rotate) était rendue en **PixiJS dans le
render worker**, partageant le contexte WebGL de Babylon. Un **controller pur** (téléphone =
manette) devait donc charger tout le stack lourd (Babylon ~1.7 Mo + Havok ~2 Mo + Pixi +
sim) pour n'afficher que pairing + joysticks → boot lent sur mobile.

## Décision

Séparer l'UI **par nature** :

- **Pixi/Babylon (render worker, esthétique pixelisée)** — le jeu + l'UI « esthétique de
  jeu » qui doit matcher le look pixelisé : **TITLE_SCREEN**, **PAUSE** (+ son flou WebGL,
  vraie dépendance), **HUD in-game**.
- **DOM/CSS (main thread, shell applicatif, net)** — **toasts, joysticks, rotate/black-cover,
  pairing**. Rendu net (un toast/joystick n'a pas à être pixelisé).

## Pourquoi

- **Perf** : un controller pur = QUE du shell = QUE du DOM → aucun canvas/Babylon/Havok
  (boot léger, le vrai fix mobile). Zéro draw-call GL pour l'UI, pas de pont pointer
  main→worker, pas de mesure de texte Pixi.
- **Clarté** : responsabilités séparées — shell applicatif (DOM, main) vs présentation de
  jeu (Pixi/Babylon, worker).
- **DX** : flexbox / transitions CSS / events natifs, bien plus rapide à itérer que Pixi.
- **La pixelisation n'existe pas encore** (`postProcess/unifiedPipeline.ts` était un stub
  vide) : ce refactor ne casse aucune frontière, il *définit* où elle ira (shell DOM
  par-dessus, jeu + title/pause pixelisés en dessous).

## Architecture

- **Shell root** DOM (`#shell-root`, `position:fixed; pointer-events:none`) par-dessus
  `#canvas` ; composants interactifs en `pointer-events:auto`.
- **`ShellHost`** (`src/app/shell/`) — pendant DOM de `RenderManager` : possède les
  composants, s'abonne à `appOrchestrator` (déjà sur le main), envoie les events en direct.
- **Pipeline d'input réutilisé tel quel** (aucune dépendance Pixi) : `stickReducer`,
  `controlChannel.writeAxes`, `inputCodec.encodeInput`, `sab-manager`. Les joysticks DOM
  appellent le sink `pairingHost.sendInput` (SAB local OU RTC) en direct.

## Phases

1. **Toasts + Rotate gate → DOM.** ✅ (2026-07-11)
2. **Joysticks → DOM** (dynamiques/flottants) + math dans `input/stickMath.ts`. ✅ (2026-07-11)
3. **Pairing overlay → DOM** (QR via dep `qrcode` rendu SVG, pastille, phases). ✅ (2026-07-12)
   `pairingHost` pousse un callback `onPhase(PairingStatus)` — plus aucune dépendance au
   render worker. `PairingOverlayScreen`/`PairingPanel`/`QR.ts` Pixi supprimés.
4. **Boot controller léger** : entry séparée `ControllerHost` choisie par `main.ts` (résolution
   de rôle avant le chargement du chunk) — un controller pur ne spawne ni render worker, ni
   Babylon, ni sim, ni SAB. ✅ (2026-07-12) Mesuré en build prod : `/?r=CODE` = 7 requêtes,
   zéro chunk lourd (~4 Mo évités). Dette : `PlayingOnPhoneScreen` (handoff receiver) reste
   Pixi — à migrer au recâblage du handoff.

## Conséquences / à mettre à jour

- **CLAUDE.md §9-10** : le canvas ne porte plus que le jeu + title/pause pixelisés ;
  l'exception « BOOT CSS-only » se généralise (tout le shell est DOM). À réviser quand les
  Phases 3-4 seront livrées.
- **Handoff** (`setGamepadGameMode`) : devenu no-op (gameMode auto en DOM) ; à recâbler sur
  le shell au handoff-in.
