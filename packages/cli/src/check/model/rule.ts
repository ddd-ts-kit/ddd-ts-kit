import type { IdleSuppression } from '../suppressions/idle-suppression';
import type { Project } from './project';
import type { RuleDoc } from './rule-doc';
import type { Violation } from './violation';

export interface Rule {
  readonly id: string;
  readonly description: string;
  /** The severity of the rule when the config says nothing. */
  readonly severity?: 'error' | 'warn';
  /** What `ddd-ts-kit explain` shows: the reason behind the rule and one example each way. */
  readonly doc?: RuleDoc;
  /** The rule judges a source on its own, whatever the project around it: `check --clean-only` runs it. */
  readonly standalone?: true;
  /** `file` rules need one source at a time and run in `check-file`; `project` rules need the tree. */
  readonly scope: 'file' | 'project';
  run(project: Project): Violation[];
  /** For a `file` rule, the part of the judgment that needs the whole tree: `check-file` skips it. */
  acrossProject?(project: Project): Violation[];
  /**
   * For a rule about the suppression directives: what it says of those that silenced nothing. Asked
   * once every rule has judged every file, so neither `check --rule` nor `check-file` asks.
   */
  ofIdleSuppressions?(project: Project, idle: readonly IdleSuppression[]): Violation[];
}
