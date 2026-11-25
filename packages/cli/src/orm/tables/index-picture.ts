/** What a schema index gives the migration tooling at one moment: taken before a command writes it, and after. */
export interface IndexPicture {
  /** The index as it stood. */
  readonly text: string | undefined;
  /** On Drizzle, the value each name exports, by the place that declares it; a name that does not compile exports none. */
  readonly names: ReadonlyMap<string, string>;
  /** Every table within reach: on Drizzle a value exported under a name, on TypeORM an entity listed in `entities`. */
  readonly reachable: ReadonlySet<string>;
  /** What the index re-exports, or itself holds, that is not read with certainty: what it exports is out of the picture. */
  readonly unread: readonly string[];
  /**
   * While something is not read with certainty, the names files read with certainty export
   * different values under, which only a line by name settles: the settle wrote none, and its
   * note says so and who keeps each.
   */
  readonly toTheSettle: ReadonlySet<string>;
  /** On Drizzle, the file or the package the index takes each name from, as its line names it: not the place that declares the value. */
  readonly givers: ReadonlyMap<string, string>;
}
