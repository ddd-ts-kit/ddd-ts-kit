import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/** The table of an aggregate: its key under `id`, its optimistic concurrency token under `version`. */
export type AggregateTable = PgTable & { readonly id: PgColumn; readonly version: PgColumn };
