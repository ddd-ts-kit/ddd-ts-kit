import { emit } from '../emit';
import { toName } from '../../naming';
import { isDeclared } from '../is-declared';
import { label } from '../label';
import { named } from '../named';
import { vars } from '../vars';
import { defineKind } from '../define-kind';

export const portKind = defineKind({
  name: 'port',
  summary: 'A port of the application layer, an abstract class that is also its injection token, and its fake.',
  scope: 'context',
  positionals: ['Name'],
  options: {},
  writesInModules: true,
  run: (scope, request) => {
    const name = label(scope, request.args[1] ?? '', { what: 'port', strip: ['port'] });
    const module = scope.module === undefined ? '' : ` --module ${toName(scope.module).kebab}`;
    const adapter = `\`ddd-ts-kit generate adapter ${scope.context.kebab} ${name.pascal}${module}\``;

    emit(scope, vars(scope, { name: named(name) }), [
      ['port/port.ts.tpl', `application/ports/${name.kebab}.port.ts`],
      ['port/fake.ts.tpl', `test/fakes/${name.kebab}.fake.ts`],
    ]);

    const simulated =
      'with `--kind simulated`, one that answers in memory, for an environment whose provider is simulated';

    scope.ws.note(
      isDeclared(scope.config)
        ? `${name.pascal} has no adapter yet: ${adapter} writes one that declares itself in infrastructure/external (${simulated}).`
        : `${name.pascal} has no adapter yet: ${adapter} writes one in infrastructure/external and binds it in ${scope.context.kebab}.module.ts (${simulated}).`,
    );
  },
});
