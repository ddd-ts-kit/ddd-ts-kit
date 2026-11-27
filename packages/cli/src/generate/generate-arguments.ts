import { Arguments } from '../commands/arguments';
import { generateOptionsOn } from './generate-options-on';

/** The arguments of `generate` as it reads them: the positionals wherever the flags stand, the value of each flag. */
export function generateArguments(argv: readonly string[]): Arguments<string, string, string> {
  return Arguments.declared(argv, generateOptionsOn(argv));
}
