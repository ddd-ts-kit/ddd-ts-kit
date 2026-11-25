import { concept } from '../concept';
import { defineKind } from '../define-kind';
import { emit } from '../emit';
import { TERM } from '../kind-options';
import { named } from '../named';
import { vars } from '../vars';

export const domainServiceKind = defineKind({
  name: 'domain-service',
  summary: 'A stateless domain service, and its spec.',
  scope: 'context',
  positionals: ['Name'],
  options: { term: TERM },
  writesInModules: true,
  run: (scope, request) => {
    const name = concept(scope, request.args[1] ?? '', { what: 'domain service', strip: ['service'] });

    emit(scope, vars(scope, { name: named(name) }), [
      ['domain-service/domain-service.ts.tpl', `domain/services/${name.kebab}.service.ts`],
      ['domain-service/domain-service.spec.ts.tpl', `test/unit/${name.kebab}.service.spec.ts`],
    ]);
  },
});
