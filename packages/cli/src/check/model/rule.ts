import type { IdleSuppression } from '../suppressions/idle-suppression';
import type { Finding } from './finding';
import type { Project } from './project';
import type { RuleDoc } from './rule-doc';
import type { SourceFile } from './source-file';
import type { Violation } from './violation';

/** What is said of a rule, whoever asks: `rules`, `explain`, the config, the engine. */
interface RuleFacts {
  readonly id: string;
  readonly description: string;
  /** The severity of the rule when the config says nothing. */
  readonly severity: 'error' | 'warn';
  /** What `ddd-ts-kit explain` shows: the reason behind the rule and one example each way. */
  readonly doc: RuleDoc;
  /** The rule judges a source on its own, whatever the project around it: `check --clean-only` runs it. */
  readonly standalone?: true;
  /**
   * For a rule about the suppression directives: what it says of those that silenced nothing. Asked
   * once every rule has judged every file, so neither `check --rule` nor `check-file` asks.
   */
  ofIdleSuppressions?(project: Project, idle: readonly IdleSuppression[]): readonly Violation[];
}

/** A rule that needs one source at a time: the engine walks the sources, and `check-file` hands it one. */
export interface FileRule extends RuleFacts {
  readonly scope: 'file';
  /** What the rule finds in one source. */
  judge(file: SourceFile, project: Project): readonly Finding[];
  /** The part of the judgment that needs the whole tree: `check-file` skips it. */
  acrossProject?(project: Project): readonly Violation[];
}

/** A rule that needs the tree: `check-file` does not run it. */
export interface ProjectRule extends RuleFacts {
  readonly scope: 'project';
  judge(project: Project): readonly Violation[];
}

export type Rule = FileRule | ProjectRule;
