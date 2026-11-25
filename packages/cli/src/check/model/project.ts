import type { Config, Severity } from '../../config';
import type { Location } from './location';
import type { SourceFile } from './source-file';

/**
 * What a rule may ask of the project while it judges one source: the same answers whether the
 * whole tree was loaded (`check`) or that source alone (`check-file`).
 */
export interface ProjectFacts {
  readonly root: string;
  readonly config: Config;
  readonly configText: string;
  /** The severity of a rule for the whole project. */
  severity(ruleId: string): Severity;
  /** The severity a rule states for itself, which holds when the config does not set one. */
  defaultSeverity(ruleId: string): 'error' | 'warn';
  /** The severity a setting for some files gives `file`; undefined when no such setting names it. */
  fileSeverity(ruleId: string, file: string): Severity | undefined;
  locate(file: string): Location;
  /** The source at a path, one the judged source imports: loaded with the tree, or read from disk once. */
  sourceAt(file: string): SourceFile | undefined;
}

/** The project with its tree: what a rule across the project, or a project rule, reads. */
export interface Project extends ProjectFacts {
  /** TypeScript sources under the source root (or the single file of `check-file`). */
  readonly files: readonly SourceFile[];
  /** Every file under the contexts directory, sources or not, relative to the root. */
  readonly contextEntries: readonly string[];
  /** Context directories found on disk. */
  readonly contextsOnDisk: readonly string[];
}
