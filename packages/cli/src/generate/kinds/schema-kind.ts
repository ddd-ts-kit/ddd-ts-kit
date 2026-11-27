import { labelKind } from '../concept-kind';
import { isSharedKernel } from '../is-shared-kernel';

/** The schema libraries that have a template of their own; any other writes a schema wrapped by the kit. */
const WRITTEN_WITH: Readonly<Record<string, string>> = {
  zod: 'zod',
  'class-validator': 'class-validator',
  typebox: 'typebox',
};

export const schemaKind = labelKind({
  name: 'schema',
  summary:
    'One shape of the HTTP contract, declared once and shared: presentation/http/shared/<name>.schema.ts of a context, or presentation/<name>.schema.ts of the shared kernel when several contexts answer with it. Routes use it whole, nested or in part; the contract documents it once and refers to it.',
  scope: 'context-or-shared-kernel',
  shared: {
    files: ['<sharedKernelDir>/presentation/<name>.schema.ts'],
    when: 'the first argument is shared-kernel: a schema several contexts answer with',
    worker: 'in its own context: generate schema <context> <Name>',
  },
  role: { what: 'schema', strip: ['schema', 'dto'] },
  writesInModules: false,
  outputs: (name, scope) => {
    const library = WRITTEN_WITH[scope.config.stack.validation] ?? 'custom';
    const directory = isSharedKernel(scope) ? 'presentation' : 'presentation/http/shared';

    return [[`schema/schema.${library}.ts.tpl`, `${directory}/${name.kebab}.schema.ts`]];
  },
});
