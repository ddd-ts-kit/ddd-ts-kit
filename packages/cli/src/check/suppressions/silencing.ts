import type { Violation } from '../model/violation';
import type { Suppression } from './find-suppressions';
import type { IdleSuppression } from './idle-suppression';

/**
 * The directives of a project at work on the findings of a run: a directive that gives a reason
 * silences the rules it names on the lines it covers, and remembers which of them it was needed for.
 */
export class Silencing {
  private readonly byFile = new Map<string, Suppression[]>();
  private readonly needed = new Map<Suppression, Set<string>>();

  constructor(private readonly directives: readonly Suppression[]) {
    for (const directive of directives.filter(({ reason }) => reason !== '')) {
      this.byFile.set(directive.file, [...(this.byFile.get(directive.file) ?? []), directive]);
      this.needed.set(directive, new Set());
    }
  }

  get count(): number {
    return this.directives.length;
  }

  /** Whether a directive silences the finding; the directive is then one the run needed. */
  silences({ file, line, ruleId }: Violation): boolean {
    const silencers = (this.byFile.get(file) ?? []).filter(
      (directive) => directive.ruleIds.includes(ruleId) && directive.covers.includes(line),
    );

    for (const directive of silencers) {
      this.needed.get(directive)?.add(ruleId);
    }

    return silencers.length > 0;
  }

  /** What the directives name and silenced nothing of, once every finding of the run was asked about. */
  get idle(): IdleSuppression[] {
    return [...this.needed].flatMap(([suppression, needed]) =>
      suppression.ruleIds.filter((ruleId) => !needed.has(ruleId)).map((ruleId) => ({ suppression, ruleId })),
    );
  }
}
