import { and, eq } from 'drizzle-orm';
import { FixedClock, loadedAt, tenantScopeOf, type ExecutionScope } from '@ddd-ts-kit/kernel';
import { saveAggregate, saveTenantAggregate, tenantCondition } from '../../../src/postgres';
import type { Database } from '../platform/database/database';
import { Invoice } from '../billing-core/domain/invoice';
import type { InvoiceRepository } from '../billing-core/domain/repositories/invoice.repository';
import { invoices } from '../billing-core/infrastructure/persistence/invoices';

const clock = new FixedClock(new Date('2026-03-01T10:00:00.000Z'));

/**
 * The repository of a project on shared tables: reads through `tenantCondition`, writes through
 * `ownTenantCondition`. Built `unfiltered`, it writes no tenant condition, as a statement that
 * forgot it: under row-level security the policies alone confine it.
 */
export class TenantInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly unfiltered = false,
  ) {}

  async findById(id: string): Promise<Invoice | undefined> {
    const [row] = await this.database
      .executor()
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), this.unfiltered ? undefined : tenantCondition(invoices.tenantId, this.scope)));

    if (row === undefined) {
      return undefined;
    }

    return loadedAt(Invoice.rehydrate(row), row.version);
  }

  async save(invoice: Invoice): Promise<void> {
    const save = { aggregate: invoice, row: invoice.state, scope: this.scope, clock };

    // Unfiltered, the database confines the statements (row-level security): the row alone names its tenant.
    await (this.unfiltered
      ? saveAggregate(this.database, invoices, { ...save, row: { ...invoice.state, ...tenantScopeOf(this.scope) } })
      : saveTenantAggregate(this.database, invoices, save));
  }
}
