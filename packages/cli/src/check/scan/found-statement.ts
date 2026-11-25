import type { ImportRecord } from './import-record';
import type { StringRecord } from './string-record';

/** An import or export statement of a source, with the literal that names its module. */
export interface FoundStatement {
  readonly record: Omit<ImportRecord, 'specifier' | 'line'>;
  /** Offset of the statement keyword in the blanked source. */
  readonly offset: number;
  /** The string literal that is the module specifier. */
  readonly literal: StringRecord;
}
