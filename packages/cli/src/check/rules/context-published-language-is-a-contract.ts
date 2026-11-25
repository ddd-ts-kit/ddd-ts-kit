import type { ImportTarget } from '../model/import-target';
import type { FileRule } from '../model/rule';
import { describeTarget } from '../support/describe-target';
import { inLayer } from '../support/in-layer';

const FIX =
  'Declare the contract with plain serializable types written in this folder: copy the few fields other contexts need instead of exposing an internal model.';

export const contextPublishedLanguageIsAContract: FileRule = {
  id: 'context/published-language-is-a-contract',
  description:
    'published-language/ imports only the kernel, the event declaration helper with the schema library of the project, and other published languages.',
  severity: 'error',
  doc: {
    why: 'A contract that re-exports a domain class is no contract: consumers get the internal model and its behaviour through the back door. The published language holds serializable types that are versioned on purpose.',
    bad: `// published-language/index.ts
export { Invoice } from '@/contexts/billing/domain/aggregates/invoice.aggregate';`,
    good: `// published-language/invoice-issued.v1.integration-event.ts
export interface InvoiceIssuedV1Payload { readonly invoiceId: string }`,
  },
  scope: 'file',
  judge(file, project) {
    if (inLayer(file, 'published-language') === undefined) {
      return [];
    }

    const allowed = project.config.publishedLanguageAllowedPackages;

    return file.imports
      .filter(({ target }) => !isContract(target, allowed))
      .map(({ target, line }) => ({
        line,
        message: `The published language imports ${describeTarget(target)}.`,
        fix: FIX,
      }));
  },
};

function isContract(target: ImportTarget, allowed: readonly string[]): boolean {
  if (target.kind === 'package') {
    return allowed.includes(target.name);
  }

  return target.kind === 'file' && target.location.area === 'context' && target.location.layer === 'published-language';
}
