import type { OptionSpecs } from '../commands/arguments';
import { GENERATE_OPTIONS } from './generate-options';
import { generateOptionsOf } from './generate-options-of';
import { kindIn } from './kind-in';

/**
 * The options of `generate` on one command line: those of every kind, each read as the kind it
 * names reads it. One flag may be a switch for a kind and a text for another: `--command` of a
 * route, `--command <UseCase>` of a job.
 */
export function generateOptionsOn(argv: readonly string[]): OptionSpecs {
  const kind = kindIn(argv);

  return kind === undefined ? GENERATE_OPTIONS : generateOptionsOf(kind);
}
