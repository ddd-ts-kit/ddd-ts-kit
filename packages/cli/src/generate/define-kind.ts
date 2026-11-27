import { heldToGlossary } from './held-to-glossary';
import type { Kind, KindRequest } from './kind';
import { learnTerms } from './learn-terms';
import { openScope } from './open-scope';
import type { Scope } from './scope';

/** A kind that writes in the context its first argument names, as it declares itself. */
export interface KindSpec extends Omit<Kind, 'aliases' | 'scope' | 'run'> {
  /** The other names it answers to: `vo` for `value-object`. */
  readonly aliases?: readonly string[];
  readonly scope: 'context' | 'context-or-shared-kernel';
  /** What it writes in the context opened for it, the rows of its `--term` already in the glossary. */
  run(scope: Scope, request: KindRequest): void;
}

/**
 * A kind of `generate` from its declaration: the steps every kind that writes in a context takes
 * are taken once, before its own. The context its first argument names is opened (or the shared
 * kernel, for a kind of what the shared kernel holds), and when the kind is held to the glossary,
 * the rows of `--term` join it before any name is judged.
 */
export function defineKind(spec: KindSpec): Kind {
  const kind: Kind = {
    ...spec,
    aliases: spec.aliases ?? [],
    run: (request) => {
      const scope = openScope(request, { sharedKernel: spec.scope === 'context-or-shared-kernel' });

      if (heldToGlossary(kind)) {
        learnTerms(scope, request.flags.term);
      }

      spec.run(scope, request);
    },
  };

  return kind;
}
