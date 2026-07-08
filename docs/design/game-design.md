# Game design — l'évasion du banc (titre de travail)

> Source : réponses de l'utilisateur (juillet 2026). Ce document est la référence
> narrative/mécanique/esthétique du jeu. Statuts : ✅ LIVRÉ (codé et vérifié),
> 🎯 CIBLE (design validé, aucun code). Voir `docs/onboarding.md` §0.1 pour le
> contrat de lecture, et `docs/progress/fable-brief-demo.md` pour l'état d'avancement technique.

## Pitch

Un banc de poissons s'évade d'une pisciculture pour retrouver l'océan. Le joueur ne
contrôle pas un poisson : il contrôle **le banc** — une masse vivante de boids pilotée
aux deux joysticks.

## Vue & rendu

- **Top-down**, rendu par un vrai moteur 3D. 🎯 Une passe de post-processing
  **pixelise la scène** pour un look « Super Nintendo avant-garde » : lisible comme un
  jeu 16-bit, éclairé et animé comme un jeu moderne. Point d'ancrage prévu :
  `src/render/postProcess/unifiedPipeline.ts` (placeholder vide aujourd'hui).
- La profondeur reste réelle : le flock est une **masse 3D avec des étages** — les
  poissons ne nagent pas tous au même plan. 🎯 La contrainte de rendu est de préserver
  la lisibilité top-down (caméra, tri visuel par étage). La simulation, elle, est déjà
  en 3D (Havok ✅).

## Boucle de jeu

Trois piliers mécaniques, tous au cœur du jeu :

1. **Guider le banc (herding)** — le contrôle indirect du groupe via la sphère
   directrice EST le gameplay. ✅ base codée (`src/sim/GameSim.ts`, `targetPosition`).
2. **Pousser / manipuler des objets** — la masse du banc comme outil physique. ✅ base
   codée (props Havok poussables, `PROP_DEFS` dans `src/shared/config.ts`).
3. **Survie / prédateurs** — des menaces dispersent ou mangent le banc ; le joueur
   protège et reforme le groupe. 🎯

## Les moves (2 joysticks) — 🎯

Le vocabulaire de jeu se construit sur des gestes à deux sticks, lus côté simulation :

- **Split** : quand les deux joysticks pointent dans des directions différentes, le
  flock se **divise en deux groupes**, chacun suivant sa propre cible.
- **Dash chargé** : hold & swipe des deux sticks dans une direction = les poissons se
  « chargent », puis **dashent** dans la direction calculée comme la **moyenne des deux
  directions** des sticks.
- D'autres moves viendront enrichir ce vocabulaire.

Règle d'architecture associée (voir `docs/onboarding.md` §2) : le futur ring buffer
d'input transporte des **axes bruts** ; la reconnaissance de gestes (divergence des
sticks, hold & swipe) vit côté sim, dans le dispatcher — jamais côté controller.

## Progression — 🎯

On commence **seul poisson**. Les autres se joignent au flock au fil des rencontres :
le banc s'accumule, grandit, devient une force. (Le `BOID_COUNT` fixe actuel — 24 —
est un paramètre de démo, pas une règle de jeu.)

## Scénario & styles de jeu — 🎯

Le banc s'évade d'une **pisciculture** pour retrouver l'océan. En chemin, il renverse
la pisciculture elle-même ; les humains, d'abord surpris, ne se laisseront pas faire.

Deux styles jouables, au choix du joueur, sur tout le parcours :

- **Stealth** — passer inaperçu, contourner, s'échapper sans bruit.
- **Bulldozer** — tout détruire sur son passage, assumer le chaos.

## Direction artistique — 🎯

- **Monde parallèle : une Asie à la Renaissance.** Pas une pisciculture moderne — tout
  y est construit en **bambou**. Du métal pourra s'intégrer progressivement,
  peut-être au fil de la progression du jeu.
- Références visuelles (images d'inspiration trouvées en ligne par l'utilisateur, non
  versionnées) : scènes d'eau vues du dessus, nénuphars, barques, palette de verts et
  de teals, accents orange koi, lumière douce et picturale.
- L'esthétique finale passe par la pixelisation (voir Vue & rendu) : penser les
  couleurs et les silhouettes pour qu'elles restent lisibles une fois pixelisées.
- Les visuels actuels (sphères, boîtes, poisson du title) sont des **placeholders
  volontaires** (assets custom prévus à l'étape 7 du brief).

## Vision & arbitrages

- Contrôler un flock de boids est une vieille idée chère à l'utilisateur ; ce jeu
  « 2D » top-down est le premier véhicule de cette idée, avant d'autres jeux.
- L'objectif est double et hiérarchisé : **prouver que le navigateur peut être une
  console** qui atteint le niveau de magie et de polissage visé — dans le **contenant**
  (boot, écrans, transitions, pairing) comme dans le **contenu** (le jeu) — et
  construire ce socle comme un **moteur réutilisable** : un proof of concept
  élargissable pour que d'autres jeux ciblent directement le browser.
- En cas d'arbitrage, l'ordre de CLAUDE.md §2 s'applique ; le polissage n'est jamais
  optionnel — c'est la thèse même du projet.

## Implications moteur (design → contraintes techniques)

| Design                              | Contrainte moteur                                                                                                                                                                       | Statut |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Split du flock en 2 groupes         | `targetPosition` (une seule cible vec3 dans `src/sim/GameSim.ts`) devient 2 cibles + id de groupe par boid — candidat : section STATES du SAB déjà réservée (`src/core/sab-manager.ts`) | 🎯     |
| Moves (charge/dash, split)          | ring buffer d'input (étape 5) = axes bruts ; reconnaissance de gestes dans le dispatcher sim                                                                                            | 🎯     |
| Pixelisation SNES avant-garde       | passe de post-process (`src/render/postProcess/`) ; résolution interne réduite = levier de perf                                                                                         | 🎯     |
| Flock à étages, lisible en top-down | boids déjà simulés en 3D ✅ ; caméra top-down + tri visuel par étage à concevoir                                                                                                        | 🎯     |
| Banc qui grandit (1 → N poissons)   | `BOID_COUNT` devient dynamique ; le layout SAB doit être dimensionné au max ou re-négocié entre threads                                                                                 | 🎯     |
| Destructibles (style bulldozer)     | promotion décoratif → collidable : gotcha documenté dans `docs/architecture/worker-responsibilities.md`                                                                                              | 🎯     |
