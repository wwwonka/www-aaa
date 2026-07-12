# Systèmes du jeu

Inspiré de *Game Programming Patterns* (Nystrom) et *Going the Distance with Babylon.js* (Elster).

---

## 1. Asset Loader
- Service Locator pour accès centralisé sans couplage direct
- `SceneLoader.ImportMeshAsync` + `AssetManager` wrappés en Promises
- Tree shaking ES6 — importer uniquement les modules Babylon.js nécessaires (>50% de réduction de bundle possible)
- Couplé au Service Worker (Workbox) pour servir glTF/textures depuis le cache

## 2. Cerveau des Boids
- **Spatial Partitioning** (Grid ou Octree) — critique, sans ça O(n²) est injouable sur mobile au-delà de ~200 boids
- **Data Locality** — positions et vitesses dans des tableaux contigus (le SAB), pas dans des objets Boid individuels
- **LOD (Level of Detail)** — les boids loin de la caméra n'exécutent pas les 3 règles complètes. Gain potentiellement équivalent au Spatial Partitioning
- **Thin Instances** dans le Render Worker — lecture directe du SAB, zéro objet JS par boid côté rendu

## 3. Gestion d'État et Inputs
- **FSM classique par switch/enum** — pas de generators JS (overhead de contexte trop élevé frame-by-frame dans le Simulation Worker)
- États : `TITLE | GAME | PAUSE`
- **Command Pattern** pour les inputs (WebRTC + Gamepad) — transforme les inputs bruts en commandes réifiées avant écriture dans le SAB
- ⚠️ Les objets Command doivent venir d'un **Object Pool** — sinon les allocations frame-by-frame contredisent le point 5

## 4. Système Audio
- Event Queue circulaire dans le SAB — le Simulation Worker pousse des triggers, jamais de son directement
- Agrégateur dans le Audio Worker — 50 collisions simultanées = 1 son d'impact modulé, pas 50 sons

## 5. Mémoire et Fluidité
- **Object Pool** — zéro `new` dans les boucles (boids, commandes d'input, particules, vecteurs)
- **Dirty Flag** — utile pour les objets d'environnement statiques. Inutile pour les boids (bougent tous à chaque frame)
