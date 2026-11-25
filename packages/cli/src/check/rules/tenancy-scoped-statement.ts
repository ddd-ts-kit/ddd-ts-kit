import { isControlPlane, type Config } from '../../config';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inLayers } from '../support/in-layers';
import { drizzleUnscoped } from '../tenancy/drizzle-unscoped';
import { knexUnscoped } from '../tenancy/knex-unscoped';
import { prismaUnscoped } from '../tenancy/prisma-unscoped';
import { savesWithoutTenant } from '../tenancy/saves-without-tenant';
import { typeormUnscoped } from '../tenancy/typeorm-unscoped';
import { unscopedReadModels } from '../tenancy/unscoped-read-models';

const FIX =
  'Reach tenant data through the helpers of the ORM package: `tenantTable` to read and `ownTenantTable` to write (Knex), `tenantCondition` and `ownTenantCondition` in the where of each statement and `tenantScopeOf` in each inserted row (Drizzle), `tenantWhere` and `ownTenantWhere` spread into the where of each statement and `tenantScopeOf` into each created row (Prisma, TypeORM), the `tenant` option of a read model store, and `saveTenantAggregate` where an aggregate is saved, never `saveAggregate`. The condition is a conjunct of the statement, since SQL binds `and` before `or`: alternatives go in a group beside it, `.where((either) => either.where(a).orWhere(b))` (Knex), `.where(and(tenantCondition(...), or(a, b)))` (Drizzle), an `OR` beside the top-level spread (Prisma), `new Brackets(...)` in an `andWhere` and a where array whose every entry spreads the helper (TypeORM). A context whose tables belong to no tenant (the control plane of the tenants) is declared so, `"contexts.<name>.tenancy": "control-plane"` recorded in "deviations"; a lock on a business key is taken with `advisoryLock(context, key, { tenant: scope })` or `tryAdvisoryLock` of the ORM package, never with a raw `pg_advisory_xact_lock`; one table that holds no tenant data is a deviation: `// ddd-ts-kit-disable-next-line tenancy/scoped-statement -- ADR-NNNN: <why>`.';

const LOCK_BY_HAND =
  'An advisory lock is taken by a raw statement: take it with `advisoryLock(context, key, { tenant: scope })` or `tryAdvisoryLock` of the ORM package, which keeps the key of two tenants apart and refuses outside a unit of work.';

/** The advisory lock functions of PostgreSQL, of the transaction or of the session, waiting or not. */
const ADVISORY_LOCK = /\bpg_(?:try_)?advisory_(?:xact_)?lock(?:_shared)?\b/i;

const READ_MODEL = 'A read model store is built without the `tenant` option: its rows are shared by every tenant.';

const SAVE =
  '`saveAggregate` writes the row in no tenant and updates it whatever its tenant: save with `saveTenantAggregate` of the ORM package.';

export const tenancyScopedStatement: FileRule = {
  id: 'tenancy/scoped-statement',
  description:
    'In a multi-tenant project ("stack.tenancy" other than "none"), a persistence adapter of a context that is not the control plane of the tenants confines every statement to the tenant of the work through the helpers of its ORM package: never the executor, client or manager used straight, raw SQL, a relational query, a row reached by its key alone, a read model store without its tenant, or an aggregate saved with `saveAggregate`; a lock on a business key is taken with `advisoryLock` or `tryAdvisoryLock` of the ORM package. The condition is a conjunct of the statement: never beside an `or` at its top, or under an `or`, a `not` or a `sql` template.',
  severity: 'error',
  doc: {
    why: 'On shared tables, one statement without its tenant condition reads or overwrites the data of every tenant: the most common and the most damaging leak of a multi-tenant application. The kit puts the condition in one place, the helpers of the ORM package, which read the tenant from the execution scope, refuse work that names none, widen reads only under an audited elevation and never widen writes. A table reached straight from the executor bypasses all of it. Judged in a project whose "stack.tenancy" is not "none": the infrastructure of the contexts, tests aside, but a context declared the control plane of the tenants ("contexts.<name>.tenancy": "control-plane", a deviation recorded in "deviations"), whose tables belong to no tenant since it decides who belongs to which (the identity preset declares its context so). Checked by text, statement by statement: on Knex the executor used other than as the argument of a helper, and raw SQL that may reach rows by itself: a word that reads or writes rows (`select`, `from`, `join`, `insert`, `update`, `delete`, `values`, `call`...) or starts a statement (`table`, `with`, `do`...), a call to a function that is not a known expression (an aggregate, a cast, arithmetic, text), a text that is not a literal or a template that interpolates; a statement of the schema (`create`, `alter`, `drop`, `comment`) with no word of rows, and an aggregate in a select, reach no row by themselves; on Drizzle a read, update or delete whose where carries no tenant condition (inline or in the local it is given), an insert whose row names no tenant, a relational query or a raw execute; on Prisma a statement on the client whose where spreads no `tenantWhere` (a read) or `ownTenantWhere` (an update, a delete), a create whose data spreads no `tenantScopeOf`, `findUnique` and `upsert`, which reach a row by its key when the tenant is never part of the key, raw SQL, and the client held in a variable; on TypeORM the same on the manager (`find*`, `count*`, `update`, `delete`, `insert`, a query builder whose where carries no condition, `insertIgnoringConflict` given a row that names no tenant, `save` and `upsert`, `query`); on the four, a read model store built without its tenant option. The condition has to be a conjunct of the statement, since SQL binds `and` before `or` and an alternative beside it is outside it: on Knex no `.orWhere*` or `.or` at the top of a statement of `tenantTable`, `ownTenantTable` or `whereTenant`, and no `clearWhere()` or `clear(\'where\')`, on the chain, on a local, on what a function of the file answers or in a `modify` (`tenantTable`, `ownTenantTable` and `whereTenant` also refuse them when the statement is built, `UngroupedOrError` and `ClearedTenantConditionError`, and hold the text of a `whereRaw`, or a `knex.raw` given to a where, as one conjunct in parentheses; an `orHaving` applies after the where, and is free); on Drizzle the condition is a direct argument of `where` or of `and`, never under `or`, `not` or a `sql` template; on Prisma the helper is spread at the top of the where or in its `AND`, never under `OR`, `NOT` or a relation; on TypeORM the same, a where array spreads it in each entry, a query builder has no `orWhere` at its top, and the condition stands in its last `where` or an `andWhere` after it, since a `where` resets what comes before it. What is in a group beside the condition is correct and accepted: a callback of a Knex `where`, an `or` given to the `and` of Drizzle, an `OR` beside the Prisma spread, `new Brackets(...)` in a TypeORM `andWhere`. A where built by another function is not followed: inline it, or record a deviation. A lock on a business key (count then insert, the next number of a sequence) is taken with `advisoryLock(context, key, { tenant: scope })` or `tryAdvisoryLock` of the ORM package, which is given the context and never the executor: a raw `pg_advisory_xact_lock` is raw SQL, reported with a message that names the helper.',
    bad: `// infrastructure/persistence/knex-invoice.repository.ts
const row = await this.database.executor()<InvoiceRow, InvoiceRow[]>('invoices').where({ id }).first();
const all = await this.database.executor().from('invoices').where({ status }); // the executor chained
// infrastructure/persistence/drizzle-invoice.repository.ts
await this.database.executor().select().from(invoices).where(eq(invoices.id, id));
await this.database.executor().query.invoices.findMany(); // a relational query cannot carry the condition
// infrastructure/persistence/prisma-invoice.repository.ts
const found = await this.database.client().billingInvoice.findUnique({ where: { id } }); // the key holds no tenant
await this.database.client().billingInvoice.updateMany({ where: { id, version }, data });
// infrastructure/persistence/type-orm-invoice.repository.ts
await this.database.manager().findOneBy(invoices, { id });
await this.database.manager().save(invoices, row); // writes by the key alone
await this.database.executor().raw('select pg_advisory_xact_lock(hashtext(?))', [key]); // a lock by hand: one key for every tenant
// the tenant is not a conjunct: \`and\` binds first, or the condition holds for one branch alone
await tenantTable<InvoiceRow>(this.database, this.scope, INVOICES).where({ id }).orWhere({ reference: id });
await this.database.executor().select().from(invoices).where(or(eq(invoices.id, id), tenantCondition(invoices.tenantId, this.scope)));
await this.database.client().billingInvoice.findMany({ where: { OR: [{ id, ...tenantWhere(this.scope) }, { reference: id }] } });
await this.database.manager().find(invoices, { where: [{ id, ...tenantWhere(this.scope) }, { reference: id }] });`,
    good: `const row = await tenantTable<InvoiceRow>(this.database, this.scope, INVOICES).where({ id }).first();
await ownTenantTable<InvoiceRow>(this.database, this.scope, INVOICES).where({ id, version }).update(changes);
const grouped = tenantTable(this.database, this.scope, INVOICES).select('status', this.database.executor().raw('sum(amount) as due')).groupBy('status');
const pages = await derivedTable(this.database, grouped, 'dues').orderBy('due', 'desc').limit(20);
await this.database.executor().select().from(invoices).where(and(eq(invoices.id, id), tenantCondition(invoices.tenantId, this.scope)));
const found = await this.database.client().billingInvoice.findFirst({ where: { id, ...tenantWhere(this.scope) } });
await this.database.client().billingInvoice.updateMany({ where: { id, version, ...ownTenantWhere(this.scope) }, data });
await this.database.manager().findOneBy(invoices, { id, ...tenantWhere(this.scope) });
await this.database.manager().update(invoices, { id, version, ...ownTenantWhere(this.scope) }, row);
await advisoryLock(this.database, 'invoice-number', { tenant: this.scope }); // held until the unit of work ends
// alternatives in a group beside the condition
await tenantTable<InvoiceRow>(this.database, this.scope, INVOICES).where((either) => either.where({ id }).orWhere({ reference: id }));
await this.database.executor().select().from(invoices).where(and(tenantCondition(invoices.tenantId, this.scope), or(eq(invoices.id, id), eq(invoices.reference, id))));
await this.database.client().billingInvoice.findMany({ where: { ...tenantWhere(this.scope), OR: [{ id }, { reference: id }] } });
await this.database.manager().find(invoices, { where: [{ id, ...tenantWhere(this.scope) }, { reference: id, ...tenantWhere(this.scope) }] });`,
  },
  scope: 'file',
  judge(file, project) {
    const { tenancy, orm } = project.config.stack;

    if (tenancy === 'none') {
      return [];
    }

    return isAdapter(file, project.config) ? unscoped(file, orm) : [];
  },
};

/** The persistence code of a context that holds tenant data: its infrastructure, tests and fakes left out. */
function isAdapter(file: SourceFile, config: Config): boolean {
  const location = file.isTest ? undefined : inLayers(file, ['infrastructure']);

  return location !== undefined && !isControlPlane(config, location.context);
}

const STATEMENTS: Readonly<Record<string, (file: SourceFile) => readonly { offset: number; message: string }[]>> = {
  knex: knexUnscoped,
  drizzle: drizzleUnscoped,
  prisma: prismaUnscoped,
  typeorm: typeormUnscoped,
};

function unscoped(file: SourceFile, orm: string): Finding[] {
  const statements = STATEMENTS[orm]?.(file) ?? [];
  const readModels = unscopedReadModels(file).map((offset) => ({ offset, message: READ_MODEL }));
  const saves = savesWithoutTenant(file).map((offset) => ({ offset, message: SAVE }));

  return [...statements, ...readModels, ...saves].map(({ offset, message }) => ({
    line: file.scan.lineAt(offset),
    message: ADVISORY_LOCK.test(statementAt(file, offset)) ? LOCK_BY_HAND : message,
    fix: FIX,
  }));
}

/** The source of the statement reported at `offset`, its SQL included, up to its end. */
function statementAt(file: SourceFile, offset: number): string {
  const end = file.scan.code.indexOf(';', offset);

  return file.text.slice(offset, end === -1 ? file.text.length : end);
}
