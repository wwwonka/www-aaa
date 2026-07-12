# IDEAS.md — Ce qui dort dans l'architecture

> Relecture croisée architecture × ambition (2026-07-07, Claude Fable 5) : ce que le moteur
> rend possible et que personne n'a encore décidé de faire. Le fil commun : chaque contrainte
> sévère du moteur (autorité unique, déterminisme, SAB, pixelisation) n'est pas un prix payé —
> c'est un mécanisme de jeu ou de DX que les moteurs « libres » ne peuvent pas offrir.
> Le jeu spécial n'est pas *malgré* l'architecture — il est *dedans*.

## 1. Le handoff diégétique — l'âme du jeu, pas de la plomberie

Tout le monde fait des jeux browser. Personne ne fait **un banc de poissons qui saute
physiquement de l'écran du salon vers le téléphone**.

- Le protocole snapshot+ACK (étape 6, `docs/progress/design-etapes-5-6.md` §B) rend la version
  diégétique possible : les poissons nagent vers le bord de l'écran desktop, disparaissent,
  émergent sur le phone.
- La scène Babylon n'est jamais détruite des deux côtés (invariant du brief §6) → l'animation
  de sortie/entrée est triviale. L'autorité unique n'interdit pas de *rendre* la transition
  des deux côtés — une seule sim steppe, les deux peuvent jouer une animation.
- Le moment « wow » de la démo est déjà payé par la contrainte technique la plus dure.
  Esprit Nintendo : la contrainte devient le geste magique.
- **Si une seule idée créative doit être faite, c'est celle-là.**

## 2. Save states d'émulateur gratuits — replay, rewind, ghosts

La sim déterministe (pas fixe 60 Hz, dispatcher séquentiel du ring d'input) + le snapshot
binaire de l'étape 6 = tous les ingrédients d'un **système de replay** sans rien ajouter au
moteur :

- Enregistrer le flux du ring d'actions + axes horodatés au step + un snapshot initial →
  rejouer n'importe quelle partie exactement.
- **DX** : bugs physiques reproductibles à l'identique (le cauchemar n°1 d'un moteur physique
  devient trivial) ; time-travel debugging ; sessions de test rejouables en CI/Playwright.
- **Gameplay/social** : ghosts partageables entre joueurs ; « rembobiner 5 secondes » comme
  mécanique (très cohérent avec un jeu d'évasion : réessayer un passage stealth raté).
- Aucun moteur web ne donne ça — parce qu'aucun n'a la discipline DOD/déterminisme du repo.

## 3. Le controller comme second écran (info asymétrique)

Le phone fait tourner le même stack de rendu que le receiver — et n'affiche aujourd'hui
qu'un fond noir avec START.

- Le phone montre ce que le banc **sent** (prédateurs proches, courants, « sonar ») pendant
  que le desktop montre ce que l'œil **voit**.
- Sert directement le pilier stealth du game design ; coût quasi nul (render worker déjà là).
- Rend l'expérience à deux écrans *nécessaire* plutôt que gadget.
- Extension audio (quand le worker audio existera) : spatialisation à deux devices — le banc
  sur les enceintes du desktop, le « battement de cœur »/charge du dash dans la main.

## 4. La pixelisation comme levier de puissance (pas juste une esthétique)

Le post-process « Super Nintendo » (résolution interne réduite) divise le coût fragment :

- À brancher sur le tier system (4b) : le tier low baisse la **résolution interne**, pas la
  qualité de sim. Un vieux téléphone garde 30 boids et la physique complète ; l'esthétique
  absorbe la dégradation.
- Personne ne remarque une pixelisation plus grosse dans un jeu déjà pixelisé.
- Point d'ancrage prévu : `src/render/postProcess/unifiedPipeline.ts` (stub).

## 5. Les moves « engagés » comme arme anti-latence

Le dash **chargé** (hold & swipe) masque entièrement les 20-40 ms du RTC : la latence
disparaît dans le geste de charge.

- Règle de design qui en découle : plus les gestes sont *engagés* (charge, commit, relâche)
  plutôt que twitch, plus le réseau devient invisible, plus c'est console.
- Le pilotage continu 2-sticks (étape 5) est la partie latence-sensible ; les moves spéciaux
  (split, dash) sont naturellement latence-immunisés. Pencher le design vers eux.

## 6. Gamepad réel avec le même game feel que le tactile

L'architecture 5a rend ça presque gratuit — la sim ne sait jamais qui parle :

- Gamepad API = main-thread only (même contrainte que RTC). Un `gamepadSampler` sur le main
  du receiver polle `navigator.getGamepads()` à ~60 Hz et émet **la même paire de sticks
  bruts** que les pads tactiles → même `stickReducer` → même `writeAxes`/`pushAction`.
  Le game feel identique vient de là : mêmes deadzone radiale, courbe de réponse,
  policy latest-wins, consommation 60 Hz.
- Écart réel à calibrer : un stick physique se recentre par ressort, un pouce sur verre
  traîne et sature à fond → même courbe de magnitude (quadratique) des deux côtés + léger
  lissage du tactile pour imiter le retour ressort.
- Les gestes se traduisent en `ActionId`, pas en périphériques : dash chargé = hold
  gâchette → relâche avec direction du stick ; double-tap-swipe (saut) = double bumper +
  flick. Le ring d'actions absorbe tout (CLAUDE.md §7).
- Haptique symétrique : `vibrationActuator` gamepad ≈ API vibration du phone.

## 7. Moves double-sticks — chaque move est un comportement réel de banc

Acquis (game design) : split/réunion (sticks divergents), poussée Zelda (foncer dans un
bloc), dash chargé destructeur (hold & swipe), saut hors de l'eau (double-tap swipe).
À ajouter — tous lisibles parce que les vrais bancs font ça :

1. **Bait ball** : deux sticks tirés l'un vers l'autre, maintenu → boule dense. Défense
   contre prédateurs ET masse ponctuelle accrue pour pousser lourd.
2. **L'étirement** : sticks opposés *maintenus* (vs le flick du split) → le banc s'étire en
   ligne pour passer tuyaux et grilles — l'outil d'infiltration d'une pisciculture.
3. **La tenaille** : après un split, stick gauche = groupe A, stick droit = groupe B (le
   layout deux-sticks EST un contrôleur de deux groupes). Converger des deux côtés d'un
   objet = le saisir/transporter, ou casser une coquille.
4. **Le tourbillon** : deux sticks en cercles synchrones → vortex qui aspire ;
   contre-rotation → bouclier.
5. **La vague** : alterner les sticks en rythme (comme une nage) → boost de vitesse.
   Expression de skill pur, signature de game feel — la vitesse se *gagne* au rythme.
6. **La feinte** : flick d'un stick pendant que l'autre tient le cap → quelques poissons
   partent en leurre pour détourner un prédateur.

## 8. Scénario 1→1000 — le nombre de poissons est barre de vie, skill tree et zoom Katamari

Les deux clés :

- **Le mass-gating est gratuit dans Havok** : chaque boid a une masse, la force collective
  croît avec le nombre. Une vanne que 30 poissons ne bougent pas, 300 la défoncent — sans
  scripting, la physique est la serrure et la clé. Level design = placer des objets dont la
  masse gate la progression.
- **Les moves se débloquent par population, pas par items** (Metroidvania biologique) :
  split impossible à 1 poisson, tenaille ~20, tourbillon ~50, saut collectif ~100 (les
  poissons se font rampe). L'accumulation EST l'arbre de compétences.

La pisciculture est naturellement compartimentée en échelles croissantes — le zoom-out
Katamari suit la géographie (caméra liée au compte de poissons) :

1. **L'écloserie (1→10)** — jarres et bacs céramique/bambou. Tutoriel : nager, pousser
   (renverser une jarre), premiers compagnons. Sortie par le tuyau de vidange = découverte
   de l'étirement.
2. **Les bassins (10→100)** — enfilade de bassins = salles de puzzle à la Zelda, un move
   requis par porte (split pour deux leviers, saut par-dessus une cloison basse quand la
   grille est infranchissable). Chaque bassin libéré = sa population rejoint le banc = un
   cran de zoom.
3. **Les canaux extérieurs (100→500)** — prédateurs (hérons frappant d'en haut : le saut
   devient risqué), filets, pompes créant des courants (la vague brille ici). Les deux
   styles s'ouvrent : défoncer les vannes de bambou au dash, ou passer de nuit en bait ball.
4. **Les cages en mer (500→1000)** — libérer les cousins d'élevage en masse ; le métal
   industriel (pompes, filets mécanisés) comme cœur du late-game — la « progression du
   métal » du game design. Final : le bateau de récolte et sa senne géante, combo forcé
   split + tourbillon + bait ball. Puis l'océan.

## 9. 1000 boids : LOD hybride, PAS de boids GPU

Les démos GPU (100k boids en compute) sont des flocks **render-only** — aucune interaction
physique par-poisson. Or le jeu repose dessus : les boids sont des corps Havok qui poussent
avec une masse réelle (mass-gating §8). Déplacer l'autorité des positions au GPU casserait :
le couplage Havok (readback GPU→CPU chaque step = LE goulot), le déterminisme (replay §2),
le snapshot de handoff (§1), l'autorité unique. **Décision : l'autorité reste CPU.**

La solution pour 1000+ : le **LOD hybride** (trick des jeux de foule) :

- ~100-200 boids « physiques » (corps Havok, près des interactions) + le reste en
  « cosmétiques » : steering pur SoA sans corps physique. La grille spatiale tient 1000
  boids de steering à 60 Hz ; c'est Havok à 1000 sphères qui plierait sur téléphone.
- Le mass-gating survit : zoomé loin (Katamari), personne ne voit quelle sardine touche la
  vanne — scaler la masse des proxys physiques avec le compte total.
- Pour 10 000+ poissons (scène finale océan) : flock GPU **côté render worker, purement
  visuel**, piloté par quelques points d'attraction venus de la sim. La sim reste
  l'autorité, le GPU amplifie l'image — zéro impact sur l'architecture.

## 10. Le site qui se métamorphose en console (le cheval de Troie PWA)

Le canon l'autorise déjà : **BOOT est la seule zone CSS/DOM permise** — l'étendre : le
« site normal » EST le boot screen.

- **Le scroll est déjà la plongée.** La page commence à la surface (ciel, la ferme vue de
  dehors) ; scroller = descendre sous l'eau, le fond s'assombrit, les sections de contenu
  sont des profondeurs. Au fond, le poisson-héros de la page (image DOM) se **morphe en
  title screen** — View Transitions API (FLIP de l'élément DOM vers sa position canvas,
  puis le canvas prend le relais). La page n'était pas une porte d'entrée : c'était le
  premier niveau.
- Cheval de Troie double : une page HTML scrollable est **indexable et partageable** — le
  jeu se distribue comme un lien, pas comme une install. Et le vecteur viral existe déjà :
  **le controller**. Personne n'installe un jeu inconnu, mais tout le monde scanne un QR
  chez un ami pour devenir la manette. Après la session : « emporte le jeu avec toi »
  (le handoff §1) → install prompt. La distribution passe par le jeu lui-même.
- Checklist native-like (au-delà de l'install prompt existant) :
  - `navigator.storage.persist()` — sinon iOS purge les ~19 Mo d'assets IndexedDB ;
  - **Wake Lock** — l'écran du phone-manette ne dort jamais pendant le jeu ;
  - orientation lock + fullscreen sur geste ;
  - haptique : `navigator.vibrate` (phone) / `vibrationActuator` (gamepad, §6) ;
  - Media Session API — le jeu visible sur l'écran de verrouillage ;
  - manifest : `display_override: window-controls-overlay` (desktop), `shortcuts`
    (« mode manette » direct) ;
  - **abandonner le pinch-resize** : une vraie app native ne se redimensionne pas au
    pinch ; le glitch de painting détruit plus d'illusion console qu'il n'en crée.

## 11. Boids niveau 2 — du steering au vivant

> Boussole de feeling : **Journey** (zen dansant), **Zelda** (liberté), **Tony Hawk**
> (l'exécution des moves comme expression de skill), **Katamari** (double stick + zoom-out).
> Diagnostic : les trois problèmes actuels (180° qui traverse le banc, collapse à l'idle,
> boids coincés derrière un obstacle) ont **la même cause racine** — le modèle
> « seek plein régime vers un point » de `BoidSimulation.ts`. Les fixes ci-dessous ne sont
> pas trois patchs : c'est un changement de modèle qui débloque aussi l'émergence.

### 11.1 La carotte au bout du bâton (fixe le 180° presque gratuitement)

Ne plus placer la sphère de contrôle en absolu : la placer **relative au centroïde du banc**.

- `sphere = centroïdeFlock + directionStick × rayonDeLead` — la sphère est un lapin toujours
  *devant* le banc, jamais *dedans*.
- Flip à 180° → la carotte apparaît instantanément de l'autre côté du banc → les poissons de
  la *queue* deviennent naturellement la *tête* (ils sont les plus proches de la nouvelle
  cible), exactement l'intention du joueur. Zéro cas spécial, zéro détection de flip.
- Le rayon de lead devient un paramètre de game feel (court = nerveux, long = paquebot) —
  et peut croître avec la population (Katamari : plus le banc est gros, plus il vire large).

### 11.2 La vague de virage (C-start en cascade — le moment murmuration)

Complément du 11.1 pour rendre le virage *spectaculaire* au lieu d'instantané :

- Détection : `dot(directionDésirée, vélocitéMoyenneBanc) < -0.6` → manœuvre de demi-tour.
- Chaque boid reçoit un délai `turnDelay[i] = distanceLeLongDeL'AncienAxe × k` : les poissons
  les plus proches de la nouvelle direction tournent d'abord, la rotation **se propage en
  vague** à travers le banc (les vrais poissons font des « C-starts » en cascade).
- Un seul tableau `Float32Array` de timers, décrémenté par step — DOD trivial.
- C'est LE geste Tony Hawk : un 180 bien claqué se *voit* onduler à travers 200 poissons.

### 11.3 Idle = milling (le tore de sardines, pas le collapse)

Quand les sticks sont neutres, ne pas éteindre le seek — le transformer :

- **Arrival** : le seek décélère dans un rayon autour de la cible (force → 0 au centre) au
  lieu du plein régime actuel — supprime déjà le collapse.
- **Biais tangentiel** : dans le rayon d'arrival, ajouter une composante perpendiculaire au
  vecteur vers-la-cible (signe fixé par boid, majorité dans le même sens) → le banc forme
  spontanément un **tore rotatif** — le « milling » des vrais bancs de sardines. C'est le
  screensaver du jeu : l'idle devient la plus belle image, pur Journey.
- **Respiration** : moduler `BOID_COHESION` par un sinus lent (~8 s) à l'idle → le tore se
  dilate/contracte comme s'il respirait.
- Micro-vie : 2-3 % des boids en état STRAGGLER volontaire — ils s'écartent nager/curioser
  puis reviennent. L'idle est un aquarium, pas une pause.

### 11.4 Context steering (fixe le coincement derrière les obstacles)

Le problème du boid coincé n'est pas un manque de force de répulsion — c'est un **minimum
local** : seek et répulsion s'annulent. La bonne réponse moderne : le **context steering**.

- Par boid : 8-16 directions échantillonnées ; une carte d'**intérêt** (dot avec la direction
  désirée) et une carte de **danger** (obstacles proches). On choisit la meilleure direction
  *non bloquée* au lieu d'additionner des forces contradictoires → le boid contourne au lieu
  de pousser dans le mur. 100 % SoA, aucune allocation.
- Coût du danger : pas de raycasts Havok par boid. Deux sources :
  - **SDF baké** de la géométrie statique du niveau (grille : distance + gradient vers
    l'obstacle le plus proche) → lookup O(1) par boid ;
  - objets dynamiques (jarres, vannes) : petit tableau de sphères/capsules répulsives
    analytiques, mis à jour depuis les corps Havok (ils sont peu nombreux).
- Filet de sécurité : watchdog anti-stuck — progrès vers la cible < seuil pendant N steps →
  état STRAGGLER → suivi de tangente le long du gradient du SDF jusqu'à revoir la cible.
- Bonus gameplay : un STRAGGLER « émet de la détresse » (visuel + audio) et attire les
  prédateurs → la maladresse du joueur crée de la tension, pas de la frustration.

### 11.5 Un octet d'état par boid (le mini-FSM qui débloque tout)

Un seul `Uint8Array` : SCHOOLING / TURNING / STUNNED / STRAGGLER / SCARED / IDLE_WANDER.

- **STUNNED** (le KO contre un mur, déjà voulu) : poids de steering → 0, le corps devient
  pur ragdoll Havok avec drag → il dérive, ventre en l'air, puis timer de réveil →
  STRAGGLER → burst de nage pour regagner le banc. Les autres, propulsés par l'impact,
  font une flash expansion (11.6). Aucun code spécial : c'est juste des poids par état.
- Le seuil de KO dépend de `vitesseImpact × masseLocale / nombreDeBoids` → foncer trop fort
  avec un banc trop petit assomme, le même mur avec 300 poissons cède (cohérent avec le
  mass-gating §8).

### 11.6 La contagion (l'algorithme n°1 du « vivant »)

Le secret des murmurations réelles : l'information se **propage de voisin en voisin**, elle
n'est pas globale. Un scalaire `panic[i]` (0..1) par boid :

- Impact/prédateur → `panic = 1` sur les boids touchés ; chaque step, un boid prend
  `max(panic[i], maxVoisins × 0.9)` ; decay exponentiel.
- La panique module les poids : séparation ↑↑, vitesse ↑, cohésion ↓ → **flash expansion**
  radiale puis re-compression quand la vague retombe — la signature visuelle des vrais bancs
  attaqués, gratuite, émergente.
- Le même canal propage tout : la panique, mais aussi l'excitation (dash réussi → onde de
  « joie » qui accélère les tail-beats), le calme (idle). Un seul mécanisme, dix effets.
- Version rendu : propager aussi une **phase de nage** de proche en proche → les coups de
  queue se synchronisent en vagues à travers le banc (+ shimmer d'écailles quand
  l'orientation change vite — le scintillement de murmuration, pur post-process).

### 11.7 Personnalité par boid (tuer l'uniformité robotique)

- Params seedés par boid : vitesse ±10 %, phase de wander, rayon de voisinage ±15 %,
  latéralité du milling. Un `Float32Array` de seeds, hashé à la création — déterministe,
  donc replay-safe (§2).
- Wander : `sin(t × freq[i] + phase[i])` en force latérale faible — pseudo-Perlin à coût nul.
- Quelques archétypes rares tirés au spawn : l'éclaireur (voisinage large, devant), le
  peureux (panic decay lent), le costaud (masse ×1.5, KO plus dur) → le joueur *reconnaît*
  des individus dans son banc. Attachement Katamari : ce ne sont plus des particules.

### 11.8 Slipstream (la vitesse se dessine)

- Un boid dans le sillage d'un autre (cône derrière, aligné) reçoit une réduction de drag →
  le banc forme spontanément des **diamants et des V** en vitesse de croisière, et le move
  « vague » (§7.5) a une justification physique : le rythme construit le train de sillages.
- Métrique déjà calculable gratuitement : la **polarisation** (norme de la vélocité moyenne
  normalisée) et le **moment angulaire** autour du centroïde classifient l'état du banc
  (schooling / milling / swarm) avec deux scalaires. Les brancher sur : les couches
  musicales (Journey — la musique suit la grâce du banc), le score de style des moves
  (Tony Hawk — un dash à polarisation 0.95 est « clean »), le shader (shimmer ∝ dérivée
  d'orientation).

### 11.9 Mémoire de danger (l'intelligence sans IA)

- Grille grossière (réutiliser `spatialPartitioning`) : `danger[cell] += impact/prédateur`,
  decay lent. Les boids ajoutent le gradient de cette grille à leur danger map (11.4).
- Résultat : le banc **évite l'endroit où il a eu mal** pendant ~30 s, contourne de lui-même
  la zone du héron → le joueur jurera que les poissons apprennent. Coût : une addition.

### Ordre de valeur suggéré

1. **11.1 carotte relative** (une ligne de math, fixe le 180°) → 2. **11.3 arrival+milling**
   (fixe l'idle, crée le screensaver) → 3. **11.6 contagion** (le plus gros gain de « vivant »
   par ligne de code) → 4. **11.4 context steering** (fixe les stucks) → 5. **11.5 FSM+KO**
   (mécanique déjà designée) → 6. le reste au fil de l'eau. Tous 100 % SoA/DOD, aucun ne
   touche l'architecture threads, tous replay-safe.

## 12. Le banc est l'orchestre (la bande-son n'existe pas — elle émerge)

L'idée folle : **ne pas composer de musique**. Le thread `audio` (prévu au canon §3, encore
vide) lit les *mêmes SAB* que le render — positions, vélocités, `panic[]`, états. Chaque
boid est **une voix d'un synthétiseur granulaire**. La musique du jeu n'est pas jouée
*pendant* la sim : elle est **la sonification de la sim elle-même**.

Le mapping tombe avec une justesse suspecte :

- **Position → espace sonore** : X = pan stéréo, et le flock 3D « à étages » (§1b) donne la
  hauteur *gratuitement* — la profondeur Y = l'octave. Un banc étalé en colonne = un accord ;
  un banc à plat = un unisson.
- **Polarisation → harmonie** : banc aligné (dash propre) = les grains se verrouillent sur
  une gamme pentatonique, consonance pure. Banc en vrac = cluster bruité. *La grâce
  s'entend.*
- **Milling (11.3) → arpège circulaire** : le tore d'idle fait tourner les voix dans le champ
  stéréo — le screensaver a sa berceuse, générée par sa propre géométrie.
- **Contagion (11.6) → la dissonance se propage physiquement** : la vague de panique
  traverse le banc *et le champ stéréo en même temps* — on entend la peur voyager de gauche
  à droite parce qu'elle voyage de gauche à droite.
- **Un poisson KO = une voix qui se tait.** À 12 poissons on entend le trou. Le compte de
  population (§8) devient de l'orchestration : 1 poisson = une flûte seule, 1000 = une masse
  chorale. Le zoom-out Katamari est aussi un crescendo.
- **Le chime Zelda émerge** : un move exécuté à polarisation > 0.9 fait converger les grains
  en un accord résolu — la récompense sonore du puzzle n'est pas un sample déclenché, c'est
  l'état du banc qui *devient* consonant.

Pourquoi c'est presque gratuit ici et hors de portée ailleurs : un moteur classique devrait
*streamer* l'état du jeu vers l'audio (latence, sérialisation). Ici l'audio worker mappe les
SAB existants et lit à 60 Hz ce que la sim écrit déjà — zéro copie, zéro message. Et le
déterminisme (§2) rend la partition rejouable : un replay rejoue *exactement la même
musique*. Partager un ghost, c'est partager un morceau.

Conséquence de design vertigineuse : les deux sticks sont un instrument. Journey te faisait
*écouter* la musique ; ici le joueur la *joue* sans le savoir — et un joueur skillé sonne
mieux qu'un débutant.

## 13. L'eau vivante — le champ de courants partagé (le substrat qui manque à tout)

Le trou commun des douze idées ci-dessus : le jeu se passe dans l'eau, et **l'eau n'existe
pas**. Les boids nagent dans un vide abstrait. L'idée : un **champ de courants** (flow
field) — grille 2D grossière de vecteurs vitesse (~64×64 vec2, 32 Ko), un seul
`Float32Array` dans le SAB — que la sim écrit et que **tous les workers lisent** : sim,
render, audio, et même le phone-controller. C'est la seule idée qui rétroagit sur les
autres au lieu de s'y ajouter : elle muscle §3, §8, §11.4 et §12.

### Technologie — pourquoi c'est presque gratuit ici et hors de portée ailleurs

- Advection + decay simples steppés dans le sim worker (semi-lagrangien light, pas de
  Navier-Stokes complet). 100 % SoA/DOD, déterministe donc replay-safe (§2), inclus dans
  le snapshot de handoff (§1).
- Un moteur classique devrait *streamer* ce champ vers le rendu et l'audio (latence,
  sérialisation). Ici render et audio workers **mappent le même SAB** et le lisent à
  60 Hz — zéro copie, zéro message. Encore une fois : la thèse du repo.
- Alimente le context steering (§11.4) sans coût : le flow field EST une carte
  d'intérêt/danger supplémentaire, lookup O(1) par boid.

### Mécanique — l'eau comme gameplay émergent, pas scripté

- **Le banc déplace l'eau** : 300 poissons qui nagent injectent de la quantité de
  mouvement dans la grille → sillage persistant, slipstream collectif (les traînards
  remontent le courant du banc), et le move « vague » (§7.5) construit littéralement
  un courant.
- **Stealth physique** : les prédateurs (hérons) lisent les rides à la surface — nager
  lentement ne laisse pas de sillage. La furtivité devient émergente : la vitesse du
  joueur *s'écrit dans l'eau*. Le dash laisse une traînée visible — la trace Tony Hawk
  du move.
- **Level design hydraulique** : pompes, vidanges, vannes = sources/puits du champ.
  Courants-tapis-roulants, sens uniques, zones mortes. Le mass-gating (§8) gagne une
  variante : rediriger un courant de vidange pour défoncer une porte que la masse seule
  n'ouvre pas.
- **Le phone sent l'eau** : la ligne latérale des vrais poissons. Le second écran (§3)
  affiche le champ de pression/courants — ce que le banc *sent* — pendant que le desktop
  montre ce que l'œil voit. L'idée 3 gagne son substrat physique.

### Scénario

Une pisciculture EST une machine hydraulique — pompes, canaux, bassins, vidanges. L'arc
narratif devient : le banc apprend à **retourner l'eau de la ferme contre elle**.
Late-game métal (§8.4) : pompes industrielles = courants violents ; final contre le
bateau de récolte : survivre au remous de l'hélice, puis l'océan — les courants à
l'échelle libre.

### Esthétique

- En top-down, **la surface de l'eau EST l'écran entier**. Le shader d'eau pixelisé
  (caustiques quantifiées à la grille de pixels, sillages en dithering, réfraction
  grossière) devient l'image signature du « Super Nintendo avant-garde ».
- L'idle milling (§11.3) brasse un tourbillon lent visible dans l'eau — le screensaver
  gagne sa matière. La palette verts/teals du game design est littéralement la couleur
  du champ.
- Audio (§12) : le flow field se sonifie — on entend les courants, le sillage du banc
  est aussi un souffle stéréo.

## Divers (plus petit, noté au passage)

- **Interpolation render-side** : le SAB latest-wins découple sim et rendu — sur device
  faible, la sim pourrait tourner à 30 Hz avec interpolation des matrices côté render
  (double buffer) pour un rendu fluide à coût sim réduit. Alternative/complément au §4.
- **Theatre.js sur la sim vivante** : `AnimationRegistry` généralisé = cinématiques et
  comportements de prédateurs animés à la main sur le jeu qui tourne (déjà la cible §4.2
  d'engine-handoff, mais penser « outil de level design », pas juste animation).
