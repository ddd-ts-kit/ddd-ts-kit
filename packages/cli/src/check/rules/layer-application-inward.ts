import { outerEntry } from '../layers/outer-entry';
import { outsideConcern } from '../layers/outside-concern';
import type { Flaw } from '../model/flaw';
import type { Layer } from '../model/layer';
import type { Location } from '../model/location';
import type { Project } from '../model/project';
import type { ResolvedImport } from '../model/resolved-import';
import type { FileRule } from '../model/rule';
import { bindingPlace } from '../support/binding-place';
import { describeTarget } from '../support/describe-target';
import { inLayer } from '../support/in-layer';
import { isDeclaredStyle } from '../support/is-declared-style';
import { isBackgroundJobFile } from '../scheduling/is-background-job-file';

const INWARD: readonly Layer[] = ['domain', 'application', 'published-language'];
const BUILTIN_FIX = 'Hide the I/O behind a port in application/ports and implement it in infrastructure/external.';

/** What the judgment of one import needs to know about the file that holds it. */
interface Wiring {
  readonly context: string;
  readonly allowed: readonly string[];
  /** Where an adapter is bound to its port, for the fix. */
  readonly binding: string;
  readonly declared: boolean;
}

export const layerApplicationInward: FileRule = {
  id: 'layer/application-inward',
  description:
    'application/ imports domain/, application/, published languages and the allowed kernel packages: never infrastructure/, presentation/, a framework or a driver. A background job (application/background/*.background-job.ts) also imports @ddd-ts-kit/validation and the validation library of the stack, for the schema of its payload.',
  severity: 'error',
  doc: {
    why: 'A use case orchestrates the domain and talks to the outside through ports. If it imports an adapter, a framework or a driver, the technical choice can no longer be replaced or faked, and the handler cannot be unit tested with plain fakes. Cross-cutting behaviour reaches a use case from outside: @ddd-ts-kit/aspects, audit, redis, scheduling, sentry and tracing are refused whatever `applicationAllowedPackages` says, their place is the composition root, a bus middleware or an adapter. The declarations of the kernel (@ddd-ts-kit/kernel/declarations) are part of the kernel and belong here: a handler, a job or a policy says what it is and names the ports it depends on, which are abstract classes, without knowing a container. A background job (application/background/*.background-job.ts), and no other file of the layer, also imports @ddd-ts-kit/validation and the validation library of the stack, no other, for the schema of its payload: the payload a queue keeps outlives the deploy that enqueued it, like the payload of an integration event, and the worker reads it with that schema before each run. @ddd-ts-kit/auth is allowed for permissions and policies, not its adapters, its wiring or its test doubles (@ddd-ts-kit/auth/jwt, /passport, /rebac, /di, /testing, nor @ddd-ts-kit/kernel/testing): a use case imports one only when `applicationAllowedPackages` names that entry itself.',
    bad: `// application/commands/issue-invoice/issue-invoice.handler.ts
import { PgInvoiceRepository } from '@/contexts/billing/infrastructure/persistence/pg-invoice.repository';
import { RedisCache } from '@ddd-ts-kit/redis';
import { retry } from '@ddd-ts-kit/aspects';
import { passportAuthenticator } from '@ddd-ts-kit/auth/passport';`,
    good: `// application/commands/issue-invoice/issue-invoice.handler.ts
import { Cache, Clock } from '@ddd-ts-kit/kernel';
import { CommandHandler } from '@ddd-ts-kit/kernel/declarations';
import { InvoiceRepository } from '@/contexts/billing/domain/repositories/invoice.repository';`,
  },
  scope: 'file',
  judge(file, project) {
    const here = inLayer(file, 'application');

    if (here === undefined) {
      return [];
    }

    const wiring: Wiring = {
      context: here.context,
      allowed: allowedPackages(file.path, here, project.config),
      binding: bindingPlace(project, here.context),
      declared: isDeclaredStyle(project),
    };

    return file.imports.flatMap((imported) =>
      outward(imported, wiring).map((flaw) => ({ line: imported.line, ...flaw })),
    );
  },
};

/**
 * A stored payload outlives the deploy that enqueued it, like the payload of an integration
 * event: a background job declares its schema with the validation library of the stack.
 */
function allowedPackages(path: string, here: Location, config: Project['config']): readonly string[] {
  const configured = config.applicationAllowedPackages;

  return isBackgroundJobFile(path, here) ? [...configured, ...config.payloadSchemaPackages] : configured;
}

function outward({ target, specifier }: ResolvedImport, wiring: Wiring): Flaw[] {
  if (target.kind === 'builtin') {
    return [{ message: `The application layer imports the Node built-in "${specifier}".`, fix: BUILTIN_FIX }];
  }

  if (target.kind === 'package') {
    return outsidePackage(target.name, specifier, wiring);
  }

  if (isInward(target.location, wiring.context)) {
    return [];
  }

  const binder = wiring.declared ? 'the declaration of the adapter' : 'the module file';
  const fix = `Depend on a port instead, an abstract class of application/ports or of domain/repositories, and let ${binder} bind the adapter.`;

  return [{ message: `The application layer imports ${describeTarget(target)}.`, fix }];
}

function outsidePackage(name: string, specifier: string, { allowed, binding }: Wiring): Flaw[] {
  const concern = outsideConcern('The application layer', name, specifier);

  if (concern !== undefined) {
    return [concern];
  }

  if (allowed.includes(name)) {
    const entry = outerEntry('The application layer', { name, specifier }, allowed);

    return entry === undefined ? [] : [entry];
  }

  const fix = `Declare a port in application/ports, an abstract class named after the need, implement it with "${name}" in infrastructure/, and bind it in ${binding}.`;

  return [{ message: `The application layer imports the package "${name}".`, fix }];
}

function isInward(there: Location, context: string): boolean {
  if (there.area === 'shared-kernel') {
    return true;
  }

  // Another context: the context/* rules decide.
  if (there.area === 'context' && there.context !== context) {
    return true;
  }

  return there.area === 'context' && INWARD.includes(there.layer);
}
