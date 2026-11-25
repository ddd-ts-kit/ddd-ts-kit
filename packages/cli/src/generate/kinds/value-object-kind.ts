import { conceptKind } from '../concept-kind';
import { IN_SHARED_KERNEL, SHARED_GLOSSARY } from '../shared-write';

export const valueObjectKind = conceptKind({
  name: 'value-object',
  aliases: ['vo'],
  summary:
    'An immutable value object validated in create, and its spec: in domain/value-objects/ of a context, or at the root of the shared kernel, beside its spec, when at least two contexts use it.',
  scope: 'context-or-shared-kernel',
  shared: {
    files: ['<sharedKernelDir>/<name>.vo.ts and its spec', SHARED_GLOSSARY],
    when: `${IN_SHARED_KERNEL}: a value at least two contexts use`,
    worker: 'in its own context',
  },
  role: { what: 'value object', strip: ['vo'] },
  outputs: (name) => [
    ['value-object/value-object.ts.tpl', `domain/value-objects/${name.kebab}.vo.ts`],
    ['value-object/value-object.spec.ts.tpl', `test/unit/${name.kebab}.vo.spec.ts`],
  ],
});
