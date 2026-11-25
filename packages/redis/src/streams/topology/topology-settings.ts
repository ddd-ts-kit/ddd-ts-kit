import type { RetentionOptions } from '../options/retention-options';
import type { StartFrom } from '../options/start-from';

export interface TopologySettings {
  readonly streamOf: (type: string) => string;
  readonly startFrom: StartFrom;
  readonly retention: RetentionOptions | undefined;
}
