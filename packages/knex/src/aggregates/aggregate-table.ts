/** The table of an aggregate: its name and its schema. It keeps the key under `id` and the optimistic concurrency token under `version`. */
export interface AggregateTable {
  readonly table: string;
  readonly schema?: string;
}
