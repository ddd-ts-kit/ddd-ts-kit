import { DECLARATIONS_ENTRY } from '../declarations/declarations-entry';
import { outerEntry } from '../layers/outer-entry';
import { outsideConcern } from '../layers/outside-concern';
import type { Flaw } from '../model/flaw';
import type { ImportTarget } from '../model/import-target';
import type { ResolvedImport } from '../model/resolved-import';
import type { Rule } from '../model/rule';
import { describeTarget } from '../support/describe-target';
import { inLayer } from '../support/in-layer';
import { perFile } from '../support/per-file';

type ImportedFile = Extract<ImportTarget, { kind: 'file' }>;

/** The kernel is allowed in the domain, its declarations entry is not: a declaration is wiring. */
const DECLARES_NOTHING: Flaw = {
  message: `The domain imports "${DECLARATIONS_ENTRY}": the domain declares nothing, aggregates, entities, value objects, events, services and repository ports carry no decorator and no dependency list.`,
  fix: 'Remove the import: put the declaration on the class that plays the role in application/ or infrastructure/ (a handler, a job, a policy, an adapter); a repository port stays a plain abstract class in domain/repositories.',
};

const BUILTIN_FIX =
  'Receive the value (an id, a date, a hash) as a parameter, produced by a port such as IdGenerator or Clock in the application layer.';

export const layerDomainPurity: Rule = {
  id: 'layer/domain-purity',
  description:
    'domain/ imports only its own domain/, the shared kernel and the allowed kernel packages: no framework, ORM, validation library or Node built-in.',
  severity: 'error',
  doc: {
    why: 'The domain is the part of the system that has to survive a change of framework, database or transport. Every outside import ties a business rule to a technical choice and makes it impossible to test without that choice. Values that come from the outside world (ids, time, randomness) enter as parameters. The packages that apply a concern from outside (@ddd-ts-kit/aspects, audit, redis, scheduling, sentry, tracing) are refused whatever `domainAllowedPackages` says. The kernel itself is allowed, its entry @ddd-ts-kit/kernel/declarations is not: a declaration is wiring, and the domain declares nothing, neither a decorator on a class nor a dependency list. A repository port is a plain abstract class. An allowed package of the kit does not allow its entries for adapters, wiring and test doubles (@ddd-ts-kit/kernel/testing, @ddd-ts-kit/auth/jwt, /passport, /rebac, /di, /testing): the domain imports one only when `domainAllowedPackages` names that entry itself.',
    bad: `// domain/aggregates/invoice.aggregate.ts
import { randomUUID } from 'node:crypto';
import { IsEmail } from 'class-validator';
import { Logged } from '@ddd-ts-kit/aspects/decorators';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { FixedClock } from '@ddd-ts-kit/kernel/testing';`,
    good: `// domain/aggregates/invoice.aggregate.ts
import { AggregateRoot } from '@ddd-ts-kit/kernel';
import { Money } from '@/contexts/billing/domain/value-objects/money.vo';`,
  },
  scope: 'file',
  run(project) {
    const allowed = project.config.domainAllowedPackages;

    return perFile(project, this.id, (file) => {
      const here = inLayer(file, 'domain');

      if (here === undefined) {
        return [];
      }

      return file.imports.flatMap((imported) =>
        impure(imported, here.context, allowed).map((flaw) => ({ line: imported.line, ...flaw })),
      );
    });
  },
};

function impure({ target, specifier }: ResolvedImport, context: string, allowed: readonly string[]): Flaw[] {
  if (target.kind === 'builtin') {
    return [{ message: `The domain imports the Node built-in "${specifier}".`, fix: BUILTIN_FIX }];
  }

  if (target.kind === 'file') {
    return outsideTheDomain(target, context);
  }

  const concern = outsideConcern('The domain', target.name, specifier);

  if (concern !== undefined) {
    return [concern];
  }

  if (specifier === DECLARATIONS_ENTRY) {
    return [DECLARES_NOTHING];
  }

  if (allowed.includes(target.name)) {
    const entry = outerEntry('The domain', { name: target.name, specifier }, allowed);

    return entry === undefined ? [] : [entry];
  }

  const fix = `Remove the import: express the need as plain TypeScript or as a port in application/ports, and keep decorators and schemas of "${target.name}" in infrastructure or presentation.`;

  return [{ message: `The domain imports the package "${target.name}".`, fix }];
}

function outsideTheDomain(target: ImportedFile, context: string): Flaw[] {
  const there = target.location;

  if (there.area === 'shared-kernel') {
    return [];
  }

  if (there.area === 'context' && there.context !== context) {
    return foreignContext(there.layer, context, there.context);
  }

  if (there.area === 'context' && there.layer === 'domain') {
    return [];
  }

  const fix =
    'Invert the dependency: declare what the domain needs as an abstract class in domain/ (or a port in application/ports) and let the outer layer implement it.';

  return [{ message: `The domain imports ${describeTarget(target)}.`, fix }];
}

/** Reaching into another context's internals is reported once, by context/published-language-only. */
function foreignContext(layer: string, context: string, other: string): Flaw[] {
  if (layer !== 'published-language') {
    return [];
  }

  const fix =
    'Translate the upstream contract in application/integration/handlers or infrastructure/anti-corruption and hand the domain its own types.';

  return [{ message: `The domain of "${context}" imports the published language of "${other}".`, fix }];
}
