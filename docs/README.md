# Index de la documentation

Point d'entrée unique. `CLAUDE.md` dit *quoi* (règles), ce dossier dit *comment*
et *pourquoi*. Quatre natures de documents, quatre dossiers — ne pas mélanger.

## Par où commencer

**`onboarding.md`** — à lire en premier par tout nouvel agent/dev. Manière de
penser le projet ("console, pas page web"), war stories, état réel vs cible,
anti-hallucination.

## `architecture/` — référence stable

Décrit *comment le système fonctionne aujourd'hui*. Mis à jour en place quand
le code change ; jamais dupliqué ; jamais un journal.

- `src-layout.md` — structure réelle du code (`app`/`core`/`sim`/`render`...).
- `threading-model.md` — les threads, ce qui tourne où.
- `worker-responsibilities.md` — règle des classes portables entre threads.
- `worker-adaptive-strategy.md` — heuristique du nombre de workers selon le device.
- `system-allocator.md` — placement worker/inline des systèmes agiles.
- `render-stack.md` — composition Babylon + Pixi sur un seul contexte GL.
- `animation-pipeline.md` — Theatre.js (dev) → `.anim` binaire (prod).
- `assets-manager.md` — chargement d'assets, IndexedDB, warmUp.
- `ui-composition.md` — composition des écrans UI.
- `systems.md` — vue d'ensemble des systèmes.
- `code-conventions.md` — naming, classes vs fonctions, conventions Babylon.js.
- `dev-tooling.md` — outillage `_dev/` / `src/_dev/`.

## `design/` — le jeu

- `game-design.md` — mécanique, moves, scénario, esthétique, implications moteur.

## `decisions/` — write-once, datées

Une question tranchée, jamais réécrite après coup. Si la décision change :
nouveau fichier qui référence l'ancien, pas une édition en place.

- `2026-07-05-shared-webgl-context-investigation.md` — pourquoi Pixi disparaissait
  frame 2 (conflit VAO avec Babylon).
- `2026-07-07-reorganisation-src.md` — proposition de réorganisation de `src/`.

## `progress/` — vivant, se périme vite

Jamais "la vérité archi actuelle" (ça, c'est `architecture/`). Mis à jour en
continu au fil des étapes livrées.

- `fable-brief-demo.md` — **source de vérité de l'état d'avancement** (coché,
  daté, prochaine étape, pièges pour le prochain agent).
- `design-etapes-5-6.md` — conception des étapes 5 (joysticks/transport RTC)
  et 6 (handoff snapshot/ACK), jusqu'à leur livraison.

## Règle d'ajout

Nouveau doc → il va dans un seul de ces quatre dossiers, selon sa nature (pas
son sujet). Une doc qui mélange référence stable et journal doit être coupée
en deux avant d'être rangée.
