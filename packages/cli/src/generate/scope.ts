import type { Config } from '../config';
import type { Name } from '../naming';
import type { Workspace } from '../workspace';
import type { GeneratorProbe } from './generator-probe';
import type { KindFlags } from './kind';

/** What every generator works with: the project, its stack and one bounded context. */
export interface Scope {
  readonly ws: Workspace;
  readonly config: Config;
  readonly context: Name;
  /** Directory of the context, relative to the project root. */
  readonly dir: string;
  readonly flags: KindFlags;
  /** What `plan-waves` hears of the command: the names to judge, in place of the judgement, and each file it builds on. */
  readonly probe?: GeneratorProbe | undefined;
}
