# Responsabilités des Workers

## Simulation Worker — La Vérité

Tout ce qui a un état logique de jeu. Producteur du SAB.

| Système | Raison |
|---------|--------|
| Havok + IA des boids | État physique, déterminisme |
| Triggers et zones | Influencent le gameplay |
| Objets destructibles | Changement d'état (santé, activation) |
| Animations logiques | Position "maître" des objets sur courbe (les boids doivent les éviter) |

## Render Worker — L'Illusion

Consommateur pur du SAB. Aucun état de jeu.

| Système | Raison |
|---------|--------|
| Skybox / environnement | Pas d'interaction physique, libère des cycles CPU dans Simulation |
| Particules cosmétiques | Étincelles, bulles — GPU uniquement, zéro collision |
| Post-processing | Bloom, God Rays — aucun impact sur la simulation |

## ⚠️ Gotcha — Promotion d'objets

Un objet décoratif (ex: plante) qui devient collidable doit être "promu" dans le
Simulation Worker pour que Havok puisse créer son corps physique.
Prévoir cette possibilité dès la conception du SceneManager.

## Moteur physique

Havok (via `@babylonjs/havok`) — intégré à Babylon.js, tourne dans le Simulation Worker.
