import type { StartFrom } from '../options/start-from';

export interface GroupDescription {
  readonly stream: string;

  /** The consumer name. */
  readonly name: string;

  readonly startFrom: StartFrom;
}
