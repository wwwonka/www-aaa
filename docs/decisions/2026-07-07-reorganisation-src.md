# Proposition (non appliquée) — réorganisation systématique de `src/`

> Statut : **proposition en attente**, rédigée le 2026-07-07. Rien de tout ceci n'est appliqué.
> Système retenu si on l'applique : dossier = thread, enforcement dependency-cruiser.

## Pourquoi

La structure actuelle (`app`, `core`, `input`, `ui`, `render`, `sim`, `audio`, `shared`) a dérivé de la cible CLAUDE.md §5 et ne suit aucun axe unique. Symptômes mesurés sur le graphe d'imports réel :

- `input/` mélange 3 threads : signaling Trystero (connectivité → system-host), `controlChannel`/`stickReducer` (schéma SAB + logique gamepad consommée par `ui/`), `CommandBuffer` (sim).
- `ui/` ↔ `render/` s'importent mutuellement (10 + 6 imports) alors que `ui` s'exécute dans le render worker.
- `core/AppOrchestrator` fuit ses types `AppState`/`AppEvent` dans app, render et ui ; `core/sab-manager` est importé par app et sim alors que CLAUDE.md exige "schémas SAB → shared".
- `app` vs `core` : frontière ambiguë, personne ne sait où ranger un nouveau fichier.

Objectif : un **système** où l'emplacement d'un fichier se déduit d'une règle, pas d'un jugement — règle vérifiée par l'outillage.

## Le système (4 règles)

### Règle 1 — Premier niveau : dossier = thread propriétaire

```
src/
├── main.ts          ← seul fichier à la racine (entrée Vite)
├── main/            ← thread main : boot, DOM, orchestration, input capture
├── system/          ← thread system-host : I/O async (assets, signaling, IDB)
├── sim/             ← thread sim : logique pure (boids, physique, dispatch input)
├── render/          ← thread render : Babylon + Pixi + UI écrans/panels
├── audio/           ← thread audio
├── shared/          ← contrats inter-threads (aucun état, aucun DOM/rendu)
└── _dev/            ← inchangé, jamais shippé
```

Un fichier va dans le dossier du thread **qui exécute son code**. S'il est exécuté par plusieurs threads, c'est un contrat → `shared/`.

### Règle 2 — Deuxième niveau : forme identique ("fractale") dans chaque dossier thread

```
<thread>/
├── <thread>.worker.ts   ← entrée du thread (pour main/ : AppHost.ts, lancé par main.ts)
├── <Nom>Manager.ts      ← l'orchestrateur du thread (1 seul), à la racine du dossier
├── <responsabilité>/    ← sous-dossiers par responsabilité
│   ├── _index.ts        ← barrel = API publique du sous-dossier (convention déjà en place)
│   └── types.ts         ← types locaux colocalisés (jamais dans shared/ s'ils ne traversent pas)
```

Nommage (déjà majoritaire, rendu obligatoire) :
- `PascalCase.ts` = module dont l'export principal est une classe/factory à état.
- `camelCase.ts` = module de fonctions pures / utilitaires.
- `*.worker.ts` = uniquement les vrais entry points de worker.
- Profondeur max : 2 niveaux sous le dossier thread (un 3ᵉ niveau = signal qu'un sous-dossier doit devenir une responsabilité à part).

### Règle 3 — `shared/` organisé par nature de contrat

```
shared/
├── sab/               ← schémas + canaux SAB : sab-manager, controlChannel, (futur ring buffer input)
├── messages/          ← types postMessage/Comlink : SimToRenderMessage, SystemHostApi, SimulationWorkerApi…
├── state/             ← types de la FSM app : AppState, AppEvent (extraits d'AppOrchestrator)
├── signaling/types.ts ← types pairing (DiscoveredPeer, PeerRole…) — les impls restent dans system/
├── config.ts  constants.ts  types.ts
```

Admission dans `shared/` : types, constantes, fonctions pures de sérialisation/layout. Zéro import vers un dossier thread, zéro état module-level.

### Règle 4 — Graphe d'imports autorisé (vérifié par dependency-cruiser)

```
tout dossier      → shared/        ✅
main/             → <thread>/      ✅ types only (import type) + création des workers
<thread A>/       → <thread B>/    ❌ (hot loop = SAB, init = postMessage, jamais d'import)
shared/           → n'importe quoi ❌
_dev/             → tout           ✅ (mais rien n'importe _dev/ hors initDev sous import.meta.env.DEV)
```

Exception explicite à déclarer : `render/render.worker.ts → sim/simHost` (stratégie adaptative — sim inline dans le render worker sur devices faibles, cf. `docs/architecture/worker-adaptive-strategy.md`).

## Mapping migration (git mv, historique préservé)

| Actuel | Nouveau |
|---|---|
| `app/*` (AppHost, events, guards, platform, pairingHost) | `main/*` |
| `core/AppOrchestrator.ts` | `main/orchestrator/` ; types `AppState`/`AppEvent` → `shared/state/` |
| `core/{AssetsManager,assetDb,assetPath,SystemHost.worker,SystemAllocator,systems/}` | `system/` (assets → `system/assets/`) |
| `core/sab-manager.ts` | `shared/sab/sabManager.ts` |
| `core/gameLoop.ts` (stub) | `sim/` |
| `input/signaling/{PairingChannel,identity}` | `system/signaling/` ; `signaling/types.ts` → `shared/signaling/types.ts` |
| `input/controlChannel.ts` | `shared/sab/controlChannel.ts` |
| `input/stickReducer.ts` | `render/ui/input/stickReducer.ts` (consommé par GamepadScreen) |
| `input/{CommandBuffer,InputProxy}` | `sim/input/` |
| `ui/*` | `render/ui/*` (résout le cycle ui↔render) |
| `sim/`, `render/`, `audio/`, `shared/` existants | inchangés |

Plus : alias Vite + tsconfig `paths` (`@shared`, `@main`, `@system`, `@sim`, `@render`, `@audio`, comme le `@dev` existant) pour tuer les `../../..`.

## Étapes d'exécution (le jour où on le fait)

1. **Extraire les contrats** (aucun déplacement) : `AppState`/`AppEvent` → `shared/state/`, `SimulationWorkerApi`/`SystemHostApi` → `shared/messages/`. Build vert.
2. **git mv par vagues** (1 vague = 1 commit) : ① `core` → `system` + `shared/sab` ; ② `app` → `main` ; ③ `ui` → `render/ui` ; ④ dissolution `input/`. Build + typecheck verts après chaque vague.
3. **Alias** dans `vite.config.ts` + `tsconfig.json`, réécriture des imports profonds.
4. **dependency-cruiser** : `pnpm add -D dependency-cruiser`, `.dependency-cruiser.cjs` encodant la Règle 4, script `pnpm lint:arch` branché au check existant.
5. **Docs** : CLAUDE.md §5 (la cible devient la réalité), réécrire `docs/architecture/src-layout.md` (déjà obsolète : mentionne `src/simulation/`, `pixiGameUI` inexistants), règle fractale dans `docs/architecture/code-conventions.md`.

## Risques / points d'attention

- **Chemins des workers Vite** (`new Worker(new URL(...))`) : vérifier chaque URL après déplacement ; le smoke test iOS (limite WebKit module workers) est le vrai juge.
- **Working tree** : migration sur branche dédiée, working tree propre, sinon collision avec les modifs en cours.
- **Theatre.js** : `_dev/@theatre` référence `render/animation` — re-tester l'export `.anim` après la vague ③.

## Vérification

1. `pnpm build` + typecheck verts après chaque vague.
2. `pnpm lint:arch` vert — et test inverse : un import `sim → render` temporaire doit faire échouer.
3. Smoke flow complet en mode workers (jamais monolith, CLAUDE.md §13) : BOOT → TITLE_SCREEN → pairing `?controller` → IN_GAME, desktop + iOS.
4. Playwright (`tests/`) vert.
5. `git log --follow` sur un fichier déplacé confirme l'historique.
