import type { Arguments, FlagOf } from '../commands/arguments';
import type { Config } from '../config';
import type { Name } from '../naming';
import type { Workspace } from '../workspace';
import type { GeneratorProbe } from './generator-probe';
import type { EVERY_KIND } from './kind-options';

/**
 * The flags a helper of a kind reads, by their shape, beside the flags every kind takes:
 * `Scope<Reading<'permission', 'public'>>` reads `--permission <name>` and `--public`.
 */
export type Reading<Text extends string = never, Flag extends string = never, Many extends string = never> = Arguments<
  Text,
  Flag | FlagOf<typeof EVERY_KIND>,
  Many
>;

/**
 * What every generator works with: the project, its stack and one bounded context, and the flags
 * of the command, read as its kind declares them. A helper names the flags it reads; one that names
 * none reads the flags every kind takes alone.
 */
export interface Scope<Flags = Reading> {
  readonly ws: Workspace;
  readonly config: Config;
  readonly context: Name;
  /** Directory of the context, relative to the project root. */
  readonly dir: string;
  readonly flags: Flags;
  /** The module of the model `--module` names: the files of its layers and their specs are written in it. */
  readonly module?: string | undefined;
  /** What `plan-waves` hears of the command: the names to judge, in place of the judgement, and each file it builds on. */
  readonly probe?: GeneratorProbe | undefined;
}
