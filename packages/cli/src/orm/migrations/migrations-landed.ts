/** What a landing did to the migrations of a branch, or why it stopped. */
export interface MigrationsLanded {
  readonly lines: readonly string[];
  readonly stop?: string;
}
