import type { OptionSpecs } from '../commands/arguments';
import type { Name } from '../naming';
import { concept } from './concept';
import type { ConceptRole } from './concept-role';
import { defineKind, type KindSpec } from './define-kind';
import { emit, type Output } from './emit';
import type { Kind } from './kind';
import { TERM } from './kind-options';
import { label } from './label';
import { named } from './named';
import type { NeedsHttp } from './refuse-without-http';
import type { Scope } from './scope';
import { vars } from './vars';

/** A kind of one name that its templates say whole, as it declares it. */
interface NamedKindSpec extends Pick<KindSpec<OptionSpecs>, 'name' | 'aliases' | 'summary' | 'shared'> {
  /** Where it is written: in a context, or in the shared kernel too. A context when left out. */
  readonly scope?: 'context' | 'context-or-shared-kernel';
  /** What its name names, and the role words the generator strips from it. */
  readonly role: ConceptRole;
  /** Said by a kind that writes for the HTTP stack (a guard): it is refused in a project without one. */
  readonly needsHttp?: NeedsHttp;
  /**
   * False for a kind whose files stay at the level of the context (a guard, a schema), which
   * refuses `--module`. Left out, its files are written into the module `--module` names.
   */
  readonly writesInModules?: boolean;
  /** Each template it renders, and the file of the context, or of the shared kernel, it renders it to. */
  readonly outputs: (name: Name, scope: Scope) => readonly Output[];
  /** What it says once its files are written: what comes next. */
  readonly next?: (name: Name, scope: Scope) => string;
}

/**
 * The kind of one concept of the model that its templates say whole (an entity, a value object, a
 * domain service): `<context> <Name>`, the name held to the glossary of the context, a word it does
 * not define joining it with `--term`, its files written into the module of the model `--module`
 * names.
 */
export function conceptKind(spec: NamedKindSpec): Kind {
  return defineKind({
    ...declaredBy(spec),
    options: { term: TERM },
    run: (scope, request) => write(scope, spec, concept(scope, request.args[1] ?? '', spec.role)),
  });
}

/**
 * The kind of one name that is not a concept of the model (a port, a guard, a schema), its
 * templates saying it whole: `<context> <Name>`, the form of the name checked and no technical
 * bucket let through. Its name is not held to the glossary, and it takes no `--term`.
 */
export function labelKind(spec: NamedKindSpec): Kind {
  return defineKind({
    ...declaredBy(spec),
    options: {},
    run: (scope, request) => write(scope, spec, label(scope, request.args[1] ?? '', spec.role)),
  });
}

/** What a kind of one name declares of itself, whatever its name is read as. */
function declaredBy({ role, outputs, next, scope = 'context', writesInModules = true, ...kind }: NamedKindSpec) {
  return { ...kind, scope, positionals: ['Name'], writesInModules };
}

function write(scope: Scope, { outputs, next }: NamedKindSpec, name: Name): void {
  emit(scope, vars(scope, { name: named(name) }), outputs(name, scope));

  if (next !== undefined) {
    scope.ws.note(next(name, scope));
  }
}
