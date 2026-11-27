import { Arguments, type OptionSpecs } from '../commands/arguments';
import { EVERY_KIND } from './kind-options';
import type { KindFlags } from './read-request';
import type { Scope } from './scope';

/**
 * The scope of what a command writes as another kind would, from a command line of its own: the
 * flags `words` give, read as `options` declare them, with the `--allow-name` of the command. The
 * repository a command writes on the first use of its aggregate, the use cases a policy writes again.
 */
export function writingAs<const O extends OptionSpecs>(
  scope: Scope,
  options: O,
  words: readonly string[] = [],
): Scope<KindFlags<O>> {
  const declared: typeof EVERY_KIND & O = { ...EVERY_KIND, ...options };
  const allowed = scope.flags.flag('allow-name') ? ['--allow-name'] : [];

  return { ...scope, flags: Arguments.declared([...allowed, ...words], declared) };
}
