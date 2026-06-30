# Worker Adaptive Strategy

## Contexte

Sur un appareil à 2 cœurs physiques, exécuter 4 workers + Main Thread génère du context switching
massif qui peut réduire les performances de plus de 50%. L'architecture doit détecter les capacités
matérielles et adapter le nombre de threads actifs.

## Hiérarchie de décision

```
hardwareConcurrency <= 2  →  1 unified worker  (simulation + render + audio séquentiels)
hardwareConcurrency <= 4  →  2 workers max     (render + simulation ; audio inline dans sim)
hardwareConcurrency > 4   →  3 workers dédiés  (architecture nominale)
```

Note : `hardwareConcurrency` retourne des *logical cores* (avec hyperthreading), pas des
performance cores. C'est un proxy imparfait — un Snapdragon 4 cœurs lents et un A-series
6 cœurs efficaces peuvent déclarer le même nombre. Utile comme heuristique, pas comme garantie.

Un appareil à 1 cœur logique n'existe pas en pratique en 2025 — le plancher réel est 2.

## Règle N-1

Ne jamais saturer tous les cœurs logiques rapportés. Laisser toujours au moins un cœur libre
pour le Main Thread UI et les tâches système de l'OS.

## Le Unified Worker

Sur appareils ≤ 2 cœurs, un seul worker exécute séquentiellement : simulation → render → audio.

Points d'implémentation :
- Pas de `requestAnimationFrame` dans un worker — utiliser `MessageChannel` ou `setTimeout`
- Le SAB reste identique : les managers lisent/écrivent les mêmes buffers, dans le même thread
- `OffscreenCanvas` doit être passé sans `transferControlToOffscreen` si le canvas reste sur
  le main thread en mode dégradé — à trancher lors de l'implémentation

## Ce qui n'est PAS dans le scope

- **Job Pool / Piscina** — pertinent pour du task parallelism (beaucoup de petites tâches
  indépendantes). Nos workers sont des subsystems persistants avec boucle de jeu. Complexité
  sans bénéfice tant qu'on n'a pas de tâches vraiment parallélisables (ex: pathfinding 1000 agents).
- **Contrôle des P-Cores / E-Cores** — impossible en Web. L'OS décide. Pas actionnable.

## Priorité d'implémentation

Cette stratégie est secondaire par rapport à :
1. Budget de frame explicite par worker (simulation ≤ X ms, render ≤ Y ms)
2. LOD de simulation dynamique si le budget est dépassé

Le unified worker est une micro-optimisation si les workers individuels sont mal calibrés.

## Où ça vit dans le code

```
src/app/
  platform/
    workerStrategy.ts   ← détecte hardwareConcurrency, retourne le mode
  workers/
    dedicated/          ← lance render + simulation + audio séparément
    unified/            ← lance un seul worker agrégateur
  AppHost.ts            ← lit la stratégie, délègue, ne sait plus si unifié ou dédié
```

## ⚠️ Mise à jour — `assetsManager.worker.ts` n'est pas dans cette hiérarchie

Un worker dédié pour l'AssetsManager existe déjà (`src/core/assetsManager.worker.ts`, voir
`docs/assets-manager.md`) — codé en dur (`new Worker(...)` dans `AppHost.ts`), pas soumis à la
stratégie adaptive ci-dessus. Sur un appareil à 2 cœurs, on a donc déjà 3 threads (Main + Render +
AssetsManager) sans même compter Simulation/Audio pas encore implémentés — exactement le scénario que
ce doc met en garde. À trancher avant d'ajouter d'autres workers dédiés : soit l'AssetsManager rejoint
un worker partagé en mode dégradé, soit la hiérarchie de décision ci-dessus doit compter tous les
systèmes (pas seulement render/simulation/audio) pour rester valide.

Non implémenté — à faire après que la simulation et le render soient fonctionnels et profilés.
