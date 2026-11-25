**English** · [Français](purity-no-ambient-randomness.fr.md)

# ddd-ts-kit/purity-no-ambient-randomness

Architecture id: `purity/no-ambient-randomness`. Default severity: `error` in `recommended`, `error` in `strict`.

Applies to: `domain/` and `application/` of a context, tests excluded.

## Why

An identifier drawn inside a rule cannot be predicted by a test nor replayed. Identifiers come from the `IdGenerator` port.

## Reported

- `Math.random`
- `crypto.randomUUID`, `getRandomValues`, `randomBytes`, `randomInt`, also imported by name from `node:crypto`
- an import of `uuid`, `nanoid`, `ulid`, `ulidx`, `cuid`, `@paralleldrive/cuid2`, `ksuid`, `shortid`, `uuidv7`, `hyperid`, `bson`

Incorrect:

```ts
import { v4 } from 'uuid';
const id = crypto.randomUUID();
```

Correct:

```ts
const invoice = Invoice.create(this.ids.next(), this.clock.now());
```

## Options

None.

`rules."purity/no-ambient-randomness"` in `ddd-ts-kit.config.json` set to `off` silences the rule, and `// ddd-ts-kit-disable-next-line purity/no-ambient-randomness -- <reason>` silences one line, exactly as for `ddd-ts-kit check`.

## Limits

- A wrapper around the forbidden access (a helper of the platform that calls `Date.now()`) is not seen here; the layer rules stop the import of that helper.
- A local declaration that shadows the global (`const process = ...`) is not reported.
- A member taken by destructuring (`const { env } = process`, `const { now } = Date`) and a `const` alias of the global (`const clock = Date; clock.now()`) are read; an alias through a `let`, a parameter or a property is not followed.

## With the CLI checker

`ddd-ts-kit check` judges from the same table and words a finding the same way, on the text of the file where this rule reads its syntax tree. It knows a parameter, a variable, a destructured name, a function or a class the file declares from the global, and a method declared under the name of a global from a call. This rule is the authority where they differ: the checker follows no alias (`const clock = Date`, `import { randomUUID as id }`), hides a `var` in its block only and a loop variable without braces in the head of the loop only, reads `typeof process.env` in a type as a use, and takes for a call a signature that has neither body, return type nor modifier, or that follows a member no semicolon ends.
