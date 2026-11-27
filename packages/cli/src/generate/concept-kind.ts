import type { OptionSpecs } from '../commands/arguments';
import type { Name } from '../naming';
import { concept } from './concept';
import type { ConceptRole } from './concept-role';
import { defineKind, type KindSpec } from './define-kind';
import { emit, type Output } from './emit';
import type { Kind } from './kind';
import { TERM } from './kind-options';
import { named } from './named';
import { vars } from './vars';

/** A concept of the model written from its templates alone, as its kind declares it. */
interface ConceptKindSpec extends Pick<KindSpec<OptionSpecs>, 'name' | 'aliases' | 'summary' | 'shared'> {
  /** Where it is written: in a context, or in the shared kernel too. A context when left out. */
  readonly scope?: 'context' | 'context-or-shared-kernel';
  /** What its name names, and the role words the generator strips from it. */
  readonly role: ConceptRole;
  /** Each template it renders, and the file of the context it renders it to. */
  readonly outputs: (name: Name) => readonly Output[];
}

/**
 * The kind of one concept of the model that its templates say whole (an entity, a value object, a
 * domain service): `<context> <Name>`, the name held to the glossary of the context, a word it does
 * not define joining it with `--term`, its files written into the module of the model `--module`
 * names.
 */
export function conceptKind({ scope = 'context', role, outputs, ...declared }: ConceptKindSpec): Kind {
  return defineKind({
    ...declared,
    scope,
    positionals: ['Name'],
    options: { term: TERM },
    writesInModules: true,
    run: (opened, request) => {
      const name = concept(opened, request.args[1] ?? '', role);

      emit(opened, vars(opened, { name: named(name) }), outputs(name));
    },
  });
}
