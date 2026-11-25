import type { FileRule } from '../model/rule';
import { inContext } from '../support/in-context';

export const contextPublishedLanguageOnly: FileRule = {
  id: 'context/published-language-only',
  description: "A file imports from another context only through that context's published-language/.",
  severity: 'error',
  doc: {
    why: 'A bounded context owns its model and must be free to change it. The published language is the only part designed for others; importing anything else couples two models and turns every refactoring into a cross-team negotiation.',
    bad: `// contexts/shipping/application/...
import { Invoice } from '@/contexts/billing/domain/aggregates/invoice.aggregate';`,
    good: `// contexts/shipping/application/...
import type { InvoiceIssuedV1 } from '@/contexts/billing/published-language';`,
  },
  scope: 'file',
  judge(file, project) {
    const here = file.location;

    if (!inContext(here)) {
      return [];
    }

    const { contextsDir } = project.config;

    return file.imports.flatMap(({ target, line }) => {
      if (target.kind !== 'file' || !inContext(target.location)) {
        return [];
      }

      const there = target.location;

      if (there.context === here.context || there.layer === 'published-language') {
        return [];
      }

      const fix = `Import from ${contextsDir}/${there.context}/published-language only; if the type is missing there, publish it with \`ddd-ts-kit generate integration-event ${there.context} <Aggregate> <Fact>\` or react to an integration event.`;

      return [
        { line, message: `"${here.context}" imports the internals of "${there.context}" (${target.path}).`, fix },
      ];
    });
  },
};
