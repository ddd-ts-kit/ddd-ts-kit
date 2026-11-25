/** What a rule found in one file, before it is given a rule id and a severity. */
export interface Finding {
  readonly line: number;
  readonly message: string;
  readonly fix: string;
  /**
   * The severity of this finding when it is not the one of its rule: a ceiling that blocks whatever
   * the rule is set to, a test in which the rule only advises.
   */
  readonly severity?: 'error' | 'warn';
  /** The file the finding is reported on when it is not the source judged: the glossary a name is missing from. */
  readonly file?: string;
  /**
   * The other files this finding is repaired in, when it sits on a file that is not its cause (a
   * handler reported because the module file does not register it). `check --changed-since`
   * keeps the finding when one of them changed, and `check <paths>` reports it when one of them is
   * among the paths given.
   */
  readonly subjects?: readonly string[];
}
