import { toName } from '../../naming';
import { labelKind } from '../concept-kind';
import { isDeclared } from '../is-declared';

export const portKind = labelKind({
  name: 'port',
  summary: 'A port of the application layer, an abstract class that is also its injection token, and its fake.',
  role: { what: 'port', strip: ['port'] },
  outputs: (name) => [
    ['port/port.ts.tpl', `application/ports/${name.kebab}.port.ts`],
    ['port/fake.ts.tpl', `test/fakes/${name.kebab}.fake.ts`],
  ],
  next: (name, scope) => {
    const module = scope.module === undefined ? '' : ` --module ${toName(scope.module).kebab}`;
    const adapter = `\`ddd-ts-kit generate adapter ${scope.context.kebab} ${name.pascal}${module}\``;

    const simulated =
      'with `--kind simulated`, one that answers in memory, for an environment whose provider is simulated';

    return isDeclared(scope.config)
      ? `${name.pascal} has no adapter yet: ${adapter} writes one that declares itself in infrastructure/external (${simulated}).`
      : `${name.pascal} has no adapter yet: ${adapter} writes one in infrastructure/external and binds it in ${scope.context.kebab}.module.ts (${simulated}).`;
  },
});
