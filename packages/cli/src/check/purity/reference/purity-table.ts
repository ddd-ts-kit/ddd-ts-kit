/**
 * What one purity/* rule forbids in domain/ and application/, and what it says. The ESLint plugin
 * and `ddd-ts-kit check` both judge from it: the plugin on the syntax tree, the checker on the text.
 */
export interface PurityTable {
  readonly id: string;
  readonly description: string;
  /** What to do instead, said with every finding. */
  readonly fix: string;
  /** Global object to the members that give the access; an empty list means every member. */
  readonly members: Readonly<Record<string, readonly string[]>>;
  readonly calls: readonly string[];
  readonly constructions: readonly string[];
  /** Constructors that read the outside world only when called without argument. */
  readonly bareConstructions: readonly string[];
  /** Bare packages and Node built-ins (without the `node:` prefix) that give the same access. */
  readonly modules: readonly string[];
  /** Built-in to the named exports that are forbidden while the rest of the module is not judged here. */
  readonly namedImports: Readonly<Record<string, readonly string[]>>;
}
