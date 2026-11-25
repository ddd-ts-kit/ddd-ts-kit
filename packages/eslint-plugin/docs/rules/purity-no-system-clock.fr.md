[English](purity-no-system-clock.md) · **Français**
<!-- translation-of: purity-no-system-clock.md sha256:c7cb0528139ea317 -->

# ddd-ts-kit/purity-no-system-clock

Identifiant d'architecture : `purity/no-system-clock`. Sévérité par défaut : `error` dans `recommended`, `error` dans `strict`.

S'applique à : `domain/` et `application/` d'un contexte, tests exclus.

## Pourquoi

Une règle qui lit l'horloge donne une réponse différente à chaque exécution. Le temps est une entrée : le domaine le reçoit, l'application le prend au port `Clock`, un test le fixe avec `FixedClock`.

## Signalé

- `new Date()` sans argument
- `Date.now`, `Date()`
- `performance.now`, `performance.timeOrigin`
- les mêmes par `globalThis`, `window`, `self` ou `global`

Incorrect :

```ts
const overdue = invoice.dueAt < new Date();
const started = Date.now();
```

Correct :

```ts
const overdue = invoice.isOverdue(this.clock.now());
const due = new Date(issuedAt.getTime() + 30 * DAY);
```

## Détails

`new Date(value)` construit une date à partir de données et est permis.

## Options

Aucune.

`rules."purity/no-system-clock"` à `off` dans `ddd-ts-kit.config.json` désactive la règle, et `// ddd-ts-kit-disable-next-line purity/no-system-clock -- <reason>` désactive une ligne, exactement comme pour `ddd-ts-kit check`.

## Limites

- Une enveloppe autour de l'accès interdit (un auxiliaire de la plateforme qui appelle `Date.now()`) n'est pas vue ici ; les règles de couche arrêtent l'import de cet auxiliaire.
- Une déclaration locale qui masque la globale (`const process = ...`) n'est pas signalée.
- Un membre pris par déstructuration (`const { env } = process`, `const { now } = Date`) et un alias `const` de la globale (`const clock = Date; clock.now()`) sont lus ; un alias par un `let`, un paramètre ou une propriété n'est pas suivi.

## Avec le checker de la CLI

`ddd-ts-kit check` juge d'après la même table et formule un constat de la même façon, sur le texte du fichier là où cette règle lit son arbre syntaxique. Il distingue de la globale un paramètre, une variable, un nom déstructuré, une fonction ou une classe que le fichier déclare, et d'un appel une méthode déclarée sous le nom d'une globale. Cette règle fait autorité là où ils diffèrent : le checker ne suit aucun alias (`const clock = Date`, `import { randomUUID as id }`), ne masque un `var` que dans son bloc et une variable de boucle sans accolades que dans l'en-tête de la boucle, lit `typeof process.env` dans un type comme un usage, et prend pour un appel une signature qui n'a ni corps, ni type de retour, ni modificateur, ou qui suit un membre qu'aucun point-virgule ne termine.
