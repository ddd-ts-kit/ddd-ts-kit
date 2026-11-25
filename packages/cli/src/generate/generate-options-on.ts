import { GENERATE_OPTIONS, type GenerateOption, TEXT } from './generate-options';
import { kindIn } from './kind-in';

/**
 * The options of `generate` on one command line. One flag may be a switch for a kind and a text
 * for another: `--command` of a route, `--command <UseCase>` of a job.
 */
export function generateOptionsOn(argv: readonly string[]): Record<string, GenerateOption> {
  return { ...GENERATE_OPTIONS, ...Object.fromEntries((kindIn(argv)?.textFlags ?? []).map((flag) => [flag, TEXT])) };
}
