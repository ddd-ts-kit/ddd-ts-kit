import type { OptionSpec, OptionSpecs } from '../commands/arguments';
import type { Kind } from './kind';
import { EVERY_KIND } from './kind-options';
import { KINDS } from './kinds';
import { optionsOf } from './options-of';

/** The flags of `generate` every kind takes, by their name. */
export const COMMON_FLAGS: readonly string[] = Object.keys(EVERY_KIND);

/**
 * Every flag a kind may take, so that a kind refuses the flag of another in its own words rather
 * than in the parser's: the flags every kind takes, then those the kinds declare.
 */
export const GENERATE_OPTIONS: OptionSpecs = {
  ...EVERY_KIND,
  ...declaredBy(KINDS),
};

/** Every flag of `generate`, by its name: a kind that does not declare one refuses it. */
export const GENERATE_FLAGS: readonly string[] = Object.keys(GENERATE_OPTIONS);

/**
 * The flags the kinds declare, each read as the first kind that declares it reads it, but as a
 * switch when some kind reads it as one: `--command` of a route. The kind asked reads its own
 * flags its own way (`generateOptionsOn`), `--command <UseCase>` of a job.
 */
function declaredBy(kinds: readonly Kind[]): OptionSpecs {
  const read = new Map<string, OptionSpec>();

  for (const [flag, option] of kinds.flatMap((kind) => Object.entries(optionsOf(kind)))) {
    if (!read.has(flag) || option.type === 'boolean') {
      read.set(flag, option);
    }
  }

  return Object.fromEntries(read);
}
