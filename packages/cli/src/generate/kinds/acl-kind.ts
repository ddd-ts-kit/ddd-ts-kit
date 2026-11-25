import { emit } from '../emit';
import { label } from '../label';
import { named } from '../named';
import { vars } from '../vars';
import { ownEntry } from '../../config/values/own-entry';
import { defineKind } from '../define-kind';

export const aclKind = defineKind({
  name: 'acl',
  summary: 'An anti-corruption translator for the model of another context or system, and its spec.',
  scope: 'context',
  positionals: ['upstreamOrSystemName'],
  options: {},
  writesInModules: true,
  run: (scope, request) => {
    const name = label(scope, request.args[1] ?? '', { what: 'upstream', strip: ['translator'] });

    const relationship = ownEntry(scope.config.contexts, scope.context.kebab)?.upstreams.find(
      (candidate) => candidate.context === name.kebab,
    )?.relationship;

    emit(scope, vars(scope, { name: named(name) }), [
      ['acl/translator.ts.tpl', `infrastructure/anti-corruption/${name.kebab}.translator.ts`],
      ['acl/translator.spec.ts.tpl', `test/integration/${name.kebab}.translator.spec.ts`],
    ]);

    if (ownEntry(scope.config.contexts, name.kebab) !== undefined && relationship !== 'anti-corruption-layer') {
      const upstreams = `contexts.${scope.context.kebab}.upstreams`;

      scope.ws.note(
        relationship === undefined
          ? `"${name.kebab}" is a context of this project: declare it in ${upstreams} with the relationship "anti-corruption-layer".`
          : `"${name.kebab}" is already an upstream of ${scope.context.kebab}, under the relationship "${relationship}": change it to "anti-corruption-layer" in ${upstreams} if ${scope.context.kebab} now translates everything it reads of it.`,
      );
    }
  },
});
