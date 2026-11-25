/** A table a generator declares in the storage of a context. */
export interface DeclaredTable {
  /** The name of the table in the database. */
  readonly table: string;
  /** The constant the tables file exports it under, on the ORM that have one: the Drizzle table, the TypeORM entity. */
  readonly constant: string;
  /** The folder of the templates that write it, per ORM; a file it does not hold is the one of `repository`. */
  readonly templates: string;
  /** How to change a table already declared, since the generator declares it once; `<file>`, `<context>` and `<table>` are filled in. */
  readonly changedBy: string;
}
