import { conceptKind } from '../concept-kind';

export const domainServiceKind = conceptKind({
  name: 'domain-service',
  summary: 'A stateless domain service, and its spec.',
  role: { what: 'domain service', strip: ['service'] },
  outputs: (name) => [
    ['domain-service/domain-service.ts.tpl', `domain/services/${name.kebab}.service.ts`],
    ['domain-service/domain-service.spec.ts.tpl', `test/unit/${name.kebab}.service.spec.ts`],
  ],
});
