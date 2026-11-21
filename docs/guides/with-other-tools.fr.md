[English](with-other-tools.md) · **Français**
<!-- translation-of: with-other-tools.md sha256:128c602a3ecac100 -->

# Composer le kit avec d'autres outils

**En bref.** Une équipe qui travaille déjà avec un outil de *monorepo* ou une méthode générale
pour agents y ajoute le kit ; elle n'a pas à choisir entre les deux. Ce guide dit, outil par
outil, où chacun agit, où les deux agiraient au même moment et lequel doit le tenir. Chaque
section est écrite à partir d'une vraie session sur un petit projet, avec les versions lancées et
ce qu'il a fallu contourner ; un outil sans sa session n'est pas décrit.

| Outil | Session | Verdict |
|---|---|---|
| [Nx](#nx) | 2026-11-20, Nx 24.0.6, `ddd-ts-kit` 0.114.1, npm 11.20, Node 26.13 | le projet du kit comme un seul projet Nx fonctionne, avec `--package-manager npm` tant que [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856) n'est pas corrigée, le chemin du compilateur tant que [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855) ne l'est pas, `vite` à la racine et un `.prettierignore` |
| [Superpowers](#superpowers) | 2026-11-21, Superpowers 7.0.2, `ddd-ts-kit` 0.114.1, npm 11.19, Node 24.22 | la formulation décide : une demande qui dit quoi construire va au kit, une idée (« ... Let's build it. ») à `brainstorming` dans la plupart des sessions interactives, qui conduit alors toute la fonctionnalité ; une section d'`AGENTS.md` la rend au kit |
| [Spec Kit](#spec-kit) | 2026-11-21, Spec Kit 1.4.3, `ddd-ts-kit` 0.114.1, npm 11.19, Node 24.22 | tout le parcours, trois *stories*, sur les règles du kit : la constitution les a recopiées, les tâches ont nommé ses générateurs, `docs/architecture/slices.md` et son relecteur ; `.specify/` laissé hors de Biome |
| [BMAD](#bmad) | 2026-11-21, BMAD Method 6.12.4, `ddd-ts-kit` 0.114.1, npm 11.19, Node 24.22 | tout le parcours, une *story*, à travers les deux processus : sa spec, son architecture et ses *epics*, puis la découverte, le glossaire et la *story* du kit ; deux glossaires et deux plans tant qu'aucun n'est choisi |

## Nx

Nx tient le *monorepo* : son graphe de projets, son cache de tâches, `nx affected` et les
frontières entre ses projets (`@nx/enforce-module-boundaries`). Le kit tient un *backend* à
l'intérieur : ses contextes délimités (bounded contexts), ses couches, son glossaire et les
frontières entre ses contextes. Les deux graphes ne sont pas les mêmes : Nx en trace un entre
projets (*packages*, applications), le kit un entre les contextes d'un seul projet.

**En résumé : un projet du kit est un projet Nx.** Nx lance et met en cache ses scripts, et
décide si le *backend* est touché ; le kit décide quels contextes le sont, et juge chaque import
à l'intérieur. Un projet Nx par contexte délimité a été essayé aussi : il coûte plus, et il peut
rendre un vert périmé (voir [plus bas](#un-projet-nx-par-contexte-délimité-déconseillé)).

### La session

Un *workspace* Nx vide (`npx create-nx-workspace@24.0.6 shop --preset=ts --pm=npm`, des
*workspaces* npm sur `packages/*`), puis dans `packages/api` :

```sh
npx ddd-ts-kit init --http hono --orm none --database none --ci none \
  --package-manager npm --context catalog:core --context ordering:core
npm install            # depuis la racine du workspace
npx nx run api:verify
```

Puis, dans un *worktree* ouvert par `npx ddd-ts-kit worktree first-slices`, comme la garde le
demande : un agrégat `Product` avec son événement `ProductListed` dans `catalog`, l'événement
d'intégration `catalog.product.listed@v1`, un agrégat `Order` dans `ordering` et son
consommateur de cet événement, `ordering` déclarant `catalog` comme son amont.
`nx run api:verify` était vert. Puis deux imports interdits ont été écrits exprès, un dans chaque
sens, pour voir quel outil signale quoi.

L'agent de code était Claude Code (Opus 5.5) avec le *plugin* du kit installé alors, 0.113.2, une
version derrière la CLI. Trois autres sessions ont ensuite été lancées à la racine de ce
*worktree*, qui tient tout le *workspace* sur une branche, avec le *plugin* Claude Code que Nx
propose dans le `.claude/settings.json` du *workspace* (`nx` 0.2.36, ses *skills* et son serveur
MCP) chargé à côté du *plugin* du kit, chacune avec une demande qui ne nomme aucun des deux
outils : ce qu'elles ont choisi est sous *Agents* plus bas.

### Un seul projet Nx pour le projet du kit

Nx déduit le projet du `package.json` de `packages/api` : chaque script devient une cible
(`nx run api:verify`, `nx run api:check:arch`), et le `typecheck` que déduit `@nx/js` s'efface
devant le script du même nom. Ce qu'il a fallu :

1. **Le gestionnaire de paquets du *workspace*.** Lancé dans un dossier vide, `init` 0.114.1 a
   choisi pnpm dans un *workspace* installé par npm
   ([#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856)) : y passer `--package-manager`
   explicitement. La version suivante prend le gestionnaire de paquets du *workspace* et dit dans
   une note où elle l'a lu.
2. **Le chemin du compilateur.** npm remonte `@typescript/native` dans le `node_modules` de la
   racine, si bien que les scripts `typecheck` et `build` de 0.114.1, qui appellent
   `node node_modules/@typescript/native/bin/tsc`, échouent sur `Cannot find module`
   ([#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855)). La version suivante écrit
   `ddd-ts-kit tsc`, qui trouve le compilateur où qu'il soit installé ; en 0.114.1, faire pointer
   les deux scripts vers la racine, `node ../../node_modules/@typescript/native/bin/tsc`.
3. **`vite` à la racine.** npm a placé `@vitest/mocker` à la racine et `vite`, son pair
   optionnel, dans `packages/api/node_modules`, si bien que Vitest s'arrêtait au démarrage sur
   `Cannot find package 'vite' imported from .../node_modules/@vitest/mocker`. `npm dedupe` ne
   l'a pas déplacé ; `npm install -D vite@8` à la racine, si. C'est un placement de npm, pas du
   kit ; les équipes qui gardent leurs outils à la racine, comme Nx le conseille, ne le
   rencontrent pas.
4. **Prettier et Biome.** Le *workspace* formate avec Prettier (`nx format:check`, lancé par la CI
   qu'écrit Nx) ; le projet du kit formate avec Biome en largeur 120. Prettier a signalé 94
   fichiers du projet du kit. Ajouter `packages/api` au `.prettierignore` de la racine : Biome
   tient ce dossier.
5. **La CI.** Le *workflow* qu'écrit Nx lance `nx run-many -t lint test build typecheck e2e` :
   sur le projet du kit cela lance `ddd-ts-kit lint`, `vitest run`, le *build* et la
   vérification des types, et rien d'autre de ce que lance `verify` : ni le contrôle de format de
   Biome, ni les seuils de couverture (`test:coverage`), ni les *specs* de bout en bout
   (`test:e2e`, qu'aucune cible `e2e` ne désigne), ni le contrôle d'architecture, ni
   dependency-cruiser, ni knip, ni le contrôle des contrats. Lancer `verify` lui-même
   (`nx affected -t verify`), ou ajouter chacun de ses scripts comme cible. Le `.github/` qu'écrit
   `init` dans `packages/api` n'y tourne jamais, comme le dit sa note : utiliser `--ci none` et
   garder la CI du *workspace*.
6. **Les *hooks* git.** `init` écrit `lefthook.yml` quoi que dise `--ci`, et lefthook ne le lit
   qu'en haut du dépôt git : dans `packages/api`, aucun *hook* de *pre-commit*, de *commit-msg*
   ou de *pre-push* du kit ne tourne. Reporter ses commandes dans une configuration de *hooks* à
   la racine du *workspace*, lancées depuis `packages/api`, sinon la CI est la seule barrière.

Avec cela, `nx run api:verify` est passé, puis de nouveau dans le *worktree* après les deux
tranches.

**Le cache.** `nx.json` ne déclare aucun cache pour les cibles de script déduites. Le déclarer
fonctionne pour les contrôles du kit : les fichiers qu'ils lisent (`ddd-ts-kit.config.json`, le
`CONTEXT.md` de chaque contexte, les sources) sont sous la racine du projet, qui est l'entrée par
défaut. Une entrée est en dehors : `ddd-ts-kit check` demande à git quels fichiers il ignore, et
le `.gitignore` de la racine répond aussi, si bien qu'un changement de ce seul fichier rejouerait
un ancien `check:arch`. Le nommer parmi les entrées (écrit d'après le code du *checker*, pas
essayé dans la session) :

```json
{
  "targetDefaults": {
    "typecheck": { "cache": true },
    "lint": { "cache": true },
    "check:arch": { "cache": true, "inputs": ["default", "{workspaceRoot}/.gitignore"] },
    "test": { "cache": true }
  }
}
```

Avec le cache déclaré, un second `nx run-many -t typecheck lint check:arch test` a lu les quatre
dans le cache (8 ms).

**Affected, à deux niveaux.** `nx affected` répond par projet : un changement dans `catalog`
donne `api`. `npx ddd-ts-kit affected --base <ref>` répond par contexte à l'intérieur : un
changement dans `catalog` donne `catalog` et `ordering`, son aval, avec les motifs de *specs* de
chacun. Garder les deux : Nx saute le *backend* quand un changement ne l'atteint pas, et les
scripts du kit restreignent à l'intérieur, comme son *hook* de *pre-push* le fait avec
`affected --run ci:test:unit` une fois reporté à la racine (étape 6).

### Un projet Nx par contexte délimité (déconseillé)

Un `project.json` dans le dossier de chaque contexte (`src/contexts/catalog/project.json` avec
`"tags": ["scope:catalog"]`) fait de chaque contexte un projet Nx imbriqué dans `api`. Ce qu'il a
fallu :

- **L'alias d'import du kit à la racine.** Nx résout les imports avec les `paths` du
  `tsconfig.base.json` de la racine ; le kit déclare `@/*` dans le `tsconfig.json` de son projet,
  que Nx ne lit pas. Sans `"paths": { "@/*": ["packages/api/src/*"] }` à la racine, le graphe de
  Nx n'a aucune arête entre les contextes, ni de `api` vers eux. Cet alias est alors global au
  *workspace* : deux projets du kit ne peuvent pas utiliser `@/` tous les deux. Après l'avoir
  changé, lancer `nx reset` : le graphe en cache n'a pas été recalculé dans cette session.
- **`allowCircularSelfDependency: true`** dans `@nx/enforce-module-boundaries`. Sans lui la règle
  a signalé 100 erreurs, une par import du kit à travers `@/` à l'intérieur d'un projet
  (« Projects should use relative imports ») : les générateurs du kit écrivent des imports par
  alias exprès.
- **Une étiquette sur `api`** (`"nx": { "tags": ["type:app"] }` dans son `package.json`) et une
  contrainte qui le laisse dépendre des contextes : la racine de composition importe chaque
  contexte.
- **La carte des contextes deux fois** : une fois dans `ddd-ts-kit.config.json` (`upstreams`), une
  fois dans les `depConstraints` de la règle. Rien ne les garde égales.

Ce qu'il a apporté : rien que le kit ne tenait déjà. Et il a montré un danger :

**Un vert périmé.** Sans l'alias à la racine, le cache a été chauffé sur un arbre propre, puis un
import interdit a été écrit dans `ordering` : `nx run api:check:arch` a répondu depuis le cache,
`0 errors`, avec la violation présente. Un fichier d'un projet imbriqué n'est plus une entrée de
`api`, et sans arête dans le graphe, aucune dépendance ne le ramène. Avec l'alias à la racine et
un graphe frais, la même exécution a été recalculée et a échoué comme il fallait.

### Quel outil signale quoi

Deux imports interdits, écrits par l'agent avec la règle de Nx active et la carte des contextes
`ordering` en aval de `catalog` :

| L'import | la garde du *plugin* (après l'écriture) | `ddd-ts-kit check` | *plugin* ESLint du kit | dependency-cruiser | `@nx/enforce-module-boundaries` |
|---|---|---|---|---|---|
| `ordering` importe l'agrégat de `catalog` (son amont, mais pas son langage publié) | `context/published-language-only` | idem | idem | idem | rien : `scope:ordering` peut dépendre de `scope:catalog`, et la règle ne sait pas quels fichiers d'un projet sont son langage publié |
| `catalog` importe un événement de domaine de `ordering` (son aval, contre la carte) | `context/published-language-only` | idem | idem | idem | « Circular dependency between catalog and ordering » |

Les deux imports atteignaient l'intérieur d'un contexte, si bien que le kit a signalé les deux
comme `context/published-language-only`. La carte elle-même est tenue par
`context/declared-relationship` et `context/no-cycle` : un import du langage publié d'`ordering`
depuis `catalog` serait signalé par celles-ci, un cas que cette session n'a pas écrit. À
l'intérieur d'un projet du kit, la règle de Nx n'a donc ajouté aucun constat, et a signalé le
second import une seconde fois, comme un cycle. S'en servir là où le kit ne regarde pas : entre
les projets du *workspace* (un *front end* qui ne doit pas importer le *backend*, des
bibliothèques partagées).

Quand le graphe de projets de Nx n'est pas en cache, la règle écrit un avertissement sur la
sortie standard et se saute ; `ddd-ts-kit lint` 0.114.1 échouait sur cette sortie
([#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857)). La version suivante lit la réponse
d'ESLint à part et passe l'avertissement sur la sortie d'erreur.

### Agents : deux jeux d'instructions

`create-nx-workspace` écrit des instructions pour agents à la racine : un `AGENTS.md` et un
`CLAUDE.md` entre des marqueurs `nx configuration`, des *skills* sous `.agents/skills`
(`nx-generate`, `nx-run-tasks`, ...), un `.claude/settings.json` qui active le *plugin* de Nx, et
la même chose pour Cursor, Gemini CLI, Codex, OpenCode et Copilot. `init` écrit les instructions
du kit dans `packages/api`. Là où elles se rencontrent :

| Moment | Nx dit | Le kit dit | Qui le tient |
|---|---|---|---|
| lancer une tâche | « always prefer running the task through nx » | `npm run verify`, `npx ddd-ts-kit check` | Nx à la racine (`nx run api:verify`, `nx affected`) ; les commandes du kit dans `packages/api`, que ses *skills* nomment |
| générer | « ALWAYS invoke the `nx-generate` skill FIRST » | les générateurs du kit, et la garde refuse un fichier écrit à la main d'une sorte qu'ils écrivent | Nx pour un nouveau projet du *workspace* ; le kit pour tout ce qui est dans un projet du kit |
| une session dans le projet du kit | rien | la garde : refuse du code sur le tronc et nomme `npx ddd-ts-kit worktree <name>`, juge chaque écriture, refuse `git commit --no-verify` | le kit : sa garde a trouvé la configuration dans `packages/api` et a tenu chacun de ces points dans la session |

**Trois sessions avec les deux *plugins*.** Chacune a été lancée à la racine du *workspace*, dans
le *worktree* de la session (sur une branche, si bien que la garde laissait écrire du code), avec
le *plugin* du kit et celui de Nx chargés ensemble, sans rien ajouter à l'`AGENTS.md` de la
racine :

| Demande | Premier *skill* | Ce qu'il a lancé | Résultat |
|---|---|---|---|
| un agrégat `Customer` avec son événement dans `ordering` | `ddd-ts-kit:scaffold` | `ddd-ts-kit generate aggregate`, puis les contrôles du kit par `npm run` et `npx ddd-ts-kit` | commité, aucun fichier écrit à la main |
| un nouveau contexte délimité `billing`, en aval d'`ordering` | `ddd-ts-kit:scaffold` | `ddd-ts-kit generate context` | commité |
| une bibliothèque partagée `money` pour l'api et un futur *front end* | `nx:nx-generate`, en citant le `CLAUDE.md` de la racine | `nx g @nx/js:library` dans `packages/money`, après avoir lu les règles du kit sur les objets valeur | commité |

`nx run-many -t verify typecheck test` était ensuite vert sur les deux projets. La dernière
colonne a donc tenu sans être écrite : le kit pour ce qui vit dans son projet, Nx pour un nouveau
projet du *workspace*. C'est une session par demande sur un seul modèle ; un modèle plus petit, ou
une demande qui mêle un dossier du projet du kit et le mot « bibliothèque », peut choisir
autrement. Dans le projet du kit, les agents ont lancé les contrôles par `npm run` et
`npx ddd-ts-kit`, pas par Nx : les mêmes commandes, sans son cache. Pour la bibliothèque, le
générateur de Nx a ajouté `@nx/vitest` et `vitest` à la racine et un *plugin* Vitest dans
`nx.json` ; l'agent en a exclu `packages/api`, qui garde sa propre configuration Vitest.

L'écrire quand même, pour d'autres modèles et d'autres agents : une ligne dans l'`AGENTS.md` de la
racine, hors des marqueurs que Nx réécrit, qui dit que `packages/api` est un projet ddd-ts-kit et
que son propre `AGENTS.md` gouverne le travail à l'intérieur. Les permissions du
`.claude/settings.json` de `packages/api` ne sont pas lues par une session lancée à la racine du
*workspace*.

**Worktrees.** `ddd-ts-kit worktree` a ouvert le *worktree* sous `packages/api/.worktrees/` et a
lancé `npm ci` à la racine du *workspace* à l'intérieur : chaque *worktree* est une copie entière
du *workspace* avec son propre `node_modules` (521 Mo ici). Nx ne l'a pas pris pour un projet
(`packages/*` ne couvre qu'un niveau). Lancer Nx depuis la racine du *worktree*.

### Ce qui a coincé, en bref

| Quoi | Où | État |
|---|---|---|
| `typecheck` et `build` appellent `tsc` par un chemin qu'un *workspace* remonté casse | le kit | [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855), corrigée après 0.114.1 |
| `init` dans un *package* d'un *workspace* npm a choisi pnpm | le kit | [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856), corrigée après 0.114.1 |
| `ddd-ts-kit lint` échoue quand un *plugin* ESLint écrit sur la sortie standard | le kit | [#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857), corrigée après 0.114.1 |
| `generate context <existant> --upstream <ctx>` n'enregistre rien et ne dit rien | le kit | [#858](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/858), corrigée après 0.114.1 |
| `vite` laissé à côté du projet quand `@vitest/mocker` est monté à la racine | npm | `vite` à la racine |
| Prettier du *workspace* contre Biome du projet | les deux | `.prettierignore` |
| `lefthook.yml` écrit dans le projet, lu en haut du dépôt seulement | *hooks* git | ses commandes reportées à la racine |
| Nx ne lit les `paths` qu'à la racine, et demande des imports relatifs dans un projet | Nx | un seul projet Nx pour le projet du kit |

## Superpowers

Superpowers est une bibliothèque de *skills* pour un agent de code qui conduit lui-même le
travail : un *hook* au démarrage de la session dit à l'agent d'invoquer une *skill* dès qu'il y a
« ne serait-ce qu'1 % de chances » qu'elle s'applique, et ses *skills* fixent le processus
(`brainstorming` avant toute fonctionnalité, `writing-plans`, `executing-plans`,
`test-driven-development`, `systematic-debugging`, `requesting-code-review`,
`finishing-a-development-branch`). Le kit tient l'architecture d'un *backend* et les étapes qui
le construisent (`use-case`, `plan-slices`, `testing`, `quality-gate`), et sa garde juge chaque
écriture. Les deux ont un avis sur les mêmes moments : comment commence une fonctionnalité,
comment s'écrit un plan, comment s'écrit un test, qui relit.

**En bref : la formulation de la demande décide qui conduit.** Une demande qui dit quoi
construire (« Add the ability for a member to borrow ... », « Members should be able to
return ... ») ou qui demande un plan est allée aux *skills* du kit à chaque fois. Une demande
formulée comme une idée (« We'd like members to ... Let's build it. »), l'exemple que donne la
*skill* d'entrée de Superpowers pour `brainstorming`, est allée à `brainstorming` dans la plupart
des sessions interactives ; celle-ci a alors conduit toute la fonctionnalité, et le kit n'a tenu
que le code : ses générateurs, sa garde, ses vérifications. Superpowers place les instructions du
projet au-dessus de ses *skills*, et une section d'`AGENTS.md` rend une telle demande au kit
(essayée plus bas).

### Les sessions

Un projet du kit seul, une bibliothèque qui prête des exemplaires de livres :

```sh
git init
npx ddd-ts-kit@0.114.1 init --package-manager npm --orm none --database none --ci none \
  --context lending:core
npm install && npm run verify
```

L'agent de code était Claude Code (Opus 5.5) avec le *plugin* du kit installé (0.114.1) et
Superpowers 7.0.2 chargé depuis un clone par `--plugin-dir`, jamais installé ; aucune demande ne
nommait l'un ou l'autre outil. Trois sortes de lancements :

- **Quatre sessions entières dans `claude -p`**, une demande chacune, lancées sur le tronc, le
  travail de chacune fusionné avant la suivante.
- **Des premiers tours**, en interactif (l'interface en terminal de Claude Code, le dossier
  approuvé à son invite) et dans `claude -p`, chacun dans une copie neuve du projet, pour voir
  quelle *skill* prend la demande : la première est choisie avant toute lecture.
- **Une fonctionnalité conduite par Superpowers jusqu'au bout**, dans `claude -p` repris tour
  après tour (`--resume`), le responsable répondant à chaque question, avec les deux seuls
  *plugins* chargés.

**Quelle *skill* a pris la demande.** Dans `claude -p` personne ne répond, et Superpowers pose
des questions : le kit y a presque tout pris, et c'est la colonne interactive qu'il faut lire.

| Demande | Interactif | `claude -p` |
|---|---|---|
| « Add the ability for a member to borrow a book copy: a loan is opened for a member and a copy, and it is refused when the member already holds three open loans. » | `use-case`, 3 sur 3 | `use-case`, 1 sur 1 (session entière, la demande ajoutant que personne ne répond) |
| « Members should be able to return a book copy they borrowed. » | `use-case`, 2 sur 2 | `use-case`, 2 sur 2 |
| « We'd like members to be able to borrow book copies, with a cap on how many loans they can hold at once. Let's build it. » | `brainstorming`, 4 sur 5 | `brainstorming`, 1 sur 8 |
| un plan des fonctionnalités suivantes, « Plan this work before anyone builds it. » | `discover-domain` 1, `plan-slices` 1 | `plan-slices`, 1 sur 1 (session entière) |
| « the same copy was lent to two members, and both loans are open. Fix it. » | pas lancé | `systematic-debugging`, 1 sur 1 (session entière) |

Les autres *plugins* de la machine étaient chargés dans les lancements interactifs et dans la
plupart de ceux de `claude -p` ; ne charger que les deux n'a rien changé dans `claude -p` (trois
lancements de chaque côté).

**Quatre sessions entières dans `claude -p`.** Les deux fonctionnalités sont allées à
`use-case` : `ddd-ts-kit worktree`, les générateurs, les termes dans `CONTEXT.md`, chaque *spec*
en échec avant son code, un commit sur la branche, et les choix faits seul listés pour le
responsable (trois chacune). Le plan est allé à `plan-slices` : `docs/architecture/slices.md`,
deux *stories* avec leurs décisions D1 à D9, vérifiées par `ddd-ts-kit plan-waves`, rien de
commité ; il a aussi trouvé un trou laissé par la première fonctionnalité (un exemplaire pouvait
être prêté deux fois), devenu le rapport de bug. Le rapport de bug est allé à
`systematic-debugging`, puis `ddd-ts-kit worktree`, une *spec* du *handler* qui reproduit le
bug, `generate error`, le correctif et `npm run verify`.

**Une fonctionnalité conduite par Superpowers.** La demande formulée comme une idée, le
responsable répondant :

1. `brainstorming` a lu le projet, reformulé la demande et demandé pourquoi ce plafond ; puis,
   une fois la raison donnée et les retours inclus, a proposé trois façons (un agrégat
   `Borrower` qui porte ses prêts ouverts, recommandé ; un `Loan` par emprunt ; deux agrégats
   tenus en phase par des événements) et demandé laquelle.
2. La première choisie, il a ouvert `ddd-ts-kit worktree borrowing`, écrit un document de
   conception sous `docs/superpowers/specs/` et, par `writing-plans`, un plan de trois tâches
   sous `docs/superpowers/plans/`, commité les deux, et demandé comment l'exécuter. Le plan
   reprenait les règles du kit comme les siennes : chaque fichier par `ddd-ts-kit generate`,
   seuls les `TODO(domain)` remplis, aucun `vi.mock`, `ddd-ts-kit check --changed-since main` à
   la fin de chaque tâche.
3. Prié de l'exécuter, `executing-plans` et `test-driven-development` l'ont construit avec les
   générateurs du kit, ont associé ses refus à 409 dans `platform-error-mapper.ts`, ont fait
   relire la branche par un sous-agent avec la consigne de relecture de Superpowers, ont commité
   trois fois, puis ont demandé s'il fallait fusionner, pousser ou garder la branche, les trois
   options de `finishing-a-development-branch`.

Le code a passé toutes les vérifications du kit (60 *specs* unitaires et d'intégration, 12 de
bout en bout, `check`). Ce que consigne la méthode du kit n'a pas été écrit : ni *story*, ni
`docs/architecture/slices.md`, ni décisions `D<n>`, ni `quality-gate`, ni
`architecture-reviewer` ; `ddd-ts-kit status` nommait toujours la première étape de la méthode.

### Qui tient quoi

| Moment | Superpowers dit | Le kit dit | Qui l'a tenu |
|---|---|---|---|
| une fonctionnalité | `brainstorming` d'abord : le pourquoi, des approches que l'humain choisit, un document de conception, puis `writing-plans` | `use-case` : une tranche verticale dans un contexte, le test d'abord | le kit pour une demande qui dit quoi construire ; Superpowers pour une idée, dans la plupart des sessions interactives |
| un plan | `writing-plans` : `docs/superpowers/plans/<date>-<feature>.md`, étape par étape avec les commandes | `plan-slices` : `docs/architecture/slices.md`, des *stories* avec leurs décisions `D<n>`, vérifiées par `plan-waves` | le kit quand un plan est demandé ; `writing-plans` quand `brainstorming` y a mené |
| un test | écrit d'abord et vu en échec ; un *mock* seulement pour une dépendance lente ou extérieure, jamais une assertion sur un *mock* | écrit d'abord ; les *fakes* des ports et les *builders*, ni `vi.mock`, ni `vi.fn`, ni `vi.spyOn` (`test/no-mocks`) | les deux disent la même chose ; aucun *mock* dans aucune session, les *specs* ont échoué avant le code |
| un bug | `systematic-debugging` : la cause d'abord, reproduite par un test | pas de *skill* à lui | Superpowers pour le diagnostic, puis les générateurs et la garde du kit |
| la relecture | `requesting-code-review` : un sous-agent avec sa consigne de relecture | `quality-gate`, l'agent `architecture-reviewer` | celui qui a conduit la fonctionnalité |
| l'isolement | `using-git-worktrees` : `.worktrees/` à la racine | `ddd-ts-kit worktree <name>` sous `.worktrees/` ; la garde refuse du code sur le tronc | `ddd-ts-kit worktree` dans chaque session qui a écrit du code, celle que Superpowers a conduite comprise |
| le démarrage de la session | son *hook* injecte `using-superpowers` | son *hook* injecte l'ordre de travail du kit | les deux, côte à côte |

Les refus de permission des sessions entières venaient du kit seul, tous les trois sur la même
commande : son `.claude/settings.json` demande avant `generate --force`, et personne ne répond
dans `claude -p` ; l'agent a supprimé le fichier généré, que personne n'avait modifié, puis l'a
généré de nouveau. `using-git-worktrees` n'a jamais tourné.

### Qui conduit : une section d'AGENTS.md

Quand Superpowers conduit, le code est celui du kit, la trace de la méthode non. Pour que le kit
garde la conduite des fonctionnalités, ajoutez une section à l'`AGENTS.md` du projet (le
`CLAUDE.md` qu'écrit `init` l'importe) ; Superpowers place les instructions du projet au-dessus
de ses *skills* :

```md
## With Superpowers

Inside this project a feature starts with the skill `ddd-ts-kit:use-case`, even when it is asked
as an idea, and a plan with `ddd-ts-kit:plan-slices`; the review before a merge is
`ddd-ts-kit:quality-gate`. Superpowers holds debugging. Its `brainstorming` runs only when
someone asks for it by name; its design doc is then the statement of needs of the story.
```

Avec elle, la demande formulée comme une idée a encore ouvert `brainstorming` dans les six
sessions interactives (son *hook* demande une *skill* avant toute lecture), mais dans chacune des
trois suivies au-delà de ce premier appel, l'agent a ensuite lu `AGENTS.md` et est passé à
`ddd-ts-kit:use-case` (l'une d'elles a atteint sa première question dans le temps observé). Sans
elle, dans les deux sessions suivies de la même façon, `brainstorming` a gardé le tour et a
demandé pourquoi. Une équipe qui préfère que Superpowers conduise peut laisser la section de côté
et garder son document de conception et son plan à côté des *stories* du kit ; le kit vérifie
alors le code, pas la méthode.

### Ce qui a coincé, en bref

| Quoi | Où | État |
|---|---|---|
| un refus répond 422, et un agent n'a trouvé aucun moyen de répondre 404 pour un prêt qui n'existe pas | le kit | [#870](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/870) : `platform-error-mapper.ts` associe un code à un statut, et aucune *skill* ne le dit ; la session conduite par Superpowers a trouvé le fichier |
| deux endroits pour un plan, deux relecteurs | les deux | la section d'`AGENTS.md` ci-dessus |

## Spec Kit et BMAD : les sessions

Spec Kit et BMAD organisent le travail d'un agent du besoin jusqu'au code, chacun avec ses propres
documents : une spécification, une architecture ou un plan, une liste de tâches ou de *stories*.
Le kit a ses propres étapes sur le même terrain (`discover-domain`, `glossary`, `plan-slices`, les
*stories* de `story`) et tient le code. Contrairement à Superpowers, les deux s'appellent par leur
nom, une commande par étape : la question n'est donc pas lequel prend une demande, mais ce que
chaque étape fait avec le kit à côté.

Chacun a été ajouté à un projet du kit à lui, la même bibliothèque que plus haut (`init` avec
`--context lending:core`, `npm install`), avec le *plugin* du kit installé (0.114.1) et Claude Code
sur Opus 5.5. Tout le parcours de chacun a tourné comme une seule conversation dans `claude -p`,
reprise étape après étape (`--resume`), le responsable répondant à chaque question ; les autres
*plugins* de la machine étaient chargés. Chaque parcours a tourné une fois.

## Spec Kit

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.4.3
specify init --here --force --non-interactive --integration claude
```

`specify init` ajoute `.specify/` (modèles, scripts, la constitution) et ses *skills* sous
`.claude/skills/`, neuf en tout, et ne touche ni `AGENTS.md`, ni `CLAUDE.md`, ni `.claude/settings.json`. Le
premier commit a échoué : le *hook* de pre-commit du kit passe Biome sur le JSON indexé, et deux
fichiers de `.specify/` ne sont pas mis en forme comme Biome le veut. Ils appartiennent à Spec Kit,
ils ont donc été laissés hors de Biome : `"!**/.specify"` dans `files.includes` de `biome.json`, à
côté de `"!**/.claude"`.

**En bref : Spec Kit a tourné sur les règles du kit, écrites dans ses propres documents.** La
constitution les a recopiées depuis `AGENTS.md`, le plan et les tâches ont nommé les générateurs du
kit, les tâches ont prévu `docs/architecture/slices.md` et son *worktree*, que l'implémentation a
écrit et ouvert, et
l'implémentation s'est terminée par l'agent `architecture-reviewer` du kit. Trois *stories*, une
branche, `npm run verify` vert ; aucun fichier n'a été créé à la main de ceux que crée un générateur.

| Étape | Ce qu'elle a écrit | Ce qu'elle a pris au kit |
|---|---|---|
| `/speckit-constitution` | `.specify/memory/constitution.md` 1.0.0, cinq principes | a lu `AGENTS.md`, `REVIEW.md` et la configuration : les principes sont les règles du kit (contextes et glossaire, couches, générateurs, tests sans *mocks*, tranches dans des *worktrees*). La garde a demandé confirmation pour une phrase qui nommait `eslint-disable` ([#873](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/873)), et l'agent l'a reformulée |
| `/speckit-specify` | `specs/001-copy-loans/spec.md`, trois *user stories*, une liste de contrôle ; une question, répondue (tout identifiant saisi au guichet, adhésions et catalogue plus tard) | la spec placée dans le contexte `lending`, ses termes dans un tableau destiné à `CONTEXT.md`, avant tout code |
| `/speckit-plan` | `plan.md`, `research.md` (décisions R1 à R8), `data-model.md`, un contrat, un *quickstart* | a lu les règles et les *skills* du kit : un agrégat `Member` qui porte ses prêts ouverts, l'unicité d'un exemplaire en prêt par la `UniqueViolationError` du noyau |
| `/speckit-tasks` | `tasks.md`, 58 tâches en six phases | a lancé les générateurs avec `--dry-run` et corrigé le plan là où le kit refusait (une projection alimentée par un événement de domaine) ; les tâches nomment `ddd-ts-kit worktree`, le glossaire, `docs/architecture/slices.md` et chaque `generate`, chaque *spec* vue en échec d'abord |
| `/speckit-implement` | six commits sur la branche de `ddd-ts-kit worktree copy-loans` | les générateurs, l'agent `architecture-reviewer`, `npm run verify` : 124 *specs* unitaires et d'intégration, 22 de bout en bout, aucun *mock*. Il a gardé 422 là où le plan disait 409, jugeant le *mapper* d'erreurs trop partagé pour y toucher ([#870](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/870)) |

La constitution est une copie : après une mise à jour du kit qui change ses règles, relancez
`/speckit-constitution`. Spec Kit crée sa branche par un *hook* que `specify init` n'a pas installé
ici ; le *worktree* du kit en a tenu lieu.

## BMAD

```sh
npx bmad-method@6.12.4 install --yes --modules bmm --tools claude-code
```

L'installeur ajoute `_bmad/` et ses *skills* sous `.claude/skills/`, 29 en tout, et les *skills* lancent leurs
scripts par `uv run`. Le projet a toujours passé `npm run verify`, et le commit a passé les *hooks*
du kit.

**En bref : BMAD est passé par les deux processus.** Son aide a placé les étapes du kit parmi les
siennes (la découverte du domaine et le glossaire avant son architecture, `ddd-ts-kit story-scope`
pour le *worktree*), et sa construction d'une *story* a suivi l'essentiel du parcours de *story* du kit (la fiche de *story*,
ses tranches, une revue de conception, l'acceptance verrouillée avant le code ; l'agent
`story-verifier` n'a pas tourné).
Le code est celui du kit ; les documents sont en double : deux glossaires, deux plans, deux
spécifications de la *story*, tant que l'équipe ne dit pas lequel compte.

| Étape | Ce qu'elle a écrit | Ce qu'elle a pris au kit |
|---|---|---|
| `/bmad-help` | rien : l'ordre des étapes | `ddd-ts-kit status`, et les étapes du kit placées parmi les siennes |
| `bmad-spec` | `_bmad-output/specs/.../SPEC.md` et `glossary.md` ; quatre questions, répondues | il a prévenu que ses *epics* et `ddd-ts-kit:plan-slices` feraient deux plans concurrents |
| les étapes du kit | `docs/architecture/discovery.md` et `contexts.md`, dix termes dans `CONTEXT.md`, la carte des contextes | les *skills* `discover-domain` et `bounded-contexts`, puis le glossaire écrit dans `CONTEXT.md`, par l'agent au sein du parcours BMAD |
| `bmad-architecture` | `ARCHITECTURE-SPINE.md`, six décisions, une relecture contradictoire | la pile que le kit fixe, gardée ; a décidé ce qu'il laisse ouvert : le stockage, où tenir chaque limite, les données personnelles |
| les étapes de `bmad-create-epics-and-stories` et `bmad-sprint-planning` | `epics.md` (un *epic*, trois *stories*), `sprint-status.yaml` | rien |
| `bmad-build` | a refusé de démarrer sur une planification non commitée, puis une branche de planification, `ddd-ts-kit story-scope 1-1-lend-a-copy-to-a-member`, cinq commits | le parcours de *story* du kit : sa fiche de *story* et ses tranches, une revue de conception par `architecture-reviewer`, l'acceptance verrouillée avant le code (par l'agent principal : un sous-agent ne peut pas la verrouiller), les générateurs, 409 associé dans `platform-error-mapper.ts` ; `npm run verify` : 57 *specs* unitaires et d'intégration, 16 de bout en bout et d'acceptance, aucun *mock* |

Tout le parcours BMAD, une *story* construite, a coûté environ 25 USD, dont 19 et 26 minutes pour
la construction de cette *story* ; tout le parcours de Spec Kit, trois *stories*, environ 19 USD,
dont 12 pour l'implémentation. Un lancement chacun, sur un seul modèle : un ordre de
grandeur, pas un prix.

**Dire lequel compte.** Une section d'`AGENTS.md`, pas essayée en session :

```md
## With BMAD

The glossary is `CONTEXT.md` of each context; BMAD writes no glossary of its own. A story is
built through `ddd-ts-kit story-scope <story key>`, and its record is
`docs/architecture/stories/<story key>.md`; the slices of `docs/architecture/slices.md` are the
plan of the code, the epics of BMAD the plan of the product.
```

## Spec Kit et BMAD : qui tient quoi

| Moment | Spec Kit | BMAD | Le kit | Qui l'a tenu |
|---|---|---|---|---|
| les principes | la constitution | aucun | `AGENTS.md`, les règles par couche | le kit, recopié dans la constitution |
| le besoin | `spec.md` | `SPEC.md` | `discover-domain`, les *stories* | l'outil ; BMAD a ajouté la découverte du kit |
| le glossaire | un tableau de la spec | `glossary.md` | `CONTEXT.md`, que lisent les générateurs | le kit ; BMAD en a gardé un second |
| l'architecture | `plan.md`, `research.md` | `ARCHITECTURE-SPINE.md` | l'arborescence et les règles, fixées ; des ADR pour le reste | l'outil pour les décisions que le kit laisse ouvertes |
| le plan du travail | `tasks.md` | `epics.md`, `sprint-status.yaml` | `slices.md`, les *stories* | les deux : les tâches de Spec Kit ont prévu `slices.md`, que son implémentation a écrit ; BMAD a gardé ses *epics* à côté de la *story* du kit |
| la branche | un *hook*, pas installé | une branche de planification | `ddd-ts-kit worktree`, `story-scope` | le kit |
| le code | `/speckit-implement` | `bmad-build` et son sous-agent | les générateurs et la garde | le kit |
| la relecture | aucune lancée | trois relecteurs à lui | `architecture-reviewer` | le kit pour Spec Kit ; les deux pour BMAD |

### Ce qui a coincé, en bref

| Quoi | Où | État |
|---|---|---|
| le JSON de `.specify/` refusé par le Biome du *hook* de pre-commit | le kit et Spec Kit | `"!**/.specify"` dans `biome.json` |
| la garde demande confirmation pour `eslint-disable` nommé dans un document Markdown | le kit | [#873](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/873) |
| un refus gardé à 422 là où le plan disait 409 | le kit | [#870](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/870) |
| deux glossaires, deux plans, deux spécifications d'une *story* | BMAD et le kit | la section d'`AGENTS.md` ci-dessus |
