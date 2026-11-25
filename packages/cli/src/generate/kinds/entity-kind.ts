import { conceptKind } from '../concept-kind';

export const entityKind = conceptKind({
  name: 'entity',
  summary: 'An entity living inside an aggregate, and its spec.',
  role: { what: 'entity', strip: ['entity'] },
  outputs: (name) => [
    ['entity/entity.ts.tpl', `domain/entities/${name.kebab}.entity.ts`],
    ['entity/entity.spec.ts.tpl', `test/unit/${name.kebab}.entity.spec.ts`],
  ],
});
