# Code Conventions

## Classes vs Fonctions

### Utilise une classe quand :

- Il y a un état interne qui évolue dans le temps
- Il y a un cycle de vie (`init`, `update`, `destroy`)
- Plusieurs instances coexistent (ex: chaque Boid)

### Utilise une fonction quand :

- C'est une transformation pure (input → output)
- C'est une utilité appelée une fois ou rarement
- Il n'y a qu'un seul "exemplaire" (pas besoin de class singleton)

```ts
// CLASSE — état + cycle de vie + instances multiples
class BoidPool { ... }
class FSM { ... }
class AudioAggregator { ... }

// FONCTION — pure, sans état
detectRuntimeContext()
createSAB(boidCount)
computeSeparation(boids, i)
```

⚠️ Éviter les "classes utilitaires" avec uniquement des méthodes statiques —
c'est un namespace déguisé. Utiliser un module ES6 avec des fonctions exportées à la place.

---

## Nommage

| Cas                             | Convention                       | Exemple                                |
| ------------------------------- | -------------------------------- | -------------------------------------- |
| Classes                         | PascalCase                       | `BoidPool`, `AudioAggregator`          |
| Fichiers de classe              | PascalCase                       | `BoidPool.ts`                          |
| Fonctions, variables, instances | camelCase                        | `detectRuntimeContext()`, `sabManager` |
| Fichiers utilitaires            | camelCase                        | `sab-manager.ts`, `constants.ts`       |
| Workers                         | camelCase + suffixe `.worker.ts` | `simulation.worker.ts`                 |
| Constantes globales             | SCREAMING_SNAKE_CASE             | `SAB_BOID_STRIDE`                      |

---

## Commentaires

Commenter uniquement le _pourquoi_ — jamais le _quoi_.
Un bon commentaire explique une contrainte cachée, un gotcha, ou un choix non-obvious.

```ts
// ✓ — explique une contrainte non-obvious
// UA fallback uniquement pour iOS/Android — pas de feature check fiable sur ces plateformes

// ✗ — décrit ce que le code dit déjà
// Vérifie si l'utilisateur est sur iOS
if (/iPhone|iPad/.test(ua)) { ... }
```

---

## Conventions Babylon.js

Le codebase est Babylon-first — ces règles s'ajoutent aux conventions ci-dessus, sans les
contredire :

- Pas de préfixe `I` sur les interfaces (`PeerConnection`, pas `IPeerConnection`).
- Champs privés/protégés préfixés `_` (`this._engine`).
- **Zéro allocation dans les boucles chaudes** (rendu, simulation) : jamais
  `position.add(velocity)` dans une boucle — utiliser `position.addInPlace(velocity)` ou
  `position.addToRef(velocity, target)`.
- Builders/méthodes statiques de création plutôt que constructeurs surchargés d'options
  (`MeshBuilder.CreateGround(...)`).
- TypeScript strict : jamais `any`, `Nullable<T>` si le type est inconnu, `readonly`
  explicite sur les propriétés immuables, type de retour explicite sur les méthodes
  publiques.

## Formatage

Aligner visuellement les déclarations de variables et imports similaires (signes `=`,
types) quand ça améliore la lisibilité d'un bloc homogène.

---

## Modules

Chaque worker est un module ES6 autonome avec son propre point d'entrée (`*.worker.ts`).
Le dossier `shared/` est le seul code importé par plusieurs workers — garder ce dossier
strictement sans effets de bord (pas d'état global, pas d'imports Babylon/Pixi/etc.).
