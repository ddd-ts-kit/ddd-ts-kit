import { concept } from '../concept';
import { emit } from '../emit';
import type { Kind } from '../kind';
import { TERM } from '../kind-options';
import { learnTerms } from '../learn-terms';
import { named } from '../named';
import { openScope } from '../open-scope';
import { vars } from '../vars';

export const entityKind: Kind = {
  name: 'entity',
  aliases: [],
  summary: 'An entity living inside an aggregate, and its spec.',
  positionals: ['context', 'Name'],
  options: { term: TERM },
  writesShared: false,
  writesInModules: true,
  run: (request) => {
    const scope = openScope(request);

    learnTerms(scope);

    const name = concept(scope, request.args[1] ?? '', { what: 'entity', strip: ['entity'] });

    emit(scope, vars(scope, { name: named(name) }), [
      ['entity/entity.ts.tpl', `domain/entities/${name.kebab}.entity.ts`],
      ['entity/entity.spec.ts.tpl', `test/unit/${name.kebab}.entity.spec.ts`],
    ]);
  },
};
