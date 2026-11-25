import type { OptionSpecs } from '../commands/arguments';
import type { Kind } from './kind';

/** `--module <module>`, taken by the kinds that write the files the modules of the model of a context divide. */
const MODULE = { type: 'string' } as const;

/** The flags a kind takes besides those of every kind: the ones it declares, and `--module` when it writes into a module. */
export function optionsOf(kind: Kind): OptionSpecs {
  return kind.writesInModules ? { ...kind.options, module: MODULE } : kind.options;
}
