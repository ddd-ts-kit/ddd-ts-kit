import { onKitContainer } from '../../config';
import { CliError } from '../../cli-error';
import { toName } from '../../naming';
import { emit } from '../emit';
import { vars } from '../vars';
import { contextFakes } from './world/context-fakes';
import { worldVars } from './world/world-vars';
import { defineKind } from '../define-kind';

export const testWorldKind = defineKind({
  name: 'test-world',
  summary:
    'The arrangement several specs of a context share, in test/worlds/: the test application, or the buses, with every fake of test/fakes/.',
  scope: 'context',
  positionals: [],
  optionalPositionals: ['Name'],
  options: {},
  writesInModules: false,
  run: (scope, request) => {
    const name = toName(request.args[1] ?? scope.context.kebab);

    if (!/^[a-z]/.test(name.kebab)) {
      throw new CliError(
        `"${request.args[1] ?? ''}" is not a name.`,
        'Name the world in words of the context, starting with a letter, or leave the name out: it is then the name of the context.',
      );
    }

    const { fakes, leftOut } = contextFakes(scope);
    const stack = onKitContainer(scope.config) ? 'container' : 'buses';

    emit(scope, vars(scope, { world: worldVars(scope, name, fakes) }), [
      [`test-world/world.${stack}.ts.tpl`, `test/worlds/${name.kebab}.world.ts`],
    ]);

    if (fakes.length === 0) {
      scope.ws.note(
        `${scope.dir}/test/fakes/ holds no fake the world can build: it gives the ${stack === 'container' ? 'test application' : 'buses'} alone. Generate a port or a repository (each comes with its fake), then run again with --force.`,
      );
    }

    leftOut.forEach((reason) => scope.ws.note(`Not in the world: ${reason}`));
  },
});
