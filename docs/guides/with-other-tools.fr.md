[English](with-other-tools.md) · **Français**
<!-- translation-of: with-other-tools.md sha256:2166da434b3cf2fc -->

# Composer le kit avec d'autres outils

**En bref.** Une équipe qui travaille déjà avec un outil de *monorepo* ou une méthode générale
pour agents y ajoute le kit ; elle n'a pas à choisir entre les deux. Ce guide dit, outil par
outil, où chacun agit, où les deux agiraient au même moment et lequel doit le tenir. Chaque
section est écrite à partir d'une vraie session sur un petit projet, avec les versions lancées et
ce qu'il a fallu contourner ; un outil sans sa session n'est pas décrit.

| Outil | Session | Verdict |
|---|---|---|
| [Nx](#nx) | 2026-11-20, Nx 24.0.6, `ddd-ts-kit` 0.114.1, npm 11.20, Node 26.13 | le projet du kit comme un seul projet Nx fonctionne, avec `--package-manager npm` tant que [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856) n'est pas corrigée, le chemin du compilateur tant que [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855) ne l'est pas, `vite` à la racine et un `.prettierignore` |
| Spec Kit, BMAD, Superpowers | pas encore lancée | suivi dans [#317](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/317) |

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

L'agent de code était Claude Code avec le *plugin* du kit. Le *plugin* Claude Code que Nx propose
dans le `.claude/settings.json` du *workspace*, et son serveur MCP, n'étaient pas installés : ce
qu'ils ajouteraient n'est pas couvert ici.

### Un seul projet Nx pour le projet du kit

Nx déduit le projet du `package.json` de `packages/api` : chaque script devient une cible
(`nx run api:verify`, `nx run api:check:arch`), et le `typecheck` que déduit `@nx/js` s'efface
devant le script du même nom. Ce qu'il a fallu :

1. **Le gestionnaire de paquets du *workspace*.** Lancé dans un dossier vide, `init` a choisi
   pnpm dans un *workspace* installé par npm ([#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856)) : passer `--package-manager` explicitement.
2. **Le chemin du compilateur.** npm remonte `@typescript/native` dans le `node_modules` de la
   racine, si bien que les scripts `typecheck` et `build`, qui appellent
   `node node_modules/@typescript/native/bin/tsc`, échouent sur `Cannot find module` ([#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855)).
   En attendant la correction, les faire pointer vers la racine :
   `node ../../node_modules/@typescript/native/bin/tsc`.
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
   sur le projet du kit cela lance `ddd-ts-kit lint`, Vitest, le *build* et la vérification des
   types, mais ni le contrôle d'architecture, ni dependency-cruiser, ni knip, ni le contrôle des
   contrats. Ajouter les cibles que le kit met dans `verify` (`check:arch`, `depcruise`,
   `deadcode`, `docs:check`), ou lancer `verify` lui-même. Le `.github/` et le `lefthook.yml`
   qu'écrit `init` dans `packages/api` n'y tournent jamais, comme le dit sa note : utiliser
   `--ci none` et garder la CI du *workspace*.

Avec cela, `nx run api:verify` est passé, puis de nouveau dans le *worktree* après les deux
tranches.

**Le cache.** `nx.json` ne déclare aucun cache pour les cibles de script déduites. Le déclarer
fonctionne pour les contrôles du kit ; chaque fichier qu'ils lisent (`ddd-ts-kit.config.json`, le
`CONTEXT.md` de chaque contexte, les sources) est sous la racine du projet, qui est l'entrée par
défaut :

```json
{
  "targetDefaults": {
    "typecheck": { "cache": true },
    "lint": { "cache": true },
    "check:arch": { "cache": true },
    "test": { "cache": true }
  }
}
```

Un second `nx run-many -t typecheck lint check:arch test` a lu les quatre dans le cache (8 ms).

**Affected, à deux niveaux.** `nx affected` répond par projet : un changement dans `catalog`
donne `api`. `npx ddd-ts-kit affected --base <ref>` répond par contexte à l'intérieur : un
changement dans `catalog` donne `catalog` et `ordering`, son aval, avec les motifs de *specs* de
chacun. Garder les deux : Nx saute le *backend* quand un changement ne l'atteint pas, et les
scripts du kit restreignent à l'intérieur, comme son *hook* de *pre-push* le fait avec
`affected --run ci:test:unit`.

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
| `catalog` importe un événement de `ordering` (contre la carte) | `context/published-language-only` | idem | idem | idem | « Circular dependency between catalog and ordering » |

À l'intérieur d'un projet du kit, la règle de Nx n'ajoute donc aucun constat, et sur un import
contre la carte elle signale la même ligne une seconde fois, en d'autres mots. S'en servir là où
le kit ne regarde pas : entre les projets du *workspace* (un *front end* qui ne doit pas importer
le *backend*, des bibliothèques partagées).

Quand le graphe de projets de Nx n'est pas en cache, la règle écrit un avertissement sur la
sortie standard et se saute ; `ddd-ts-kit lint` échoue alors sur cette sortie ([#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857)).
`npx eslint` seul fonctionne.

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
| une session dans le projet du kit | rien | la garde : refuse du code sur le tronc, ouvre un *worktree*, juge chaque écriture, refuse `git commit --no-verify` | le kit : sa garde a trouvé la configuration dans `packages/api` et a tenu chacun de ces points dans la session |

L'écrire pour les agents : une ligne dans l'`AGENTS.md` de la racine, hors des marqueurs que Nx
réécrit, qui dit que `packages/api` est un projet ddd-ts-kit et que son propre `AGENTS.md`
gouverne le travail à l'intérieur. Les permissions du `.claude/settings.json` de `packages/api`
ne sont pas lues par une session lancée à la racine du *workspace*.

**Worktrees.** `ddd-ts-kit worktree` a ouvert le *worktree* sous `packages/api/.worktrees/` et a
lancé `npm ci` à la racine du *workspace* à l'intérieur : chaque *worktree* est une copie entière
du *workspace* avec son propre `node_modules` (521 Mo ici). Nx ne l'a pas pris pour un projet
(`packages/*` ne couvre qu'un niveau). Lancer Nx depuis la racine du *worktree*.

### Ce qui a coincé, en bref

| Quoi | Où | État |
|---|---|---|
| `typecheck` et `build` appellent `tsc` par un chemin qu'un *workspace* remonté casse | le kit | [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855) |
| `init` dans un *package* d'un *workspace* npm a choisi pnpm | le kit | [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856) |
| `ddd-ts-kit lint` échoue quand un *plugin* ESLint écrit sur la sortie standard | le kit | [#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857) |
| `generate context <existant> --upstream <ctx>` n'enregistre rien et ne dit rien | le kit | [#858](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/858) |
| `vite` laissé à côté du projet quand `@vitest/mocker` est monté à la racine | npm | `vite` à la racine |
| Prettier du *workspace* contre Biome du projet | les deux | `.prettierignore` |
| Nx ne lit les `paths` qu'à la racine, et demande des imports relatifs dans un projet | Nx | un seul projet Nx pour le projet du kit |
