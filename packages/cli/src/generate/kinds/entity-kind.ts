import { concept } from '../concept';
import { defineKind } from '../define-kind';
import { emit } from '../emit';
import { TERM } from '../kind-options';
import { named } from '../named';
import { vars } from '../vars';

export const entityKind = defineKind({
  name: 'entity',
  summary: 'An entity living inside an aggregate, and its spec.',
  scope: 'context',
  positionals: ['Name'],
  options: { term: TERM },
  writesInModules: true,
  run: (scope, request) => {
    const name = concept(scope, request.args[1] ?? '', { what: 'entity', strip: ['entity'] });

    emit(scope, vars(scope, { name: named(name) }), [
      ['entity/entity.ts.tpl', `domain/entities/${name.kebab}.entity.ts`],
      ['entity/entity.spec.ts.tpl', `test/unit/${name.kebab}.entity.spec.ts`],
    ]);
  },
});
