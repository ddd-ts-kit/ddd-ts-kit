import { Arguments } from '../commands/arguments';
import { EVERY_KIND } from '../generate/kind-options';

/** The flags of a scope no command opened, the context of a preset or the platform it rewires: none given. */
export const NO_FLAGS = Arguments.declared([], EVERY_KIND);
