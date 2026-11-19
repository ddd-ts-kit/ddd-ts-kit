[English](versioning.md) · **Français**
<!-- translation-of: versioning.md sha256:b51a981f8166b167 -->

# Versions et stabilité

**Résumé.** Le kit en est à ses versions 0.x : son API et l'arborescence d'un projet généré bougent
encore. Une version corrective ne casse jamais rien ; une version mineure le peut, et chaque rupture
dit alors quoi faire dans une ligne `To move:` de [CHANGELOG.md](../CHANGELOG.md). Les plages
qu'écrit `init` ne prennent que les correctifs : une rupture n'atteint jamais un projet sans que
quelqu'un change une version. La version 1.0 figera l'API et ajoutera une période de dépréciation à
chaque retrait.

## Une seule version pour tout

La CLI (`ddd-ts-kit`), chaque package `@ddd-ts-kit/*` et le plugin pour les agents de code sont
publiés ensemble, sous une seule version. Un projet les met à jour ensemble : un package du kit
attend les autres à la même version, et le plugin décrit les commandes de la CLI publiée avec lui.
Le kit est publié souvent, parfois plusieurs fois par semaine : chaque version est petite, et ses
notes dans CHANGELOG.md sont courtes.

## Ce que dit un numéro de version, avant 1.0

| La version change de | Exemple | Ce qu'elle peut contenir |
|---|---|---|
| correctif | 0.113.1 à 0.113.2 | des corrections et des ajouts, jamais de rupture : rien de ce qu'un projet a écrit ou généré ne cesse de fonctionner |
| mineure | 0.113.2 à 0.114.0 | la même chose, et des changements qui cassent ; chacun vient avec sa ligne `To move:` |

Une rupture est tout changement après lequel un projet doit agir : une API renommée ou retirée, une
règle qui refuse désormais ce qu'elle acceptait, un fichier généré que le projet doit réécrire, une
arborescence qui bouge. La release fait respecter la frontière entre les deux :
`pipeline/monorepo/release-version.mjs --set` refuse une version corrective tant qu'un changement en
attente demande à un projet d'agir. Elle le fait à partir de la version 0.114.0 : trois versions
correctives antérieures (0.83.1, 0.83.4 et 0.84.1) portaient une ligne `To move:`.

Avant 1.0, une rupture n'apporte aucune transition : pas d'alias, pas de cale, pas d'avertissement
d'abord (la décision et ses raisons sont dans
[l'ADR 0005](adr/0005-a-refusal-is-an-error-at-once-before-1-0.fr.md)). Ce qui les remplace, c'est la
ligne `To move:`, qui dit ce qui a changé et quoi lancer, et les commandes qui font le déplacement :
`ddd-ts-kit doctor` liste ce qu'une mise à jour a laissé à faire, `ddd-ts-kit init --force` réécrit
les fichiers dont `init` est propriétaire et garde ceux de l'équipe, `ddd-ts-kit check --rule <id>`
liste les fichiers qu'une règle refuse désormais.

## Les plages que tient un projet

`init` écrit les packages du kit avec une plage en accent circonflexe de la version qui l'a lancé,
`^0.113.2`. Pour une version inférieure à 1.0, npm et pnpm lisent cette plage comme « 0.113.2 ou un
correctif ultérieur de 0.113 » : les installations d'un projet, sa CI et la machine d'un collègue
prennent les corrections d'elles-mêmes, et une version mineure, la seule qui peut casser, n'arrive
que quand quelqu'un change la plage. Gardez le lockfile dans le dépôt : il fixe la version exacte
que prend chaque installation entre deux mises à jour.

## Mettre à jour

1. Lisez les sections de [CHANGELOG.md](../CHANGELOG.md) de la version qui suit la vôtre jusqu'à la
   nouvelle. Il est aussi livré dans `node_modules/ddd-ts-kit/CHANGELOG.md`, où un agent de code le
   lit. Chaque ligne `To move:` est une étape.
2. Changez ensemble chaque version de `ddd-ts-kit` et de `@ddd-ts-kit/*`, installez, et mettez à
   jour le plugin.
3. Lancez les commandes que nomment les lignes `To move:`, puis `npx ddd-ts-kit doctor` et
   `npm run verify`.

Plusieurs versions mineures peuvent être franchies d'un coup : les étapes s'additionnent, dans
l'ordre du changelog. Le guide
[Migrer après une mise à jour du kit](guides/commands.fr.md#migrer-après-une-mise-à-jour-du-kit)
détaille chaque commande.

## Ce qui est pris en charge

- **Versions.** La dernière version reçoit les corrections, de sécurité comprises ; une version plus
  ancienne n'est pas corrigée ([SECURITY.fr.md](../SECURITY.fr.md)). Avant 1.0, le prix pour rester
  à jour, ce sont les lignes `To move:`, et c'est pourquoi chacune dit quoi lancer.
- **Node.** 22.12 ou plus récent. Chaque pull request lance les specs sur Node 22 et Node 24.
- **Gestionnaires de paquets.** npm et pnpm : le pipeline installe les projets générés avec les
  deux.
- **TypeScript.** Les projets générés vérifient leurs types avec le compilateur natif de
  TypeScript 7.

## Ce que garantira 1.0

La politique de 1.0 remplace l'ADR 0005, comme le dit cet enregistrement :

- Une rupture n'arrive que dans une version majeure. Les versions mineures et correctives gardent
  chaque forme publiée en état de marche.
- Ce qui disparaît est d'abord déprécié : il continue de fonctionner, un avertissement nomme son
  remplaçant, et il n'est retiré qu'à la version majeure suivante au plus tôt.
- Une nouvelle règle qui refuse ce qu'un projet contient déjà commence comme avertissement dans une
  version mineure et devient une erreur dans la version majeure suivante.
- La version majeure précédente continue de recevoir les corrections de sécurité pendant une durée
  annoncée à la sortie de la suivante.

## Le chemin vers 1.0

1.0 n'a pas de date. Elle viendra quand le kit n'aura plus besoin de casser pour tenir ce qu'il
promet :

- l'arborescence d'un projet généré et l'API publique de chaque package ont traversé plusieurs
  versions mineures sans ligne `To move:` ;
- les applications d'exemple et les projets d'essai passent d'une version à la suivante avec les
  seules lignes `To move:`, et une mise à jour ne demande aucun changement écrit à la main au-delà ;
- chaque famille (ORM, brokers, loggers) est à parité, ou ce qui lui manque est déclaré ;
- aucune anomalie de gravité haute n'est ouverte.

D'ici là, un projet qui a besoin d'une API figée garde sa version et met à jour quand il le
choisit : le changelog garde chaque étape.
