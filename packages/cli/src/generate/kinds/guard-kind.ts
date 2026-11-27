import { CONFIG_FILE } from '../../config';
import { labelKind } from '../concept-kind';

export const guardKind = labelKind({
  name: 'guard',
  summary:
    'A guard of the project: a declared class in presentation/http/guards/ that a route group or a controller names in `guards`, and its spec. It controls the caller at the edge; permissions stay on the use cases.',
  role: { what: 'guard', strip: ['guard'] },
  needsHttp: {
    fix: `Set stack.http to express, fastify or nest in ${CONFIG_FILE}: a guard stands before the controllers of a route group.`,
  },
  writesInModules: false,
  outputs: (name) => [
    ['controller/guard.ts.tpl', `presentation/http/guards/${name.kebab}.guard.ts`],
    ['controller/guard.spec.ts.tpl', `test/unit/${name.kebab}.guard.spec.ts`],
  ],
});
