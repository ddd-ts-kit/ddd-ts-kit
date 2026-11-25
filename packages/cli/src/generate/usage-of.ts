import { optionUsage } from '../commands/option-usage';
import type { Kind } from './kind';

/** The option of the kinds that write the files the modules of the model of a context divide. */
export const MODULE_OPTION = '[--module <module>]';

/**
 * What follows `ddd-ts-kit generate` for a kind, as the help prints it: its name, its positional
 * arguments, its flags, and `--module` on the kinds that take it.
 */
export function usageOf(kind: Kind): string {
  const { name, positionals, optionalPositionals = [], shown = {}, options, shownOptions } = kind;
  const flags = shownOptions ?? Object.entries(options).map(([option, spec]) => optionUsage(option, spec).optional);

  return [
    name,
    ...positionals.map((positional) => shown[positional] ?? `<${positional}>`),
    ...optionalPositionals.map((positional) => shown[positional] ?? `[${positional}]`),
    flags,
    kind.writesInModules ? MODULE_OPTION : [],
  ]
    .flat()
    .join(' ');
}
