/**
 * The methods `saveAggregate` calls on the model of an aggregate: `client.invoice` fits as is on
 * the databases where Prisma offers `skipDuplicates` (PostgreSQL, MySQL, CockroachDB). The
 * arguments are built from the columns of the mapper at run time, which the generated types
 * cannot follow: they are typed as objects, and it is the model that validates them. The model
 * keeps the key under `id` and the optimistic concurrency token under `version`.
 */
export interface PrismaAggregateDelegate {
  /** `{ data: [row], skipDuplicates: true }` */
  createMany(args?: object): PromiseLike<{ count: number }>;
  /** `{ where, data }` */
  updateMany(args?: object): PromiseLike<{ count: number }>;
  /** `{ where }` */
  count(args?: object): PromiseLike<number>;
}
