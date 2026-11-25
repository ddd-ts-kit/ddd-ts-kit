import type { OptionSpecs } from '../commands/arguments';
import { GENERATE_OPTIONS } from './generate-options';
import { kindIn } from './kind-in';
import { optionsOf } from './options-of';

/**
 * The options of `generate` on one command line: those of every kind, each read as the kind it
 * names reads it. One flag may be a switch for a kind and a text for another: `--command` of a
 * route, `--command <UseCase>` of a job.
 */
export function generateOptionsOn(argv: readonly string[]): OptionSpecs {
  const kind = kindIn(argv);

  return kind === undefined ? GENERATE_OPTIONS : { ...GENERATE_OPTIONS, ...optionsOf(kind) };
}
