import type { FileRule } from '../model/rule';
import { inLayer } from '../support/in-layer';

const FIX =
  'Move the shared type to application/ (a port or a use case result) and let both sides import it from there.';

export const layerInfrastructureNoPresentation: FileRule = {
  id: 'layer/infrastructure-no-presentation',
  description: 'infrastructure/ implements ports of application/ and domain/, never imports presentation/.',
  severity: 'error',
  doc: {
    why: 'Adapters implement ports declared inward. An adapter that knows a DTO or a route depends on one transport, and both outer layers start changing together.',
    bad: `// infrastructure/persistence/pg-invoice.repository.ts
import type { InvoiceDto } from '@/contexts/billing/presentation/http/invoice.dto';`,
    good: `// infrastructure/persistence/pg-invoice.repository.ts
import { InvoiceRepository } from '@/contexts/billing/domain/repositories/invoice.repository';`,
  },
  scope: 'file',
  judge(file) {
    const here = inLayer(file, 'infrastructure');

    if (here === undefined) {
      return [];
    }

    return file.imports.flatMap(({ target, line }) => {
      if (target.kind !== 'file' || target.location.area !== 'context') {
        return [];
      }

      if (target.location.layer !== 'presentation' || target.location.context !== here.context) {
        return [];
      }

      return [{ line, message: `infrastructure/ imports presentation/ (${target.path}).`, fix: FIX }];
    });
  },
};
