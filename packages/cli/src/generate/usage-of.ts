import { optionUsage } from '../commands/option-usage';
import type { Kind, KindScope } from './kind';

/** The option of the kinds that write the files the modules of the model of a context divide. */
export const MODULE_OPTION = '[--module <module>]';

/** The first argument of a kind that writes in a context, as the usage writes it. */
const CONTEXT_ARGUMENT: Readonly<Record<KindScope, string | []>> = {
  context: '<context>',
  'context-or-shared-kernel': '<context|shared-kernel>',
  'new-context': [],
  project: [],
};

/**
 * What follows `ddd-ts-kit generate` for a kind, as the help prints it: its name, its positional
 * arguments, its flags, and `--module` on the kinds that take it.
 */
export function usageOf(kind: Kind): string {
  const { name, positionals, optionalPositionals = [], shown = {}, options, shownOptions } = kind;
  const flags = shownOptions ?? Object.entries(options).map(([option, spec]) => optionUsage(option, spec).optional);

  return [
    name,
    CONTEXT_ARGUMENT[kind.scope],
    ...positionals.map((positional) => shown[positional] ?? `<${positional}>`),
    ...optionalPositionals.map((positional) => shown[positional] ?? `[${positional}]`),
    flags,
    kind.writesInModules ? MODULE_OPTION : [],
  ]
    .flat()
    .join(' ');
}
