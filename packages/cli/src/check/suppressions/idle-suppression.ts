import type { Suppression } from './find-suppressions';

/** A rule a directive names with a reason, which no finding of the run needed. */
export interface IdleSuppression {
  readonly suppression: Suppression;
  readonly ruleId: string;
}
