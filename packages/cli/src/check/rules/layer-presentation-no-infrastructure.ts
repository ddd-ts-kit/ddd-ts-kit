import type { Rule } from '../model/rule';
import { bindingPlace } from '../support/binding-place';
import { inLayer } from '../support/in-layer';
import { perFile } from '../support/per-file';

export const layerPresentationNoInfrastructure: Rule = {
  id: 'layer/presentation-no-infrastructure',
  description: 'presentation/ imports application/ (and domain types for mapping), never infrastructure/.',
  severity: 'error',
  doc: {
    why: 'A route translates a transport request into a command or a query and maps the answer back. Reaching an adapter directly skips the use case, so the business rule that guards the operation is skipped too.',
    bad: `// presentation/http/issue-invoice.route.ts
import { PgInvoiceRepository } from '@/contexts/billing/infrastructure/persistence/pg-invoice.repository';`,
    good: `// presentation/http/issue-invoice.route.ts
import type { IssueInvoiceHandler } from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.handler';`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) => {
      const here = inLayer(file, 'presentation');

      if (here === undefined) {
        return [];
      }

      const fix = `Call a command or query handler of application/ instead; the adapter is bound to its port in ${bindingPlace(project, here.context)}.`;

      return file.imports.flatMap(({ target, line }) => {
        if (target.kind !== 'file' || target.location.area !== 'context') {
          return [];
        }

        if (target.location.layer !== 'infrastructure' || target.location.context !== here.context) {
          return [];
        }

        return [{ line, message: `presentation/ imports infrastructure/ (${target.path}).`, fix }];
      });
    });
  },
};
