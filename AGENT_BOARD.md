# Tableau de Bord des Agents (AGENT_BOARD.md)

Ce fichier est le point de synchronisation partagé entre **Vous**, **Antigravity (Gemini)**, **Claude Code** et **GitHub Copilot**.

---

## 👥 Rôles & Responsabilités

| Agent                    | Force / Rôle                      | Usage Principal                                                                                                                               |
| :----------------------- | :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Antigravity (Gemini)** | **L'Architecte & Rédacteur Tech** | Conception haut de niveau, modélisation, calculs complexes, documentation technique (`docs/`), rédaction de plans d'action.                   |
| **Claude Code**          | **Le Développeur Terminal (CLI)** | Écriture du code, exécution de scripts (`pnpm build`), gestion des dépendances, correction rapide d'erreurs TypeScript, refactoring local.    |
| **GitHub Copilot**       | **L'Assistant d'Édition Inline**  | Autocomplétion intelligente de code, génération de boilerplate (structures de base), et discussions rapides au curseur dans l'IDE.            |
| **NotebookLM**           | **Le Critique & Chercheur**       | Analyse et synthèse de la base de code, génération de résumés audio (podcasts), critique de designs complexes et résolution de bugs logiques. |

---

## 📋 Kanban Actif

### 🟥 À faire (Backlog)

- [ ] **Étape 4b du brief** (`docs/fable-brief-demo.md` §7) : micro-benchmark boot (<50ms), fusion de workers selon les cœurs, `?forceTier=low`.
- [ ] **Étape 5 du brief** : joysticks controller → sim via WebRTC (ring buffer SAB, CLAUDE.md §7). L'API `setMoveInput` du sim worker est le point de branchement.
- [ ] Intégrer Workbox dans le Service Worker pour le cache offline de l'App Shell (JS/CSS) (Non commencé).
- [ ] Séquencer le chargement : `warmUp('app')` puis `warmUp('game')` dans `AppOrchestrator` (Non commencé).

### 🟨 En cours (Active)

_(rien — en attente du go utilisateur pour l'étape 4b ou 5)_

### 🟩 Terminé (Done)

- [x] Création du pont dynamique `?monolith` dans `src/main.ts` et correction des appels dans `monolith.ts` (Antigravity).
- [x] Mode monolith complet et validé : UI cliquable, sim steppée, HMR OK (Claude Code, `9337be5`).
- [x] **Étape 3 du brief** — Boids + Havok en local (binding wasm brut, zéro Babylon dans `src/sim/`) (Claude Code, `9337be5`).
- [x] **Étape 4a du brief** — SAB câblé Simulation Worker → Render Worker + `?dev` (Claude Code, `9337be5`). Issues GitHub #1/#2/#3 fermées.

---

## 💬 Journal des Décisions & Alignement

### [2026-07-06] Étapes 3+4a livrées — état du brief (Claude Code)

**Où on en est** : l'encadré d'avancement en tête de `docs/fable-brief-demo.md` est la **source de vérité** — étapes 0, 1, 2, 3 et 4a cochées (commit `9337be5`, branche `feature/title-screen-theatre`). Prochaine : **4b** (heuristique adaptative) puis **5** (joysticks RTC).

**Décisions structurantes prises (validées utilisateur)** :

- **Havok via le binding wasm brut (`hknp`)**, pas le plugin Babylon : `src/sim/` n'importe rien de Babylon, portable tel quel dans le worker. Tout est encapsulé dans `PhysicsEngine.ts` (bascule NullEngine possible sans toucher au reste si besoin).
- **SAB de bout en bout** : `GameSim` écrit les matrices 4x4 (layout `SAB_SECTION`/`SAB_BOID_STRIDE`), le render les lit en latest-wins sans Atomics (sim seule écrivaine). `BoidsRenderer` recopie dans un buffer local — **WebGL refuse les vues adossées à un SAB**.
- **`?dev`** (workers) et `?monolith` (mono-thread) donnent le même flow dev : START GAME direct + clavier WASD. Les deux sont sous `import.meta.env.DEV` — en prod, la garde `hasController` reste le seul chemin vers `IN_GAME` (vérifié : un `PLAY` forcé reste bloqué).
- Sim worker **receiver uniquement** (autorité unique du game state, CLAUDE.md §4), spawn au boot pour précharger le wasm pendant le title.

**Pièges pour le prochain agent** (détail dans la mémoire Claude + brief) :

- Le playbook CLAUDE.md §15 s'applique à CHAQUE étape : critique d'architecture + **attendre le go utilisateur** avant d'implémenter.
- En monolith : `engine.getDeltaTime()` Babylon reste à 0 (boucle custom), `self.fonts` n'existe pas sur le main thread (`ui/registerFontFace.ts`), et l'EventSystem Pixi exige la réaffirmation de `rootBoundary.rootTarget` + `setHardwareScalingLevel(1/dpr)`.
- Visuels boids/props = placeholders volontaires (cônes/boîtes) — assets custom à l'étape 7.



### [2026-07-05] Intégration du Mode Monolith (Antigravity)

- **Décision** : Ajout du routage dans `main.ts` pour charger le mode monolithique via `?monolith` sans instancier les workers.
- **Impact** : Permet le support natif du HMR en cours de dev. En production, tout le code de dev de `_dev/` est éliminé par tree-shaking grâce au gardiennage par `import.meta.env.DEV`.
- **Prochaine étape** : Lancer `pnpm dev` et ouvrir `http://localhost:5173/?monolith` pour valider le rendu du poisson et des menus PixiJS.
