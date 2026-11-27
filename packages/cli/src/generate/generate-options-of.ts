import type { OptionSpecs } from '../commands/arguments';
import { GENERATE_OPTIONS } from './generate-options';
import type { Kind } from './kind';
import { optionsOf } from './options-of';

/** The flags of `generate` as `kind` reads them: its own its way, the others as `GENERATE_OPTIONS` reads them. */
export function generateOptionsOf(kind: Kind): OptionSpecs {
  return { ...GENERATE_OPTIONS, ...optionsOf(kind) };
}
