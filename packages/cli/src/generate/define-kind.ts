import { Arguments, type OptionSpecs } from '../commands/arguments';
import { heldToGlossary } from './held-to-glossary';
import type { Kind } from './kind';
import type { KindFlags, ReadRequest } from './read-request';
import { EVERY_KIND } from './kind-options';
import { learnTerms } from './learn-terms';
import { openScope } from './open-scope';
import type { Scope } from './scope';

/** What a kind declares of itself, wherever it writes. */
interface Declared<O extends OptionSpecs> extends Omit<Kind, 'aliases' | 'scope' | 'options' | 'run'> {
  /** The other names it answers to: `vo` for `value-object`. */
  readonly aliases?: readonly string[];
  readonly options: O;
}

/** A kind that writes in the context its first argument names. */
interface InAContext<O extends OptionSpecs> extends Declared<O> {
  readonly scope: 'context' | 'context-or-shared-kernel';
  /** What it writes in the context opened for it, the rows of its `--term` already in the glossary. */
  run(scope: Scope<KindFlags<O>>, request: ReadRequest<O>): void;
}

/** A kind that creates a context, or writes in the project itself. */
interface Elsewhere<O extends OptionSpecs> extends Declared<O> {
  readonly scope: 'new-context' | 'project';
  run(request: ReadRequest<O>): void;
}

/** A kind as it declares itself: its flags, where it writes, and what it writes there. */
export type KindSpec<O extends OptionSpecs> = InAContext<O> | Elsewhere<O>;

/**
 * A kind of `generate` from its declaration: it reads its flags as it declares them, as a command
 * reads its options, and the steps every kind that writes in a context takes are taken once, before
 * its own. The context its first argument names is opened (or the shared kernel, for a kind of what
 * the shared kernel holds), and when the kind is held to the glossary, the rows of `--term` join it
 * before any name is judged.
 */
export function defineKind<const O extends OptionSpecs>(spec: KindSpec<O>): Kind {
  const declared: typeof EVERY_KIND & O = { ...EVERY_KIND, ...spec.options };

  const kind: Kind = {
    ...spec,
    aliases: spec.aliases ?? [],
    run: (request) => {
      const { flags } = request;

      Arguments.readAs(flags, declared);

      const read: ReadRequest<O> = { ...request, flags, module: request.flags.text('module') };

      if (inAContext(spec)) {
        const scope = openScope(read, { sharedKernel: spec.scope === 'context-or-shared-kernel' });

        if (heldToGlossary(kind)) {
          learnTerms(scope, request.flags.many('term'));
        }

        spec.run(scope, read);
      } else {
        spec.run(read);
      }
    },
  };

  return kind;
}

/** True for a kind that writes in the context its first argument names, or the shared kernel. */
function inAContext<O extends OptionSpecs>(spec: KindSpec<O>): spec is InAContext<O> {
  return spec.scope === 'context' || spec.scope === 'context-or-shared-kernel';
}
