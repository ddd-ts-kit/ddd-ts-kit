import type { Config } from '../config';
import type { Kind } from '../generate/kind';

/** One generator a preset runs on its context, as `ddd-ts-kit generate <kind> <context> <args...>` would. */
export interface PresetStep {
  readonly kind: Kind;
  readonly args: readonly string[];
  /** The flags of the generator as a command line writes them (`--personal email`), or what they are in a project of this config. */
  readonly flags?: readonly string[] | ((config: Config) => readonly string[]);
}
