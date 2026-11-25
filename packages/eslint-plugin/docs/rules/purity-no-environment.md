**English** · [Français](purity-no-environment.fr.md)

# ddd-ts-kit/purity-no-environment

Architecture id: `purity/no-environment`. Default severity: `error` in `recommended`, `error` in `strict`.

Applies to: `domain/` and `application/` of a context, tests excluded.

## Why

Configuration, logs, files and the network are the outside world. Reached directly they make a use case depend on the machine it runs on; behind a port they are a parameter.

## Reported

- `process.env`, `argv`, `cwd`, `exit`, `stdout`, `stderr`, `stdin`
- any member of `console`
- a call of the global `fetch`, `new XMLHttpRequest`, `new WebSocket`, `new EventSource`
- an import of `fs`, `http`, `https`, `http2`, `net`, `dgram`, `dns`, `tls`, `child_process`, `worker_threads`, `os`, `readline`, `axios`, `node-fetch`, `undici`, `got`, `dotenv`

Incorrect:

```ts
const url = process.env['PAYMENT_URL'];
console.log('charging', amount);
await fetch(url);
```

Correct:

```ts
await this.paymentGateway.charge(amount);
```

## Options

None.

`rules."purity/no-environment"` in `ddd-ts-kit.config.json` set to `off` silences the rule, and `// ddd-ts-kit-disable-next-line purity/no-environment -- <reason>` silences one line, exactly as for `ddd-ts-kit check`.

## Limits

- A wrapper around the forbidden access (a helper of the platform that calls `Date.now()`) is not seen here; the layer rules stop the import of that helper.
- A local declaration that shadows the global (`const process = ...`) is not reported.
- A member taken by destructuring (`const { env } = process`, `const { now } = Date`) and a `const` alias of the global (`const clock = Date; clock.now()`) are read; an alias through a `let`, a parameter or a property is not followed.

## With the CLI checker

`ddd-ts-kit check` judges from the same table and words a finding the same way, on the text of the file where this rule reads its syntax tree. It knows a parameter, a variable, a destructured name, a function or a class the file declares from the global, and a method declared under the name of a global from a call. This rule is the authority where they differ: the checker follows no alias (`const clock = Date`, `import { randomUUID as id }`), hides a `var` in its block only and a loop variable without braces in the head of the loop only, reads `typeof process.env` in a type as a use, and takes for a call a signature that has neither body, return type nor modifier, or that follows a member no semicolon ends.
