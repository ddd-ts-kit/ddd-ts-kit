import type { ImportRecord } from '../scan/import-record';
import type { ImportTarget } from './import-target';

/** An import or export statement as the scanner read it, with what its specifier leads to. */
export interface ResolvedImport extends ImportRecord {
  readonly target: ImportTarget;
}
